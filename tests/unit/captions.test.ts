import { describe, it, expect } from 'vitest';
import { parseCaptions, groupCaptionWords, captionLines, formatCaptions, loadComposition, sequenceScenes, parseComposition, type MediaInfo } from '@ove/schema';
import { captionAt, toDrawOperations, prepareOperations } from '@ove/graphics'; import { evaluateFrame } from '@ove/timeline'; import { captionTrack } from '../../packages/core/src/media';
const words = [{ text: 'They', start: 0, end: 0.3 }, { text: 'perceive', start: 0.3, end: 0.8 }, { text: 'the', start: 0.8, end: 0.9 }, { text: 'situation,', start: 0.9, end: 1.6 }, { text: 'plan', start: 1.6, end: 1.9 }, { text: 'the', start: 1.9, end: 2 }, { text: 'next', start: 2, end: 2.2 }, { text: 'step.', start: 2.2, end: 2.6 }, { text: 'Again', start: 3.2, end: 3.6 }];
describe('caption files', () => {
  it('reads SRT, dropping formatting tags', () => expect(parseCaptions('1\n00:00:01,000 --> 00:00:02,500\n<i>Hello</i> there\n\n2\n00:00:03,000 --> 00:00:04,000\nSecond line\n', 'a.srt')).toEqual([{ text: 'Hello there', start: 1, end: 2.5 }, { text: 'Second line', start: 3, end: 4 }]));
  it('reads WebVTT with hours, cue settings and notes', () => expect(parseCaptions('WEBVTT\n\nNOTE made by hand\n\nintro\n01:00:01.250 --> 01:00:02.000 align:middle\nHi\n', 'a.vtt')).toEqual([{ text: 'Hi', start: 3601.25, end: 3602 }]));
  it('reads JSON lines and JSON word timings', () => { expect(parseCaptions(JSON.stringify({ cues: [{ text: 'One line', start: 0, end: 1 }] }), 'a.json')).toEqual([{ text: 'One line', start: 0, end: 1 }]); expect(parseCaptions(JSON.stringify({ words }), 'w.json', Infinity).map(c => c.text)).toEqual(['They perceive the situation,', 'plan the next step.', 'Again']); });
  it('rejects JSON without words or cues', () => expect(() => parseCaptions('{"x":1}', 'a.json')).toThrow(/words.*cues/));
});
describe('grouping words into lines', () => {
  it('breaks after sentences, after commas once a line has 3 words, at pauses and at maxWords', () => { expect(groupCaptionWords(words, 99).map(c => c.text)).toEqual(['They perceive the situation,', 'plan the next step.', 'Again']);
    expect(groupCaptionWords([{ text: 'a', start: 0, end: .1 }, { text: 'b,', start: .1, end: .2 }, { text: 'c', start: .2, end: .3 }, { text: 'd', start: .8, end: .9 }], 99).map(c => c.text)).toEqual(['a b, c', 'd']);
    expect(groupCaptionWords(words.slice(0, 4), 2).map(c => c.text)).toEqual(['They perceive', 'the situation,']); });
  it('splits long lines from a file only when they carry word timings', () => { const cue = { text: 'x', start: 0, end: 3, words }; expect(captionLines([cue], 4).length).toBeGreaterThan(1); expect(captionLines([{ text: 'a b c d e f g h i', start: 0, end: 1 }], 2)).toHaveLength(1); });
  it('formats SRT and WebVTT', () => { const cues = [{ text: 'Hi', start: 61.5, end: 3725.004 }]; expect(formatCaptions(cues, 'srt')).toBe('1\n00:01:01,500 --> 01:02:05,004\nHi\n'); expect(formatCaptions(cues, 'vtt')).toBe('WEBVTT\n\n00:01:01.500 --> 01:02:05.004\nHi\n'); });
});
describe('the word being said', () => {
  const layer = { cues: groupCaptionWords(words, 99), maxWords: 8, mode: 'words', offset: 0 };
  it('marks words said, being said and still to come', () => { expect(captionAt(layer, 1.7)!.words.map(w => w.state)).toEqual([1, 0, 0, 0]); expect(captionAt(layer, 2.1)!.words.map(w => w.state)).toEqual([2, 2, 1, 0]); });
  it('keeps a finished line up through a short gap, then clears', () => { expect(captionAt(layer, 2.75)!.words.every(w => w.state === 2)).toBe(true); expect(captionAt(layer, 3.0)).toBeNull(); expect(captionAt(layer, 3.3)!.words[0]!.text).toBe('Again'); });
  it('honours offset and lines mode', () => { expect(captionAt({ ...layer, offset: 1 }, 1.7)!.words[0]!.text).toBe('They'); expect(captionAt({ ...layer, mode: 'lines' }, 1.7)!.words.every(w => w.state === 2)).toBe(true); });
});
const scene = (id: string, extra: any) => ({ id, name: id, layers: [], ...extra });
describe('sequencing and media-driven timing', () => {
  it('places scenes after each other, overlapping by their transition unless told otherwise', () => { const out: any = sequenceScenes({ durationFrames: 'auto', scenes: [scene('a', { durationFrames: 100 }), scene('b', { durationFrames: 50, transitionIn: { type: 'fade', durationFrames: 10 } }), scene('c', { durationFrames: 40, overlap: 0, transitionIn: { type: 'zoom', durationFrames: 18 } }), scene('d', { startFrame: 5, durationFrames: 10 })] });
    expect(out.scenes.map((s: any) => s.startFrame)).toEqual([0, 90, 140, 5]); expect(out.durationFrames).toBe(180); });
  it('refuses "auto" outside loadComposition', () => expect(() => parseComposition({ version: '1.0', id: 'x', name: 'x', width: 10, height: 10, fps: 30, durationFrames: 'auto', scenes: [scene('a', { startFrame: 0, durationFrames: 10 })] })).toThrow(/loadComposition/));
  it('uses measured media in expressions and sizes scenes from it', () => { const media: Record<string, MediaInfo> = { vo: { duration: 4, frames: 120, soundEnd: 3.5, soundEndFrames: 105, segments: [{ start: 0, end: 1, startFrame: 0, endFrame: 30 }, { start: 1.5, end: 3.5, startFrame: 45, endFrame: 105 }] } };
    const c = loadComposition({ version: '1.0', id: 'x', name: 'x', width: 10, height: 10, fps: 30, durationFrames: 'auto', assets: [{ id: 'vo', type: 'audio', src: './vo.wav' }],
      scenes: [scene('a', { durationFrames: "{{media['vo'].soundEndFrames + 20}}", layers: [{ id: 'cue', type: 'rect', width: 1, height: 1, startFrame: '{{media.vo.segments[1].startFrame}}' }] }), scene('b', { durationFrames: 30 })] }, {}, { media });
    expect(c.scenes.map(s => [s.startFrame, s.durationFrames])).toEqual([[0, 125], [125, 30]]); expect(c.durationFrames).toBe(155); expect(c.scenes[0]!.layers[0].startFrame).toBe(45); });
  it('explains a media reference when media was not measured', () => expect(() => loadComposition({ version: '1.0', id: 'x', name: 'x', width: 10, height: 10, fps: 30, durationFrames: 30, scenes: [scene('a', { startFrame: 0, durationFrames: "{{media.vo.frames}}" })] })).toThrow(/unknown variable "media"/));
});
describe('captions layers', () => {
  const comp = parseComposition({ version: '1.0', id: 'x', name: 'x', width: 100, height: 100, fps: 10, durationFrames: 100, scenes: [{ id: 's', name: 's', startFrame: 20, durationFrames: 50, layers: [{ id: 'g', type: 'group', startFrame: 5, children: [{ id: 'cc', type: 'captions', src: 'inline', cues: groupCaptionWords(words, 99) }] }] }] });
  it('draws the current line with word states and font parts', () => { const op = prepareOperations(toDrawOperations(evaluateFrame(comp, 20 + 5 + 17)), comp.fps)[0]!.children![0]!; expect(op.kind).toBe('captions'); expect(op.fontStack).toBe('"Inter"'); expect(op.caption!.words.map(w => `${w.text}:${w.state}`)).toEqual(['plan:1', 'the:0', 'next:0', 'step.:0']); });
  it('exports every line at its place in the video', () => expect(captionTrack(comp).map(c => [c.text, +c.start.toFixed(2), +c.end.toFixed(2)])).toEqual([['They perceive the situation,', 2.5, 4.1], ['plan the next step.', 4.1, 5.1], ['Again', 5.7, 6.1]]));
});
