import { requestUrl } from "obsidian";
import { PlaybackState, TextChunk, TtsReaderSettings } from "./types";

// Tencent Cloud TTS voice types
export const TENCENT_VOICES = [
	{ key: "1001", label: "智瑜 (女声)" },
	{ key: "1002", label: "智美 (女声)" },
	{ key: "1003", label: "智强 (男声)" },
	{ key: "1004", label: "智甜 (女声)" },
	{ key: "1005", label: "智强（多语种）" },
	{ key: "1006", label: "智琳（粤语女声）" },
	{ key: "1007", label: "智琪 (女声)" },
	{ key: "1008", label: "智诚 (男声)" },
	{ key: "1009", label: "智蓉 (女声)" },
	{ key: "1010", label: "智皓（多语种男声）" },
	{ key: "1017", label: "智瑜（英文女声）" },
	{ key: "1018", label: "智强（英文男声）" },
];

type SettingsProvider = () => TtsReaderSettings;
type StateListener = (state: PlaybackState) => void;

export class EdgeTtsEngine {
	private chunks: TextChunk[] = [];
	private currentIndex = 0;
	private isStopped = true;
	private paused = false;
	private sessionId = 0;
	private audioElement: HTMLAudioElement | null = null;
	private currentBlobUrl: string | null = null;
	private prefetchedAudio: string | null = null;
	private static readonly MAX_CHUNK_CHARS = 150; // Tencent TextToVoice limit

	constructor(
		private readonly getSettings: SettingsProvider,
		private readonly onStateChange: StateListener,
	) {}

	isSupported(): boolean {
		return true;
	}

	isActive(): boolean {
		return !this.isStopped && this.chunks.length > 0;
	}

	isPaused(): boolean {
		return this.paused;
	}

	getCurrentIndex(): number {
		return this.currentIndex;
	}

	async getVoices(): Promise<SpeechSynthesisVoice[]> {
		return [];
	}

	async speak(chunks: TextChunk[], startIndex = 0): Promise<void> {
		this.stop(false);

		this.chunks = this.rechunkForTencent(chunks);
		this.currentIndex = Math.max(0, Math.min(startIndex, this.chunks.length - 1));
		this.isStopped = false;
		this.paused = false;

		this.sessionId += 1;
		const sid = this.sessionId;

		this.emit("preparing");
		await this.synthesizeAndPlay(sid);
	}

	pause(): void {
		if (!this.isActive() || this.paused) {
			return;
		}
		this.audioElement?.pause();
		this.paused = true;
		this.emit("paused");
	}

	resume(): void {
		if (!this.isActive() || !this.paused) {
			return;
		}
		this.audioElement?.play().catch(() => {});
		this.paused = false;
		this.emit("speaking");
	}

	stop(emitState = true): void {
		this.sessionId += 1;
		this.isStopped = true;
		this.paused = false;
		this.prefetchedAudio = null;
		this.cleanup();
		if (emitState) {
			this.emit("stopped");
		}
	}

	next(): void {
		if (!this.isActive()) return;
		this.jumpTo(Math.min(this.currentIndex + 1, this.chunks.length - 1));
	}

	previous(): void {
		if (!this.isActive()) return;
		this.jumpTo(Math.max(this.currentIndex - 1, 0));
	}

	private jumpTo(index: number): void {
		this.sessionId += 1;
		this.currentIndex = index;
		this.paused = false;
		this.prefetchedAudio = null;
		this.cleanup();
		this.synthesizeAndPlay(this.sessionId);
	}

	private rechunkForTencent(chunks: TextChunk[]): TextChunk[] {
		const result: TextChunk[] = [];
		for (const chunk of chunks) {
			if (chunk.text.length <= EdgeTtsEngine.MAX_CHUNK_CHARS) {
				result.push(chunk);
			} else {
				const sentences = chunk.text.split(/(?<=[。！？.!?\n])/g);
				let buffer = "";
				let lang = chunk.language;
				for (const s of sentences) {
					if (buffer.length + s.length > EdgeTtsEngine.MAX_CHUNK_CHARS && buffer.length > 0) {
						result.push({ text: buffer, language: lang });
						buffer = s;
					} else {
						buffer += s;
					}
				}
				if (buffer.length > 0) {
					result.push({ text: buffer, language: lang });
				}
			}
		}
		return result;
	}

