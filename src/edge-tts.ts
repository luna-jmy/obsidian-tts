import { Platform, requestUrl } from "obsidian";
import { ChunkLanguage, PlaybackState, TextChunk, TtsReaderSettings } from "./types";

// Default Cloudflare Worker URL — replace with your own after deployment
const DEFAULT_PROXY_URL = "https://edge-tts-proxy.your-name.workers.dev";

export const EDGE_VOICES = {
	chinese: [
		{ name: "zh-CN-XiaoxiaoNeural", label: "晓晓 (女, 通用)" },
		{ name: "zh-CN-XiaoyiNeural", label: "晓伊 (女, 活泼)" },
		{ name: "zh-CN-YunjianNeural", label: "云健 (男, 热情)" },
		{ name: "zh-CN-YunxiNeural", label: "云希 (男, 阳光)" },
		{ name: "zh-CN-YunxiaNeural", label: "云夏 (男, 可爱)" },
		{ name: "zh-CN-YunyangNeural", label: "云扬 (男, 专业)" },
	],
	english: [
		{ name: "en-US-JennyNeural", label: "Jenny (Female, Friendly)" },
		{ name: "en-US-AriaNeural", label: "Aria (Female, Confident)" },
		{ name: "en-US-GuyNeural", label: "Guy (Male, Passionate)" },
		{ name: "en-US-ChristopherNeural", label: "Christopher (Male, Authoritative)" },
		{ name: "en-US-MichelleNeural", label: "Michelle (Female, Pleasant)" },
		{ name: "en-US-RogerNeural", label: "Roger (Male, Lively)" },
	],
};

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

		this.sessionId += 1;
		this.chunks = chunks;
		this.currentIndex = Math.max(0, Math.min(startIndex, chunks.length - 1));
		this.isStopped = false;
		this.paused = false;

		this.emit("preparing");
		await this.synthesizeAndPlay(this.sessionId);
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
		this.cleanup();

		if (emitState) {
			this.emit("stopped");
		}
	}

	next(): void {
		if (!this.isActive()) {
			return;
		}

		const nextIndex = Math.min(this.currentIndex + 1, this.chunks.length - 1);
		this.jumpTo(nextIndex);
	}

	previous(): void {
		if (!this.isActive()) {
			return;
		}

		const previousIndex = Math.max(this.currentIndex - 1, 0);
		this.jumpTo(previousIndex);
	}

	private jumpTo(index: number): void {
		this.sessionId += 1;
		this.currentIndex = index;
		this.paused = false;
		this.cleanup();
		this.synthesizeAndPlay(this.sessionId);
	}

	private async synthesizeAndPlay(sessionId: number): Promise<void> {
		if (this.isStopped || sessionId !== this.sessionId) {
			return;
		}

		if (this.currentIndex >= this.chunks.length) {
			this.isStopped = true;
			this.paused = false;
			this.emit("idle", "Finished reading.");
			return;
		}

		const chunk = this.chunks[this.currentIndex];
		const settings = this.getSettings();
		const voice = this.pickVoice(chunk.language);

		try {
			const proxyUrl = settings.proxyUrl || DEFAULT_PROXY_URL;
			const response = await requestUrl({
				url: proxyUrl,
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					text: chunk.text,
					voice,
					rate: this.toProsodyPercent(settings.rate),
					volume: this.toProsodyPercent(settings.volume),
					pitch: this.toProsodyHz(settings.pitch),
				}),
			});

			if (this.isStopped || sessionId !== this.sessionId) {
				return;
			}

			// response.arrayBuffer is available from Obsidian requestUrl
			const audioBuffer = response.arrayBuffer;
			const blob = new Blob([audioBuffer], { type: "audio/mpeg" });
			const url = URL.createObjectURL(blob);
			this.currentBlobUrl = url;

			const audio = new Audio(url);
			this.audioElement = audio;

			audio.onplay = () => {
				if (sessionId === this.sessionId) {
					this.emit("speaking");
				}
			};

			audio.onended = () => {
				if (this.isStopped || sessionId !== this.sessionId) {
					return;
				}

				this.cleanup();
				this.currentIndex += 1;
				this.synthesizeAndPlay(sessionId);
			};

			audio.onerror = () => {
				if (this.isStopped || sessionId !== this.sessionId) {
					return;
				}

				this.isStopped = true;
				this.paused = false;
				this.emit("error", "Audio playback failed.");
			};

			await audio.play();
		} catch (error) {
			if (this.isStopped || sessionId !== this.sessionId) {
				return;
			}

			this.isStopped = true;
			this.paused = false;
			const message =
				error instanceof Error
					? error.message
					: typeof error === "object" && error !== null
						? JSON.stringify(error)
						: String(error);
			this.emit("error", `Edge TTS error: ${message}`);
		}
	}

	private pickVoice(language: ChunkLanguage): string {
		const settings = this.getSettings();

		if (language === "zh" || language === "mixed") {
			return settings.edgeChineseVoice;
		}

		if (language === "en") {
			return settings.edgeEnglishVoice;
		}

		return settings.edgeEnglishVoice;
	}

	private toProsodyPercent(value: number): string {
		const percent = Math.round((value - 1) * 100);
		return `${percent >= 0 ? "+" : ""}${percent}%`;
	}

	private toProsodyHz(value: number): string {
		const hz = Math.round((value - 1) * 10);
		return `${hz >= 0 ? "+" : ""}${hz}Hz`;
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
