import { App, Platform, PluginSettingTab, Setting } from "obsidian";
import { TENCENT_VOICES } from "./edge-tts";
import type TtsReaderPlugin from "./main";

export class TtsReaderSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: TtsReaderPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "TTS Reader" });
    containerEl.createEl("p", {
      cls: "tts-reader-settings-note",
      text: Platform.isAndroidApp
        ? "Android uses Tencent Cloud TTS (requires internet and API credentials)."
        : "This plugin uses your operating system text-to-speech voices. Install offline Chinese and English voices in the OS settings for offline use."
    });

    new Setting(containerEl)
      .setName("Rate")
      .setDesc("Speech speed.")
      .addSlider((slider) => slider
        .setLimits(0.5, 2, 0.1)
        .setValue(this.plugin.settings.rate)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.rate = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Pitch")
      .setDesc("Speech pitch.")
      .addSlider((slider) => slider
        .setLimits(0.5, 2, 0.1)
        .setValue(this.plugin.settings.pitch)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.pitch = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Volume")
      .setDesc("Speech volume.")
      .addSlider((slider) => slider
        .setLimits(0, 1, 0.05)
        .setValue(this.plugin.settings.volume)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.volume = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Chunk size")
      .setDesc("Maximum characters per speech chunk.")
      .addSlider((slider) => slider
        .setLimits(200, 1200, 50)
        .setValue(this.plugin.settings.chunkSize)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.chunkSize = value;
          await this.plugin.saveSettings();
        }));

    const voiceContainer = containerEl.createDiv();
    voiceContainer.createEl("h3", { text: "Voices" });

    if (Platform.isAndroidApp) {
      voiceContainer.createEl("p", {
        cls: "tts-reader-settings-note",
        text: "Configure Tencent Cloud TTS API credentials and voice."
      });

      new Setting(voiceContainer)
        .setName("SecretId")
        .setDesc("Tencent Cloud API SecretId.")
        .addText((text) => text
          .setValue(this.plugin.settings.tencentSecretId)
          .onChange(async (value) => {
            this.plugin.settings.tencentSecretId = value;
            await this.plugin.saveSettings();
          }));

      new Setting(voiceContainer)
        .setName("SecretKey")
        .setDesc("Tencent Cloud API SecretKey.")
        .addText((text) => text
          .setValue(this.plugin.settings.tencentSecretKey)
          .onChange(async (value) => {
            this.plugin.settings.tencentSecretKey = value;
            await this.plugin.saveSettings();
          }));

      new Setting(voiceContainer)
        .setName("Voice")
        .setDesc("TTS voice type.")
        .addDropdown((dropdown) => {
          TENCENT_VOICES.forEach((v) => {
            dropdown.addOption(v.key, v.label);
          });
          dropdown
            .setValue(this.plugin.settings.tencentVoiceType)
            .onChange(async (value) => {
              this.plugin.settings.tencentVoiceType = value;
              await this.plugin.saveSettings();
            });
        });
    } else {
      voiceContainer.createEl("p", {
        cls: "tts-reader-settings-note",
        text: "Voice choices come from the current device. Leave fields on Auto unless you need a specific Chinese or English voice."
      });
      void this.renderVoiceSettings(voiceContainer);
    }

    containerEl.createEl("h3", { text: "Content cleanup" });
    this.addCleanupToggle("Skip frontmatter", "Do not read YAML properties at the top of a note.", "skipFrontmatter");
    this.addCleanupToggle("Skip code blocks", "Do not read fenced code blocks or math blocks.", "skipCodeBlocks");
    this.addCleanupToggle("Skip HTML", "Do not read inline HTML tags or HTML comments.", "skipHtmlBlocks");
    this.addCleanupToggle("Skip embeds", "Do not read Obsidian embeds such as ![[image.png]].", "skipEmbeds");
    this.addCleanupToggle("Skip images", "Do not read Markdown image alt text.", "skipImages");
    this.addCleanupToggle("Skip tables", "Do not read likely Markdown table rows.", "skipTables");

    new Setting(containerEl)
      .setName("Test voice")
      .setDesc("Read a short Chinese and English sample with the current settings.")
      .addButton((button) => button
        .setButtonText("Play sample")
        .onClick(() => {
          void this.plugin.speakPlainText("这是一段中文测试。This is an English voice test.", "Voice sample");
        }));
  }

  private async renderVoiceSettings(containerEl: HTMLElement): Promise<void> {
    const voices = await this.plugin.tts.getVoices();

    if (voices.length === 0) {
      containerEl.createEl("p", {
        cls: "tts-reader-settings-note",
        text: "No system voices were reported yet. Open your operating system TTS settings if offline voices are missing."
      });
      return;
    }

    this.addVoiceDropdown(containerEl, "Default voice", "Used first for all text when set.", "defaultVoiceURI", voices);
    this.addVoiceDropdown(containerEl, "Chinese voice", "Used for Chinese or mixed Chinese-English chunks when no default voice is set.", "chineseVoiceURI", voices);
    this.addVoiceDropdown(containerEl, "English voice", "Used for English chunks when no default voice is set.", "englishVoiceURI", voices);
  }

  private addVoiceDropdown(
    containerEl: HTMLElement,
    name: string,
    description: string,
    key: "defaultVoiceURI" | "chineseVoiceURI" | "englishVoiceURI",
    voices: SpeechSynthesisVoice[]
  ): void {
    new Setting(containerEl)
      .setName(name)
      .setDesc(description)
      .addDropdown((dropdown) => {
        dropdown.addOption("", "Auto");
        voices.forEach((voice) => {
          const locality = voice.localService ? "local" : "remote";
          dropdown.addOption(voice.voiceURI, `${voice.name} (${voice.lang}, ${locality})`);
        });
        dropdown
          .setValue(this.plugin.settings[key])
          .onChange(async (value) => {
            this.plugin.settings[key] = value;
            await this.plugin.saveSettings();
          });
      });
  }

  private addCleanupToggle(
    name: string,
    description: string,
    key: keyof TtsReaderPlugin["settings"]["cleanup"]
  ): void {
    new Setting(this.containerEl)
      .setName(name)
      .setDesc(description)
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.cleanup[key])
        .onChange(async (value) => {
          this.plugin.settings.cleanup[key] = value;
          await this.plugin.saveSettings();
        }));
  }
}
