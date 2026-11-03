import { describe, it, expect } from 'vitest';
import { parseComposition } from '@ove/schema'; import { evaluateFrame } from '@ove/timeline'; import { toDrawOperations, prepareOperations, collectImageSources, htmlReferences } from '@ove/graphics';
const comp = (layer: any) => parseComposition({ version: '1.0', id: 'h', name: 'H', width: 400, height: 300, fps: 30, durationFrames: 60, scenes: [{ id: 's', name: 'S', startFrame: 0, durationFrames: 60, layers: [{ id: 'h', type: 'html', width: 200, height: 100, html: '<b>Hi</b>', startFrame: 6, ...layer }] }] });
describe('html layers', () => {
  it('fills in defaults and needs a size', () => { const l: any = comp({}).scenes[0]!.layers[0]; expect(l).toMatchObject({ css: '', vars: {}, resolution: 1 }); expect(() => comp({ width: undefined })).toThrow(); });
  it('refuses web URLs, so nothing is fetched while rendering', () => { expect(() => comp({ html: '<img src="https://x.test/a.png">' })).toThrow(/cannot load from the web/); expect(() => comp({ css: '.a{background:url(//cdn.test/b.png)}' })).toThrow(/cannot load from the web/);
    expect(() => comp({ html: '<img src="logo">', css: '.a{background:url("./bg.png")}' })).not.toThrow(); });
  it('checks CSS variable names and animated values', () => { expect(() => comp({ vars: { accent: '#fff' } })).toThrow(/start with --/);
    expect(() => comp({ animations: [{ property: '--w', keyframes: [{ frame: 0, value: '12px' }] }] })).toThrow(/numbers or colours/);
    expect(() => comp({ animations: [{ property: '--w', keyframes: [{ frame: 0, value: 0 }, { frame: 10, value: '#fff' }] }] })).not.toThrow(); });
  it('finds the pictures its markup and CSS use', () => { expect(htmlReferences({ html: `<img src="logo"><img src='./a.png'><img src="data:image/png;base64,x">`, css: `.a{background:url(bg.jpg)} .b{mask:url("#m")}` })).toEqual(['logo', './a.png', 'bg.jpg']);
    expect(collectImageSources(comp({ html: '<img src="logo">' }).scenes[0]!.layers)).toEqual(['logo']); });
  it('only counts src attributes, not data-src or similar', () => { expect(htmlReferences({ html: `<img data-src="lazy.png" src="logo"><div data-lottie-src='x.json'></div>` })).toEqual(['logo']); });
  it('gives the runtime its CSS variables at each frame, animated ones included', () => { const c = comp({ vars: { '--accent': '#22d3ee' }, animations: [{ property: '--progress', keyframes: [{ frame: 0, value: 0 }, { frame: 30, value: 1 }] }] });
    const op = prepareOperations(toDrawOperations(evaluateFrame(c, 6 + 15)), 30)[0]!; expect(op.kind).toBe('html'); expect(op.vars).toEqual({ '--accent': '#22d3ee', '--progress': 0.5, '--t': 0.5, '--frame': 15 }); });
});
