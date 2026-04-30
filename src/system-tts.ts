import { ChunkLanguage, PlaybackState, TextChunk, TtsReaderSettings } from "./types";

type SettingsProvider = () => TtsReaderSettings;
type StateListener = (state: PlaybackState) => void;

export class SystemTtsEngine {
  private chunks: TextChunk[] = [];
  private currentIndex = 0;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private isStopped = true;
  private paused = false;
  private sessionId = 0;

  constructor(
    private readonly getSettings: SettingsProvider,
    private readonly onStateChange: StateListener
  ) {}

  isSupported(): boolean {
    return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
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
    if (!this.isSupported()) {
      return [];
    }

    const synthesis = window.speechSynthesis;
    const voices = synthesis.getVoices();
    if (voices.length > 0) {
      return voices;
    }

    return new Promise((resolve) => {
      const timeout = window.setTimeout(() => {
        synthesis.removeEventListener("voiceschanged", handleVoicesChanged);
        resolve(synthesis.getVoices());
      }, 800);

      const handleVoicesChanged = () => {
        window.clearTimeout(timeout);
        synthesis.removeEventListener("voiceschanged", handleVoicesChanged);
        resolve(synthesis.getVoices());
      };

      synthesis.addEventListener("voiceschanged", handleVoicesChanged);
    });
  }

  async speak(chunks: TextChunk[], startIndex = 0): Promise<void> {
    if (!this.isSupported()) {
      throw new Error("System text-to-speech is not available in this Obsidian environment.");
    }

    this.stop(false);
    await this.getVoices();

    this.sessionId += 1;
    this.chunks = chunks;
    this.currentIndex = Math.max(0, Math.min(startIndex, chunks.length - 1));
    this.isStopped = false;
    this.paused = false;

    this.emit("preparing");
    this.speakCurrent(this.sessionId);
  }

  pause(): void {
    if (!this.isSupported() || !this.isActive() || this.paused) {
      return;
    }

    window.speechSynthesis.pause();
    this.paused = true;
    this.emit("paused");
  }

  resume(): void {
    if (!this.isSupported() || !this.isActive() || !this.paused) {
      return;
    }

    window.speechSynthesis.resume();
    this.paused = false;
    this.emit("speaking");
  }

  stop(emitState = true): void {
    this.sessionId += 1;
    this.isStopped = true;
    this.paused = false;
    this.currentUtterance = null;

    if (this.isSupported()) {
      window.speechSynthesis.cancel();
    }

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

  seekBy(seconds: number): void {
    if (!this.isActive()) return;
    // SystemTTS has no precise time seeking; approximate with chunk navigation
    if (seconds < 0) {
      this.previous();
    } else {
      this.next();
    }
  }

  private jumpTo(index: number): void {
    if (!this.isSupported()) {
      return;
    }

    this.sessionId += 1;
    this.currentIndex = index;
    this.paused = false;
    window.speechSynthesis.cancel();
    this.speakCurrent(this.sessionId);
  }

  private speakCurrent(sessionId: number): void {
    if (this.isStopped || sessionId !== this.sessionId) {
      return;
    }

    if (this.currentIndex >= this.chunks.length) {
      this.isStopped = true;
      this.paused = false;
      this.currentUtterance = null;
      this.emit("idle", "Finished reading.");
      return;
    }

    const chunk = this.chunks[this.currentIndex];
    const settings = this.getSettings();
    const utterance = new SpeechSynthesisUtterance(chunk.text);
    const voice = this.pickVoice(chunk.language);

    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = chunk.language === "en" ? "en-US" : "zh-CN";
    }

    utterance.rate = settings.rate;
    utterance.pitch = settings.pitch;
    utterance.volume = settings.volume;

    utterance.onstart = () => {
      if (sessionId === this.sessionId) {
        this.emit("speaking");
      }
    };

    utterance.onend = () => {
      if (this.isStopped || sessionId !== this.sessionId) {
        return;
      }
      this.currentIndex += 1;
      this.speakCurrent(sessionId);
    };

    utterance.onerror = (event) => {
      if (this.isStopped || sessionId !== this.sessionId) {
        return;
      }
      this.isStopped = true;
      this.paused = false;
      this.emit("error", `TTS error: ${event.error}`);
    };

    this.currentUtterance = utterance;
    window.speechSynthesis.speak(utterance);
  }

  private pickVoice(language: ChunkLanguage): SpeechSynthesisVoice | null {
    const voices = window.speechSynthesis.getVoices();
    const settings = this.getSettings();

    const preferredURIs = [
      settings.defaultVoiceURI,
      language === "en" ? settings.englishVoiceURI : "",
      language === "zh" || language === "mixed" ? settings.chineseVoiceURI : "",
      language === "mixed" ? settings.englishVoiceURI : ""
    ].filter((uri) => uri.length > 0);

    for (const uri of preferredURIs) {
      const voice = voices.find((candidate) => candidate.voiceURI === uri);
      if (voice) {
        return voice;
      }
    }

    if (language === "en") {
      return findVoiceByLanguage(voices, ["en-US", "en-GB", "en"]);
    }

    if (language === "zh" || language === "mixed") {
      return findVoiceByLanguage(voices, ["zh-CN", "zh-Hans", "zh"]);
    }

    return voices[0] ?? null;
  }

  private emit(status: PlaybackState["status"], message?: string): void {
    this.onStateChange({
      status,
      chunkIndex: this.currentIndex,
      chunkCount: this.chunks.length,
      message
    });
  }
}

function findVoiceByLanguage(voices: SpeechSynthesisVoice[], languagePrefixes: string[]): SpeechSynthesisVoice | null {
  for (const prefix of languagePrefixes) {
    const exact = voices.find((voice) => voice.lang.toLowerCase() === prefix.toLowerCase());
    if (exact) {
      return exact;
    }
  }

  for (const prefix of languagePrefixes) {
    const lowerPrefix = prefix.toLowerCase();
    const partial = voices.find((voice) => voice.lang.toLowerCase().startsWith(lowerPrefix));
    if (partial) {
      return partial;
    }
  }

  return null;
}
