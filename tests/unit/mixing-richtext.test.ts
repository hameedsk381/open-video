import { describe, it, expect } from 'vitest';
import { parseComposition } from '@ove/schema'; import { soundIntervals, volumeEnvelope } from '@ove/timeline'; import { envelopeExpression, audioMixArgs } from '@ove/ffmpeg'; import { layoutRich } from '@ove/graphics';
// Evaluates the FFmpeg expression subset envelopeExpression produces (if, lt, gte and arithmetic) at time t, by turning it into JS.
const evalExpr = (expr: string, t: number) => new Function('t', `const iff=(c,a,b)=>c?a:b,lt=(a,b)=>a<b,gte=(a,b)=>a>=b; return ${expr.replace(/\bif\(/g, 'iff(')};`)(t) as number;
const at = (points: [number, number][], t: number) => { if (t <= points[0]![0]) return points[0]![1]; for (let i = 1; i < points.length; i++) if (t <= points[i]![0]) { const [t0, v0] = points[i-1]!, [t1, v1] = points[i]!; return v0 + (v1 - v0)*(t - t0)/(t1 - t0); } return points.at(-1)![1]; };
const comp = (layers: any[], extra: any = {}) => parseComposition({ version: '1.0', id: 'm', name: 'M', width: 10, height: 10, fps: 10, durationFrames: 100, scenes: [{ id: 's', name: 'S', startFrame: 0, durationFrames: 100, layers }], ...extra });
describe('volume envelopes', () => {
  it('is undefined when nothing changes, so a plain volume is used', () => expect(volumeEnvelope({ layer: { volume: 0.8 }, fps: 10, start: 0, duration: 5, others: [] })).toBeUndefined());
  it('follows volume keyframes', () => { const env = volumeEnvelope({ layer: { volume: 1, animations: [{ property: 'volume', keyframes: [{ frame: 0, value: 1 }, { frame: 20, value: 0.2 }] }] }, fps: 10, start: 0, duration: 5, others: [] })!;
    expect(at(env, 0)).toBeCloseTo(1); expect(at(env, 1)).toBeCloseTo(0.6); expect(at(env, 4)).toBeCloseTo(0.2); expect(env.length).toBeLessThan(6); });
  it('ducks with attack and release, bridging short gaps', () => { const music = { volume: 1 }; const voice = { layer: { id: 'vo' } as any, intervals: [[2, 3], [3.5, 4], [6, 7]] as [number, number][] };
    const env = volumeEnvelope({ layer: music, fps: 10, start: 0, duration: 10, duck: { amount: 0.25, attackFrames: 5, releaseFrames: 10 }, others: [voice] })!;
    expect(at(env, 1)).toBeCloseTo(1); expect(at(env, 1.75)).toBeCloseTo(0.625); expect(at(env, 2.5)).toBeCloseTo(0.25); expect(at(env, 3.25)).toBeCloseTo(0.25); expect(at(env, 4.5)).toBeCloseTo(0.625); expect(at(env, 5.2)).toBeCloseTo(1); expect(at(env, 6.5)).toBeCloseTo(0.25); });
  it('only ducks under the layers named in by', () => { const others = [{ layer: { id: 'sfx' } as any, intervals: [[1, 2]] as [number, number][] }, { layer: { id: 'vo' } as any, intervals: [[5, 6]] as [number, number][] }];
    const env = volumeEnvelope({ layer: { volume: 1 }, fps: 10, start: 0, duration: 10, duck: { amount: 0.5, attackFrames: 0, releaseFrames: 0, by: ['vo'] }, others })!; expect(at(env, 1.5)).toBe(1); expect(at(env, 5.5)).toBe(0.5); });
  it('ducks during measured phrases, mapped through trim and speed', () => { const c = comp([{ id: 'vo', type: 'audio', src: 'voice', startFrame: 20, trimStart: 10, playbackRate: 2 }]);
    expect(soundIntervals(c, { voice: { duration: 9, segments: [{ start: 1, end: 3 }, { start: 5, end: 7 }] } })[0]!.intervals).toEqual([[2, 3], [4, 5]]); expect(soundIntervals(c)[0]!.intervals).toEqual([[2, 10]]); });
});
describe('FFmpeg volume expressions', () => {
  it('evaluates to the same gain as the envelope', () => { const points: [number, number][] = [[0, 1], [1.5, 1], [2, 0.3], [4, 0.3], [5.5, 0.8], [6, 1]];
    const expr = envelopeExpression(points); for (const t of [0, 0.7, 1.75, 3, 4.75, 5.9, 8]) expect(evalExpr(expr, t)).toBeCloseTo(at(points, t), 4); });
  it('keeps the expression shallow for long envelopes', () => { const points = Array.from({ length: 64 }, (_, i) => [i/10, i % 2] as [number, number]); expect((envelopeExpression(points).match(/if\(lt/g) ?? []).length).toBe(62); expect(evalExpr(envelopeExpression(points), 3.25)).toBeCloseTo(0.5, 4); });
  it('uses the expression in the mix only for clips with an envelope', () => { const graph = audioMixArgs({ durationSeconds: 5, clips: [{ source: 'a.wav', start: 0, duration: 5, volume: 0.5 }, { source: 'b.wav', start: 0, duration: 5, envelope: [[0, 1], [5, 0]] }] })[5]!;
    expect(graph).toContain('volume=0.5,'); expect(graph).toMatch(/volume='if\(gte\(t,5\),0,\(1\+\(-1\)\*\(t-0\)\/5\)\)':eval=frame/); });
});
describe('rich text', () => {
  const measure = (text: string, _span: unknown, size: number) => Array.from(text).length*size*0.5;
  it('wraps styled spans together and keeps line breaks', () => { const r = layoutRich([{ text: 'Agentic ' }, { text: 'AI', fontSize: 40 }, { text: ' gets\nthings done' }], { fontSize: 20, maxWidth: 130 }, measure);
    expect(r.lines.map(l => l.runs.filter(x => x.kind === 'word').map(x => x.text).join(' '))).toEqual(['Agentic AI', 'gets', 'things done']); expect(r.lines[0]!.runs.find(x => x.text === 'AI')!.size).toBe(40); });
  it('shrinks every span by the same factor to fit maxLines', () => { const r = layoutRich([{ text: 'one two ' }, { text: 'three', fontSize: 40 }], { fontSize: 20, maxWidth: 100, maxLines: 1, minFontSize: 5 }, measure);
    expect(r.lines).toHaveLength(1); expect(r.scale).toBeLessThan(1); const sizes = r.lines[0]!.runs.filter(x => x.kind === 'word').map(x => x.size); expect(sizes[2]! / sizes[0]!).toBeCloseTo(2, 5); });
  it('cuts with an ellipsis when it cannot shrink enough', () => { const r = layoutRich([{ text: 'one two three four five six' }], { fontSize: 20, maxWidth: 100, maxLines: 1 }, measure); expect(r.truncated).toBe(true); expect(r.lines).toHaveLength(1); expect(r.lines[0]!.width).toBeLessThanOrEqual(100); expect(r.lines[0]!.runs.at(-1)!.text.endsWith('…')).toBe(true); });
  it('accepts spans in the schema with styles and highlights', () => { const t: any = comp([{ id: 't', type: 'text', spans: [{ text: 'Plain ' }, { text: 'bold', fontWeight: 800, color: '#22d3ee', background: 'rgba(0,0,0,0.5)', underline: true }] }]).scenes[0]!.layers[0]; expect(t.content).toBe(''); expect(t.spans[1]).toMatchObject({ fontWeight: 800, underline: true }); });
  it('accepts animated volume and ducking in the schema', () => { const c = comp([{ id: 'm', type: 'audio', src: 'm.wav', duck: {}, animations: [{ property: 'volume', keyframes: [{ frame: 0, value: 1 }] }] }], { export: { audio: 'pad', audioVolume: 0.5, duck: { amount: 0.2 } } });
    expect((c.scenes[0]!.layers[0] as any).duck).toEqual({ amount: 0.3, attackFrames: 6, releaseFrames: 15 }); expect(c.export).toMatchObject({ audioVolume: 0.5, duck: { amount: 0.2 } }); });
});
