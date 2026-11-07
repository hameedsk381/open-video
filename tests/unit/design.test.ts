import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs'; import { join } from 'node:path';
import { describeStyleFamilies, fontIds, parseComposition, styleFamilies } from '@ove/schema'; import { builtinFontFaces } from '@ove/graphics'; import { builtinFontDir, builtinFonts } from '@ove/graphics/fonts';
const comp = (extra: any = {}) => parseComposition({ version: '1.0', id: 'd', name: 'D', width: 10, height: 10, fps: 30, durationFrames: 10, scenes: [{ id: 's', name: 'S', startFrame: 0, durationFrames: 10, layers: [{ id: 't', type: 'text', content: 'Hi' }] }], ...extra });
describe('fonts and style families', () => {
  it('has every bundled face file on disk, so a font the model may choose always renders', () => {
    for (const face of builtinFontFaces) expect(existsSync(join(builtinFontDir(face.pkg), face.file)), face.file).toBe(true);
  });
  it('offers a family only if it ships both Latin faces, so accented text does not fall back', () => {
    for (const id of fontIds) expect(builtinFontFaces.filter(face => face.family === id && face.style === 'normal').length, id).toBeGreaterThanOrEqual(2);
  });
  it('builds every style family only from fonts the renderer ships and colours it can draw', () => {
    expect(styleFamilies.length).toBeGreaterThanOrEqual(8);
    for (const family of styleFamilies) {
      const { fonts, palette } = family.look;
      expect(fontIds as readonly string[], family.id).toContain(fonts.display); expect(fontIds as readonly string[], family.id).toContain(fonts.body);
      for (const [role, value] of Object.entries(palette)) expect(value, `${family.id} ${role}`).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(new Set(styleFamilies.map(family => family.id)).size).toBe(styleFamilies.length);
  });
  it('lists the families in an order that depends on the brief, so none is always first', () => {
    const firstFamily = (brief: string) => describeStyleFamilies(brief).split('\n')[0]!.slice(2).split(' ')[0];
    expect(describeStyleFamilies('a launch video')).toBe(describeStyleFamilies('a launch video'));
    const firsts = new Set(['coffee roaster promo', 'panic attack awareness', 'budgeting app launch', 'a wedding invitation', 'quarterly results', 'a skate shop sale', 'a podcast trailer', 'kids reading app'].map(firstFamily));
    expect(firsts.size).toBeGreaterThan(2);
    for (const brief of ['x', 'y']) expect(describeStyleFamilies(brief).split('\n')).toHaveLength(styleFamilies.length);
  });
});

describe('design defaults', () => {
  it('uses the built-in Inter as the default font', () => expect((comp().scenes[0]!.layers[0] as any).fontFamily).toBe('Inter'));
  it('ships every built-in face, normal and italic, for each script', () => { expect(new Set(builtinFontFaces.map(f => f.family))).toEqual(new Set(fontIds)); expect(new Set(builtinFontFaces.map(f => f.style))).toEqual(new Set(['normal', 'italic']));
    for (const face of builtinFontFaces) { expect(face.weight).toMatch(/^\d+( \d+)?$/); expect(existsSync(join(builtinFontDir(face.pkg), face.file))).toBe(true); } });
  it('turns the faces into data URLs for the renderer', async () => { const fonts = await builtinFonts(); expect(fonts[0]!.url.startsWith('data:font/woff2;base64,')).toBe(true); expect(fonts[0]!.unicodeRange).toContain('U+0000-00FF'); });
  it('accepts a gradient background and grain, with no grain by default', () => { expect(comp().grain).toBe(0);
    const c = comp({ grain: 0.04, background: { type: 'linear', from: [0, 0], to: [10, 10], stops: [{ offset: 0, color: '#000' }, { offset: 1, color: '#123' }] } }); expect(c.grain).toBe(0.04); expect((c.background as any).type).toBe('linear');
    expect(() => comp({ grain: 2 })).toThrow(); });
});
