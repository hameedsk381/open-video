# Open Video Engine

An independent, JSON-first, frame-deterministic video engine. A video is one canonical JSON composition: OVE validates it, evaluates each frame with Chromium Canvas 2D, and streams the frames into FFmpeg for MP4 (H.264/H.265), WebM (VP9, with transparency), MOV (ProRes), GIF or PNG frames.

## Setup

Prerequisites: Node.js 22+ (the development machine has Node 26), pnpm, and an FFmpeg build with libx264, libx265, libvpx-vp9, libopus and ProRes (most full builds have all of them). Install dependencies then install Chromium:

```sh
pnpm install
pnpm exec playwright install chromium
pnpm test
```

## Start a video

```sh
pnpm ove init my-video
pnpm ove still my-video/composition.json --frame 45 --output still.png
pnpm ove render my-video/composition.json --output my-video/out.mp4
```

Text uses Inter by default, an open-licence font built into OVE, so videos look the same on every machine with no fonts installed. Compositions can set a gradient `background` and `grain` (moving film grain). Text can animate word by word, letter by letter or line by line (`split`, with presets such as `rise`, `pop`, `blur` and `typewriter`), and `export.loudness` (or `--loudness -14`) makes the sound a set loudness. A scene `camera` pans, zooms, turns and shakes the whole scene (layers marked `fixed`, such as captions, stay put), and `motionBlur` blurs fast motion like a film camera. Paths can morph from one shape into another, transitions include iris, push, dip and blur, `sfx:whoosh` and six other built-in sound effects need no files, a `tempo` gives expressions `beat()`, `bar()` and `beats()` so cuts land on the music, and captions drop filler words and can emphasise key words.

`init` creates a 1920×1080, five-second starter that renders as-is:

- `composition.json`, the video. Edit it to make your own.
- `composition.schema.json`, so editors autocomplete and check the file (`composition.json` points at it through `$schema`).
- `assets/`, media referenced from the composition by asset id.
- `.claude/skills/ove/SKILL.md`, an agent skill that teaches coding agents (Claude Code and others that read skills) how to write and check compositions. Pass `--no-skill` to leave it out.

## Live preview and Studio

```sh
pnpm ove dev my-video/composition.json
```

Opens a local preview at `http://127.0.0.1:3000/` (the next free port if that one is taken):

- **Paused or scrubbing**, it shows the exact frame from the same renderer as `ove render`. **Playing** switches to the browser Player, which draws live with sound (video layers are kept close to, not exactly on, the frame).
- Space plays and pauses, ← → step (shift for 10 frames), Home/End jump, and you can drag along the timeline.
- **Studio:** under the timeline every layer has a bar at its real time. Drag a bar to move the layer in time, drag its right edge to change when it ends, or click it to edit its properties (position, size, timing, text, colours…) in the side panel. Edits are checked against the schema and saved to `composition.json` (keeping its indentation; small one-line objects are written out over several lines). Undo (ctrl+z) restores the file exactly. Layers produced by `repeat` or components, and values written as `{{ }}`, are shown read-only.
- Saving the file in your editor reloads the preview. If it has a mistake, the error appears over the last version that worked until you fix it.
- The variables panel lists the composition's variables; editing a value re-renders the preview (it does not change the file).
- Media files are served to the Player from the composition's folder only; media elsewhere (absolute paths outside it) renders but does not play live. Asset files are not watched: re-save the composition after replacing one.

## Player

The Player plays a composition in any web page, with sound, using the renderer's own drawing code:

```js
import { createPlayer } from 'open-video-engine/player';
const player = await createPlayer(document.querySelector('#video'), { composition, assetBase: '/videos/promo/', controls: true, loop: true });
player.on('ended', () => console.log('done'));
```

It takes the composition JSON (variables are resolved with `values`), loads media relative to `assetBase`, and offers `play`, `pause`, `seek`, `setValues`, `destroy` and events (`frame`, `play`, `pause`, `ended`, `error`). Audio uses Web Audio, so `playbackRate` changes pitch in the Player (renders keep it).

## Narration-driven timing and captions

Scenes can size themselves to their voiceover. OVE measures each audio and video asset (length, and the phrases between pauses) when a composition uses `media`, so `"durationFrames": "{{18 + media['vo-intro'].soundEndFrames + 38}}"` fits a scene to its narration and `"startFrame": "{{18 + media['vo-loop'].segments[2].startFrame}}"` brings something in on the third phrase. Scenes without `startFrame` follow one another automatically, and `"durationFrames": "auto"` ends the video with its last scene. `pnpm ove inspect video.json` shows the measured media and the timing it produces.

