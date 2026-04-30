import { requestUrl } from "obsidian";
import { ChunkLanguage, PlaybackState, TextChunk, TtsReaderSettings } from "./types";

// Baidu free TTS voices
const BAIDU_VOICES = {
	chinese: [
		{ key: "0", label: "女声 (默认)" },
		{ key: "1", label: "男声" },
		{ key: "3", label: "情感合成-度逍遥" },
		{ key: "4", label: "情感合成-度丫丫" },
		{ key: "5", label: "度小娇" },
		{ key: "6", label: "度小美" },
		{ key: "7", label: "度小宇" },
	],
	english: [
		{ key: "0", label: "Female (default)" },
		{ key: "1", label: "Male" },
	],
};

export { BAIDU_VOICES };

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
			// Baidu TTS: simple HTTP GET, returns MP3
			const speed = Math.round(settings.rate * 5);
			const url = `https://tts.baidu.com/text2audio?lan=${voice}&ie=UTF-8&spd=${speed}&pit=${Math.round(settings.pitch * 5)}&vol=${Math.round(settings.volume * 15)}&per=${settings.baiduVoiceKey}&tex=${encodeURIComponent(chunk.text)}`;

			const response = await requestUrl({ url });

			if (this.isStopped || sessionId !== this.sessionId) {
				return;
			}

			const audioBuffer = response.arrayBuffer;
			const blob = new Blob([audioBuffer], { type: "audio/mpeg" });
			const blobUrl = URL.createObjectURL(blob);
			this.currentBlobUrl = blobUrl;

			const audio = new Audio(blobUrl);
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
			this.emit("error", `TTS error: ${message}`);
		}
	}

	private pickVoice(language: ChunkLanguage): string {
		if (language === "en") {
			return "en";
		}
		return "zh";
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
