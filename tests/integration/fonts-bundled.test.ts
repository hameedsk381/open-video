import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { fontIds, parseComposition } from '@ove/schema';
import { renderStill } from '@ove/core';

// A font the renderer cannot find falls back to a default face without any error, so the only proof a bundled family works is
// that it draws differently from the others. Every family draws the same sentence; no two pictures may be the same.
const draw = (fontFamily: string, fontStyle: 'normal' | 'italic' = 'normal') => parseComposition({
  version: '1.0', id: 'f', name: 'F', width: 900, height: 160, fps: 30, durationFrames: 1, background: '#ffffff',
  scenes: [{ id: 's', name: 'S', startFrame: 0, durationFrames: 1, layers: [{ id: 't', type: 'text', content: 'Hamburgefonstiv 0123 Rag', x: 30, y: 40, fontSize: 64, color: '#000000', fontFamily, fontStyle }] }],
});
const hash = async (fontFamily: string, fontStyle?: 'normal' | 'italic') => createHash('sha256').update(await renderStill(draw(fontFamily, fontStyle), { frame: 0 })).digest('hex');

describe('bundled fonts', () => {
  it('draws every family as itself, not as a fallback face', async () => {
    const seen = new Map<string, string>();
    for (const family of fontIds) seen.set(await hash(family), family);
    expect([...seen.values()].sort()).toEqual([...fontIds].sort());
    // An unknown family is the fallback; none of the bundled ones may be the same picture as it.
    const fallback = await hash('No Such Family 12345');
    expect(seen.has(fallback), 'a bundled family drew like the fallback').toBe(false);
  }, 120_000);

  it('has real italic faces where it ships them', async () => {
    for (const family of ['Playfair Display', 'Instrument Serif']) expect(await hash(family, 'italic'), family).not.toBe(await hash(family, 'normal'));
  }, 60_000);
});
