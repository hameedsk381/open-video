import { describe, expect, it } from 'vitest';
import { explainerSchema, loadComposition } from '@ove/schema';
import { compileExplainer } from '@ove/core';

// Other shapes of video (the 9:16 column is scaled and centred), and the phone and hex scenes.
const base = { topic: 'T', handle: '@t', scenes: [{ kind: 'stat', value: '3×', label: 'faster' }] };
const compile = (extra: Record<string, unknown>, scenes: unknown[] = base.scenes) => compileExplainer(explainerSchema.parse({ ...base, ...extra, scenes })).composition as any;

describe('explainer shapes', () => {
  it('stays 1080×1920 by default, with no camera', () => {
    const c = compile({});
    expect([c.width, c.height]).toEqual([1080, 1920]);
    expect(c.scenes[0].camera).toBeUndefined();
    expect(c.overlay.some((l: any) => l.id === 'column')).toBe(false);
  });

  it('fits the column into 16:9, 1:1 and 4:5', () => {
    for (const [aspect, w, h, zoom] of [['16:9', 1920, 1080, 1080 / 1920], ['1:1', 1080, 1080, 1080 / 1920], ['4:5', 1080, 1350, 1350 / 1920]] as const) {
      const c = compile({ aspect });
      expect([c.width, c.height], aspect).toEqual([w, h]);
      expect(c.scenes[0].camera, aspect).toMatchObject({ x: 540, y: 960, zoom });
      const column = c.overlay.find((l: any) => l.id === 'column');
      expect(column.scale, aspect).toBeCloseTo(zoom, 5);
      expect(column.x + 1080 * zoom / 2, aspect).toBeCloseTo(w / 2, 3);
      expect(() => loadComposition(c), aspect).not.toThrow();
    }
  });

  it('rejects an unknown shape', () => { expect(explainerSchema.safeParse({ ...base, aspect: '2:1' }).success).toBe(false); });
});

describe('phone and hex scenes', () => {
  const scenes = [
    { kind: 'phone', app: 'Chat', messages: [{ side: 'in', text: 'Hello' }, { side: 'out', text: 'Hi' }], caption: 'A reply' },
    { kind: 'hex', columns: 4, rows: 3, lit: [1, 5], tags: ['A', 'B'], caption: 'Cells' },
  ];

  it('compile into valid scenes with one bubble per message and one cell per slot', () => {
    const c = compile({}, scenes), loaded = loadComposition(c);
    const ids = (i: number) => (loaded.scenes[i]!.layers as any[]).map(l => l.id as string);
    expect(ids(0).filter(id => /^bubble-\d$/.test(id))).toHaveLength(2);
    expect(ids(1).filter(id => id.startsWith('hex-') && !id.startsWith('hex-tag') && !id.startsWith('hex-caption'))).toHaveLength(12);
    expect(ids(1)).toContain('hex-tag-1');
  });

  it('limit what a script can ask for', () => {
    expect(explainerSchema.safeParse({ ...base, scenes: [{ kind: 'phone', app: 'X', messages: [] }] }).success).toBe(false);
    expect(explainerSchema.safeParse({ ...base, scenes: [{ kind: 'hex', columns: 9 }] }).success).toBe(false);
    expect(explainerSchema.safeParse({ ...base, scenes: [{ kind: 'hex' }] }).success).toBe(true);
  });
});
