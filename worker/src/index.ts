const WSS_URL =
  "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const CHROMIUM_VERSION = "131.0.0.0";

const ALLOWED_ORIGINS = [
  "capacitor://localhost",
  "http://localhost",
  "app://obsidian.md",
];

export default {
  async fetch(request: Request): Promise<Response> {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    // Only allow POST
    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405, request);
    }

    const origin = request.headers.get("Origin") || "";
    // Simple origin check — skip for non-browser clients
    if (origin && !ALLOWED_ORIGINS.some((o) => origin.startsWith(o))) {
      return json({ error: "Forbidden" }, 403, request);
    }

    let body: { text?: string; voice?: string; rate?: string; volume?: string; pitch?: string };
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400, request);
    }

    const { text, voice = "zh-CN-XiaoxiaoNeural", rate = "+0%", volume = "+0%", pitch = "+0Hz" } = body;
    if (!text || typeof text !== "string") {
      return json({ error: "Missing 'text' field" }, 400, request);
    }

    if (text.length > 5000) {
      return json({ error: "Text too long (max 5000 chars)" }, 400, request);
    }

    try {
      const audio = await synthesize(text, voice, rate, volume, pitch);
      return new Response(audio, {
        headers: {
          "Content-Type": "audio/mpeg",
          "Content-Disposition": "inline; filename=tts.mp3",
          ...corsHeaders(request),
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return json({ error: `TTS synthesis failed: ${message}` }, 502, request);
    }
  },
} satisfies ExportedHandler;

function corsHeaders(request: Request): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": request.headers.get("Origin") || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(data: unknown, status = 200, request: Request): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(request) },
  });
}

// --- Edge TTS WebSocket synthesis (server-side, headers allowed) ---

interface WsMessage {
  headers: Record<string, string>;
  body: string;
}

function parseMessage(raw: string): WsMessage {
  const parts = raw.split("\r\n\r\n");
  const headerLines = parts[0].split("\r\n");
  const headers: Record<string, string> = {};
  for (const line of headerLines) {
    const idx = line.indexOf(":");
    if (idx > 0) {
      headers[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  }
  return { headers, body: parts[1] || "" };
}

function generateRequestId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 32);
}

async function generateSecMsGec(): Promise<string> {
  const WIN_EPOCH = 11644473600;
  let ticks = Date.now() / 1000 + WIN_EPOCH;
  ticks -= ticks % 300;
  ticks *= 1e7;
  const strToHash = `${ticks.toFixed(0)}${TRUSTED_CLIENT_TOKEN}`;
  const data = new TextEncoder().encode(strToHash);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

async function synthesize(
  text: string,
  voice: string,
  rate: string,
  volume: string,
  pitch: string,
): Promise<Uint8Array> {
  const requestId = generateRequestId();
  const connectionId = crypto.randomUUID();
  const secMsGec = await generateSecMsGec();
  const url = `${WSS_URL}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=1-${CHROMIUM_VERSION}&ConnectionId=${connectionId}`;

  // Cloudflare Workers support WebSocket clients via fetch
  const resp = await fetch(url, {
    headers: {
      "Upgrade": "websocket",
      "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_VERSION} Safari/537.36 Edg/${CHROMIUM_VERSION}`,
      "Origin": "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
      "Pragma": "no-cache",
      "Cache-Control": "no-cache",
    },
  });

  if (resp.status !== 101) {
    throw new Error(`WebSocket upgrade failed: HTTP ${resp.status}`);
  }

  const ws = resp.webSocket;
  if (!ws) {
    throw new Error("No WebSocket in response");
  }

  ws.accept();

  // Send config
  ws.send(
    `Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
      JSON.stringify({
        context: {
          synthesis: {
            audio: {
              metadataoptions: { sentenceBoundaryEnabled: "false", wordBoundaryEnabled: "false" },
              outputFormat: "audio-24khz-48kbitrate-mono-mp3",
            },
          },
        },
      }) +
      "\r\n"
  );

  // Send SSML
  const ssml =
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>` +
    `<voice name='${voice}'>` +
    `<prosody rate='${rate}' pitch='${pitch}' volume='${volume}'>` +
    escapeXml(text) +
    `</prosody></voice></speak>`;

  ws.send(
    `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}\r\n`
  );

  // Collect audio
  return new Promise((resolve, reject) => {
    const audioChunks: Uint8Array[] = [];
    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        ws.close();
        reject(new Error("TTS synthesis timed out (15s)"));
      }
    }, 15_000);

    ws.addEventListener("message", (event: MessageEvent) => {
      if (typeof event.data === "string") {
        const msg = parseMessage(event.data);
        if (msg.headers.Path === "turn.end") {
          clearTimeout(timeout);
          if (!settled) {
            settled = true;
            ws.close();
            const totalLength = audioChunks.reduce((sum, c) => sum + c.length, 0);
            const result = new Uint8Array(totalLength);
            let offset = 0;
            for (const chunk of audioChunks) {
              result.set(chunk, offset);
              offset += chunk.length;
            }
            resolve(result);
          }
        }
      } else if (event.data instanceof ArrayBuffer) {
        // Skip 2-byte header prefix
        if (event.data.byteLength > 2) {
          audioChunks.push(new Uint8Array(event.data, 2));
        }
      }
    });

    ws.addEventListener("error", () => {
      clearTimeout(timeout);
      if (!settled) {
        settled = true;
        reject(new Error("WebSocket connection error"));
      }
    });

    ws.addEventListener("close", () => {
      clearTimeout(timeout);
      if (!settled) {
        settled = true;
        reject(new Error("WebSocket closed unexpectedly"));
      }
    });
  });
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
