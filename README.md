# Ambiance

A Windows-first, open-source desktop study aide and ambient sound mixer with five distinct visual themes. Inspired by the simplicity of Blanket, but not affiliated with it.

## Features

- Configurable Pomodoro timer, short and long breaks, pause/resume, optional auto-next and completed-session count.
- Optional dismissible second-monitor distraction shield during focus sessions (Windows desktop).
- Shortcut to Windows notification settings for Do not disturb (no automatic OS notification suppression).
- Optional timer completion notifications where supported.

- Mix looping ambient audio with independent volume and mute controls.
- Five themes: Dark Academia, Light Academia, Modern, Gothic, Cyberpunk.
- Save, load, rename and delete presets; each stores sound IDs, volumes and mute state.
- Import your own local audio files (stored in your browser/session; use the desktop app for persistent imports).
- Launch settings: no autoplay, restore last mix, or play a chosen preset.
- Start minimized to the system tray; tray actions show/hide, play/pause, quit.
- All settings stored locally; no accounts or telemetry.

## Development

Requirements (Windows 10/11): Node.js 20+, npm, Rust stable with the MSVC toolchain, Microsoft C++ Build Tools and WebView2. See [Tauri v2 Windows prerequisites](https://v2.tauri.app/start/prerequisites/).

```bash
npm install
npm run tauri dev
```

On Windows, the production installer can be built using `npm run tauri build` (NSIS/MSI depending on Tauri bundle configuration). For browser-only preview: `npm run dev`. Build desktop packages: `npm run tauri build`.

## Audio

This project intentionally does **not** redistribute third-party recordings. Add your own audio files using **Import sounds**. For reusable bundled recordings, seek CC0 or otherwise redistributable licenses and preserve attribution where required.

Potential sources: [Freesound](https://freesound.org) (filter by CC0), [OpenGameArt](https://opengameart.org), [Pixabay](https://pixabay.com/sound-effects/) and [Mixkit](https://mixkit.co/free-sound-effects/). Review each recording's terms before distribution.

Imported audio is copied to the app data directory in the desktop build; browser preview imports are temporary.

## License

MIT. See LICENSE.
