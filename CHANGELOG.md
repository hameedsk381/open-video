# Changelog

All notable changes to Open Video Engine. The published package is `open-video-engine` (built from `packages/ove`).

## Unreleased

### Added
- Narration-driven timing: measured media (`media[...]`) in expressions, `durationFrames: "auto"` and automatic scene placement.
- Captions layers (SRT, WebVTT, JSON word timings) with the spoken word highlighted, filler words dropped, emphasis words, and `ove captions` subtitle export.
- Audio: animated volume, ducking, `export.loudness` / `--loudness` (measured gain with a peak limiter), and built-in sound effects (`sfx:click`, `tick`, `pop`, `whoosh`, `thump`, `ding`, `riser`).
- Design: Inter built in as the default font, gradient backgrounds, film grain, role-named easings (`land`, `snap`, `glide`, `pop`, `move`, `exit`, `drift`).
- Motion: rich text spans, kinetic text (`split` by words, letters or lines), a scene camera (pan, zoom, rotate, shake) with `fixed` layers, motion blur, shape morphing, iris/push/dip/blur transitions, and a tempo beat grid (`beat()`, `bar()`, `beats()`).
- `ove review`: a contact sheet and design checks (text cut, off-frame, too small, overlapping or too brief to read; competing headlines; type scale and colours; frozen stretches; scene rhythm; transitions; caption pace; sounds cut off; loudness).
- `ove cache size` and `ove cache clean [--older-than 30d]`.
- Output quality settings: `--crf`, `--bitrate`, `--audio-bitrate`, `--scale`, `--no-motion-blur`.
- Agent skill: design guide, planning (beats, look, storyboard), story and pacing, endings.

### Changed
- Encoder defaults: H.264 crf 20 and H.265 crf 24, with `aq-mode=3`, to avoid banding in dark gradients.
- The drawing runtime and text layout are plain JavaScript files (`packages/graphics/runtime/`) read as text, instead of escaped template strings.
- The renderer replaces a crashed or unresponsive page and retries the frame once; errors name the frame and the layer.
- Every command checks its options: typos and options from another command stop it with a suggestion; `--name=value` is accepted. `ove review --frames` is now `--sheet-frames` (the old name still works).
- The cache folder has one subfolder per kind (`media/`, `video/`, `sfx/`); entries are marked when used. The dev server's frame cache is capped at 256 MB.
- Video layers decode only the source frames they can show, instead of from the start of the source for the whole video's length.

### Fixed
- `ove dev` refuses requests from other sites and other host names (cross-site writes to the composition, DNS rebinding).
- Distributed renders using built-in sound effects failed while mixing the soundtrack.

### Removed
- The unused `@ove/react` stub package and the no-op `pnpm build` (turbo) script.

## 0.1.0

- First version: JSON compositions, frame-deterministic rendering in Chromium, FFmpeg output (MP4, WebM, MOV, GIF, PNG frames), video layers, audio mixing, variables and batch rendering, transitions, drawing primitives, lists and components, `ove dev` preview, the Player, the Studio, distributed rendering, and the Node API.
