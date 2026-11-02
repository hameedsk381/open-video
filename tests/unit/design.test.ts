import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs'; import { join } from 'node:path';
import { parseComposition } from '@ove/schema'; import { builtinFontFaces } from '@ove/graphics'; import { builtinFontDir, builtinFonts } from '@ove/graphics/fonts';
const comp = (extra: any = {}) => parseComposition({ version: '1.0', id: 'd', name: 'D', width: 10, height: 10, fps: 30, durationFrames: 10, scenes: [{ id: 's', name: 'S', startFrame: 0, durationFrames: 10, layers: [{ id: 't', type: 'text', content: 'Hi' }] }], ...extra });
describe('design defaults', () => {
  it('uses the built-in Inter as the default font', () => expect((comp().scenes[0]!.layers[0] as any).fontFamily).toBe('Inter'));
  it('ships every built-in face, normal and italic, for each script', () => { expect(builtinFontFaces).toHaveLength(14); expect(new Set(builtinFontFaces.map(f => f.style))).toEqual(new Set(['normal', 'italic']));
    for (const face of builtinFontFaces) { expect(face.weight).toBe('100 900'); expect(existsSync(join(builtinFontDir(), face.file))).toBe(true); } });
  it('turns the faces into data URLs for the renderer', async () => { const fonts = await builtinFonts(); expect(fonts[0]!.url.startsWith('data:font/woff2;base64,')).toBe(true); expect(fonts[0]!.unicodeRange).toContain('U+0000-00FF'); });
  it('accepts a gradient background and grain, with no grain by default', () => { expect(comp().grain).toBe(0);
    const c = comp({ grain: 0.04, background: { type: 'linear', from: [0, 0], to: [10, 10], stops: [{ offset: 0, color: '#000' }, { offset: 1, color: '#123' }] } }); expect(c.grain).toBe(0.04); expect((c.background as any).type).toBe('linear');
    expect(() => comp({ grain: 2 })).toThrow(); });
});
