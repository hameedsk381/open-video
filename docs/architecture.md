# OVE architecture

The canonical, versioned JSON composition is the only rendering input. `@ove/schema` validates it and exposes JSON Schema; `@ove/timeline` resolves integer-frame scene/layer visibility; `@ove/animation` evaluates each property from the requested frame with no prior state; and `@ove/graphics` converts evaluated layers into renderer-neutral draw operations.

The first `@ove/renderer` backend is a local deterministic Canvas 2D runtime loaded in Chromium via Playwright. Frames are requested explicitly and encoded as PNG in the page; `@ove/ffmpeg` streams them straight into FFmpeg's stdin (no temporary frame files) for H.264/AAC output. Because every frame is independent, the renderer keeps a pool of pages (one browser context, so one renderer process, each) and `renderFrames` requests frames ahead of the encoder while yielding them strictly in order; output is byte-identical whatever the page count.

Performance notes, from the 300-frame 1080×1920 example on an 8-core development machine. Wall-clock times there varied by up to 2× between identical runs depending on other load, so treat them as rough and benchmark on your own hardware:

- Drawing alone scales with pages: 13.0 s with one page, 5.9 s with four, no gain at eight.
- End-to-end gains are smaller because Chromium and FFmpeg share the CPU. PNG decoding plus x264 at `medium` cost about 37 CPU-seconds for this clip, 14 of them PNG decoding. Past ~4 pages Chromium starts taking cores from the encoder, which is why the default is half the cores, capped at 4.
- The fastest default-setting runs took 5–6 s; the slowest earlier runs of the same pipeline took 13–18 s under load.

`ove render --preset` picks the x264 preset. File size and quality are deterministic, so these columns are reliable:

| Preset | Size | SSIM vs `slow` |
|---|---|---|
| ultrafast | 932 KB | 0.9994 |
| superfast | 372 KB | — |
| veryfast (OVE default) | 244 KB | 0.9991 |
| medium (x264 default) | 272 KB | 0.9995 |
| slow | 272 KB | — |

All presets are visually identical for flat motion graphics like this one. `veryfast` gave the smallest file and, with four pages, was faster than `medium` in every paired run (13.4 s vs 16.9 s, 6.3 s vs 10.8 s), so it is the default. Footage-heavy compositions may compress better with `--preset medium` or slower.

Raw RGBA frames were tried and rejected: moving 8 MB per frame out of Chromium, through either the Playwright protocol or an HTTP upload from the page, costs about 2 s per frame against ~35 ms to encode a PNG.

`@ove/assets` resolves media references — an asset id from `composition.assets` or a path relative to the composition file — and images are preloaded once as data URLs before rendering.

Video layers are decoded by FFmpeg, not by a `<video>` element, because seeking a browser video to an exact frame is not reliable. Before rendering, each source is decoded once onto the composition's frame grid (frame k = time k/fps, scaled down to fit the canvas) as high-quality JPEGs in a content-addressed cache (`OVE_CACHE_DIR`, default `<tmp>/ove-video-cache`); only the part a layer can show is decoded unless it loops. `videoFrameIndex` in `@ove/timeline` maps a layer frame to a source frame from `trimStart`, `playbackRate` and `loop` (past the end it holds the last frame). For each output frame the renderer reads the needed JPEGs and sends them with the draw payload, where the page decodes and draws them like images, so output stays byte-identical across page counts. 

Audio is mixed by FFmpeg in the same process that encodes the video. `audioWindows` in `@ove/timeline` gives each `audio` layer and each unmuted `video` layer its absolute on-screen window, clipped by scene, groups and `endFrame`. `planAudio` (in the CLI) turns those into seconds-based clips, skips videos with no audio track, and adds `export.audio` as a looping soundtrack. `audioMixArgs` in `@ove/ffmpeg` builds one filter chain per clip (trim, `atempo` for speed without pitch change, cut to the window, 48 kHz stereo, volume, fades, sample-exact delay) and sums them with `amix` normalisation turned off, so a clip's level does not depend on how many others play. The mix is padded or cut to exactly the video's length. React and Player adapters are consumers of the same IR, never timing authorities. Queue/API/Studio packages are reserved module boundaries until the local pipeline is stable.

## Milestone status

