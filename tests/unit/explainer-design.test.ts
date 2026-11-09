import { describe, expect, it } from 'vitest';
import { explainerLookDefs, explainerLooks, explainerSchema, explainerFontMaxWeight, loadComposition, lookForTopic } from '@ove/schema';
import { compileExplainer } from '@ove/core';
import { explainerPrompt, writeExplainer, type AiProvider } from '@ove/ai';

// A look is a whole design: colours, type, motion, texture, corners and weight. Models choose it per subject, a script can change parts of it,
// and a reply that chose nothing still gets a look that depends on its topic, so videos about different things do not all come out alike.
const scenes = [{ kind: 'title', lines: ['What is', 'A CACHE', 'really?'], say: 'x' }, { kind: 'stat', value: '87%', label: 'of reads', note: 'a week' }];
const make = (extra: Record<string, unknown> = {}) => { const spec = explainerSchema.parse({ topic: 'CACHES', scenes, ...extra }); return compileExplainer(spec).composition as any; };
const allLayers = (c: any): any[] => c.scenes.flatMap((scene: any) => scene.layers);

const luminance = (hex: string) => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!; };
const contrast = (a: string, b: string) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi! + 0.05) / (lo! + 0.05); };

describe('the looks', () => {
  it('are thirteen, each a different design, and every one builds into a valid video', () => {
    expect(explainerLooks).toHaveLength(13);
    const seen = new Set(explainerLooks.map(look => JSON.stringify([explainerLookDefs[look].colors, explainerLookDefs[look].design])));
    expect(seen.size).toBe(13);
    for (const look of explainerLooks) expect(() => loadComposition(make({ look })), look).not.toThrow();
  });

  it('keep text and signal colours readable on their board and cards', () => {
    for (const look of explainerLooks) {
      const { colors } = explainerLookDefs[look];
      for (const board of [colors.bg, colors.surface]) {
        expect(contrast(colors.text, board), `${look} text`).toBeGreaterThanOrEqual(7);
        expect(contrast(colors.accent, board), `${look} accent`).toBeGreaterThanOrEqual(4.2);
        expect(contrast(colors.accent2, board), `${look} accent2`).toBeGreaterThanOrEqual(4.2);
      }
      expect(contrast(colors.muted, colors.bg), `${look} muted`).toBeGreaterThanOrEqual(4);
    }
  });

  it('only use fonts the engine carries, at weights those fonts have', () => {
    for (const look of explainerLooks) {
      const { fontDisplay, fontBody } = explainerLookDefs[look].design;
      expect(explainerSchema.safeParse({ topic: 'T', design: { fontDisplay, fontBody }, scenes }).success, look).toBe(true);
    }
  });

  it('keep the default look exactly as it was', () => {
    const v = make().variables;
    expect(v.bg.default).toBe('#0b1c3f');
    expect([v.fontDisplay.default, v.fontBody.default, v.texture.default, v.transition.default]).toEqual(['Archivo', 'Inter', 'grid', 'fade']);
    expect(allLayers(make()).find(layer => layer.id === 'stat-value').fontWeight).toBe(900);
  });
});