`captions` layers show SRT, WebVTT or JSON captions; with word timings the word being said is highlighted. `pnpm ove captions video.json --output video.srt` exports them as a subtitle file. [examples/agentic-ai](examples/agentic-ai/composition.json) uses all of this: its narration comes from `make-narration.ps1` (Windows' built-in voices, with word timings for the captions), and nothing in it is timed by hand.

## Distributed rendering

Split one render across machines (or processes) running `ove worker`:

```sh
pnpm ove worker --port 4400 --token s3cret            # on each worker machine
pnpm ove render video.json --output out.mp4 --workers http://10.0.0.5:4400,http://10.0.0.6:4400 --token s3cret --chunk-size 60
```

The coordinator sends chunks of frames to free workers, retries a failed chunk on another worker, joins the segments without re-encoding and mixes the soundtrack once over the whole video. Workers listen on 127.0.0.1 unless given `--host`, and every request needs the token. They read media from the paths in the composition (made absolute by the coordinator), so they need the same files at the same paths (a shared drive) unless the composition uses URLs. Use font assets rather than installed fonts so every machine draws text the same way. mp4, webm and mov can be rendered this way.

## Templates: one composition, many videos

The starter declares `title`, `tagline` and `accent` variables, used in the composition as `{{title}}` and so on. Change them per render, or render one video per row of a JSON file:

```sh
pnpm ove render my-video/composition.json --output sale.mp4 --var "title=Spring Sale\nUp to 40% off" --var accent=#f97316
pnpm ove render my-video/composition.json --batch rows.json --output "out/{{title}}.mp4"
```

`rows.json` is an array like `[{ "title": "Welcome,\nPriya", "accent": "#16a34a" }, ...]`. Values are checked against their declared types before anything renders, and characters that cannot appear in file names are replaced in batch output paths.

Templates can also take lists and build layers from them: `{{ }}` holds expressions (`{{160 + index * 320}}`, `{{item.price > 50 ? "#dc2626" : "#111827"}}`), `repeat` outputs layers or scenes once per list item, `if` keeps a layer only when a condition holds, and `components` define a set of layers once to place anywhere with `{ "use": "card", "with": { … } }`. The agent skill ([packages/cli/skills/ove/SKILL.md](packages/cli/skills/ove/SKILL.md)) has the full syntax with examples.

## Making a video with a coding agent

Run `pnpm ove init my-video`, open `my-video` in your agent, and describe the video you want. The skill tells the agent to edit `composition.json`, run `ove validate`, look at frames with `ove still`, check the whole video with `ove review`, and only then `ove render`. The skill source lives in [packages/cli/skills/ove/SKILL.md](packages/cli/skills/ove/SKILL.md).

## Commands

| Command | What it does |
|---|---|
| `ove init <dir> [--force] [--no-skill]` | Scaffold a starter project |
| `ove schema [--output file]` | Print or write the composition JSON Schema |
| `ove doctor` | Check Node, FFmpeg (and the encoders each format needs), ffprobe and the browser |
| `ove browser install` | Download Playwright's Chromium (otherwise an installed Chrome or Edge is used) |
| `ove dev <composition.json> [--port 3000]` | Preview with live playback and the Studio editor, reloading when the file changes |
| `ove worker [--port 4400] [--host 127.0.0.1] [--token T]` | Render chunks for `ove render --workers` |
| `ove validate <composition.json>` | Check a composition and report errors |
| `ove inspect <composition.json>` | Print duration, scenes, variables and assets |
| `ove still <composition.json> [--frame n] [--output file.png]` | Render one frame to PNG |
| `ove review <composition.json> [--output review.png] [--json]` | Contact sheet plus design checks: text cut off, off the frame, too small or overlapping; inconsistent type sizes and colours; frozen stretches; uniform scene lengths; mixed transitions; loudness. Exits with an error when it finds errors |
| `ove render <composition.json> [--output file.mp4] [--loudness -14] [--no-motion-blur] [--format f] [--codec h264\|h265] [--transparent] [--frames a-b] [--crf n | --bitrate 8M] [--scale 0.5] [--concurrency n] [--preset name]` | Render the video. `--crf`/`--bitrate` (and `--audio-bitrate`) set quality (default crf 20 for H.264); `--scale 0.5` makes a quick half-size draft. The format follows the output extension (`.mp4`, `.webm`, `.mov`, `.gif`, or no extension for a folder of PNG frames) unless `--format` says otherwise. `--transparent` keeps the background see-through (webm, mov, png). `--frames 30-89` renders part of it. Frames are drawn on `n` browser pages at once (default: half the CPU cores, at most 4); `--preset` is the x264/x265 speed/size trade-off (default `veryfast`) |
| `ove render <composition.json> --batch rows.json --output "dir/{{var}}.mp4"` | Render one video per row of variable values |

`validate`, `inspect`, `still`, `review`, `render` and `dev` all accept `--var name=value` (repeatable) and `--vars values.json`.

Run them as `pnpm ove <command>` from this repository. Paths are relative to the repository root, and media paths inside a composition are relative to the composition file.

`pnpm render:example` renders [examples/typography](examples/typography/composition.json) to `artifacts/typography.mp4` (1080×1920, 30fps, ten seconds, with music).

## Node API and the npm package

`@ove/core` is the API the CLI is built on: `loadCompositionFile`, `renderMedia` (any format, frame range, progress callback, `AbortSignal`) and `renderStill`. `pnpm build:package` bundles it with the CLI into [packages/ove](packages/ove/README.md), the publishable `open-video-engine` package (plain JavaScript, type declarations, the starter template and the agent skill). Publishing it is a separate step: `npm publish` from `packages/ove` after a build.

See [architecture](docs/architecture.md) for package boundaries and milestone status.