	private async synthesizeAndPlay(sessionId: number): Promise<void> {
		if (this.isStopped || sessionId !== this.sessionId) return;

		if (this.currentIndex >= this.chunks.length) {
			this.isStopped = true;
			this.paused = false;
			this.emit("idle", "Finished reading.");
			return;
		}

		const chunk = this.chunks[this.currentIndex];
		const settings = this.getSettings();

		if (!settings.tencentSecretId || !settings.tencentSecretKey) {
			this.isStopped = true;
			this.emit("error", "Please set Tencent Cloud SecretId and SecretKey in settings.");
			return;
		}

		try {
			let audioBase64: string;
			if (this.prefetchedAudio) {
				audioBase64 = this.prefetchedAudio;
				this.prefetchedAudio = null;
			} else {
				audioBase64 = await this.callTencentTts(chunk.text, settings);
			}

			if (this.isStopped || sessionId !== this.sessionId) return;

			const binaryStr = atob(audioBase64);
			const bytes = new Uint8Array(binaryStr.length);
			for (let i = 0; i < binaryStr.length; i++) {
				bytes[i] = binaryStr.charCodeAt(i);
			}

			const blob = new Blob([bytes], { type: "audio/mp3" });
			const blobUrl = URL.createObjectURL(blob);
			this.currentBlobUrl = blobUrl;

			const audio = new Audio(blobUrl);
			this.audioElement = audio;

			audio.onplay = () => {
				if (sessionId === this.sessionId) {
					this.emit("speaking");
				}
				// Pre-fetch next chunk while current one plays
				const nextIndex = this.currentIndex + 1;
				if (nextIndex < this.chunks.length) {
					const nextChunk = this.chunks[nextIndex];
					this.callTencentTts(nextChunk.text, settings).then((base64) => {
						if (sessionId === this.sessionId && !this.isStopped) {
							this.prefetchedAudio = base64;
						}
					}).catch(() => {});
				}
			};

			audio.onended = () => {
				if (this.isStopped || sessionId !== this.sessionId) return;
				this.cleanup();
				this.currentIndex += 1;
				this.synthesizeAndPlay(sessionId);
			};

			audio.onerror = () => {
				if (this.isStopped || sessionId !== this.sessionId) return;
				this.isStopped = true;
				this.paused = false;
				this.emit("error", "Audio playback failed.");
			};

			await audio.play();
		} catch (error) {
			if (this.isStopped || sessionId !== this.sessionId) return;
			this.isStopped = true;
			this.paused = false;
			const message =
				error instanceof Error ? error.message : String(error);
			this.emit("error", `TTS error: ${message}`);
		}
	}

	private async callTencentTts(text: string, settings: TtsReaderSettings): Promise<string> {
		const host = "tts.tencentcloudapi.com";
		const service = "tts";
		const action = "TextToVoice";
		const version = "2019-08-23";
		const timestamp = Math.floor(Date.now() / 1000);
		const date = new Date(timestamp * 1000).toISOString().split("T")[0];

		// Speed: Tencent range -2 (slowest) to 6 (fastest), default 0
		// Map settings.rate 0.5-2.0 to -2..4 (0.5→-2, 1.0→0, 2.0→4)
		const speed = Math.max(-2, Math.min(6, Math.round((settings.rate - 1) * 4)));

		const payload = JSON.stringify({
			Text: text,
			SessionId: crypto.randomUUID(),
			VoiceType: parseInt(settings.tencentVoiceType) || 1001,
			Speed: speed,
			Volume: Math.round(settings.volume * 5),
		});

		const contentType = "application/json; charset=utf-8";

		// Step 1: Build canonical request
		const httpRequestMethod = "POST";
		const canonicalUri = "/";
		const canonicalQueryString = "";
		const canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-tc-action:${action.toLowerCase()}\n`;
		const signedHeaders = "content-type;host;x-tc-action";
		const hashedPayload = await sha256Hex(payload);
		const canonicalRequest = [
			httpRequestMethod,
			canonicalUri,
			canonicalQueryString,
			canonicalHeaders,
			signedHeaders,
			hashedPayload,
		].join("\n");

		// Step 2: Build string to sign
		const algorithm = "TC3-HMAC-SHA256";
		const credentialScope = `${date}/${service}/tc3_request`;
		const hashedCanonicalRequest = await sha256Hex(canonicalRequest);
		const stringToSign = [algorithm, timestamp, credentialScope, hashedCanonicalRequest].join("\n");

		// Step 3: Calculate signature
		const secretDate = await hmacSha256(`TC3${settings.tencentSecretKey}`, date);
		const secretService = await hmacSha256(secretDate, service);
		const secretSigning = await hmacSha256(secretService, "tc3_request");
		const signature = await hmacSha256Hex(secretSigning, stringToSign);

		// Step 4: Build authorization
		const authorization = `${algorithm} Credential=${settings.tencentSecretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

		// Step 5: Make request
		const response = await requestUrl({
			url: `https://${host}`,
			method: "POST",
			headers: {
				"Content-Type": contentType,
				"Host": host,
				"X-TC-Action": action,
				"X-TC-Version": version,
				"X-TC-Timestamp": String(timestamp),
				"X-TC-Region": "ap-beijing",
				"Authorization": authorization,
			},
			body: payload,
		});

		const json = response.json;
		if (json?.Response?.Error) {
			throw new Error(json.Response.Error.Message || json.Response.Error.Code);
		}
		if (!json?.Response?.Audio) {
			throw new Error("No audio in response");
		}

		return json.Response.Audio;
	}

	private cleanup(): void {
		if (this.audioElement) {
			this.audioElement.onplay = null;
			this.audioElement.onended = null;
			this.audioElement.onerror = null;
			this.audioElement.pause();
			this.audioElement.src = "";
			this.audioElement = null;
		}
		if (this.currentBlobUrl) {
			URL.revokeObjectURL(this.currentBlobUrl);
			this.currentBlobUrl = null;
		}
	}

	private emit(status: PlaybackState["status"], message?: string): void {
		this.onStateChange({
			status,
			chunkIndex: this.currentIndex,
			chunkCount: this.chunks.length,
			message,
		});
	}
}

// --- Crypto helpers using Web Crypto API ---

async function sha256Hex(data: string): Promise<string> {
	const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
	return arrayBufferToHex(buf);
}

async function hmacSha256(key: ArrayBuffer | string, data: string): Promise<ArrayBuffer> {
	const keyBuf = typeof key === "string" ? new TextEncoder().encode(key) : key;
	const cryptoKey = await crypto.subtle.importKey("raw", keyBuf, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
}

async function hmacSha256Hex(key: ArrayBuffer, data: string): Promise<string> {
	const buf = await hmacSha256(key, data);
	return arrayBufferToHex(buf);
}

function arrayBufferToHex(buf: ArrayBuffer): string {
	return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}
