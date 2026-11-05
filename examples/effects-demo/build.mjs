// The handbook's master prompt as a script: one 30-second vertical video (900 frames at 30 fps) made of the fx-* effect blocks over your footage.
//   npx tsx examples/effects-demo/build.mjs path/to/clip.mp4
// writes composition.json beside this file (copy or point it at your clip: the file name is used as given). Then:
//   ove review examples/effects-demo/composition.json --output review.png    and    ove render examples/effects-demo/composition.json --output out.mp4
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compositionJsonSchema, loadComposition } from '@ove/schema';
import { addBlock, applyTheme, emptyComposition, readBlock, readTheme } from '../../packages/cli/src/blocks.ts';

const clip = process.argv[2];
if (!clip) throw new Error('Usage: npx tsx examples/effects-demo/build.mjs path/to/clip.mp4');
const here = dirname(fileURLToPath(import.meta.url)), clipName = basename(clip);
await mkdir(here, { recursive: true });
await copyFile(resolve(clip), resolve(here, clipName));

let raw = emptyComposition('effects-demo', 1080, 1920);
raw.name = '36 effects, one video'; applyTheme(raw, await readTheme('signal')); delete raw.motionBlur; raw.export = { loudness: -14 };
const add = async (id, options = {}) => { raw = addBlock(raw, await readBlock(id), options).composition; };

// Footage in two stretches, with the effects that sit on top of it. Scene effects (they bring their own copy of the footage) fill the gaps.
await add('footage', { id: 'footage-a', at: 0, frames: 300, set: { src: clipName } });
await add('fx-command-bridge', { scene: 'footage-a', at: 0, frames: 60, set: { command: '/create video', message: '36 CREATIVE EFFECTS AVAILABLE' } });
await add('fx-glass-cards', { scene: 'footage-a', at: 60, frames: 60 });
await add('fx-duo-title', { scene: 'footage-a', at: 120, frames: 90, set: { line1: 'ONE VIDEO.', line2: '36 EFFECTS.', line3: 'POWERED BY OVE.' } });
await add('fx-icon-orbit', { scene: 'footage-a', at: 210, frames: 90 });
await add('fx-stats-split', { id: 'stats', at: 300, frames: 90, set: { footage: clipName, heading: 'MOTION GRAPHICS', sub: 'Powered by MotionRender', note: 'DEMO DATA' } });
await add('fx-spotlight', { id: 'spotlight', at: 390, frames: 120, set: { footage: clipName } });
await add('footage', { id: 'footage-b', at: 510, frames: 180, set: { src: clipName, trim: 300 } });
await add('fx-checklist', { scene: 'footage-b', at: 0, frames: 90 });
await add('fx-timeline', { scene: 'footage-b', at: 90, frames: 90, set: { heading: 'ONE COMPOSITION. COMPLETE CONTROL.' } });
await add('fx-gallery', { id: 'gallery', at: 690, frames: 90 });
await add('fx-cta-card', { id: 'cta', at: 780, frames: 120, set: { footage: clipName, line1: 'CREATE WITHOUT LIMITS.', line2: 'POWERED BY MOTIONRENDER.', line3: 'BUILD. COMPOSE. RENDER.' } });

raw.durationFrames = 900;
const composition = loadComposition(raw); // throws with the location of anything the schema rejects
await writeFile(resolve(here, 'composition.json'), JSON.stringify(raw, null, 2) + '\n');
await writeFile(resolve(here, 'composition.schema.json'), JSON.stringify(compositionJsonSchema, null, 2) + '\n');
console.log(`Wrote ${resolve(here, 'composition.json')}: ${composition.width}x${composition.height}, ${composition.durationFrames} frames, ${composition.scenes.length} scenes`);
