import { setIcon } from "obsidian";
import type { PlaybackState } from "./types";

export class PlaybackFloatingBar {
	private containerEl: HTMLElement;
	private innerEl: HTMLElement;
	private prevBtn: HTMLElement;
	private playPauseBtn: HTMLElement;
	private stopBtn: HTMLElement;
	private nextBtn: HTMLElement;
	private progressEl: HTMLElement;

	constructor(
		private readonly onPlayPause: () => void,
		private readonly onStop: () => void,
		private readonly onPrevious: () => void,
		private readonly onNext: () => void,
	) {
		this.containerEl = document.body.createDiv({ cls: "tts-playback-floating" });
		this.containerEl.style.display = "none";

		this.innerEl = this.containerEl.createDiv({ cls: "tts-playback-inner" });

		this.prevBtn = this.createButton("skip-back", onPrevious);
		this.playPauseBtn = this.createButton("play", onPlayPause);
		this.stopBtn = this.createButton("square", onStop);
		this.nextBtn = this.createButton("skip-forward", onNext);

		this.progressEl = this.innerEl.createSpan({ cls: "tts-playback-progress" });
		this.progressEl.setText("");
	}

	update(state: PlaybackState): void {
		// Show when ready, preparing, speaking, or paused
		const visible = state.status === "ready" || state.status === "preparing" || state.status === "speaking" || state.status === "paused";
		this.containerEl.style.display = visible ? "" : "none";

		if (!visible) return;

		// Play/pause icon: show "play" when ready/paused, "pause" when speaking
		const icon = (state.status === "speaking") ? "pause" : "play";
		setIcon(this.playPauseBtn, icon);

		if (state.chunkCount > 0) {
			const current = Math.min(state.chunkIndex + 1, state.chunkCount);
			this.progressEl.setText(`${current}/${state.chunkCount}`);
		} else {
			this.progressEl.setText("");
		}
	}

	destroy(): void {
		this.containerEl.remove();
	}

	private createButton(icon: string, onClick: () => void): HTMLElement {
		const btn = this.innerEl.createEl("button", { cls: "tts-playback-btn" });
		setIcon(btn, icon);
		btn.addEventListener("click", (e) => {
			e.preventDefault();
			onClick();
		});
		return btn;
	}
}
