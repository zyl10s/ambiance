# Ambiance

A Linux-first, open-source desktop ambient sound mixer with five distinct visual themes. Inspired by the simplicity of Blanket, but not affiliated with it.

## Features

- Mix looping ambient audio with independent volume and mute controls.
- Five themes: Dark Academia, Light Academia, Modern, Gothic, Cyberpunk.
- Save, load, rename and delete presets; each stores sound IDs, volumes and mute state.
- Import your own local audio files (stored in your browser/session; use the desktop app for persistent imports).
- Launch settings: no autoplay, restore last mix, or play a chosen preset.
- Start minimized to the system tray; tray actions show/hide, play/pause, quit.
- All settings stored locally; no accounts or telemetry.

## Development

Requirements: Node.js 20+, npm, Rust stable, and [Tauri v2 Linux prerequisites](https://v2.tauri.app/start/prerequisites/).

```bash
npm install
npm run tauri dev
```

For browser-only preview: `npm run dev`. Build desktop packages: `npm run tauri build`.

## Audio

This project intentionally does **not** redistribute third-party recordings. Add your own audio files using **Import sounds**. For reusable bundled recordings, seek CC0 or otherwise redistributable licenses and preserve attribution where required.

Potential sources: [Freesound](https://freesound.org) (filter by CC0), [OpenGameArt](https://opengameart.org), [Pixabay](https://pixabay.com/sound-effects/) and [Mixkit](https://mixkit.co/free-sound-effects/). Review each recording's terms before distribution.

Imported audio is copied to the app data directory in the desktop build; browser preview imports are temporary.

## License

MIT. See LICENSE.
