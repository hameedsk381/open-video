# MotionRender

[![npm](https://img.shields.io/npm/v/motionrender)](https://www.npmjs.com/package/motionrender) [![licence: MIT](https://img.shields.io/badge/licence-MIT-blue)](LICENSE)

An independent, JSON-first, frame-deterministic motion graphics video engine. A video is one canonical JSON composition: MotionRender validates it, evaluates each frame with Chromium Canvas 2D, and streams the frames into FFmpeg for MP4 (H.264/H.265), WebM (VP9, with transparency), MOV (ProRes), GIF or PNG frames.

## Why MotionRender

- **Frame-exact.** Every frame is a pure function of time, so a render is reproducible. AI runs before rendering, never inside it.
- **No AI key needed to make a video.** The agent that writes the script is the model: an explainer script (scenes and spoken lines) goes in, a voiced, captioned MP4 comes out. See [Explainer videos](#explainer-videos-no-ai-key-needed).
- **Three ways to write a video:** a JSON composition, React components (`motionrender/react`), or an explainer script.
- **A design review that blocks bad output.** Text cut off, too small to read on a phone, or under the captions and the platform's controls is reported before anything renders.
- **Sourced facts.** `mr facts` looks up figures from Wikipedia, the World Bank and exchange rates (no key), and a script can carry its sources.
- **Built for agents.** An MCP server, agent skills and a one-command folder setup, below.
- **MIT licensed.**

### Use it with an agent

```sh
claude mcp add motionrender -- npx -y motionrender mcp      # Claude Code
npx -y motionrender mcp --config all                        # print the config for Claude Code, Claude Desktop, Codex and Cursor
npx -y motionrender setup .                                 # AGENTS.md, CLAUDE.md, MCP config and the skills, in this folder
```

See [AGENTS.md](AGENTS.md) for the tool list and the production loop.

## Quickstart

```sh
# Run anywhere with npx (zero installation)
npx motionrender init my-video
npx motionrender dev my-video/composition.json
npx motionrender render my-video/composition.json --output out.mp4

# Or launch the AI Studio UI
npx motionrender ai studio
```

*(`mr` is the short form of `motionrender`; `ove` still works as an older alias.)*

## Setup (Local Development)

Prerequisites: Node.js 22+, pnpm, and an FFmpeg build with libx264, libx265, libvpx-vp9, libopus and ProRes. Install dependencies then install Chromium:

```sh
pnpm install
pnpm exec playwright install chromium
pnpm test
```

## Start a video

```sh
pnpm mr init my-video
pnpm mr still my-video/composition.json --frame 45 --output still.png
pnpm mr render my-video/composition.json --output my-video/out.mp4
```

Text uses Inter by default, an open-licence font built into MotionRender, so videos look the same on every machine with no fonts installed. Compositions can set a gradient `background` and `grain` (moving film grain). Text can animate word by word, letter by letter or line by line (`split`, with presets such as `rise`, `pop`, `blur` and `typewriter`), and `export.loudness` (or `--loudness -14`) makes the sound a set loudness. A `react` layer draws a React component every frame (flexbox, grid, rich text, inline SVG, live counters), written with `mr build video.tsx` ([examples/react-video](examples/react-video)). Lottie animations play frame-exactly, GLSL shaders (Shadertoy code included) fill boxes with animated textures, and groups can lay their children out in rows and columns ([examples/expressive](examples/expressive/composition.json)). A scene `camera` pans, zooms, turns and shakes the whole scene (layers marked `fixed`, such as captions, stay put), and `motionBlur` blurs fast motion like a film camera. Paths can morph from one shape into another, transitions include iris, push, dip and blur, `sfx:whoosh` and six other built-in sound effects need no files, a `tempo` gives expressions `beat()`, `bar()` and `beats()` so cuts land on the music, and captions drop filler words and can emphasise key words.

`init` creates a 1920×1080, five-second starter that renders as-is:

- `composition.json`, the video. Edit it to make your own.
- `composition.schema.json`, so editors autocomplete and check the file (`composition.json` points at it through `$schema`).
- `assets/`, media referenced from the composition by asset id.
- `.claude/skills/ove/SKILL.md`, an agent skill that teaches coding agents (Claude Code and others that read skills) how to write and check compositions. Pass `--no-skill` to leave it out.

## Live preview and Studio

```sh
pnpm mr dev my-video/composition.json
```

Opens a local preview at `http://127.0.0.1:3000/` (the next free port if that one is taken):

- **Paused or scrubbing**, it shows the exact frame from the same renderer as `mr render`. **Playing** switches to the browser Player, which draws live with sound (video layers are kept close to, not exactly on, the frame).
- Space plays and pauses, ← → step (shift for 10 frames), Home/End jump, and you can drag along the timeline.
- **Studio:** under the timeline every layer has a bar at its real time. Drag a bar to move the layer in time, drag its right edge to change when it ends, or click it to edit its properties (position, size, timing, text, colours…) in the side panel. Edits are checked against the schema and saved to `composition.json` (keeping its indentation; small one-line objects are written out over several lines). Undo (ctrl+z) restores the file exactly. Layers produced by `repeat` or components, and values written as `{{ }}`, are shown read-only.
- Saving the file in your editor reloads the preview. If it has a mistake, the error appears over the last version that worked until you fix it.
- The variables panel lists the composition's variables; editing a value re-renders the preview (it does not change the file).
- The server only answers its own page: it listens on 127.0.0.1, refuses requests addressed to any other host name, and accepts changes only as JSON from the preview page itself, so other websites open in your browser cannot read the project or edit the file. Behind a reverse proxy, name it with `--allow-host preview.example`.
- Media files are served to the Player from the composition's folder only; media elsewhere (absolute paths outside it) renders but does not play live. Asset files are not watched: re-save the composition after replacing one.

## Player

The Player plays a composition in any web page, with sound, using the renderer's own drawing code:

```js
import { createPlayer } from 'motionrender/player';
const player = await createPlayer(document.querySelector('#video'), { composition, assetBase: '/videos/promo/', controls: true, loop: true });
player.on('ended', () => console.log('done'));
```

It takes the composition JSON (variables are resolved with `values`), loads media relative to `assetBase`, and offers `play`, `pause`, `seek`, `setValues`, `destroy` and events (`frame`, `play`, `pause`, `ended`, `error`). Audio uses Web Audio, so `playbackRate` changes pitch in the Player (renders keep it).

## Narration-driven timing and captions

Scenes can size themselves to their voiceover. MotionRender measures each audio and video asset (length, and the phrases between pauses) when a composition uses `media`, so `"durationFrames": "{{18 + media['vo-intro'].soundEndFrames + 38}}"` fits a scene to its narration and `"startFrame": "{{18 + media['vo-loop'].segments[2].startFrame}}"` brings something in on the third phrase. Scenes without `startFrame` follow one another automatically, and `"durationFrames": "auto"` ends the video with its last scene. `pnpm mr inspect video.json` shows the measured media and the timing it produces.

`captions` layers show SRT, WebVTT or JSON captions; with word timings the word being said is highlighted. `pnpm mr captions video.json --output video.srt` exports them as a subtitle file. [examples/agentic-ai](examples/agentic-ai/composition.json) uses all of this: its narration comes from `make-narration.ps1` (Windows' built-in voices, with word timings for the captions), and nothing in it is timed by hand.

## Distributed rendering

Split one render across machines (or processes) running `mr worker`:

```sh
pnpm mr worker --port 4400 --token s3cret            # on each worker machine
pnpm mr render video.json --output out.mp4 --workers http://10.0.0.5:4400,http://10.0.0.6:4400 --token s3cret --chunk-size 60
```

The coordinator sends chunks of frames to free workers, retries a failed chunk on another worker, joins the segments without re-encoding and mixes the soundtrack once over the whole video. Workers listen on 127.0.0.1 unless given `--host`, and every request needs the token. They read media from the paths in the composition (made absolute by the coordinator), so they need the same files at the same paths (a shared drive) unless the composition uses URLs. Use font assets rather than installed fonts so every machine draws text the same way. mp4, webm and mov can be rendered this way.

## Variables: one composition, many videos

The starter declares `title`, `tagline` and `accent` variables, used in the composition as `{{title}}` and so on. Change them per render, or render one video per row of a JSON file:

```sh
pnpm mr render my-video/composition.json --output sale.mp4 --var "title=Spring Sale\nUp to 40% off" --var accent=#f97316
pnpm mr render my-video/composition.json --batch rows.json --output "out/{{title}}.mp4"
```

`rows.json` is an array like `[{ "title": "Welcome,\nPriya", "accent": "#16a34a" }, ...]`. Values are checked against their declared types before anything renders, and characters that cannot appear in file names are replaced in batch output paths.

Compositions can also take lists and build layers from them: `{{ }}` holds expressions (`{{160 + index * 320}}`, `{{item.price > 50 ? "#dc2626" : "#111827"}}`), `repeat` outputs layers or scenes once per list item, `if` keeps a layer only when a condition holds, and `components` define a set of layers once to place anywhere with `{ "use": "card", "with": { … } }`. The agent skill ([packages/cli/skills/ove/SKILL.md](packages/cli/skills/ove/SKILL.md)) has the full syntax with examples.

## Making a video with a coding agent

Run `pnpm mr init my-video`, open `my-video` in your agent, and describe the video you want. The skill tells the agent to edit `composition.json`, run `mr validate`, look at frames with `mr still`, check the whole video with `mr review`, and only then `mr render`. The skill source lives in [packages/cli/skills/ove/SKILL.md](packages/cli/skills/ove/SKILL.md).

## Explainer videos (no AI key needed)

An explainer is a short vertical video that teaches one idea. You, or your agent, write a script of scenes and spoken lines, not coordinates; MotionRender draws it, records the voice, checks the design and renders it. The model that writes the script is the one you are already talking to.

```sh
pnpm mr explainer kinds               # every scene kind, each with a valid example
pnpm mr explainer looks               # the 13 whole designs: colours, type, motion, texture, corners, weight
pnpm mr make explainer.json --no-voice   # validate, build, run the design review, draw one contact sheet of the whole video
pnpm mr make explainer.json --draft      # a quick half-size MP4 to check the motion
pnpm mr make explainer.json --final      # the finished, voiced MP4
pnpm mr make explainer.json --no-react   # keep the stock JSON scenes (scenes are drawn with React components by default)
```

- **16 scene kinds:** title, flow, grid, steps, compare, stat, chart, timeline, pile, media, phone, hex, `quote`, `code`, `freeform` and closing. `quote` is a source card (who said it, their exact words, an optional stamp): write only words a source really said. `code` is an editor card with a file name, up to 14 lines and lines picked out one after another as they are explained. `freeform` is a board you lay out yourself, with text, boxes and circles placed on the 1080×1920 column and timed to appear, for ideas the other kinds cannot draw.
- **Drawn with React, in several ways.** `mr make` draws every scene kind with React components built on the `@ove/react` kit (spring physics, `NumberTicker`, `KineticText`, `BentoGrid`, `ProgressBar`, `Typewriter`, `CodeEditor` and the rest), so one kind is not one template: compare is split, stacked or versus; chart is columns, rows or a line; steps are a list, a ladder, cards or a bento; a stat is a hero number, a ring or stacked; a quote is a card, a pull quote or typed out; and so on for the other kinds. A scene's `variant` picks one; left out, the scene's own content does (a long point wants stacked, a percentage wants a ring, many bars want rows). The explainer writer is also sent back a script that is mostly one scene kind. Wide, square and 4:5 videos work too: the vertical column is fitted into the frame. `--no-react` keeps the older fixed scenes, and a script that needs something the React view cannot draw falls back to them on its own.
- **The design follows the content.** `look` picks a whole design; each scene can set its own `layout` (`card`, `editorial`, or `auto`, which goes editorial when the scene carries a lot of text) and `place`. Scenes are centred between the header and the area reel apps cover, and steps, compare and timeline spacing adapt to how many items they have.
- **Voice, captions, chapters and music.** Each scene lasts as long as its spoken line (a free Edge voice, which needs an internet connection). The words are drawn as captions timed to the real speech, the word being said highlighted. A segmented progress bar and a "03 / 09" count show where the viewer is. A quiet music bed sits under the voice and drops while it speaks (`music`: `calm`, `pulse` or `none`), and the mix is mastered to −14 LUFS. `captions: false` and `chapters: false` turn the first two off; a silent build has no captions or music.
- **A treatment before the scenes.** `mr explainer write "…"` (needs an AI provider) asks the model to weigh three genuinely different shapes for the video and choose one, so videos on different topics do not share one skeleton. `--avoid a/explainer.json,b/explainer.json` steers a new video away from the scene sequences already made.
- **A design review before rendering.** `mr make` reports text cut off or off the frame, text too small to read on a phone, content under the captions or the platform's controls, long holds with little motion, too many type sizes, and captions that go by too fast. A build with errors is not rendered; warnings are listed. A scene that holds longer than 9 s gets a note suggesting a split.

Limits: there are no photos unless you supply them (a `media` scene takes your own files, or an image model's picture), and the voice and the writer need a network connection. See [docs/ai.md](docs/ai.md) for voices and the writer, [docs/agent-sandbox.md](docs/agent-sandbox.md) for running it in a container, and the agent skill [ove-explainer](packages/cli/skills/ove-explainer/SKILL.md).

## AI-assisted authoring

An optional `mr ai` layer turns a brief into a normal composition and assets. AI runs before rendering, never
inside it, so the video is still deterministic and reproducible.

```sh
export GROQ_API_KEY=gsk_...
pnpm mr ai studio                     # local page: brief, preview, render
pnpm mr ai compose reels/spring --brief "Spring sale for a coffee brand" --kind reel --narration
pnpm mr ai batch products.json --brief "A clean product card" --output "out/{{id}}.mp4"
pnpm mr ai image "a soft teal background, no text" --out assets/bg.png --composition video.json --id bg
pnpm mr ai narrate --brief "Why deterministic rendering matters" --composition video.json
pnpm mr ai transcribe assets/voice.wav --composition video.json --start 1.2
pnpm mr ai capabilities               # every block, component, effect, transition and sound the AI may use
pnpm mr agent "A viral launch reel for an open-source vector database"   # writes a creative direction, then React code, then produces the video
pnpm mr ai doctor
```

A **planner** works out the beats and the art direction before anything is generated, and its answer is checked against
the **capability registry** so the model can only point at capabilities that exist and fit the canvas. The video is then
written as React code on a machine that will run that code, and a failed React build is reported, not quietly replaced
by a composition. A plain composition is still written when the host cannot run code (the hosted worker), for batch
variable fields, for non-image assets, and when you ask for it: `--no-react` keeps the React route off, `--full` writes
every layer, and `--json-layers` keeps the saved file's layers as JSON. `--no-plan` skips the planner. `mr agent`
first writes a creative direction that weighs three shapes for the video; `--avoid reel-a,reel-b` steers it away from
the structure of videos you already made.

The model's JSON is validated with the same schema as a hand-written composition; errors go back to the model until
it is valid, and `--review` can add the renderer's design checks as feedback. `--provider mock` runs the whole
pipeline offline. To measure rather than judge the AI paths, `pnpm eval:ai` runs a fixed set of briefs through the real
router and scores composed, duration, resolution, copy readable and picture moves (offline with the mock provider).
Groq covers chat (`openai/gpt-oss-120b`) and word-timed transcription (`whisper-large-v3-turbo`), and its speech
endpoint speaks narration when you ask for the `native` engine (`canopylabs/orpheus-v1-english`); it has no image model.
`mr ai studio` serves the same commands as a local product around projects (a Projects home with thumbnails, a Create flow, an editor with live preview, text editing, Ask AI, looks, history and export); it binds to 127.0.0.1 and writes only inside `--out` (default `ai-videos`).
See [docs/ai.md](docs/ai.md).

## Thumbnails

`mr thumbnail video/composition.json --title "40% off your first box" --width 1280 --output thumbnail.png` renders a cover image from one frame (`--frame`, by default well into the first scene), with an optional title over a soft shade. The composition is not changed. The AI Studio has the same action under each result.

## Video as code

Write a video in TypeScript or JavaScript when logic is easier than JSON: loops, functions, data, springs and noise.

```js
import { createVideo, text, rect, sample, spring, riseIn, code, sfx } from 'motionrender/builder';

const v = createVideo({ id: 'launch', width: 1920, height: 1080, background: '#0b1020' });
v.scene('intro', { seconds: 4 }, scene => {
  scene.add(text('Write the video.', { x: 160, y: 330, fontSize: 150, fontWeight: 800, color: '#f5f7fb' }));
  scene.add(rect({ x: 160, y: 700, width: 1, height: 10, fill: '#22d3ee', animations: [sample('width', 20, 70, f => spring({ frame: f - 20, from: 1, to: 520 }))] }));
  scene.add(sfx('whoosh', { startFrame: 4 }));
});
export default v;
```

`mr build video.mjs` writes `composition.json` beside the file, checked against the schema; then validate, review and render as usual (a `.ts` file needs Node 22.18 or newer). The builder runs only at build time, so the video stays frame-exact. `sample(property, from, to, fn)` turns any function of the frame into keyframes. For visuals no layer can draw, a **code layer** runs your own `draw(ctx, { frame, t, fps, width, height, props, api })` on a canvas every frame (see `examples/code-video`). It runs JavaScript while rendering, so `still`, `review`, `render`, `dev` and `thumbnail` refuse it unless you pass `--allow-code` (only for files you trust), and the AI commands and the Studio never accept it.

### Effects over footage

`mr blocks` lists 29 motion-graphics effects named `fx-*`: glass cards, duo and glitch and extruded titles, icon orbit, stats split, spotlight, checklist, editing timeline, command bridge, word-synced captions, highlighter, strike and rewrite, typewriter quote, day to night, light leak, duotone, clone wall, pull-out, punch-in, notifications, chat, before and after, counter hero, map journey, step tracker, split reveal, gallery and an end card. Put footage in, then add them on top:

```sh
mr add footage video/composition.json --aspect 9:16 --theme signal --set src=clip.mp4 --frames 300
mr add fx-glass-cards video/composition.json --scene footage --at 60 --frames 90
mr add fx-stats-split video/composition.json --set footage=clip.mp4 --at 300 --frames 90
```

`npx tsx examples/effects-demo/build.mjs clip.mp4` builds a 30-second, 900-frame vertical video from ten of them. Five more (neon outline, colour pop, background swap, sticker freeze, tracked label) use a **matte** of the speaker that you make with any tool (rembg, Robust Video Matting, an editor): a layer's `matte` property shows it only where the matte is white, and `mr track matte.mp4` follows the speaker for labels. A layer or scene `grade` (exposure, contrast, saturation, temperature, tint, shadows, highlights, fade, or a look such as cinematic, teal-orange or noir) colour-grades footage, and `fx-grade-look`, letterbox, shake-hit, progress ring, ticker, lens flare and RGB flash round out the library. In `mr dev` the Studio timeline moves and resizes scenes and layers, trims layer starts, and drags keyframes (Alt+arrows nudge the selected layer, edits snap to the playhead, Ctrl+Z undoes). See the `ove-effects` skill for the full list.

### Video as React components

```tsx
import { AbsoluteFill, Series, interpolate, spring, useCurrentFrame, useVideoConfig } from 'motionrender/react';

export const config = { id: 'promo', width: 1920, height: 1080, fps: 30, durationInFrames: 270, background: '#0b1020' };

export default function Promo() {
  const frame = useCurrentFrame(), { fps } = useVideoConfig();
  const y = spring({ frame, fps, from: 60, to: 0 }), opacity = interpolate(frame, [0, 10], [0, 1]);
  return <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', color: '#fff', fontSize: 120, opacity, transform: `translateY(${y}px)` }}>Hello</AbsoluteFill>;
}
```

`mr build promo.tsx` bundles the component (esbuild; install `react`, `react-dom` and `esbuild`) and writes `composition.json` with one `react` layer, drawn every frame from `useCurrentFrame()`: `Sequence`, `Series`, `AbsoluteFill`, `interpolate`, `spring`, `Easing` and `random` work as you would expect, and and the component is mounted live in a real page, so effects, refs, `<canvas>`, WebGL (three.js), d3, chart and animation libraries, and CSS-in-JS all work. Keep every frame a pure function of `useCurrentFrame()`: `Math.random` and `Date` would make frames differ, and CSS transitions are not played. For work that finishes later (loading a model or picture) call `delayRender()` and `continueRender(handle)`; the frame waits. WebGL canvases need `preserveDrawingBuffer: true`. `<Audio src startFrom volume />`, `<Video src left top width height />` and `<Img src />` work as in Remotion: `mr build` renders the component per frame and turns each run of frames where an `Audio` or `Video` is shown into a normal audio or video layer (so mixing, ducking and frame-exact decoding are unchanged). `Video` is drawn under the component, or over it with `layer="front"`; `left`, `top`, `width` and `height` may change with the frame (the clip moves; a changing size is applied too). The scan renders every frame in Node (9,000 frames took about a second); a component that needs `window` while rendering is not scanned, and the build says so. CSS files, fonts and pictures a component imports (`import '@fontsource/inter/index.css'`, `import './app.css'`) are bundled as data. Renders are offline, so fonts a page would download at runtime (a Google Fonts link) do not load; import the font files or declare them in `config.assets`. CSS transitions are not played (animate from the frame). Set `config.live = false` to draw static markup instead (faster, no effects or canvas). Live videos need a few more milliseconds per frame, and a canvas is captured as a PNG, so 4K WebGL scenes are slow. Declare pictures in `config.assets` and name them in `<img src>`; export `layers` to add audio, captions or sound effects beside the component. Everything else (review, thumbnail, loudness, the encoder) works as for any composition. Like code layers it needs `--allow-code`. See `examples/react-video` and `examples/three-video` (a lit three.js knot under a React title).

## Blocks and themes

Ready-made pieces you copy into a video, like a component library. A **block** is a scene (title, big number, quote, bullet list, numbered steps, stat grid, section divider, call to action, phone mockup, image with caption, icon row, split screen) or an overlay (lower third, badge, progress bar, handle). Scenes come with a slow camera push, drifting background shapes, a push transition and soft built-in sound effects, and new compositions get light motion blur; the picture blocks take a screenshot or photo (`--set image=shot.png`, or an asset id). Blocks are sized from the canvas, so each one fits 16:9, 9:16, 1:1 and 4:5, and they read their colours from a **theme** (`midnight`, `paper`, `neon`, `espresso`).

```sh
mr blocks                                   # list blocks and themes
mr add title-hero reel/composition.json --aspect 9:16 --theme neon --set headline="Fresh roasted, daily"
mr add stat-grid reel/composition.json      # appends a scene
mr add lower-third reel/composition.json --scene title-hero --at 20 --set name="Sam Lee"
mr theme espresso reel/composition.json     # switch every block's colours at once
```

`mr add` writes plain JSON: a component (named after the block, with underscores) under `components` and a placement whose `with` holds the text, so a block is yours to edit afterwards. Scenes are appended and overlap by their fade; overlays go inside a scene (`--scene`, default the last) from `--at`. Expressions can read `canvas.width`, `canvas.height` and `canvas.fps`, which is how blocks resize themselves. Blocks live in `packages/cli/blocks/*.json` and themes in `packages/cli/themes/*.json`. Themes change colours, corner radius and heading weight; fonts stay Inter unless you add font assets.

`mr init <dir>` starts from a small starter video; `mr add` brings in blocks. The AI can also write a whole video from a brief; see `docs/ai.md`.

## Examples

Each folder in [examples/](examples) is a runnable project; render one with `pnpm mr render examples/<name>/composition.json --output out.mp4`.

- `typography`: kinetic type over a music bed. `code-video`: a video written as code. `react-video`: a React component video.
- `three-video`: a Three.js 3D layer. `expressive`: html, Lottie, shader layers and group layout.
- `effects-demo`: ten `fx-*` effects over footage (see [Effects over footage](#effects-over-footage)).
- `url-shortener` and `uber-heatmap`: explainer scripts; build one with `pnpm mr make examples/url-shortener/spec.json --no-voice`.

## How it compares

From each project's own README, November 2026:

| | MotionRender | [Remotion](https://github.com/remotion-dev/remotion) | [HyperFrames](https://github.com/heygen-com/hyperframes) |
|---|---|---|---|
| You write | JSON, React components or an explainer script | React components | HTML with timing attributes and GSAP timelines |
| Licence | MIT | A special licence; a company licence is needed in some cases | Apache-2.0 |
| Ready-made pieces | 63 blocks and 5 themes | Templates, elements, effects, transitions, captions | About 450 blocks |
| Cloud rendering | A Docker stack with a queue and workers (a shared disk; no serverless option yet) | Lambda and Vercel Sandbox | An AWS Lambda package and hosted sharing |
| Agents | MCP server, skills, `mr setup` | Agent Skills | A Claude plugin and skills |

Both are far larger and more established, with tens of thousands of GitHub stars each, and have bigger catalogs and hosted rendering. MotionRender's bet is different: an explainer route that needs no AI key, a design review that stops bad output, and sourced facts, not a bigger catalog.

## Commands

| Command | What it does |
|---|---|
| `mr init <dir> [--force] [--no-skill]` | Scaffold a starter project |
| `mr schema [--output file]` | Print or write the composition JSON Schema |
| `mr cache size\|clean [--older-than 30d]` | Show or free the cache of decoded video, media measurements and sound effects (`OVE_CACHE_DIR`, default the system temp folder) |
| `mr doctor` | Check Node, FFmpeg (and the encoders each format needs), ffprobe and the browser |
| `mr browser install` | Download Playwright's Chromium (otherwise an installed Chrome or Edge is used) |
| `mr dev <composition.json> [--port 3000]` | Preview with live playback and the Studio editor, reloading when the file changes |
| `mr worker [--port 4400] [--host 127.0.0.1] [--token T]` | Render chunks for `mr render --workers` |
| `mr validate <composition.json>` | Check a composition and report errors |
| `mr inspect <composition.json>` | Print duration, scenes, variables and assets |
| `mr still <composition.json> [--frame n] [--output file.png]` | Render one frame to PNG |
| `mr make <explainer.json or composition.json> [--draft|--final] [--no-voice] [--no-react]` | The whole loop in one call: validate, build, design review and one contact sheet of the whole video; add `--draft` for a quick half-size MP4 or `--final` for the finished one. The quickest way for a coding agent to make a video (MCP: `motionrender_make_video`) |
| `mr explainer kinds\|looks\|example\|validate\|compile\|write` | Explainer scripts: list the scene kinds and the 13 looks, print a whole example, check a script, build it to `composition.json`, or have a model write one (`write` needs an AI provider; `--avoid` steers it away from earlier videos) |
| `mr review <composition.json> [--output review.png] [--json]` | Contact sheet plus design checks: text cut off, off the frame, too small, overlapping or not on screen long enough to read; text under a platform's UI (safe zones, with letterboxing for 4:5 and square canvases); competing headlines; inconsistent type sizes and colours; frozen stretches; uniform scene lengths; mixed transitions; caption pace; sounds cut off mid-phrase; loudness. Exits with an error when it finds errors |
| `mr render <composition.json> [--output file.mp4] [--loudness -14] [--no-motion-blur] [--format f] [--codec h264\|h265] [--transparent] [--frames a-b] [--crf n | --bitrate 8M] [--scale 0.5] [--concurrency n] [--preset name]` | Render the video. `--crf`/`--bitrate` (and `--audio-bitrate`) set quality (default crf 20 for H.264); `--scale 0.5` makes a quick half-size draft. The format follows the output extension (`.mp4`, `.webm`, `.mov`, `.gif`, or no extension for a folder of PNG frames) unless `--format` says otherwise. `--transparent` keeps the background see-through (webm, mov, png). `--frames 30-89` renders part of it. Frames are drawn on `n` browser pages at once (default: half the CPU cores, at most 4); `--preset` is the x264/x265 speed/size trade-off (default `veryfast`) |
| `mr render <composition.json> --batch rows.json --output "dir/{{var}}.mp4"` | Render one video per row of variable values |
| `mr ai doctor` | Show the AI provider, model and capabilities |
| `mr ai capabilities` | List the capability registry: every block, React component, effect, transition and sound the AI may use |
| `mr ai compose <dir> --brief "…"` | Plan the route (JSON composition or React), generate, validate and repair (optional `--no-plan`, narration and render) |
| `mr ai refine <composition.json> --instruction "…"` | Refine an existing composition using natural language instructions while preserving the rest |
| `mr ai narrate <script\|--brief>` | Write/speak a voiceover and add word-timed captions to a video |
| `mr ai transcribe <audio>` | Write captions for existing audio (and optionally add them to a video) |
| `mr ai edit <clip> --out dir` | Turn a raw clip into an edited reel: transcribe, cut silences and filler words, word-timed captions |
| `mr ai shorts <long.mp4> --out dir --count 5` | Split a long recording into the best-scored vertical shorts, each a full project |
| `mr ai image "<prompt>" --out file.png` | Generate a picture and optionally register it as an asset |
| `mr ai batch <rows.json> --brief "…" --output "dir/{{id}}.mp4"` | Generate one composition with variables, then render one video per row |
| `mr ai studio [--port 3100] [--out ai-videos]` | Local web app for the AI commands: projects, create, live editor, history, export; writes only inside `--out` |

Each command checks its options and stops with a suggestion on a typo; `--name=value` works as well as `--name value`. `validate`, `inspect`, `still`, `review`, `render` and `dev` all accept `--var name=value` (repeatable) and `--vars values.json`.

Run them as `pnpm mr <command>` from this repository. Paths are relative to the repository root, and media paths inside a composition are relative to the composition file.

`pnpm render:example` renders [examples/typography](examples/typography/composition.json) to `artifacts/typography.mp4` (1080×1920, 30fps, ten seconds, with music).

## Node API and the npm package

`@ove/core` is the API the CLI is built on: `loadCompositionFile`, `renderMedia` (any format, frame range, progress callback, `AbortSignal`) and `renderStill`. `pnpm build:package` bundles it with the CLI into [packages/ove](packages/ove/README.md), the publishable `motionrender` package (plain JavaScript, type declarations, the starter template and the agent skill). Publishing it is a separate step: `npm publish` from `packages/ove` after a build.

See [architecture](docs/architecture.md) for package boundaries and milestone status.
