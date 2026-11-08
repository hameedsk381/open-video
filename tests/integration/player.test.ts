import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { builtinFontFaces } from '../../packages/graphics/src/index';
import { builtinFontDir } from '../../packages/graphics/src/fonts';
import { bundlePlayer } from '../../packages/player/src/bundle';

// The browser Player draws a composition on a canvas and moves through it: opened in a real browser, it makes a canvas of the right
// size, paints something on frame 0 and on a later frame, and seeking changes what is drawn.
const composition = {
  version: '1.0', id: 'player-smoke', name: 'Player smoke', width: 320, height: 180, fps: 30, durationFrames: 60, background: '#102030',
  scenes: [{ id: 's1', name: 'Scene', durationFrames: 60, layers: [
    { id: 'bar', type: 'rect', x: 0, y: 60, width: 100, height: 60, fill: '#ff0000', animations: [{ property: 'x', keyframes: [{ frame: 0, value: 0 }, { frame: 59, value: 200 }] }] },
  ] }],
};
let browser: Browser, page: Page, script = '';

beforeAll(async () => {
  script = await bundlePlayer({ minify: false });
  browser = await chromium.launch();
  page = await browser.newPage();
  await page.route('http://player.test/**', async route => {
    const url = new URL(route.request().url());
    // The Player loads its built-in fonts from ./fonts/ beside the script, as `ove dev` serves them.
    const face = builtinFontFaces.find(item => `/fonts/${item.file}` === url.pathname);
    if (face) return route.fulfill({ contentType: 'font/woff2', body: await readFile(join(builtinFontDir(face.pkg), face.file)) });
    if (url.pathname === '/player.js') return route.fulfill({ contentType: 'text/javascript', body: script });
    return route.fulfill({ contentType: 'text/html', body: '<!doctype html><div id="host"></div>' });
  });
  await page.goto('http://player.test/');
}, 120_000);
afterAll(async () => { await browser?.close(); });

describe('browser Player', () => {
  it('draws the composition, and seeking moves what is drawn', async () => {
    // Written as a string: the page, not Vite, must resolve the dynamic import.
    const result = await page.evaluate(`(async () => {
      const { createPlayer } = await import('http://player.test/player.js');
      const player = await createPlayer(document.getElementById('host'), { composition: ${JSON.stringify(composition)}, controls: false });
      const canvas = document.querySelector('canvas'), ctx = canvas.getContext('2d');
      const redAt = x => { const [r, g, b] = ctx.getImageData(x, 90, 1, 1).data; return r > 200 && g < 60 && b < 60; };
      await player.seek(0); const first = { red10: redAt(10), red250: redAt(250) };
      await player.seek(59); const last = { red10: redAt(10), red250: redAt(250) };
      return { width: canvas.width, height: canvas.height, frames: player.composition.durationFrames, first, last };
    })()`) as { width: number; height: number; frames: number; first: unknown; last: unknown };
    expect(result).toMatchObject({ width: 320, height: 180, frames: 60 });
    expect(result.first).toEqual({ red10: true, red250: false });      // the bar starts at the left
    expect(result.last).toEqual({ red10: false, red250: true });       // and ends at the right
  }, 120_000);
});
