import { describe, it, expect } from 'vitest';
import { parseComposition } from '@ove/schema'; import { evaluateFrame, splitCount, splitPresetAnimations } from '@ove/timeline'; import { audioMixArgs } from '@ove/ffmpeg';
const comp = (text: any) => parseComposition({ version: '1.0', id: 'k', name: 'K', width: 100, height: 100, fps: 30, durationFrames: 60, scenes: [{ id: 's', name: 'S', startFrame: 0, durationFrames: 60, layers: [{ id: 't', type: 'text', startFrame: 10, fontSize: 40, ...text }] }] });
const unitsAt = (c: any, frame: number) => (evaluateFrame(c, frame).find(l => l.id === 't') as any)?.units;
describe('split text', () => {
  it('fills in defaults and checks properties', () => { const t: any = comp({ content: 'a b', split: {} }).scenes[0]!.layers[0]; expect(t.split).toMatchObject({ by: 'words', stagger: 3, order: 'forward', preset: 'rise', duration: 18 });
    expect(() => comp({ content: 'a', split: { animations: [{ property: 'width', keyframes: [{ frame: 0, value: 1 }] }] } })).toThrow(/Pieces of split text can animate/);
    expect(() => comp({ spans: [{ text: 'a b' }], split: { by: 'letters' } })).toThrow(/splits by words or lines/); });
  it('counts words and letters, ignoring spaces', () => { expect(splitCount({ content: ' One  two\nthree ', split: { by: 'words' } })).toBe(3); expect(splitCount({ content: 'Hé y', split: { by: 'letters' } })).toBe(3); expect(splitCount({ spans: [{ text: 'Rich ' }, { text: 'text' }], split: { by: 'words' } })).toBe(2); });
  it('staggers each step from the layer start', () => { const c = comp({ content: 'one two three', split: { stagger: 4 } });
    const u = unitsAt(c, 10 + 4); expect(u).toHaveLength(3); expect(u[0].y).toBeLessThan(18); expect(u[1].y).toBeCloseTo(18, 5); expect(u[1].opacity).toBe(0); expect(u[2].opacity).toBe(0);
    const settled = unitsAt(c, 10 + 8 + 18); expect(settled.every((v: any) => v.opacity === 1 && v.y === 0)).toBe(true); });
  it('sizes presets to the font and lets custom animations replace them', () => { const pop = splitPresetAnimations('pop', 20, 40); expect(pop.find(a => a.property === 'scale')!.keyframes[0]!.value).toBe(0.6);
    expect(splitPresetAnimations('rise', 20, 100).find(a => a.property === 'y')!.keyframes[0]!.value).toBe(45);
    const c = comp({ content: 'a b', split: { stagger: 2, animations: [{ property: 'rotation', keyframes: [{ frame: 0, value: 90 }, { frame: 10, value: 0 }] }] } }); expect(unitsAt(c, 15)).toEqual([{ rotation: 45 }, { rotation: 63 }]); });
  it('leaves layers without split alone', () => expect(unitsAt(comp({ content: 'a b' }), 20)).toBeUndefined());
});
describe('loudness', () => {
  it('accepts a target in LUFS', () => { expect(comp({ content: 'x' }).export.loudness).toBeUndefined(); expect(parseComposition({ ...comp({ content: 'x' }), export: { loudness: -14 } }).export.loudness).toBe(-14); expect(() => parseComposition({ ...comp({ content: 'x' }), export: { loudness: 3 } })).toThrow(); });
  it('applies the master gain and a limiter to the mix', () => { const graph = audioMixArgs({ durationSeconds: 2, gainDb: 6.5, clips: [{ source: 'a.wav', start: 0, duration: 2 }] }).join(' ');
    expect(graph).toContain('apad=whole_dur=2.000000,volume=6.50dB,alimiter=limit=0.84'); expect(audioMixArgs({ durationSeconds: 2, clips: [{ source: 'a.wav', start: 0, duration: 2 }] }).join(' ')).not.toContain('alimiter'); });
});
