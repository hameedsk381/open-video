import { describe, it, expect } from 'vitest';
import { parseComposition } from '@ove/schema'; import { evaluateFrame } from '@ove/timeline'; import { toDrawOperations, prepareOperations, collectLottieSources, flattenOperations } from '@ove/graphics';
const comp = (layers: any[], extra: any = {}) => parseComposition({ version: '1.0', id: 'x', name: 'X', width: 400, height: 300, fps: 30, durationFrames: 60, ...extra, scenes: [{ id: 's', name: 'S', startFrame: 0, durationFrames: 60, layers }] });
const ops = (c: any, frame: number) => flattenOperations(prepareOperations(toDrawOperations(evaluateFrame(c, frame)), 30));
describe('lottie layers', () => {
  it('need a size, take lottie assets and time like video', () => { const c = comp([{ id: 'l', type: 'lottie', src: 'anim', width: 200, height: 100, startFrame: 10, trimStart: 15, playbackRate: 2 }], { assets: [{ id: 'anim', type: 'lottie', src: './a.json' }] });
    expect(c.scenes[0]!.layers[0]).toMatchObject({ fit: 'contain', loop: false }); expect(collectLottieSources(c.scenes[0]!.layers)).toEqual(['anim']);
    expect(ops(c, 10 + 30)[0]!.mediaTime).toBeCloseTo((15 + 30*2)/30, 9); expect(() => comp([{ id: 'l', type: 'lottie', src: 'a.json' }])).toThrow(); });
});
describe('shader layers', () => {
  it('pass vars, animated ones and time to the runtime', () => { const c = comp([{ id: 'sh', type: 'shader', width: 100, height: 100, fragment: 'void main(){}', vars: { '--speed': 2, '--tint': '#ff0000' },
      animations: [{ property: '--speed', keyframes: [{ frame: 0, value: 0 }, { frame: 30, value: 3 }] }] }]);
    expect(ops(c, 15)[0]!.vars).toEqual({ '--speed': 1.5, '--tint': '#ff0000', '--t': 0.5, '--frame': 15 }); });
  it('check their variables and resolution', () => { const sh = (extra: any) => comp([{ id: 'sh', type: 'shader', width: 10, height: 10, fragment: 'void main(){}', ...extra }]);
    expect(() => sh({ vars: { speed: 1 } })).toThrow(/start with --/); expect(() => sh({ vars: { '--edge': '2px' } })).toThrow(); expect(() => sh({ resolution: 3 })).toThrow(); expect(() => sh({ fragment: '' })).toThrow(); });
});
describe('group layout', () => {
  it('fills in defaults and checks its options', () => { const g: any = comp([{ id: 'g', type: 'group', layout: {}, children: [] }]).scenes[0]!.layers[0];
    expect(g.layout).toEqual({ direction: 'row', gap: 0, padding: 0, align: 'start', justify: 'start' }); expect(() => comp([{ id: 'g', type: 'group', layout: { direction: 'diagonal' } }])).toThrow(); });
});
