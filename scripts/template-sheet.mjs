// Renders a contact sheet of a shipped template (default content): `tsx scripts/template-sheet.mjs <id> [outDir] [frames=8]`.
// Used to look at templates while designing them; the sheet is one PNG, frames evenly spread through the video.
import { readFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadComposition, renderStill } from '@ove/core';

const [id, out = join(process.cwd(), 'scratch', 'sheets'), count = '8'] = process.argv.slice(2);
if (!id) { console.error('usage: template-sheet.mjs <id> [outDir] [frames]'); process.exit(1); }
const root = resolve(import.meta.dirname, '..');
const composition = loadComposition(JSON.parse(await readFile(join(root, 'packages', 'cli', 'templates', id, 'composition.json'), 'utf8')));
await mkdir(out, { recursive: true });
const n = Number(count), last = composition.durationFrames - 1, files = [];
for (let i = 0; i < n; i++) {
  const frame = Math.min(last, Math.round(((i + 0.55) / n) * last));
  const file = join(out, `${id}-${String(i).padStart(2, '0')}.png`);
  await renderStill(composition, { frame, output: file }); files.push(file);
}
const tall = composition.height > composition.width, cols = tall ? n : Math.min(4, n), rows = Math.ceil(n / cols);
const tileW = tall ? 360 : 640;
const cell = i => { const row = Math.floor(i / cols); return `${(i % cols) * tileW}_${row === 0 ? '0' : Array(row).fill('h0').join('+')}`; };
const args = ['-y', '-v', 'error', ...files.flatMap(f => ['-i', f]), '-filter_complex', `${files.map((_, i) => `[${i}]scale=${tileW}:-2[s${i}]`).join(';')};${files.map((_, i) => `[s${i}]`).join('')}xstack=inputs=${n}:layout=${files.map((_, i) => cell(i)).join('|')}[v]`, '-map', '[v]', join(out, `${id}-sheet.png`)];
const r = spawnSync('ffmpeg', args, { encoding: 'utf8' });
if (r.status) console.error(r.stderr);
else console.log(join(out, `${id}-sheet.png`), `${cols}x${rows}`);
