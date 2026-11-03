# motionrender

A JSON-first, frame-deterministic motion graphics video engine. A video is one JSON composition: layers, animation, transitions, video and audio, text, drawing and templates with variables, lists and components. MotionRender renders it in headless Chromium and encodes it with FFmpeg to MP4 (H.264/H.265), WebM (VP9, with transparency), MOV (ProRes), GIF or a folder of PNG frames.

## Requirements

- Node.js 22 or later.
- FFmpeg with ffprobe, on `PATH` (or set `OVE_FFMPEG_PATH` and `OVE_FFPROBE_PATH`).
- Chromium for Playwright: `npx playwright install chromium`. On Windows an installed Google Chrome is used if present; `OVE_CHROMIUM_EXECUTABLE` picks a specific browser.

## Command line

```sh
npm install motionrender
npx motionrender init my-video
npx motionrender dev my-video/composition.json
npx motionrender render my-video/composition.json --output out.mp4
```

You can use `motionrender`, `mr`, or `ove` interchangeably:
`npx motionrender` lists every command: `init`, `schema`, `doctor`, `browser install`, `dev` (live preview with audio), `render` (formats, codecs, transparency, frame ranges, batch rendering), `ai` and `ai studio` (`motionrender ai studio`).

## Node API

```js
import { loadCompositionFile, renderMedia, renderStill } from 'motionrender';

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

## React Videos & Builder

```js
import { AbsoluteFill, Series, interpolate, spring, useCurrentFrame, useVideoConfig } from 'motionrender/react';
import { createVideo, text, rect, sample } from 'motionrender/builder';
```

## Player (browser)

```js
import { createPlayer } from 'motionrender/player';
const player = await createPlayer(document.querySelector('#video'), { composition, assetBase: '/media/', controls: true });
```

Plays a composition live in any page with sound, drawn by the same code as the renderer. `play`, `pause`, `seek`, `setValues`, `destroy`, and `frame`/`play`/`pause`/`ended`/`error` events.

## Writing compositions

`ove init` creates a starter project with `composition.schema.json` for editor checks and an agent skill (`.claude/skills/ove/SKILL.md`) that documents the whole format for coding agents and people alike.

MIT licensed.
