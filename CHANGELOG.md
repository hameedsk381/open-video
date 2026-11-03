# Changelog

All notable changes to Open Video Engine. The published package is `open-video-engine` (built from `packages/ove`).

## Unreleased

### Added
- The AI Studio is now a React + Vite app (`apps/studio`) with a Vercel-style UI (light and dark, system fonts, no network needed). `pnpm build:studio` builds it into `packages/cli/studio`; `pnpm dev:studio` runs Vite against a running studio; `pnpm build:package` ships it. Without a build the studio serves the previous plain page.
- React `Video`: `layer="front"` and per-frame `left/top/width/height` (the clip moves or resizes); the build warns when it cannot scan for Audio and Video.
- React videos: `Audio`, `Video` and `Img` components (found at build time and turned into audio and video layers), and imported CSS, fonts and pictures are bundled with the component.
- Live React videos: the component is mounted in a real page each frame (React effects, refs, canvas, WebGL, three.js, d3, CSS-in-JS and other npm libraries work), then drawn through the html path with canvases captured as pictures. `delayRender()` / `continueRender()` hold a frame for async work; `config.live = false` keeps the old static-markup mode. See `examples/three-video`.
- AI Studio redesigned as a product around projects: a Projects home with thumbnails (made once, cached in `.studio`), duplicate, rename and delete (to `.trash`); a Create flow (kind, description, pictures dropped in, optional voiceover); an Editor with a live Player preview, scene jumps, and tabs for Edit (text and colour fields, or every text layer), Ask AI, Look (themes and adding blocks), History (restore) and Export (render, problem check, thumbnail); a Library; and Settings. Videos made from a template keep their variables and components, so their text stays editable by field. Studio adds `/api/projects`, `/api/project`, `/api/thumb`, `/api/library`, `/api/variables`, `/api/theme`, `/api/text`, `/api/add-block`, `/api/upload` and `/api/project/*`.
- Mattes: any layer can carry a `matte` (a video or picture you make with rembg, Robust Video Matting or an editor), shown only where the matte is white (`luma`) or opaque (`alpha`), optionally inverted. `ove track` follows the speaker through a matte. Five matte effects: neon outline, colour pop, background swap, sticker freeze, tracked label (`ove add fx-tracked-label --track track.json`).
- Colour grading: a `grade` on a layer or scene (exposure, contrast, saturation, temperature, tint, shadows, highlights, fade, or a look: warm, cool, cinematic, teal-orange, noir, vivid, faded), drawn through an SVG filter. Seven more effects: `fx-grade-look`, letterbox, shake hit, progress ring, ticker, lens flare, RGB flash.
- Studio timeline: drag scenes to move or resize them, drag a layer's left edge to trim its start, drag keyframe diamonds to retime them, Alt+arrows to nudge, snapping to the playhead.
- Effects library: 29 `fx-*` blocks (glass cards, duo title, icon orbit, stats split, spotlight, checklist, timeline, command bridge, captions, highlighter, strike and rewrite, glitch, extruded and typewriter titles, grades, light leak, clone wall, pull-out, punch-in, notifications, chat, before and after, counter hero, map journey, step tracker, split reveal, gallery, end card), a `footage` base block and the `signal` theme. `ove add --frames n` sets how long a scene or overlay lasts. `examples/effects-demo` builds a 30-second master video from them. Needs no subject matte, so neon outline, colour pop, background swap, sticker freeze and tracked label are not included.
- React videos: `open-video-engine/react` (`useCurrentFrame`, `useVideoConfig`, `Sequence`, `Series`, `AbsoluteFill`, `interpolate`, `spring`, `Easing`, `random`) and `ove build video.tsx`, which bundles the component with esbuild into a `react` layer. The renderer draws the component's markup (react-dom/server) for each frame through the html path, so frames stay exact and every other OVE feature applies. Needs `--allow-code`. See `examples/react-video`.
- Video as code: `open-video-engine/builder` (`createVideo`, layer constructors, `sample`, `spring`, `tween`, `interpolate`) builds composition JSON from TypeScript or JavaScript, and `ove build video.ts` writes it, checked with the schema. See `examples/code-video`.
- `code` layers: your own `draw(ctx, { frame, t, fps, width, height, props, api })` runs every frame on a canvas (`api.random(seed)`, `api.noise`, `api.interpolate`, `api.spring`). `Math.random` and `Date` throw so frames repeat. Because they run JavaScript, `still`, `review`, `render`, `dev`, `thumbnail`, the Player (`allowCode`) and the API (`allowCode`) refuse them unless you opt in with `--allow-code`; network access is blocked while they render; the AI commands, the Studio and workers never accept them.
- Refining a large composition (a template video, for example) sends the model a one-line-per-layer outline and takes back fixes by path, instead of the whole file both ways: about 7 KB instead of 94 KB for a four-scene video.
- AI revision history: every compose, refine, narrate, transcribe and image change is kept as a numbered revision beside the composition; `ove ai history` and `ove ai restore`, and a History list with Restore in the Studio.
- `ove thumbnail`: a cover image from any frame with an optional title, also in the Studio.
- Task skills for coding agents next to the main one: `ove-make-reel`, `ove-voiceover-captions`, `ove-batch-videos`, `ove-ai-compose`; `ove init` installs them all.
- Fixed: `ove ai refine --instruction` was refused by the strict option check.
- Blocks move and sound: slow camera pushes, drifting background shapes, push transitions, built-in sound effects, light motion blur. Four visual blocks (`phone-mockup`, `image-caption`, `icon-row`, `split-screen`) and two picture templates (`product-wide`, `showcase-tall`). `--narration` on a template video writes one voiceover line per scene and cuts the scenes to the audio. Templates take supplied pictures.
- Blocks and themes: `ove blocks`, `ove add <block> <composition.json>` and `ove theme`. Twelve reusable scenes and overlays (title, big number, quote, bullet list, numbered steps, stat grid, section divider, call to action, lower third, badge, progress bar, handle) that fit any aspect ratio, four themes, and four whole-video templates built from them (`launch-wide`, `story-tall`, `explainer-square`, `keynote-wide`). Expressions can read `canvas.width`, `canvas.height` and `canvas.fps`. The AI fills these templates and picks a theme.
- `ove ai`: provider-agnostic AI authoring (`compose`, `narrate`, `transcribe`, `image`, `batch`, `doctor`). Models write
  compositions, scripts and pictures; OVE validates every composition with the real schema, repairs it, optionally
  reviews it, then renders deterministically. Provider: Groq (chat, speech, transcription) and an offline `mock`. See `docs/ai.md`.
- `ove ai studio`: a loopback-only local page for the AI commands (brief form, live progress, rendered preview, video
  player, render), writing only inside `--out`. Requests are restricted to its own host and origin, and generated
  projects are ordinary files for `ove dev` / `ove review` / `ove render`.
- `html` layers: HTML and CSS (flexbox, grid, rich text, inline SVG) drawn as part of the frame, with no scripts and nothing fetched from the web. CSS variables can be animated with keyframes on `--name`, and `--t` places CSS `@keyframes` frame-exactly. Example: `examples/html-card`.
- `lottie` layers: Lottie animations (light player, no expressions) seeked frame-exactly, with fit, trim, speed and loop.
- `shader` layers: GLSL fragment shaders (Shadertoy `mainImage` too) with time, resolution and animatable variables as uniforms; renders use SwiftShader so pixels match on every machine.
- `layout` on groups: children placed in a row or column with gap, padding, align and justify, measured as drawn. Example: `examples/expressive`.

## 0.2.0 (2026-11-02)

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