- Phase 1: schema, timeline, animation, graphics — implemented and tested.
- Phase 2: Chromium Canvas frame capture and seekable browser runtime — implemented.
- Phase 3: FFmpeg MP4 export with audio muxing — implemented.
- Video layers (FFmpeg frame extraction) and audio mixing (audio layers, video sound, soundtrack) — implemented.
- Variables (`{{name}}` templating, `--var`, `--vars`, `--batch`) — implemented.
- Text fitting (wrap, max lines, shrink to fit, ellipsis), font files, weight, style and letter spacing — implemented.
- Transitions (fade, slide, wipe, zoom; in and out), transform origins, colour and size animation, cubic/back/spring/hold and Bézier easing — implemented.
- `ove dev` live preview (server-rendered frames, reload on save, variables panel) — implemented.
- Drawing primitives (paths with line drawing, outlines, dashes, gradients, shadows, blur and CSS filters, blend modes, rounded media, clip-path masks) — implemented.
- Lists, expressions, `repeat`, `if` and components for templates — implemented.
- Output formats (MP4 H.264/H.265, WebM VP9 with alpha, MOV ProRes, GIF, PNG frames), transparency, frame ranges, the Node API in `@ove/core` and the bundled `open-video-engine` package — implemented.
- Browser discovery (Playwright Chromium, then installed Chrome/Edge on any OS), `ove doctor`, `ove browser install`, integration tests and a CI workflow for Linux, macOS and Windows — implemented; CI written but not yet run (the project has no repository host yet).
- Distributed rendering (`ove worker`, chunked renders joined without re-encoding, retries) — implemented.
- The browser Player (`open-video-engine/player`) and live playback with sound in `ove dev` — implemented.
- The Studio in `ove dev` (layer timeline with drag and resize, property editing saved to the file, undo) — implemented.
- Next: run CI on a repository host, render-farm features (worker discovery, shared asset upload), Studio canvas editing (drag layers on the preview), keyframe editing.

## Text and fonts

Text layout needs real font metrics, so it runs in the page: `textLayoutSource` in `@ove/graphics` is plain JavaScript injected into the runtime and also compiled for unit tests (`layoutText`), so both run the same code. Lines break at `\n`, then at spaces to fit `maxWidth` (over-long words split between characters); with `minFontSize` the size steps down 1px until the text fits `maxLines` without splitting a word; anything still too long is cut to `maxLines` with an ellipsis that fits. Font assets are read as data URLs and registered with `FontFace` in every page before the first frame, one face per file under its `family`, weight and style, so text renders identically on every page and run. The renderer adds each text operation's CSS font prefix and quoted family list, and the page appends the final size.

## Drawing

Shapes are drawn with Canvas 2D primitives in the page runtime. `path` layers use `Path2D` with SVG path data; their length, needed to draw only part of an outline (`trimStart`/`trimEnd`, implemented as a single dash with an offset), comes from a hidden SVG `<path>`'s `getTotalLength`, cached per path. Gradients are built per draw in the layer's own coordinates, so they follow its transform. Outlines are drawn after fills (text outlines before, so they sit behind the letters), and the shadow is cleared after the first of the two so it is cast once. `blur` and `filter` become `ctx.filter`, `blendMode` becomes `globalCompositeOperation`, and `radius` on images/videos and `clipPath` on groups become clip paths. These are canvas state, so on a group they apply to each child's drawing separately rather than to a flattened group image. All of it is byte-identical across page counts in testing.

## Animation and transitions

`@ove/animation` evaluates keyframes with named easings (quadratic, cubic, back, a normalised spring, `hold`) or CSS-style cubic Béziers, solved by Newton steps with a bisection fallback; colour keyframes for `fill` and `color` mix per channel in sRGB, including alpha. `toDrawOperations` hands the renderer final values: animated properties replace static ones and `originX`/`originY` (`"center"` or pixels) are resolved to pixels, so the page pivots rotation and scale with translate → rotate/scale → translate back.

Scenes draw in their listed order and `zIndex` orders layers within each scene, so overlapping scenes stack predictably. While a scene's `transitionIn` or `transitionOut` is running, `evaluateFrame` wraps its layers in a group carrying the transition's offset, opacity, scale (around the canvas centre) and clip rectangle; `transitionState` computes these from eased progress (0 hidden → 1 shown), the same maths serving in and out. Transitions between scenes come from overlapping them, so a crossfade's two opacities always sum to one. Existing `fade` transitions now ease with `easeInOut` by default rather than linearly.

## Variables

A composition may declare typed `variables` (string, number, boolean, color) and use them as `{{name}}` in any string. They are resolved before validation, on the raw JSON: `loadComposition` in `@ove/schema` merges supplied values over defaults, converts command-line strings to the declared types, and substitutes every string except the `variables` block itself. A string that is exactly one reference takes the typed value, so numeric and boolean fields can be templated; elsewhere the value is inserted as text. The result then goes through the normal schema validation, so a variable can never produce a composition the engine would otherwise reject. All problems (unknown names, wrong types, undeclared references with their JSON path) are reported together. `ove render --batch` resolves and checks every row and every output path before rendering any of them, then renders the rows one after another.

## Live preview

`ove dev` (`packages/cli/src/dev.ts`) is a loopback-only HTTP server around one `Renderer`. The page asks for frames as PNGs from `/api/frame`, so the preview is pixel-identical to `ove render`; frames are cached per composition version, and the page keeps a few requests ahead of the playhead (about 30 while playing) and shows the newest frame it has, so playback keeps real time while frames are still rendering. The composition's folder is watched (editors often save by renaming a temp file) and changes are debounced; each successful reload, from the file or from the page's variables panel, builds a new renderer, bumps the version and is pushed to the page over server-sent events. A failed reload keeps the previous composition and renderer and sends the readable validation error (`describeError`) instead.

