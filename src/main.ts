import { Editor, MarkdownView, Notice, Platform, Plugin, TFile } from "obsidian";
import { EdgeTtsEngine } from "./edge-tts";
import { PlaybackFloatingBar } from "./playback-floating";
import { TtsPlaybackView, TTS_PLAYBACK_VIEW_TYPE } from "./playback-sidebar";
import { TtsReaderSettingTab } from "./settings";
import { SystemTtsEngine } from "./system-tts";
import { chunkTextForSpeech, cleanMarkdownForSpeech, extractCurrentSection } from "./text";
import { DEFAULT_SETTINGS, PlaybackState, TextChunk, TtsReaderSettings } from "./types";

export default class TtsReaderPlugin extends Plugin {
  settings: TtsReaderSettings = { ...DEFAULT_SETTINGS };
  tts!: SystemTtsEngine | EdgeTtsEngine;
  private playbackUI: PlaybackFloatingBar | null = null;
  private statusBarEl: HTMLElement | null = null;
  private lastChunks: TextChunk[] = [];
  private lastFile: TFile | null = null;

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

    this.registerView(TTS_PLAYBACK_VIEW_TYPE, (leaf) => new TtsPlaybackView(leaf, this));
    this.initPlaybackUI();

    this.addRibbonIcon("volume-2", "Open TTS player", () => {
      void this.openTtsPlayer();
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
        this.ttsStop();
      }
    });

    this.addCommand({
      id: "previous-chunk",
      name: "Read previous chunk",
      callback: () => {
        this.ttsPrevious();
      }
    });

    this.addCommand({
      id: "next-chunk",
      name: "Read next chunk",
      callback: () => {
        this.ttsNext();
      }
    });

    this.addCommand({
      id: "open-tts-panel",
      name: "Open TTS playback panel",
      callback: () => {
        void this.activateSidebarView();
      }
    });

    this.addSettingTab(new TtsReaderSettingTab(this.app, this));

    // Re-prepare when user switches to a different note
    const onLeafChange = () => {
      const file = this.app.workspace.getActiveFile();
      if (!file || file === this.lastFile) return;
      if (this.lastChunks.length === 0) return;
      void this.prepareForFile(file);
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.app.workspace as any).on("active-leaf-change", onLeafChange);
    this.register(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.app.workspace as any).off("active-leaf-change", onLeafChange);
    });
  }

  onunload(): void {
    this.tts.stop(false);
    this.playbackUI?.destroy();
    this.playbackUI = null;
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

  // --- New UX: Icon opens player UI without auto-playing ---

  async openTtsPlayer(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new Notice("Open a Markdown note before starting TTS.");
      return;
    }
    await this.prepareForFile(file);

    // Open sidebar if in sidebar mode
    if (this.settings.controlPosition === "sidebar") {
      await this.activateSidebarView();
    }
  }

  private async prepareForFile(file: TFile): Promise<void> {
    // Stop any current playback
    if (this.tts.isActive()) {
      this.tts.stop(false);
    }

    const markdown = await this.app.vault.cachedRead(file);
    const cleanText = cleanMarkdownForSpeech(markdown, this.settings.cleanup);
    const chunks = chunkTextForSpeech(cleanText, this.settings.chunkSize);

    if (chunks.length === 0) {
      new Notice("There is no readable text after cleanup.");
      return;
    }

    if (!this.tts.isSupported()) {
      new Notice("System text-to-speech is not available in this Obsidian environment.");
      return;
    }

    this.lastChunks = chunks;
    this.lastFile = file;

    // Show UI in "ready" state (prepared but not playing)
    this.updateStatus({
      status: "ready",
      chunkIndex: 0,
      chunkCount: chunks.length,
    });
  }

  // --- Playback control methods (called from UI buttons) ---

  async ttsPlayPause(): Promise<void> {
    if (this.tts.isActive()) {
      // Currently speaking or paused — toggle pause
      this.pauseOrResume();
    } else if (this.lastChunks.length > 0) {
      // Ready state — start playing from current position
      try {
        await this.tts.speak(this.lastChunks);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        new Notice(message);
      }
    }
  }

  ttsStop(): void {
    if (this.lastChunks.length > 0) {
      // Reset to beginning and show "ready" state
      this.tts.stop(false);
      this.updateStatus({
        status: "ready",
        chunkIndex: 0,
        chunkCount: this.lastChunks.length,
      });
    } else {
      this.tts.stop();
    }
  }

  ttsNext(): void {
    this.tts.next();
  }

  ttsPrevious(): void {
    this.tts.previous();
  }

  // --- Internal helpers ---

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

  pauseOrResume(): void {
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

  rebuildPlaybackUI(): void {
    this.playbackUI?.destroy();
    this.playbackUI = null;
    this.initPlaybackUI();
  }

  private initPlaybackUI(): void {
    if (this.settings.controlPosition === "floating") {
      this.playbackUI = new PlaybackFloatingBar(
        () => this.ttsPlayPause(),
        () => this.ttsStop(),
        () => this.ttsPrevious(),
        () => this.ttsNext(),
      );
    }
  }

  private async activateSidebarView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(TTS_PLAYBACK_VIEW_TYPE);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getRightLeaf(false);
    if (leaf) {
      await leaf.setViewState({ type: TTS_PLAYBACK_VIEW_TYPE, active: true });
      this.app.workspace.revealLeaf(leaf);
    }
  }

  private updateStatus(state: PlaybackState): void {
    if (!this.statusBarEl) {
      return;
    }

    if (state.status === "speaking" || state.status === "paused") {
      const current = Math.min(state.chunkIndex + 1, state.chunkCount);
      this.statusBarEl.setText(`TTS ${state.status} ${current}/${state.chunkCount}`);
    } else if (state.status === "ready") {
      this.statusBarEl.setText(`TTS ready ${state.chunkCount} chunks`);
    } else if (state.status === "error") {
      this.statusBarEl.setText("TTS error");
      if (state.message) {
        new Notice(state.message);
      }
    } else {
      this.statusBarEl.setText(`TTS ${state.status}`);
    }

    // Forward to playback UI
    this.playbackUI?.update(state);
    const leaves = this.app.workspace.getLeavesOfType(TTS_PLAYBACK_VIEW_TYPE);
    for (const leaf of leaves) {
      if (leaf.view instanceof TtsPlaybackView) {
        leaf.view.update(state);
      }
    }
  }
}
