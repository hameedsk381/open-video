import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadComposition, renderStill } from '@ove/core';

// Code layers run the composition's own JavaScript, so they render only when the caller allows it, repeat exactly, and refuse what
// would make a frame depend on the render (Math.random, Date).
let dir = '';
const drawing = `function draw(ctx, { frame, t, width, height, props, api }) {
  ctx.fillStyle = props.color; const x = api.interpolate(frame, [0, 30], [20, width - 60]);
  ctx.fillRect(x, height / 2 - 20, 40, 40);
  const rand = api.random(7); ctx.fillStyle = '#ffffff'; for (let i = 0; i < 5; i++) ctx.fillRect(rand() * width, rand() * 40, 6, 6);
}`;
const comp = (layer: Record<string, unknown>) => loadComposition({ version: '1.0', id: 'c', name: 'C', width: 320, height: 180, fps: 30, durationFrames: 31, background: '#101820',
  scenes: [{ id: 's', name: 'S', startFrame: 0, durationFrames: 31, layers: [{ id: 'sketch', type: 'code', width: 320, height: 180, props: { color: '#ffcc00' }, ...layer }] }] });
beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'ove-code-')); await writeFile(join(dir, 'sketch.js'), `export ${drawing}`); });
afterAll(() => rm(dir, { recursive: true, force: true }));

describe('code layer', () => {
  it('needs exactly one of code and src', () => {
    expect(() => comp({})).toThrow(/exactly one of/);
    expect(() => comp({ code: drawing, src: 'sketch.js' })).toThrow(/exactly one of/);
  });

  it('does not render unless the caller allows code', async () => {
    await expect(renderStill(comp({ code: drawing }), { frame: 0, baseDir: dir })).rejects.toThrow(/--allow-code/);
  });

  it('draws inline code and a file, frame by frame, the same every time', async () => {
    const inline = comp({ code: drawing }), file = comp({ src: 'sketch.js' });
    const [a0, a30, a30again, f30] = await Promise.all([renderStill(inline, { frame: 0, baseDir: dir, allowCode: true }), renderStill(inline, { frame: 30, baseDir: dir, allowCode: true }),
      renderStill(inline, { frame: 30, baseDir: dir, allowCode: true }), renderStill(file, { frame: 30, baseDir: dir, allowCode: true })]);
    expect(a0.equals(a30)).toBe(false);
    expect(a30.equals(a30again)).toBe(true);
    expect(f30.equals(a30)).toBe(true);
  });

  it('refuses code that depends on chance or the clock, naming the layer', async () => {
    await expect(renderStill(comp({ code: 'function draw(ctx) { ctx.fillRect(Math.random() * 10, 0, 5, 5); }' }), { frame: 0, baseDir: dir, allowCode: true })).rejects.toThrow(/Layer "sketch" \(code\).*Math\.random\(\)/);
    await expect(renderStill(comp({ code: 'function draw(ctx) { ctx.fillRect(Date.now() % 10, 0, 5, 5); }' }), { frame: 0, baseDir: dir, allowCode: true })).rejects.toThrow(/Date is not repeatable/);
    await expect(renderStill(comp({ code: 'const x = 1;' }), { frame: 0, baseDir: dir, allowCode: true })).rejects.toThrow(/must define a function named draw/);
  });
});
