import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadComposition, renderStill } from '@ove/core';
import { createRenderer } from '@ove/renderer';

// p5 layers run a p5.js sketch's draw(p, args) once per frame. The random and noise seeds are set before each frame and the drawing is cleared,
// so a frame is a pure function of its number: it repeats exactly, and drawing other frames first changes nothing. Like code layers they run
// the composition's JavaScript, so they render only when allowed, and Math.random is refused.
let dir = '';
const sketch = `function draw(p, { frame, width, height, props }) {
  p.background(props.bg); p.noStroke(); p.fill(props.color);
  p.circle(40 + frame * 4, height / 2, 40);
  for (let i = 0; i < 6; i++) p.rect(p.random(width), p.random(30), 8, 8);
  p.rect(10, height - 24, 20 + p.noise(frame * 0.1) * 60, 10);
}`;
const comp = (layer: Record<string, unknown>) => loadComposition({ version: '1.0', id: 'c', name: 'C', width: 320, height: 180, fps: 30, durationFrames: 60, background: '#101820',
  scenes: [{ id: 's', name: 'S', startFrame: 0, durationFrames: 60, layers: [{ id: 'sk', type: 'p5', width: 320, height: 180, props: { bg: '#102030', color: '#ffcc00' }, ...layer }] }] });
const still = (layer: Record<string, unknown>, frame: number) => renderStill(comp(layer), { frame, baseDir: dir, allowCode: true });
beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'ove-p5-')); await writeFile(join(dir, 'sketch.js'), `export ${sketch}`); });
afterAll(() => rm(dir, { recursive: true, force: true }));

describe('p5 layer', () => {
  it('needs exactly one of code and src', () => {
    expect(() => comp({})).toThrow(/exactly one of/);
    expect(() => comp({ code: sketch, src: 'sketch.js' })).toThrow(/exactly one of/);
  });

  it('does not render unless the caller allows code', async () => {
    await expect(renderStill(comp({ code: sketch }), { frame: 0, baseDir: dir })).rejects.toThrow(/--allow-code/);
  });

  it('moves with the frame and repeats exactly', async () => {
    const [a0, a30, a30again] = await Promise.all([still({ code: sketch }, 0), still({ code: sketch }, 30), still({ code: sketch }, 30)]);
    expect(a0.equals(a30)).toBe(false);
    expect(a30.equals(a30again)).toBe(true);
  });

  it('draws a frame the same whatever was drawn before it, on one page', async () => {
    const renderer = await createRenderer(comp({ code: sketch }), { baseDir: dir, allowCode: true });
    try {
      const first = await renderer.renderFrame(10); await renderer.renderFrame(45); await renderer.renderFrame(3);
      expect((await renderer.renderFrame(10)).equals(first)).toBe(true);
    } finally { await renderer.close(); }
  });

  it('draws the same from a file as inline, and changes with the seed', async () => {
    const [inline, file, other] = await Promise.all([still({ code: sketch }, 12), still({ src: 'sketch.js' }, 12), still({ code: sketch, seed: 2 }, 12)]);
    expect(file.equals(inline)).toBe(true);
    expect(other.equals(inline)).toBe(false);
  });

  it('refuses what would make a frame depend on the render', async () => {
    await expect(still({ code: 'function draw(p) { p.rect(Math.random() * 10, 0, 5, 5); }' }, 0)).rejects.toThrow(/Math\.random/);
  });
});
