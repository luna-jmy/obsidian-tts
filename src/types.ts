export type ChunkLanguage = "zh" | "en" | "mixed" | "unknown";

export interface TextChunk {
  text: string;
  language: ChunkLanguage;
}

export interface CleanupSettings {
  skipFrontmatter: boolean;
  skipCodeBlocks: boolean;
  skipHtmlBlocks: boolean;
  skipEmbeds: boolean;
  skipImages: boolean;
  skipTables: boolean;
}

export interface TtsReaderSettings {
  defaultVoiceURI: string;
  chineseVoiceURI: string;
  englishVoiceURI: string;
  rate: number;
  pitch: number;
  volume: number;
  chunkSize: number;
  cleanup: CleanupSettings;
  edgeChineseVoice: string;
  edgeEnglishVoice: string;
  proxyUrl: string;
  baiduVoiceKey: string;
}

export type PlaybackStatus =
  | "idle"
  | "preparing"
  | "speaking"
  | "paused"
  | "stopped"
  | "error";

export interface PlaybackState {
  status: PlaybackStatus;
  chunkIndex: number;
  chunkCount: number;
  message?: string;
}

export const DEFAULT_SETTINGS: TtsReaderSettings = {
  defaultVoiceURI: "",
  chineseVoiceURI: "",
  englishVoiceURI: "",
  rate: 1,
  pitch: 1,
  volume: 1,
  chunkSize: 650,
  cleanup: {
    skipFrontmatter: true,
    skipCodeBlocks: true,
    skipHtmlBlocks: true,
    skipEmbeds: true,
    skipImages: true,
    skipTables: false
  },
  edgeChineseVoice: "zh-CN-XiaoxiaoNeural",
  edgeEnglishVoice: "en-US-JennyNeural",
  proxyUrl: "",
  baiduVoiceKey: "0"
};
