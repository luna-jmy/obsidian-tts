# TTS Reader

TTS Reader is an Obsidian plugin MVP that reads notes aloud through the operating system text-to-speech voices.

## MVP scope

- Reads the current note.
- Reads selected text.
- Reads the current section in the editor.
- Supports play, pause/resume, stop, previous chunk, and next chunk.
- Uses Web Speech API (`speechSynthesis`) and the system TTS voices.
- Works without Node.js or Electron runtime APIs so it can run on Android Obsidian.
- Does not bundle `voice.zip` or the `voice/` directory.

## Development

```bash
npm install
npm run build
npm run lint
```

For local Obsidian testing, copy `main.js`, `manifest.json`, and `styles.css` into:

```text
<Vault>/.obsidian/plugins/tts-reader/
```
