import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { bundlePlayer } from '../../packages/player/src/bundle';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { builtinFontFaces } from '../../packages/graphics/src/index';
import { builtinFontDir } from '../../packages/graphics/src/fonts';
import { p5Source } from '../../packages/graphics/src/runtime';

// The libraries behind sketch, physics and p5 layers also have to work in the browser Player: rough.js and matter.js ride inside it, and
// p5.js is fetched from beside it only for a video that has a p5 layer.
let browser: Browser, page: Page, script = '';
const p5Requests: string[] = [];
const base = { version: '1.0', width: 320, height: 180, fps: 30, durationFrames: 120, background: '#102030' };
const withLayers = (id: string, layers: unknown[]) => ({ ...base, id, name: id, scenes: [{ id: 's', name: 'S', durationFrames: 120, layers }] });

beforeAll(async () => {
  script = await bundlePlayer({ minify: false });
  browser = await chromium.launch();
  page = await browser.newPage();
  await page.route('http://player.test/**', async route => {
    const url = new URL(route.request().url());
    const face = builtinFontFaces.find(item => `/fonts/${item.file}` === url.pathname);
    if (face) return route.fulfill({ contentType: 'font/woff2', body: await readFile(join(builtinFontDir(face.pkg), face.file)) });
    if (url.pathname === '/player.js') return route.fulfill({ contentType: 'text/javascript', body: script });
    if (url.pathname === '/p5.min.js') { p5Requests.push(url.pathname); return route.fulfill({ contentType: 'text/javascript', body: p5Source() }); }
    return route.fulfill({ contentType: 'text/html', body: '<!doctype html><div id="host"></div>' });
  });
  await page.goto('http://player.test/');
}, 180_000);
afterAll(async () => { await browser?.close(); });

const run = (composition: unknown, body: string, options = '') => page.evaluate(`(async () => {
  const { createPlayer } = await import('http://player.test/player.js');
  document.getElementById('host').innerHTML = '';
  const player = await createPlayer(document.getElementById('host'), { composition: ${JSON.stringify(composition)}, controls: false ${options} });
  const canvas = document.querySelector('canvas'), ctx = canvas.getContext('2d');
  const count = (test, x = 0, y = 0, w = canvas.width, h = canvas.height) => { const d = ctx.getImageData(x, y, w, h).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (test(d[i], d[i + 1], d[i + 2])) n++; return n; };
  const yellow = (r, g, b) => r > 200 && g > 150 && b < 80, red = (r, g, b) => r > 200 && g < 70 && b < 70;
  ${body}
})()`);

describe('browser Player: sketch, physics and p5 layers', () => {
  it('draws hand-drawn shapes', async () => {
    const hand = withLayers('hand', [{ id: 'box', type: 'rect', x: 40, y: 40, width: 200, height: 100, fill: '#ff0000', sketch: { boil: 4 } }]);
    const result = await run(hand, `await player.seek(0); const a = canvas.toDataURL(); const n = count(red); await player.seek(4); return { n, changed: canvas.toDataURL() !== a };`) as { n: number; changed: boolean };
    expect(result.n).toBeGreaterThan(5000); expect(result.changed).toBe(true);
  }, 120_000);

  it('simulates bodies that fall and settle, the same on every seek', async () => {
    const world = withLayers('world', [{ id: 'w', type: 'physics', x: 0, y: 0, width: 320, height: 180, emit: [{ shape: 'circle', x: 160, y: -30, spread: 60, width: 20, count: 12, every: 3, fill: '#ff0000' }] }]);
    const result = await run(world, `await player.seek(0); const empty = count(red); await player.seek(110); const late = count(red); const low = count(red, 0, 120, 320, 60); await player.seek(110); return { empty, late, low, again: count(red) };`) as { empty: number; late: number; low: number; again: number };
    expect(result.empty).toBe(0); expect(result.late).toBeGreaterThan(1500); expect(result.low).toBeGreaterThan(1000); expect(result.again).toBe(result.late);
  }, 120_000);

  it('loads p5.js from beside the Player, once, and only for a video that has a p5 layer', async () => {
    const plain = withLayers('plain', [{ id: 'r', type: 'rect', x: 0, y: 0, width: 10, height: 10, fill: '#ff0000' }]);
    await run(plain, 'await player.seek(0); return 1;');
    expect(p5Requests).toHaveLength(0);
    const sketch = withLayers('sketch', [{ id: 'sk', type: 'p5', width: 320, height: 180, code: "function draw(p, { frame, height }) { p.background('#102030'); p.noStroke(); p.fill('#ffcc00'); p.circle(40 + frame * 4, height / 2, 40); }" }]);
    const result = await run(sketch, `await player.seek(0); const atStart = count(yellow, 20, 70, 40, 40); const away = count(yellow, 140, 70, 40, 40); await player.seek(30); return { atStart, away, now: count(yellow, 140, 70, 40, 40), gone: count(yellow, 20, 70, 40, 40) };`, ', allowCode: true') as { atStart: number; away: number; now: number; gone: number };
    expect(result.atStart).toBeGreaterThan(500); expect(result.away).toBe(0); expect(result.now).toBeGreaterThan(500); expect(result.gone).toBe(0);
    expect(p5Requests).toHaveLength(1);
    await run(sketch, 'await player.seek(5); return 1;', ', allowCode: true');
    expect(p5Requests).toHaveLength(1);
  }, 180_000);
});
