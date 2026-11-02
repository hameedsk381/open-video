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
- Media-driven timing (measured media in expressions, automatic scene placement, "auto" length) and captions (SRT/VTT/JSON, word highlighting, subtitle export) — implemented.
- Animated volume and ducking, rich text spans, and output quality settings (CRF, bitrate, audio bitrate, draft scale) — implemented.
- Next: run CI on a repository host, Studio canvas and keyframe editing, speech-to-text for captions of recorded voice.

## Text and fonts

Text layout needs real font metrics, so it runs in the page: `textLayoutSource` in `@ove/graphics` is plain JavaScript injected into the runtime and also compiled for unit tests (`layoutText`), so both run the same code. Lines break at `\n`, then at spaces to fit `maxWidth` (over-long words split between characters); with `minFontSize` the size steps down 1px until the text fits `maxLines` without splitting a word; anything still too long is cut to `maxLines` with an ellipsis that fits. Font assets are read as data URLs and registered with `FontFace` in every page before the first frame, one face per file under its `family`, weight and style, so text renders identically on every page and run. The renderer adds each text operation's CSS font prefix and quoted family list, and the page appends the final size.

Inter (SIL Open Font License, from `@fontsource-variable/inter`) is built in and is the default family. `builtinFontFaces` in `@ove/graphics` lists its variable faces (weight 100–900 and optical size, normal and italic, one file per script with its `unicode-range`); `@ove/graphics/fonts` finds the files in Node, from the package or, in the published package, `dist/fonts`. The renderer registers them as data URLs before the font assets, so text matches across machines without any font installed. The Player loads the same files by URL from `fontBase` (default: `fonts/` beside the Player script), which `ove dev` serves and the package build copies with the licence.

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

## Media-driven timing and captions

