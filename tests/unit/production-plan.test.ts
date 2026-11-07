import { describe, expect, it } from 'vitest';
import { loadComposition, scaffoldProduction } from '@ove/core';
import { productionSchema } from '@ove/schema';

// Scaffolding is how an existing timeline becomes a production plan: every scene a shot, every text layer its on-screen
// copy, every picture and sound carried over, and a script that says what the video already says.
const composition = (overrides: Record<string, unknown> = {}) => loadComposition({
  version: '1.0', id: 'lamp', name: 'Late Nights', width: 1080, height: 1920, fps: 30, durationFrames: 150,
  background: '#101014', grain: 0.04,
  export: { format: 'mp4', loudness: -16, audio: 'bed', audioVolume: 0.4, duck: { amount: 0.3 } },
  assets: [{ id: 'take', type: 'video', src: './assets/take.mp4' }, { id: 'still', type: 'image', src: './assets/still.png' }, { id: 'bed', type: 'audio', src: './assets/bed.wav' }],
  scenes: [
    { id: 'open', name: 'Open', startFrame: 0, durationFrames: 60, layers: [
      { id: 'copy', type: 'text', content: 'Built for late nights' },
      { id: 'take', type: 'video', src: 'take' },
      { id: 'line', type: 'audio', src: 'line.wav', volume: 0.8 },
    ] },
    { id: 'detail', name: 'Detail', startFrame: 60, durationFrames: 90, transitionIn: { type: 'fade', durationFrames: 12 }, layers: [
      { id: 'copy', type: 'text', content: 'Warm light. No glare.' },
      { id: 'still', type: 'image', src: 'still' },
    ] },
  ],
  ...overrides,
});

describe('scaffoldProduction', () => {
  it('turns each scene into a shot, in order, with its copy, footage and sound', () => {
    const plan = scaffoldProduction(composition());
    expect(productionSchema.parse(plan)).toBeTruthy();
    expect(plan.shots.map(shot => [shot.id, shot.sceneId, shot.durationSeconds])).toEqual([['open', 'open', 2], ['detail', 'detail', 3]]);
    expect(plan.shots[0]).toMatchObject({ name: 'Open', action: 'Open', onScreen: 'Built for late nights', media: { video: 'take' }, audio: { src: 'line.wav', volume: 0.8 } });
    expect(plan.shots[1]).toMatchObject({ onScreen: 'Warm light. No glare.', media: { image: 'still' }, transition: 'fade' });
  });

  it('writes a script from the shots when the timeline has none, and links each shot to its beat', () => {
    const plan = scaffoldProduction(composition());
    expect(plan.script?.beats.map(beat => [beat.id, beat.onScreen])).toEqual([['open', 'Built for late nights'], ['detail', 'Warm light. No glare.']]);
    expect(plan.shots.map(shot => shot.beatId)).toEqual(['open', 'detail']);
  });

  it('keeps an existing script and links beats by position when the counts agree', () => {
    const created = composition({ content: { promise: 'A lamp for the hours that matter.', audience: 'Night workers', beats: [
      { id: 'hook', name: 'Hook', onScreen: 'Built for late nights', narration: 'Some of the best work happens after dark.' },
      { id: 'proof', name: 'Proof', onScreen: 'Warm light. No glare.' },
    ] } });
    const plan = scaffoldProduction(created);
    expect(plan.script?.beats.map(beat => beat.id)).toEqual(['hook', 'proof']);
    expect(plan.shots.map(shot => shot.beatId)).toEqual(['hook', 'proof']);
    expect(plan.brief).toMatchObject({ prompt: 'A lamp for the hours that matter.', audience: 'Night workers' });
  });

  it('leaves the script alone when it does not line up with the shot list', () => {
    const plan = scaffoldProduction(composition({ content: { beats: [{ id: 'hook', name: 'Hook', onScreen: 'Only one beat' }] } }));
    expect(plan.script?.beats.map(beat => beat.id)).toEqual(['hook']);
    expect(plan.shots.every(shot => shot.beatId === undefined)).toBe(true);
  });

  it('carries the look, the soundtrack and the export settings across', () => {
    const plan = scaffoldProduction(composition({
      scenes: [{ id: 'open', name: 'Open', startFrame: 0, durationFrames: 60, layers: [{ id: 'copy', type: 'text', content: 'Hi' }] }],
      texture: { type: 'paper' },
    }));
    expect(plan.style).toMatchObject({ palette: { bg: '#101014' }, texture: 'paper' });
    expect(plan.audio).toMatchObject({ music: 'bed', volume: 0.4, duck: true });
    expect(plan.export).toMatchObject({ format: 'mp4', loudness: -16, grain: 0.04 });
    expect(plan.brief.targetDurationSeconds).toBe(5);
  });

  it('plans only the scenes, skipping the generated narration and caption scenes', () => {
    const plan = scaffoldProduction(composition({
      scenes: [
        { id: 'open', name: 'Open', startFrame: 0, durationFrames: 60, layers: [{ id: 'copy', type: 'text', content: 'Hi' }] },
        { id: 'narration', name: 'Narration', startFrame: 60, durationFrames: 30, layers: [] },
        { id: 'captions', name: 'Captions', startFrame: 90, durationFrames: 30, layers: [] },
      ],
    }));
    expect(plan.shots.map(shot => shot.id)).toEqual(['open']);
  });

  it('refuses a video with nothing to plan', () => {
    expect(() => scaffoldProduction(composition({
      scenes: [{ id: 'narration', name: 'Narration', startFrame: 0, durationFrames: 60, layers: [] }],
    }))).toThrow(/no scenes to plan/);
  });
});
