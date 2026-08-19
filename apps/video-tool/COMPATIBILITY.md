# Video & Audio Converter compatibility record

Last verification: 2026-08-19

## Automated browser result

| Browser / device | Status | Evidence |
| --- | --- | --- |
| Chrome 149, Linux desktop | Passed | Real FFmpeg WebAssembly run produced MP3, M4A, Small/Balanced/High Quality compressed MP4, accurate trimmed MP4, and silent compressed/trimmed MP4 outputs. Renamed WebM and corrupt MP4 fixtures were rejected. No runtime exceptions occurred. |
| Chrome 149, Linux desktop, direct `file:` launch | Passed | Real MP4 validation and 192 kbps MP3 generation completed without a server, upload, or runtime exception. Reset terminated the worker and a second direct-file validation successfully initialized a fresh worker. |
| Chrome 149, emulated 320 CSS-pixel viewport | Passed | Document width and viewport width were both 320 pixels; primary navigation and converter controls remained present. |

The automated run used repository-hosted `@ffmpeg/ffmpeg` 0.12.15 and the
single-thread `@ffmpeg/core` 0.12.10 build over a local static HTTP server. The
single-thread build does not require `SharedArrayBuffer` or cross-origin
isolation headers, which ordinary GitHub Pages projects do not provide.

Direct `file:` launches use the same unmodified FFmpeg core through a Blob
worker and a repository-hosted gzip/base64 copy of the WASM payload. This avoids
opaque-origin worker and fetch restrictions without a local server or upload.

## Manual compatibility matrix

These targets require final checks on their native platforms. A blank browser
result is not represented as a pass.

| Target | Current result | Manual checks required |
| --- | --- | --- |
| Current Microsoft Edge desktop | Pending native check | Select, validate, convert all formats, cancel, reset, and download. |
| Current Firefox desktop | Pending native check | Confirm FFmpeg worker/WASM startup, video preview, range controls, and downloads. |
| Current Safari desktop | Pending native check | Confirm WASM memory behavior, AAC/H.264 playback, object-URL downloads, and range input interaction. |
| Current Android Chrome | Pending device check | Use a small MP4; verify touch controls, mobile warning threshold, background-memory recovery, and downloads. |
| Current iOS Safari | Pending device check | Use a small MP4; verify file picker, WASM startup, touch range handles, playback, and Files download handoff. |

## Reusable manual test sequence

1. Load `apps/video-tool/index.html` either directly from a `file:` URL or from
   an HTTP/HTTPS origin. Confirm the picker remains enabled in both modes.
2. Select a small MP4 with audio and confirm filename, size, duration,
   dimensions, audio presence, and preview.
3. Generate MP3 and M4A at each listed bitrate and inspect playback.
4. Generate each compression preset and inspect H.264 video, AAC audio,
   dimensions, frame rate, and displayed size comparison.
5. Select a non-zero trim start and end, preview the range, generate the trim,
   and compare its first/last frames and duration with the requested boundaries.
6. Select a silent MP4 and confirm that audio options are disabled while
   compression and trimming succeed without an audio stream.
7. Try a renamed non-MP4 file and a corrupt MP4; confirm each is rejected and a
   new valid source can be selected afterward.
8. Start several jobs, cancel during an active job, and confirm queued jobs are
   cancelled while any earlier completed download remains.
9. Replace the source and use Reset; confirm previous object URLs and result
   cards disappear.
10. Inspect the Network panel and confirm HTTP(S) requests are limited to page
    and repository-hosted runtime assets; selected and generated media use only
    local `blob:` URLs.
11. Complete keyboard-only navigation, screen-reader announcements, reduced
    motion, and a 320 CSS-pixel viewport check.
