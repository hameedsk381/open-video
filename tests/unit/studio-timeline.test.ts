import { describe, expect, it } from 'vitest';
import { applyKeyframeEdit, applySceneEdit } from '../../packages/cli/src/studio';
import { devPage } from '../../packages/cli/src/dev-page';

// The Studio timeline: scenes can be moved and resized, keyframes retimed, all as edits to a copy of the file's own JSON.
const raw = { version: '1.0', id: 's', name: 'S', width: 100, height: 100, fps: 30, durationFrames: 120,
  scenes: [
    { id: 'a', name: 'A', startFrame: 0, durationFrames: 60, layers: [{ id: 'box', type: 'rect', width: 10, height: 10, animations: [{ property: 'x', keyframes: [{ frame: 0, value: 0 }, { frame: 20, value: 50 }, { frame: 40, value: 90 }] }] }] },
    { id: 'b', name: 'B', startFrame: '{{second}}', durationFrames: 60, layers: [] },
    { repeat: '{{items}}', as: 'it', each: [{ id: 'rep-{{index}}', name: 'R', durationFrames: 10, layers: [] }] },
  ] };

describe('Studio scene edits', () => {
  it('moves and resizes a scene on a copy', () => {
    const next: any = applySceneEdit(raw, { id: 'a', set: { startFrame: 10, durationFrames: 45 } });
    expect(next.scenes[0]).toMatchObject({ id: 'a', startFrame: 10, durationFrames: 45 }); expect((raw as any).scenes[0].startFrame).toBe(0);
  });
  it('refuses what it cannot change safely', () => {
    expect(() => applySceneEdit(raw, { id: 'zzz', set: { startFrame: 1 } })).toThrow(/No scene "zzz"/);
    expect(() => applySceneEdit(raw, { id: 'b', set: { startFrame: 5 } })).toThrow(/comes from a variable/);
    expect(() => applySceneEdit(raw, { id: 'a', set: { durationFrames: 0 } })).toThrow(/whole number of frames/);
    expect(() => applySceneEdit(raw, { id: 'a', set: { name: 'x' } as any })).toThrow(/cannot be changed here/);
    expect(() => applySceneEdit(raw, { id: 'rep-0', set: { startFrame: 1 } })).toThrow(/No scene/);
  });
});

describe('Studio keyframe edits', () => {
  it('retimes a keyframe and keeps them in order', () => {
    const next: any = applyKeyframeEdit(raw, { id: 'box', animation: 0, keyframe: 1, frame: 50 });
    expect(next.scenes[0].layers[0].animations[0].keyframes.map((k: any) => k.frame)).toEqual([0, 40, 50]);
    expect((raw as any).scenes[0].layers[0].animations[0].keyframes[1].frame).toBe(20);
  });
  it('refuses a keyframe that is not there or a frame that is not valid', () => {
    expect(() => applyKeyframeEdit(raw, { id: 'box', animation: 3, keyframe: 0, frame: 5 })).toThrow(/not written in the file/);
    expect(() => applyKeyframeEdit(raw, { id: 'box', animation: 0, keyframe: 0, frame: -4 })).toThrow(/whole frame/);
    expect(() => applyKeyframeEdit(raw, { id: 'nope', animation: 0, keyframe: 0, frame: 4 })).toThrow(/No layer/);
  });
});

describe('Studio page', () => {
  it('has a script that parses and offers the timeline editing it describes', () => {
    const script = /<script>([\s\S]*)<\/script>/.exec(devPage)?.[1] ?? '';
    expect(script.length).toBeGreaterThan(2000);
    expect(() => new Function(script)).not.toThrow();
    for (const name of ['startSceneDrag', 'startKeyframeDrag', 'keyframeRow', "'/api/scene'", "'/api/keyframe'", "'start'"]) expect(script, name).toContain(name);
  });
});
