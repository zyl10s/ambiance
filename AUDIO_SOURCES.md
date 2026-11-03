# Bundled ambient recordings

Ambiance is offline-first. The three starter recordings are fetched by
`.github/workflows/bundle-audio.yml` and committed to `public/audio/`.
The application reads these **local files**; it never streams from Wikimedia.

| App tile | Local file | Source | Creator | Rights |
| --- | --- | --- | --- | --- |
| Rain | rain.ogg | https://commons.wikimedia.org/wiki/File:Rain_(1).ogg | ezwa (PDSounds) | Public domain |
| Thunderstorm | storm.ogg | https://commons.wikimedia.org/wiki/File:Rain_and_thunder.ogg | User:Caesar | Public domain |
| Café | cafe.ogg | https://commons.wikimedia.org/wiki/File:Cafe_ambiance.ogg | Marble Toast | CC0 1.0 |

The source pages contain the authors' rights declarations. Retain this
file when distributing the app. Do not add recordings without verifying
redistribution rights and checking that they are suitable for seamless
ambient playback.

NOTE: The files are only present after the GitHub Actions workflow
completes successfully. If Actions is disabled or cannot push to the
repository, they must be downloaded and committed before packaging.
