# open-video-engine

A JSON-first, frame-deterministic video engine. A video is one JSON composition: layers, animation, transitions, video and audio, text, drawing and templates with variables, lists and components. OVE renders it in headless Chromium and encodes it with FFmpeg to MP4 (H.264/H.265), WebM (VP9, with transparency), MOV (ProRes), GIF or a folder of PNG frames.

## Requirements

- Node.js 22 or later.
- FFmpeg with ffprobe, on `PATH` (or set `OVE_FFMPEG_PATH` and `OVE_FFPROBE_PATH`).
- Chromium for Playwright: `npx playwright install chromium`. On Windows an installed Google Chrome is used if present; `OVE_CHROMIUM_EXECUTABLE` picks a specific browser.

## Command line

```sh
npm install open-video-engine
npx ove init my-video
npx ove dev my-video/composition.json
npx ove render my-video/composition.json --output out.mp4
```

`npx ove` with no arguments lists every command: `init`, `schema`, `doctor` (checks FFmpeg, encoders and the browser), `browser install`, `dev` (preview with live playback and sound, plus a Studio for editing layer timing and properties), `validate`, `inspect`, `still`, `render` (formats, codecs, transparency, frame ranges, batch rendering from a data file), `worker` (distributed rendering: `ove render --workers URL,URL --token T`) and `ai` (prompt-to-composition, narration, word-timed captions for existing audio, images and prompt-to-batch; provider: Groq or an offline mock). `ove ai studio` opens the same AI commands as a local page with a brief form, live progress and a rendered preview.

## Node API

```js
import { loadCompositionFile, renderMedia, renderStill } from 'open-video-engine';

const { composition, baseDir } = await loadCompositionFile('my-video/composition.json', { title: 'Hello from Node' });

await renderMedia(composition, {
  baseDir,
  output: 'out/hello.webm',          // format follows the extension: .mp4 .webm .mov .gif, or no extension for PNG frames
  transparent: true,                 // webm, mov and png only
  frameRange: [0, 89],               // optional, inclusive
  onProgress: ({ rendered, total }) => console.log(`${rendered}/${total}`),
  signal: AbortSignal.timeout(60_000),
});

const png = await renderStill(composition, { baseDir, frame: 45 }); // a Buffer
```

Also exported: `loadComposition` (from an object), `compositionJsonSchema`, `describeError` for readable validation errors, `createRenderer` and `renderFrames` for custom pipelines, and the composition types.

Distributed rendering is available from Node as well: `renderDistributed(composition, { output, workers: [httpWorker(url, token)], chunkSize })`.

## Player (browser)

```js
import { createPlayer } from 'open-video-engine/player';
const player = await createPlayer(document.querySelector('#video'), { composition, assetBase: '/media/', controls: true });
```

Plays a composition live in any page with sound, drawn by the same code as the renderer. `play`, `pause`, `seek`, `setValues`, `destroy`, and `frame`/`play`/`pause`/`ended`/`error` events.

## Writing compositions

`ove init` creates a starter project with `composition.schema.json` for editor checks and an agent skill (`.claude/skills/ove/SKILL.md`) that documents the whole format for coding agents and people alike.

MIT licensed.
