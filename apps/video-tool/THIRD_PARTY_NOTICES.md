# Third-Party Notices

The Video & Audio Converter runs the following unmodified, repository-hosted
FFmpeg WebAssembly distribution files. They are loaded only from the same site
as the application; no runtime dependency is fetched from a third-party CDN.

## @ffmpeg/ffmpeg 0.12.15

- Purpose: browser controller and dedicated worker for FFmpeg WebAssembly
- Files: `vendor/ffmpeg/ffmpeg.js`, `vendor/ffmpeg/814.ffmpeg.js`
- License: MIT
- Copyright: Copyright (c) 2019 Jerome Wu
- Local license: [LICENSE-MIT.txt](vendor/ffmpeg/LICENSE-MIT.txt)
- Project source: <https://github.com/ffmpegwasm/ffmpeg.wasm>
- Package: <https://www.npmjs.com/package/@ffmpeg/ffmpeg/v/0.12.15>

## @ffmpeg/core 0.12.10

- Purpose: single-thread FFmpeg JavaScript loader and WebAssembly media engine
- Files: `vendor/ffmpeg/ffmpeg-core.js`, `vendor/ffmpeg/ffmpeg-core.wasm`
- Direct-file compatibility copy: `vendor/ffmpeg/ffmpeg-core.wasm.js`
- License: GNU General Public License, version 2 or any later version
- Local license: [LICENSE-GPL-2.0.txt](vendor/ffmpeg/LICENSE-GPL-2.0.txt)
- Project source and build scripts: <https://github.com/ffmpegwasm/ffmpeg.wasm>
- Package: <https://www.npmjs.com/package/@ffmpeg/core/v/0.12.10>

The core includes FFmpeg and codec libraries selected by the upstream build.
FFmpeg and the FFmpeg logo are trademarks of Fabrice Bellard, originator of the
FFmpeg project. Upstream FFmpeg source and licensing information are available
at <https://ffmpeg.org/>.

The vendored files were obtained from the official npm package archives:

- `@ffmpeg/ffmpeg@0.12.15`
- `@ffmpeg/core@0.12.10`

No changes were made to those distribution files.

`ffmpeg-core.wasm.js` is generated from the unmodified `ffmpeg-core.wasm`
bytes using deterministic gzip compression and base64 encoding. It is loaded
only for direct `file:` use, where browsers prohibit fetching the adjacent WASM
file. Decompressing it produces the original distribution file byte for byte.
