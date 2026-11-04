import { describe, expect, it } from 'vitest';
import { loadComposition } from '@ove/schema';
import { retimeComposition } from '@ove/ai';

// A two-scene composition: the second overlaps the first through its transition-in, the first scene carries an
// animated, split text layer, the second an audio layer with fades and a source position. Totals 180 frames = 6 s.
const fixture = {
  version: '1.0',
  id: 'retime-fixture',
  name: 'Retime fixture',
  fps: 30,
  width: 1080,
  height: 1920,
  durationFrames: 180,
  scenes: [
    {
      id: 'a', name: 'A', startFrame: 0, durationFrames: 90,
      layers: [{
        id: 't', type: 'text', content: 'Hello', x: 100, y: 100, fontSize: 64,
        startFrame: 10, endFrame: 80,
        animations: [{ property: 'opacity', keyframes: [{ frame: 0, value: 0 }, { frame: 30, value: 1, easing: 'land' }] }],
        split: { by: 'words', duration: 18, stagger: 4, preset: 'rise' },
      }],
    },
    {
      id: 'b', name: 'B', startFrame: 75, durationFrames: 105, transitionIn: { type: 'fade', durationFrames: 15 },
      layers: [{ id: 's', type: 'audio', src: 'sfx:click', trimStart: 300, fadeInFrames: 12, fadeOutFrames: 30 }],
    },
  ],
};
const composition = loadComposition(structuredClone(fixture));

describe('retimeComposition', () => {
  it('stretches every timing by the same factor (6 s to 12 s)', () => {
    const retimed = retimeComposition(structuredClone(composition), 12);
    expect(retimed.durationFrames).toBe(360);
    const [a, b] = retimed.scenes;
    expect(a!.durationFrames).toBe(180);
    expect(b!.durationFrames).toBe(210);
    // The second scene still begins where the first ends, minus its (doubled) transition-in.
    expect(b!.startFrame).toBe(150);
    const layer = a!.layers[0]!;
    expect(layer.startFrame).toBe(20);
    expect(layer.endFrame).toBe(160);
    expect(layer.animations![0]!.keyframes.map((keyframe: any) => keyframe.frame)).toEqual([0, 60]);
    expect(layer.split!.duration).toBe(36);
    expect(layer.split!.stagger).toBe(8);
    const audio = b!.layers[0]!;
    expect(audio.fadeInFrames).toBe(24);
    expect(audio.fadeOutFrames).toBe(60);
    // Source positions point into the media, not the timeline: untouched.
    expect(audio.trimStart).toBe(300);
  });

  it('trims as well as stretches (6 s to 3 s)', () => {
    const retimed = retimeComposition(structuredClone(composition), 3);
    expect(retimed.durationFrames).toBe(90);
    const [a, b] = retimed.scenes;
    expect(a!.durationFrames).toBe(45);
    expect(b!.startFrame).toBe(37); // 45 minus the 8-frame transition-in
    expect(b!.durationFrames).toBe(53);
    const layer = a!.layers[0]!;
    expect(layer.startFrame).toBe(5);
    expect(layer.endFrame).toBe(40);
    expect(layer.animations![0]!.keyframes.map((keyframe: any) => keyframe.frame)).toEqual([0, 15]);
    expect(layer.split!.stagger).toBe(2);
  });

  it('puts rounding drift on the longest scene so the total is exact', () => {
    const three = loadComposition({ ...structuredClone(composition), durationFrames: 270, scenes: [90, 90, 90].map((durationFrames, i) => ({ id: `s${i}`, name: `S${i}`, startFrame: i * 90, durationFrames, layers: [] })) });
    const retimed = retimeComposition(three, 61 / 30);
    expect(retimed.durationFrames).toBe(61);
    expect(retimed.scenes.reduce((total, scene) => Math.max(total, scene.startFrame + scene.durationFrames), 0)).toBe(61);
    expect(retimed.scenes.some((scene: { durationFrames: number }) => scene.durationFrames === 21)).toBe(true);
  });

  it('returns the composition unchanged when the length already matches', () => {
    const same = retimeComposition(composition, 6);
    expect(same).toBe(composition);
  });

  it('produces a composition the loader still accepts', () => {
    const retimed = retimeComposition(structuredClone(composition), 12);
    expect(() => loadComposition(structuredClone(retimed))).not.toThrow();
    expect(retimed.scenes.map(scene => scene.startFrame)).toEqual([0, 150]);
  });
});
