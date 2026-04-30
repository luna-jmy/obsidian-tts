import { ItemView, setIcon, WorkspaceLeaf } from "obsidian";
import type { PlaybackState } from "./types";
import type TtsReaderPlugin from "./main";

export const TTS_PLAYBACK_VIEW_TYPE = "tts-playback";

export class TtsPlaybackView extends ItemView {
	private prevBtn: HTMLElement | null = null;
	private playPauseBtn: HTMLElement | null = null;
	private stopBtn: HTMLElement | null = null;
	private nextBtn: HTMLElement | null = null;
	private progressEl: HTMLElement | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: TtsReaderPlugin,
	) {
		super(leaf);
	}

	static getViewType(): string {
		return TTS_PLAYBACK_VIEW_TYPE;
	}

	getViewType(): string {
		return TTS_PLAYBACK_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "TTS Player";
	}

	getIcon(): string {
		return "volume-2";
	}

	async onOpen(): Promise<void> {
		const container = this.contentEl.createDiv({ cls: "tts-playback-sidebar" });

		const controls = container.createDiv({ cls: "tts-playback-controls" });

		this.prevBtn = this.createButton(controls, "skip-back", () => this.plugin.ttsPrevious());
		this.playPauseBtn = this.createButton(controls, "play", () => this.plugin.pauseOrResume());
		this.stopBtn = this.createButton(controls, "square", () => this.plugin.ttsStop());
		this.nextBtn = this.createButton(controls, "skip-forward", () => this.plugin.ttsNext());

		this.progressEl = container.createSpan({ cls: "tts-playback-progress" });
		this.progressEl.setText("Idle");
	}

	async onClose(): Promise<void> {
		this.prevBtn = null;
		this.playPauseBtn = null;
		this.stopBtn = null;
		this.nextBtn = null;
		this.progressEl = null;
	}

	update(state: PlaybackState): void {
		if (!this.playPauseBtn || !this.progressEl) return;

		const icon = state.status === "speaking" ? "pause" : "play";
		setIcon(this.playPauseBtn, icon);

		if (state.chunkCount > 0) {
			const current = Math.min(state.chunkIndex + 1, state.chunkCount);
			this.progressEl.setText(`${current}/${state.chunkCount}`);
		} else {
			const labels: Record<string, string> = {
				idle: "Idle",
				preparing: "Preparing...",
				stopped: "Stopped",
				error: "Error",
			};
			this.progressEl.setText(labels[state.status] || state.status);
		}
	}

	private createButton(parent: HTMLElement, icon: string, onClick: () => void): HTMLElement {
		const btn = parent.createEl("button", { cls: "tts-playback-btn" });
		setIcon(btn, icon);
		btn.addEventListener("click", (e) => {
			e.preventDefault();
			onClick();
		});
		return btn;
	}
}