### Lists, expressions and components

`{{ }}` holds an expression in a small language (`packages/schema/src/expression.ts`) that is tokenised, parsed to a tree and evaluated by OVE itself, never by JavaScript `eval`: literals, names with field and index access, arithmetic, comparisons, `&&`/`||`/`!`, `?:` and a fixed set of functions. Only own fields of plain objects, list items and `.length` can be read, so prototype properties are unreachable. Template expansion (`substituteVariables`) walks the raw JSON with a scope. In `layers`, `children`, `scenes` and repeat bodies it also handles `if` (dropping entries whose condition is false, where empty text and empty lists count as false), `repeat` (outputting `each` once per item with `as`, `index` and `count` added to the scope) and `use` (turning a component placement into a group whose children are the component's layers, expanded with its resolved `params` and the composition's variables only). Recursive component use is reported rather than followed. Everything happens before schema validation, so the expanded composition is checked like a hand-written one.

## Output formats and the public API

`renderMedia` in `@ove/core` is the one render path; the CLI only parses flags around it. The output format comes from an explicit option, else the output file's extension, else `export.format`, and the merged export settings are re-validated (transparency only for webm/mov/png, `codec` only for mp4). `createEncoder` in `@ove/ffmpeg` maps each format to codecs: libx264/libx265 + AAC with `+faststart`, libvpx-vp9 (`yuva420p` when transparent) + Opus, ProRes 4444/HQ + PCM, and GIF through `palettegen`/`paletteuse` in one pass over the piped frames. PNG output skips FFmpeg and writes the renderer's frames directly. A frame range renders `[first, last]` and offsets the audio mix to match. When `export.transparent` is set the renderer skips the background fill, and the canvas alpha travels through the PNG frames into the encoder.

`scripts/build-package.mjs` produces `packages/ove` (npm name `open-video-engine`): esbuild bundles `@ove/core` and the CLI into two ES modules with playwright and zod external, `tsc` emits declarations whose `@ove/*` imports are rewritten to relative paths, and the starter template and agent skill are copied beside `dist` where `ove init` expects them. The package was verified by installing the packed tarball into an empty project and using the CLI, the API and the types from there.

## Browser discovery and checks

`launchBrowser` in `@ove/renderer` tries `OVE_CHROMIUM_EXECUTABLE`, then Playwright's bundled Chromium (the most consistent pixels between machines), then an installed Chrome or Edge through Playwright channels, and fails with instructions otherwise. `ove doctor` reports Node, FFmpeg with the encoders each output format needs (`checkFfmpeg`), ffprobe and the browser that would be used. Integration tests (`pnpm test:integration`, `tests/integration`) render every format for real and check codecs, alpha, frame ranges and determinism; `.github/workflows/ci.yml` runs them with the unit tests and a package smoke test on Linux, macOS and Windows.

## Distributed rendering

`renderDistributed` in `@ove/core` plans chunks of frames, makes the composition's relative media paths absolute, and hands chunks to `RenderWorker`s (`httpWorker` talks to `ove worker`). Each worker takes the next chunk; a failed chunk goes back on the queue, a worker failing twice in a row is dropped, and the render stops when a chunk runs out of attempts or no worker is left. Chunks are rendered silent (`renderMedia` with `audio: false`) in the final format, then `concatSegments` joins them with FFmpeg's concat demuxer and stream copy while mixing the full audio plan once, so neither picture nor sound is re-encoded or seamed at chunk boundaries. In testing a two-worker render matched a single-machine render at 59.9 dB PSNR (encoder keyframe placement differs) with identical audio. `ove worker` requires a bearer token on every request (compared in constant time), re-validates the composition, runs one job at a time and binds to 127.0.0.1 unless told otherwise.

## Player and live playback

The drawing code lives in `canvasRuntimeSource` (`@ove/graphics`) as a factory, `createCanvasRuntime(canvas, measurePath)`. The renderer injects it into its Chromium pages; the Player (`@ove/player`) receives it as an ES module produced at bundle time (`bundlePlayer`, an esbuild virtual module), so both draw with the same code and no strings are evaluated at runtime. Moving the code into the factory left all 210 reference frames byte-identical. The Player evaluates frames itself, draws live from wall-clock time (skipping frames rather than slowing down), keeps one `<video>` per video layer in sync with the playhead (seeking exactly when paused, correcting drift while playing), and schedules every sound with Web Audio from the playhead position, including trims, loops, volume and fades. `ove dev` serves the Player bundle and the composition folder's media (paths are checked to stay inside it) and switches to the Player while playing.

## Studio

`packages/cli/src/studio.ts` maps the expanded composition back to the file: `layerTimeline` lists layers with absolute frame windows, and a layer is editable when exactly one object with its id is written literally in the file's scenes (not inside a repeat body or a component definition). `applyLayerEdit` changes plain fields on a copy, refusing structural keys and non-scalar values; the dev server validates the result with `loadComposition` before writing it in the file's own indentation, and keeps the previous text for undo, which restores the file byte for byte.
