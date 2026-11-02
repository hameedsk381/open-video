import { describe, it, expect } from 'vitest';
import { parseComposition, loadComposition, beatFunctions, dropFillerWords, sfxNames } from '@ove/schema'; import { evaluateFrame, transitionState } from '@ove/timeline'; import { captionAt, canvasRuntimeSource } from '@ove/graphics'; import { sfxRecipes, sfxArgs } from '@ove/ffmpeg';
const base = (scenes: any[], extra: any = {}) => ({ version: '1.0', id: 'x', name: 'X', width: 200, height: 100, fps: 30, durationFrames: 'auto', ...extra, scenes });
it('the drawing runtime is valid JavaScript (escapes inside its template survive)', () => { expect(() => new Function(canvasRuntimeSource)).not.toThrow(); expect(canvasRuntimeSource).toContain(String.raw`/\S+/g`); expect(canvasRuntimeSource).not.toMatch(/split\(\/s\+\/\)/); });
describe('beat grid', () => {
  it('turns beats and bars into frames', () => { const f = beatFunctions({ fps: 30, tempo: { bpm: 120, offset: 0.25 } }); expect(f.beat!(0)).toBe(8); expect(f.beat!(2)).toBe(38); expect(f.bar!(1)).toBe(68); expect(f.bar!(1, 2)).toBe(98); expect(f.beats!(3)).toBe(45); expect(f.beat!(0.5)).toBe(15); });
  it('works in expressions and explains a missing tempo', () => { const c = loadComposition(base([{ id: 's', name: 'S', durationFrames: '{{bar(2)}}', layers: [{ id: 'a', type: 'rect', width: 1, height: 1, startFrame: '{{beat(3)}}' }] }], { tempo: { bpm: 90 } }));
    expect(c.durationFrames).toBe(160); expect(c.scenes[0]!.layers[0]!.startFrame).toBe(60); expect(() => loadComposition(base([{ id: 's', name: 'S', durationFrames: '{{beats(4)}}' }]))).toThrow(/needs a top-level "tempo"/); });
});
describe('caption extras', () => {
  const cues = [{ text: 'So, um, every every agent', start: 0, end: 2, words: [{ text: 'So,', start: 0, end: 0.3 }, { text: 'um,', start: 0.3, end: 0.6 }, { text: 'every', start: 0.6, end: 0.9 }, { text: 'Every', start: 0.9, end: 1.2 }, { text: 'agent.', start: 1.2, end: 2 }] }];
  it('drops fillers and repeated words but keeps deliberate ones', () => { expect(dropFillerWords(cues)[0]!.text).toBe('So, every agent.'); expect(dropFillerWords([{ text: 'Uh, no. No, really', start: 0, end: 1 }])[0]!.text).toBe('no. No, really'); expect(dropFillerWords([{ text: 'um', start: 0, end: 1 }])).toEqual([]); });
  it('marks emphasis words once said', () => { const at = (t: number) => captionAt({ cues, maxWords: 8, mode: 'words', dropFillers: true, emphasis: ['AGENT'] }, t)!.words;
    expect(at(1.5).map(w => w.text)).toEqual(['So,', 'every', 'agent.']); expect(at(1.5)[2]).toMatchObject({ emphasis: true, state: 1 }); expect(at(0.1)[2]).toMatchObject({ emphasis: true, state: 0 }); expect(at(1.5)[1]!.emphasis).toBeUndefined(); });
});
describe('shape morphing', () => {
  it('passes the shapes and eased progress to the runtime', () => { const c = parseComposition({ ...base([{ id: 's', name: 'S', startFrame: 0, durationFrames: 30, layers: [{ id: 'p', type: 'path', d: 'M0 0 L10 0 L10 10 Z', animations: [{ property: 'd', keyframes: [{ frame: 0, value: 'M0 0 L10 0 L10 10 Z' }, { frame: 10, value: 'M0 0 L20 0 L0 20 Z' }] }] }] }]), durationFrames: 30 });
    expect((evaluateFrame(c, 5)[0] as any).morph).toEqual({ from: 'M0 0 L10 0 L10 10 Z', to: 'M0 0 L20 0 L0 20 Z', t: 0.5 }); expect((evaluateFrame(c, 20)[0] as any).morph.t).toBe(1); expect((evaluateFrame(c, 5)[0] as any).evaluated.d).toBeUndefined(); });
  it('wants path data for d and numbers elsewhere', () => { const make = (property: string, value: unknown) => parseComposition({ ...base([{ id: 's', name: 'S', startFrame: 0, durationFrames: 30, layers: [{ id: 'p', type: 'path', d: 'M0 0', animations: [{ property, keyframes: [{ frame: 0, value }] }] }] }]), durationFrames: 30 });
    expect(() => make('d', 5)).toThrow(/SVG path data/); expect(() => make('x', 'M0 0')).toThrow(/need numbers/); expect(() => make('fill', 'M0 0')).toThrow(/colour/); });
});
describe('transitions', () => {
  const t = (type: string, progress: number, extra: any = {}) => transitionState([{ transition: { type, durationFrames: 10, direction: 'left', easing: 'linear', color: '#fff', ...extra } as any, progress }], 200, 100);
  it('iris clips to a growing circle', () => { expect(t('iris', 0.5).clipPath).toMatch(/^M\d/); const r = (p: number) => Number(/A([\d.]+)/.exec(t('iris', p).clipPath!)![1]); expect(r(1)).toBeCloseTo(Math.hypot(100, 50), 5); expect(r(0.5)).toBeCloseTo(r(1)/2, 5); });
  it('dip hides the scene for the first half under a colour that peaks midway', () => { expect(t('dip', 0.25)).toMatchObject({ opacity: 0, overlay: { color: '#fff', opacity: 0.5 } }); expect(t('dip', 0.5).overlay!.opacity).toBe(1); expect(t('dip', 0.75)).toMatchObject({ opacity: 1, overlay: { opacity: 0.5 } }); });
  it('blur comes into focus', () => { expect(t('blur', 0).blur).toBeGreaterThan(3); expect(t('blur', 1).blur).toBe(0); });
  it('push moves the scene before it out the same way', () => { const c = loadComposition(base([{ id: 'a', name: 'A', durationFrames: 30, layers: [{ id: 'r', type: 'rect', width: 1, height: 1 }] }, { id: 'b', name: 'B', durationFrames: 30, transitionIn: { type: 'push', direction: 'right', durationFrames: 10, easing: 'linear' }, layers: [{ id: 'r', type: 'rect', width: 1, height: 1 }] }]));
    const [a, b] = evaluateFrame(c, 25) as any[]; expect(a.id).toBe('scene:a'); expect(b.id).toBe('scene:b'); expect(a.x).toBeCloseTo(-100, 5); expect(b.x).toBeCloseTo(100, 5); });
});
describe('sound effects', () => {
  it('has a recipe for every name and checks names', () => { expect(Object.keys(sfxRecipes).sort()).toEqual([...sfxNames].sort()); expect(sfxArgs('pop', 'x.wav').at(-1)).toBe('x.wav');
    const audio = (src: string) => parseComposition({ ...base([{ id: 's', name: 'S', startFrame: 0, durationFrames: 30, layers: [{ id: 'a', type: 'audio', src }] }]), durationFrames: 30 }); expect(() => audio('sfx:whoosh')).not.toThrow(); expect(() => audio('sfx:boing')).toThrow(/Built-in sounds are/); });
});