`prepareComposition` in `@ove/core` is the full load: when a composition mentions `media`, `measureMedia` measures every audio and video asset (ffprobe for length, FFmpeg's silencedetect at -45 dB / 0.25 s for the sound segments between pauses, cached per file version) and passes the result into expressions as `media[id]` (seconds and frames at the composition fps). `loadComposition` then resolves expressions, places scenes without `startFrame` after the previous one minus their overlap (`sequenceScenes`) and turns `"durationFrames": "auto"` into the last scene's end before validation; `parseComposition` alone refuses `"auto"`. `attachCaptions` reads each captions layer's file into `cues`. The dev server measures the same way and hands the measurements to the Player.

Captions (`packages/schema/src/captions.ts`) parse SRT, WebVTT and JSON lines or word timings; word timings are grouped into lines at sentence ends, at commas once a line has three words, at pauses and at `maxWords`. Each frame, `prepareOperations` works out the line on screen and each word's state (said, being said, to come), keeping a finished line up through gaps under 0.3 s; the canvas runtime lays the line out with the shared text layout and draws it word by word on its background box. `captionTrack` places every captions layer's lines in the whole video for `ove captions` (SRT/VTT export).

## Volume automation, rich text and quality settings

`volumeEnvelope` in `@ove/timeline` turns a sound's volume keyframes and ducking into clip-relative [time, gain] points; `soundIntervals` gives the times each other sound is audible, from measured phrases (mapped through `trimStart` and `playbackRate`) where available, else its on-screen window. Ducking ramps down over `attackFrames` before each sound and up over `releaseFrames` after it, bridging gaps shorter than both so it does not pump. Renders apply the points with FFmpeg's `volume` filter as a balanced `if(lt(t,…))` expression evaluated per audio frame; the Player schedules the same points as Web Audio gain ramps, so both mix the same way. Points on straight runs are dropped to keep both short.

Rich text (`spans` on text layers) is laid out by `layoutRich`, in the same shared source as `layoutText`: spans are split into words and spaces, wrapped together, and scaled by one factor to fit `maxLines`/`minFontSize`, then ellipsised if needed. The runtime puts every run of a line on one baseline (the largest font ascent in the line) and draws highlights first, then outlines, fills and underlines.

## Shape morphing, transitions, sound effects and the beat grid

A path whose `d` animates carries a `morph` (the keyframe paths around the frame and the eased progress, from `animationSegment`) instead of an evaluated value. The runtime samples both outlines at 240 points along their length with the measuring SVG path, reverses the second if it winds the other way (by signed area), rotates it to the offset closest to the first, and mixes the points; the exact paths are drawn at the keyframes. Shapes with several subpaths are sampled as one line, so they morph with stray joins.

`transitionState` also produces a clip path (`iris`, a circle growing from x, y past the farthest corner), a blur (`blur`, 2% of the frame's long side at the start), and an overlay (`dip`: a full-frame rect returned after the scene's wrapper, so it covers what is under it too, peaking at the midpoint while the scene appears only for the second half). `push` is a slide for the scene itself; `evaluateFrame` moves every earlier, still-visible scene by the same eased amount in the same direction.

Built-in sound effects are FFmpeg recipes (`aevalsrc` formulas, and seeded pink noise for `whoosh`) in `@ove/ffmpeg`; `sfxFile` renders one to a WAV in the cache folder, named by a hash of its recipe, and `planAudio` resolves `sfx:` sources to it (so ducking and loudness treat them like any sound). The Player loads them from `sfxBase` (default `sfx/` beside the Player script); `ove dev` serves them and the package build copies them to `dist/sfx`.

`tempo` gives expressions `beat`, `bar` and `beats` (frames, rounded) through scope functions: `substituteVariables` passes them like `media`, and the expression evaluator calls a function from the scope when no built-in has that name. Captions drop filler words and immediate repeats (`dropFillerWords`, cached per cue list) before lines are grouped, in the video and in exported subtitles, and `captionAt` marks emphasis words, which the runtime draws in `emphasisColor` once said.

## Camera and motion blur

A scene `camera` is applied in `evaluateFrame`: `cameraState` evaluates its x, y, zoom, rotation and shake (three sines at unrelated rates, so the wobble is smooth and the same in every render) at the scene-local frame, and the scene's layers, apart from those marked `fixed`, are wrapped in a group whose origin is the camera point and whose position puts that point at the frame's centre, scaled by zoom and turned by the negative rotation. Transitions wrap the result as before, so a scene can push in while it fades.

`evaluateFrame` accepts fractional frames, which motion blur uses: with `motionBlur`, the renderer evaluates `samples` moments from the frame forward across `shutter`/360 of a frame (never backwards, so a hard cut does not blend with the previous scene), and the page draws each and averages them in linear light, weighted by alpha, converting back through a 16-bit lookup table. Pixels that do not change come back byte-identical, which an integration test checks, so blur adds nothing to still parts of the frame. Grain and review reports are applied once, to the averaged frame. `inspectFrame` (review) and the Player draw single frames; `--no-motion-blur` / `motionBlur: false` render without it, and distributed renders strip it from the composition sent to workers.

## Kinetic text and loudness

`split` on a text layer is evaluated in two halves. The timeline (`splitUnits`) works out the animated values of each stagger step: one entry per piece the text can have (words or letters counted from its content, ignoring spaces; lines get one step per word, since lines are only known after layout), evaluated at the layer frame minus step × stagger, from either the layer's `animations` or a preset sized in ems. The canvas runtime lays the text out as usual, finds the pieces in each line (words and letters skip spaces), places each by measuring the text before it so kerning and letter spacing match the unsplit line, maps pieces to steps by `order` (`random` is a shuffle seeded by the layer id), and draws each piece in the layer's own coordinates with its offset, scale and rotation wrapped around the piece's centre, so gradients stay continuous. Settled split text draws the same as unsplit text, which an integration test checks on frame thumbnails.

`export.loudness` is applied by `masterAudio`: the planned mix is rendered once to a WAV and measured with FFmpeg's EBU R128 meter, and the difference to the target becomes one fixed gain on the whole mix, followed by a limiter at about −1.5 dBFS. A fixed gain keeps the mix's own dynamics (FFmpeg's `loudnorm` in one pass rides the level instead), and measuring over the whole composition gives partial renders and distributed chunks the same gain. Very loud targets can fall short where the limiter holds peaks back (−11 LUFS asked, −12.1 measured on the agentic AI example).

## Review

`reviewComposition` in `@ove/core` (the `ove review` command) draws a frame every half second with `payload.report` set, which makes the canvas runtime record, for each text and captions block, its box in composition pixels (the four corners of its layout box through the current transform), its rendered size, opacity and whether layout cut or shrank it, plus a 64-pixel-wide greyscale thumbnail of the frame. Drawing without encoding a PNG keeps this cheap (about 30 s for a 63 s video at 1280 px). Text problems count only when they last a second of samples, so entrances and transitions, where layers pass through tiny sizes and over each other on purpose, are not flagged. Reading time tracks each text block's longest unbroken stretch at full opacity against a quarter of a second per word plus half a second; headline-size blocks (6% of the short side) are clustered when they touch vertically and overlap horizontally, so a title set one word per line counts once; caption pace comes from `captionTrack` (the lines the video shows, fillers dropped); a sound is cut off when one of its measured phrases runs past the end of its on-screen window (after trim and speed) and the window ends before the video does. Frozen stretches come from the thumbnails (mean change under half a grey level), loudness from mixing the soundtrack exactly as a render would into a WAV and running FFmpeg's EBU R128 meter. The contact sheet is drawn in a separate page from full renders of evenly spaced frames. Easing names follow the job the motion does (`land`, `snap`, `glide`, `pop`, `move`, `exit`, `drift`), each a cubic Bézier, alongside the standard quad, cubic, quart and expo curves.

## Design defaults: background, grain and encoder settings

`background` takes a gradient as well as a colour, drawn in composition pixels. `grain` adds moving film grain after every layer: a seeded 256×256 tile of noise in −1…1, added to each pixel's red, green and blue at `grain × 128` levels whatever its brightness (blending with overlay barely touches dark pixels, which is where banding shows), starting at an offset hashed from the frame number, so it is identical in every render and on any page count. It is skipped for transparent output. H.264 defaults to crf 20 and H.265 to crf 24, both with `aq-mode=3`, which biases adaptive quantisation towards dark, flat areas: on a dark radial gradient this removed most of the banding x264's defaults (crf 23, aq-mode 1) left, at about 10% more data than crf 18 alone. Grain is expensive to encode (around 20 Mbit/s at 1080p and crf 18) and is smeared into blocks at crf 23, so it is opt-in.

`export.crf`/`bitrate`/`audioBitrate` (and the matching CLI flags) set the encoders' constant quality or data rate; `export.scale` renders at a fraction of the size, rounded to even dimensions, by sizing the page and scaling the canvas transform. Shadows and blur are in canvas pixels and do not scale with it, so drafts can look slightly sharper or softer there.
