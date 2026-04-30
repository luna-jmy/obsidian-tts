import { Editor, MarkdownView, Notice, Platform, Plugin, TFile } from "obsidian";
import { EdgeTtsEngine } from "./edge-tts";
import { TtsReaderSettingTab } from "./settings";
import { SystemTtsEngine } from "./system-tts";
import { chunkTextForSpeech, cleanMarkdownForSpeech, extractCurrentSection } from "./text";
import { DEFAULT_SETTINGS, PlaybackState, TextChunk, TtsReaderSettings } from "./types";

export default class TtsReaderPlugin extends Plugin {
  settings: TtsReaderSettings = { ...DEFAULT_SETTINGS };
  tts!: SystemTtsEngine | EdgeTtsEngine;
  private statusBarEl: HTMLElement | null = null;
  private lastChunks: TextChunk[] = [];

  async onload(): Promise<void> {
    await this.loadSettings();

    this.statusBarEl = this.addStatusBarItem();
    this.statusBarEl.addClass("tts-reader-status");
    this.updateStatus({ status: "idle", chunkIndex: 0, chunkCount: 0 });

    this.tts = Platform.isAndroidApp
      ? new EdgeTtsEngine(
          () => this.settings,
          (state) => this.updateStatus(state)
        )
      : new SystemTtsEngine(
          () => this.settings,
          (state) => this.updateStatus(state)
        );

    this.addRibbonIcon("volume-2", "Read current note", () => {
      void this.toggleCurrentNoteReading();
    });

    this.addCommand({
      id: "read-current-note",
      name: "Read current note",
      callback: () => {
        void this.readCurrentNote();
      }
    });

    this.addCommand({
      id: "read-selection",
      name: "Read selection",
      editorCallback: (editor) => {
        void this.readSelection(editor);
      }
    });

    this.addCommand({
      id: "read-current-section",
      name: "Read current section",
      editorCallback: (editor) => {
        void this.readCurrentSection(editor);
      }
    });

    this.addCommand({
      id: "pause-resume",
      name: "Pause or resume reading",
      callback: () => {
        this.pauseOrResume();
      }
    });

    this.addCommand({
      id: "stop",
      name: "Stop reading",
      callback: () => {
        this.tts.stop();
      }
    });

    this.addCommand({
      id: "previous-chunk",
      name: "Read previous chunk",
      callback: () => {
        this.tts.previous();
      }
    });

    this.addCommand({
      id: "next-chunk",
      name: "Read next chunk",
      callback: () => {
        this.tts.next();
      }
    });

    this.addSettingTab(new TtsReaderSettingTab(this.app, this));
  }

  onunload(): void {
    this.tts.stop(false);
  }

  async loadSettings(): Promise<void> {
    const saved = await this.loadData();
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...saved,
      cleanup: {
        ...DEFAULT_SETTINGS.cleanup,
        ...saved?.cleanup
      }
    };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async readCurrentNote(): Promise<void> {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const file = view?.file;

    if (!file) {
      new Notice("Open a Markdown note before starting TTS.");
      return;
    }

    const markdown = await this.app.vault.cachedRead(file);
    await this.speakMarkdown(markdown, file);
  }

  async readSelection(editor: Editor): Promise<void> {
    const selection = editor.getSelection().trim();

    if (selection.length === 0) {
      new Notice("Select text before using Read selection.");
      return;
    }

    await this.speakMarkdown(selection, "Selection");
  }

  async readCurrentSection(editor: Editor): Promise<void> {
    const markdown = editor.getValue();
    const section = extractCurrentSection(markdown, editor.getCursor().line);
    await this.speakMarkdown(section, "Current section");
  }

  async speakPlainText(text: string, label: string): Promise<void> {
    const chunks = chunkTextForSpeech(text, this.settings.chunkSize);
    await this.speakChunks(chunks, label);
  }

  private async toggleCurrentNoteReading(): Promise<void> {
    if (this.tts.isActive()) {
      this.tts.stop();
      return;
    }

    await this.readCurrentNote();
  }

  private pauseOrResume(): void {
    if (!this.tts.isActive()) {
      new Notice("Nothing is being read.");
      return;
    }

    if (this.tts.isPaused()) {
      this.tts.resume();
    } else {
      this.tts.pause();
    }
  }

  private async speakMarkdown(markdown: string, source: TFile | string): Promise<void> {
    const cleanText = cleanMarkdownForSpeech(markdown, this.settings.cleanup);
    const chunks = chunkTextForSpeech(cleanText, this.settings.chunkSize);
    const label = typeof source === "string" ? source : source.basename;

    await this.speakChunks(chunks, label);
  }

  private async speakChunks(chunks: TextChunk[], label: string): Promise<void> {
    if (chunks.length === 0) {
      new Notice("There is no readable text after cleanup.");
      return;
    }

    if (!this.tts.isSupported()) {
      new Notice("System text-to-speech is not available in this Obsidian environment.");
      return;
    }

    this.lastChunks = chunks;
    try {
      await this.tts.speak(chunks);
      new Notice(`Reading ${label}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(message);
      this.updateStatus({
        status: "error",
        chunkIndex: 0,
        chunkCount: chunks.length,
        message
      });
    }
  }

  private updateStatus(state: PlaybackState): void {
    if (!this.statusBarEl) {
      return;
    }

    if (state.status === "speaking" || state.status === "paused") {
      const current = Math.min(state.chunkIndex + 1, state.chunkCount);
      this.statusBarEl.setText(`TTS ${state.status} ${current}/${state.chunkCount}`);
      return;
    }

    if (state.status === "error") {
      this.statusBarEl.setText("TTS error");
      if (state.message) {
        new Notice(state.message);
      }
      return;
    }

    this.statusBarEl.setText(`TTS ${state.status}`);
  }
}