describe('a script changing the design', () => {
  it('takes the look\'s own fonts, texture and transition, and lets `design` and `colors` change any part', () => {
    const terminal = make({ look: 'terminal' }).variables;
    expect([terminal.fontDisplay.default, terminal.texture.default, terminal.transition.default]).toEqual(['JetBrains Mono', 'scanlines', 'wipe']);
    const changed = make({ look: 'terminal', design: { fontDisplay: 'Playfair Display', texture: 'none' }, colors: { accent: '#112233' } }).variables;
    expect([changed.fontDisplay.default, changed.texture.default, changed.transition.default, changed.accent.default]).toEqual(['Playfair Display', 'none', 'wipe', '#112233']);
  });

  it('refuses fonts, motions and corner styles the engine does not have', () => {
    for (const design of [{ fontDisplay: 'Comic Sans' }, { motion: 'spin' }, { corners: 'pointy' }, { weight: 'heavy' }, { texture: 'stripes' }]) expect(explainerSchema.safeParse({ topic: 'T', design, scenes }).success, JSON.stringify(design)).toBe(false);
  });

  it('never asks a font for a weight it does not have', () => {
    const weights = (look: string) => allLayers(make({ look })).filter(layer => layer.type === 'text' && layer.fontFamily === '{{fontDisplay}}').map(layer => layer.fontWeight as number);
    expect(Math.max(...weights('blueprint'))).toBeLessThanOrEqual(explainerFontMaxWeight['Space Grotesk']!);
    expect(Math.max(...weights('candy'))).toBeLessThanOrEqual(explainerFontMaxWeight.Syne!);
    const bebas = allLayers(make({ look: 'newsprint', design: { fontDisplay: 'Bebas Neue' } })).filter(layer => layer.type === 'text' && layer.fontFamily === '{{fontDisplay}}');
    expect(Math.max(...bebas.map(layer => layer.fontWeight as number))).toBe(400);
    expect(Math.max(...weights('navy'))).toBe(900);
    expect(Math.max(...allLayers(make({ design: { weight: 'medium' } })).filter(layer => layer.fontFamily === '{{fontDisplay}}').map(layer => layer.fontWeight as number))).toBe(600);
  });

  it('rounds or squares the cards', () => {
    const radius = (design: Record<string, unknown>) => allLayers(make({ design })).find(layer => layer.id === 'stat-card').radius as number;
    expect(radius({ corners: 'soft' })).toBe(22);
    expect(radius({ corners: 'sharp' })).toBeLessThan(10);
    expect(radius({ corners: 'round' })).toBeGreaterThan(30);
  });

  it('changes how text arrives', () => {
    const arrival = (motion: string) => { const layer = allLayers(make({ design: { motion } })).find(item => item.id === 'stat-label'); return layer.animations.map((a: any) => a.property).sort().join(','); };
    expect(arrival('rise')).toBe('opacity,y');
    expect(arrival('drop')).toBe('opacity,y');
    expect(arrival('blur')).toBe('blur,opacity');
    expect(arrival('fade')).toBe('opacity');
    const y0 = (motion: string) => allLayers(make({ design: { motion } })).find(item => item.id === 'stat-label').animations.find((a: any) => a.property === 'y')?.keyframes[0].value;
    expect(y0('rise')).toBeGreaterThan(y0('drop'));
  });

  it('does not leak into the next video', () => {
    make({ look: 'terminal', design: { motion: 'fade', corners: 'sharp' } });
    expect(allLayers(make()).find(layer => layer.id === 'stat-card').radius).toBe(22);
    expect(allLayers(make()).some(layer => layer.id === 'stat-hair')).toBe(false);
  });

  it('lays title, stat, steps and closing out flush left, without cards, when the design is editorial', () => {
    const all = [...scenes, { kind: 'steps', items: [{ title: 'A' }, { title: 'B' }], say: 'x' }, { kind: 'closing', title: 'Done', points: ['one'], cta: 'x.io', say: 'x' }];
    const ids = (design: Record<string, unknown>) => allLayers(make({ scenes: all, design })).map(layer => layer.id as string);
    const card = ids({ layout: 'card' }), editorial = ids({ layout: 'editorial' });
    expect(card).toContain('stat-card');
    expect(editorial).not.toContain('stat-card');
    expect(editorial).toEqual(expect.arrayContaining(['stat-hair', 'title-bar', 'step-line-0', 'close-rule']));
    expect(loadComposition(make({ scenes: all, design: { layout: 'editorial' } }))).toBeTruthy();
    expect(explainerSchema.safeParse({ topic: 'T', design: { layout: 'columns' }, scenes }).success).toBe(false);
  });

  it('gives the print-like looks the editorial layout and leaves the others as cards', () => {
    const layouts = Object.fromEntries(explainerLooks.map(look => [look, explainerLookDefs[look].design.layout]));
    expect(layouts).toMatchObject({ navy: 'card', ink: 'card', newsprint: 'editorial', sage: 'editorial', terminal: 'editorial', slate: 'editorial' });
    expect(allLayers(make({ look: 'newsprint' })).some(layer => layer.id === 'stat-card')).toBe(false);
    expect(allLayers(make({ look: 'newsprint', design: { layout: 'card' } })).some(layer => layer.id === 'stat-card')).toBe(true);
  });
});

describe('choosing a look for a topic', () => {
  it('always gives the same look to the same topic, and spreads topics over every look', () => {
    expect(lookForTopic('  Load Balancers ')).toBe(lookForTopic('load balancers'));
    const used = new Set(Array.from({ length: 300 }, (_, i) => lookForTopic(`topic number ${i}`)));
    expect(used.size).toBe(13);
  });

  it('is used when the model chose no look, and never replaces one it chose', async () => {
    const provider = (reply: unknown) => ({ id: 'fake', model: 'fake', chat: async () => JSON.stringify(reply) }) as unknown as AiProvider;
    const body = { topic: 'HOW BREAD RISES', scenes: [{ kind: 'title', lines: ['A'] }] };
    expect((await writeExplainer(provider(body), 'bread')).explainer.look).toBe(lookForTopic('HOW BREAD RISES'));
    expect((await writeExplainer(provider({ ...body, look: 'sage' }), 'bread')).explainer.look).toBe('sage');
    expect((await writeExplainer(provider({ ...body, look: 'terminal', design: { corners: 'round' } }), 'bread')).explainer.design).toEqual({ corners: 'round' });
  });

  it('is asked of the model, with every look and its character', () => {
    const system = explainerPrompt('Topic', {}).map(message => message.content).join('\n');
    for (const look of explainerLooks) expect(system, look).toContain(`${look} (${explainerLookDefs[look].note})`);
    expect(system).toMatch(/do not reach for navy by default/);
    expect(system).toContain('"look":"..."');
  });
});
