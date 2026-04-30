import { CleanupSettings, ChunkLanguage, TextChunk } from "./types";

const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff]/;
const LATIN_RE = /[A-Za-z]/;
const COMMON_ABBREVIATIONS = new Set([
  "mr",
  "mrs",
  "ms",
  "dr",
  "prof",
  "sr",
  "jr",
  "vs",
  "etc",
  "fig",
  "no",
  "e.g",
  "i.e"
]);

export function cleanMarkdownForSpeech(markdown: string, settings: CleanupSettings): string {
  let text = markdown.replace(/\r\n/g, "\n");

  if (settings.skipFrontmatter) {
    text = stripFrontmatter(text);
  }

  if (settings.skipCodeBlocks) {
    text = text
      .replace(/```[\s\S]*?```/g, "\n")
      .replace(/~~~[\s\S]*?~~~/g, "\n")
      .replace(/\$\$[\s\S]*?\$\$/g, "\n");
  }

  text = text.replace(/%%[\s\S]*?%%/g, "\n");

  if (settings.skipHtmlBlocks) {
    text = text
      .replace(/<!--[\s\S]*?-->/g, "\n")
      .replace(/<\/?[^>\n]+>/g, " ");
  }

  text = replaceEmbeds(text, settings.skipEmbeds);
  text = replaceMarkdownImages(text, settings.skipImages);
  text = replaceWikiLinks(text);
  text = replaceMarkdownLinks(text);

  if (settings.skipTables) {
    text = removeLikelyTables(text);
  }

  text = text
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/gm, "")
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, "")
    .replace(/^\s*\[![^\]]+\][+-]?\s*/gm, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/==(.*?)==/g, "$1");

  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n\n")
    .trim();
}

export function extractCurrentSection(markdown: string, currentLine: number): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const boundedLine = Math.max(0, Math.min(currentLine, lines.length - 1));
  let start = -1;
  let level = 0;

  for (let index = boundedLine; index >= 0; index -= 1) {
    const match = /^(#{1,6})\s+/.exec(lines[index]);
    if (match) {
      start = index;
      level = match[1].length;
      break;
    }
  }

  if (start === -1) {
    return extractCurrentParagraph(lines, boundedLine);
  }

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const match = /^(#{1,6})\s+/.exec(lines[index]);
    if (match && match[1].length <= level) {
      end = index;
      break;
    }
  }

  return lines.slice(start, end).join("\n");
}

export function chunkTextForSpeech(text: string, maxLength: number): TextChunk[] {
  const chunks: TextChunk[] = [];
  let current = "";
  const safeMaxLength = Math.max(160, maxLength);

  const flush = () => {
    const trimmed = current.trim();
    if (trimmed.length > 0) {
      chunks.push({
        text: trimmed,
        language: detectLanguage(trimmed)
      });
    }
    current = "";
  };

  const appendUnit = (unit: string) => {
    const trimmed = unit.trim();
    if (trimmed.length === 0) {
      return;
    }

    if (trimmed.length > safeMaxLength) {
      flush();
      splitLongText(trimmed, safeMaxLength).forEach((part) => {
        chunks.push({
          text: part,
          language: detectLanguage(part)
        });
      });
      return;
    }

    const next = current.length === 0 ? trimmed : `${current} ${trimmed}`;
    if (next.length > safeMaxLength) {
      flush();
      current = trimmed;
    } else {
      current = next;
    }
  };

  text
    .split(/\n{2,}/)
    .flatMap((paragraph) => splitSentences(paragraph))
    .forEach(appendUnit);

  flush();
  return chunks;
}

export function detectLanguage(text: string): ChunkLanguage {
  const hasCjk = CJK_RE.test(text);
  const hasLatin = LATIN_RE.test(text);

  if (hasCjk && hasLatin) {
    return "mixed";
  }
  if (hasCjk) {
    return "zh";
  }
  if (hasLatin) {
    return "en";
  }
  return "unknown";
}

function stripFrontmatter(markdown: string): string {
  const lines = markdown.split("\n");
  if (lines[0]?.trim() !== "---") {
    return markdown;
  }

  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].trim() === "---") {
      return lines.slice(index + 1).join("\n");
    }
  }

  return markdown;
}

function replaceEmbeds(text: string, skipEmbeds: boolean): string {
  return text.replace(/!\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_match, target: string, alias?: string) => {
    if (skipEmbeds) {
      return " ";
    }
    return alias ?? readableFileName(target);
  });
}

function replaceMarkdownImages(text: string, skipImages: boolean): string {
  return text.replace(/!\[([^\]]*)\]\([^)]+\)/g, (_match, alt: string) => {
    if (skipImages) {
      return " ";
    }
    return alt;
  });
}

function replaceWikiLinks(text: string): string {
  return text.replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_match, target: string, alias?: string) => {
    return alias ?? readableFileName(target);
  });
}

function replaceMarkdownLinks(text: string): string {
  return text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

function readableFileName(target: string): string {
  return target
    .split("/")
    .pop()
    ?.replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .trim() ?? target;
}

function removeLikelyTables(text: string): string {
  return text
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed.includes("|")) {
        return true;
      }
      if (/^\|?[\s:|-]+\|[\s:|-]*$/.test(trimmed)) {
        return false;
      }
      return !(trimmed.startsWith("|") || trimmed.endsWith("|"));
    })
    .join("\n");
}

function extractCurrentParagraph(lines: string[], currentLine: number): string {
  let start = currentLine;
  let end = currentLine + 1;

  while (start > 0 && lines[start - 1].trim().length > 0) {
    start -= 1;
  }

  while (end < lines.length && lines[end].trim().length > 0) {
    end += 1;
  }

  return lines.slice(start, end).join("\n");
}

function splitSentences(paragraph: string): string[] {
  const normalized = paragraph.replace(/\s+/g, " ").trim();
  const result: string[] = [];
  let buffer = "";

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    buffer += char;

    if (/[。！？!?]/.test(char) || (char === "." && isSentencePeriod(normalized, index))) {
      result.push(buffer.trim());
      buffer = "";
    }
  }

  if (buffer.trim().length > 0) {
    result.push(buffer.trim());
  }

  return result.length > 0 ? result : [normalized];
}

function isSentencePeriod(text: string, index: number): boolean {
  const previous = text[index - 1] ?? "";
  const next = text[index + 1] ?? "";
  if (/\d/.test(previous) && /\d/.test(next)) {
    return false;
  }

  const previousWord = text
    .slice(Math.max(0, index - 12), index)
    .split(/\s+/)
    .pop()
    ?.toLowerCase();

  if (previousWord && COMMON_ABBREVIATIONS.has(previousWord)) {
    return false;
  }

  return next.length === 0 || /\s|["')\]]/.test(next);
}

function splitLongText(text: string, maxLength: number): string[] {
  const parts: string[] = [];
  let remaining = text.trim();

  while (remaining.length > maxLength) {
    const windowText = remaining.slice(0, maxLength);
    const breakAt = Math.max(
      windowText.lastIndexOf("。"),
      windowText.lastIndexOf("，"),
      windowText.lastIndexOf(","),
      windowText.lastIndexOf(" ")
    );
    const splitIndex = breakAt > maxLength * 0.5 ? breakAt + 1 : maxLength;
    parts.push(remaining.slice(0, splitIndex).trim());
    remaining = remaining.slice(splitIndex).trim();
  }

  if (remaining.length > 0) {
    parts.push(remaining);
  }

  return parts;
}
