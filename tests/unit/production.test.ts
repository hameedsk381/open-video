import { describe, expect, it } from 'vitest';
import { productionSchema } from '@ove/schema';
import { compileProduction, productionSummary } from '@ove/core';

// The production manifest is the plan; compile is the contract between the plan and the renderer. These tests are
// about what compile refuses to invent and what it carries through unchanged.
const manifest = (overrides: Record<string, unknown> = {}) => productionSchema.parse({
  version: '1.0', id: 'spot', name: 'The Spot',
  brief: { prompt: 'A quiet product film' },
  shots: [
    { id: 's1', sceneId: 'open', action: 'Hands open the box', durationSeconds: 2 },
    { id: 's2', sceneId: 'open', action: 'The product on a table', durationSeconds: 4 },
  ],
  ...overrides,
});

describe('productionSchema', () => {
  it('fills defaults and keeps the shots in order', () => {
    const production = manifest();
    expect(production.format).toEqual({ width: 1920, height: 1080, fps: 30 });
    expect(production.shots.map(shot => shot.id)).toEqual(['s1', 's2']);
    expect(production.shots[0]?.camera).toEqual({ shotSize: 'medium', angle: 'eye-level', movement: 'static' });
  });

  it('rejects references the manifest does not define', () => {
    const bad = () => productionSchema.parse({
      id: 'x', name: 'X', brief: { prompt: 'p' },
      characters: [{ id: 'may', name: 'May', description: 'engineer', referenceAssets: ['portrait'] }],
      shots: [{ id: 's1', sceneId: 'a', action: 'works', durationSeconds: 2, characterIds: ['ghost'], propIds: ['lamp'] }],
    });
    expect(bad).toThrow(/character ["\\]*ghost/);
    expect(bad).toThrow(/asset ["\\]*portrait/);
    expect(bad).toThrow(/prop ["\\]*lamp/);
  });

  it('rejects duplicate ids, a beat that is not in the script, and an approved shot without a take', () => {
    expect(() => manifest({ shots: [
      { id: 's1', sceneId: 'a', action: 'a', durationSeconds: 1 },
      { id: 's1', sceneId: 'a', action: 'b', durationSeconds: 1 },
    ] })).toThrow(/used twice/);
    expect(() => manifest({ shots: [{ id: 's1', sceneId: 'a', action: 'a', durationSeconds: 1, beatId: 'hook' }] })).toThrow(/has no script/);
    expect(() => manifest({ shots: [{ id: 's1', sceneId: 'a', action: 'a', durationSeconds: 1, generation: { status: 'approved' } }] })).toThrow(/needs the assetId/);
  });

  it('treats a bare word as an asset id, not a path', () => {
    expect(() => manifest({ shots: [{ id: 's1', sceneId: 'a', action: 'a', durationSeconds: 1, media: { image: 'hero' } }] })).toThrow(/neither an asset id nor a path/);
    expect(manifest({ shots: [{ id: 's1', sceneId: 'a', action: 'a', durationSeconds: 1, media: { image: './assets/hero.png' } }] }).shots[0]?.media?.image).toBe('./assets/hero.png');
  });
});

describe('compileProduction', () => {
  it('lays shots end to end and compiles a card while footage is still a plan', () => {
    const { composition, notes } = compileProduction(manifest());
    expect(composition.fps).toBe(30);
    expect(composition.durationFrames).toBe(180);
    expect(composition.scenes.map(scene => [scene.id, scene.startFrame, scene.durationFrames])).toEqual([['s1', 0, 60], ['s2', 60, 120]]);
    expect(composition.scenes[0]?.layers[0]).toMatchObject({ type: 'text', content: 'Hands open the box', textAlign: 'center' });
    expect(composition.scenes[0]?.metadata).toMatchObject({ sceneId: 'open', action: 'Hands open the box' });
    expect(notes.join(' ')).toContain('no footage yet');
  });

  it('uses approved generated footage, and ignores a take that is not approved', () => {
    const withAsset = (status: string) => manifest({
      assets: [{ id: 'take-3', type: 'video', src: './assets/take-3.mp4' }],
      shots: [{ id: 's1', sceneId: 'a', action: 'a', durationSeconds: 2, generation: { status, assetId: 'take-3', provider: 'veo' } }],
    });
    const approved = compileProduction(withAsset('approved')).composition;
    expect(approved.scenes[0]?.layers[0]).toMatchObject({ type: 'video', src: 'take-3', muted: true });
    expect(approved.scenes[0]?.assetIds).toEqual(['take-3']);
    expect(approved.assets.map(asset => asset.id)).toEqual(['take-3']);
    const planned = compileProduction(withAsset('planned')).composition;
    expect(planned.scenes[0]?.layers[0]?.type).toBe('text');
  });

  it('keeps a still, the script and the soundtrack', () => {
    const { composition } = compileProduction(manifest({
      assets: [{ id: 'shot-1', type: 'image', src: './assets/shot-1.png' }, { id: 'bed', type: 'audio', src: './assets/bed.wav' }],
      audio: { music: 'bed', volume: 0.7 },
      script: { beats: [{ id: 'hook', name: 'Hook', onScreen: 'Open it', narration: 'Open it.' }] },
      shots: [{ id: 's1', sceneId: 'a', action: 'a', durationSeconds: 2, onScreen: 'Open it', beatId: 'hook', media: { image: 'shot-1' },
        audio: { src: './assets/line.wav', volume: 0.9 } }],
    }));
    expect(composition.scenes[0]?.beat).toBe('hook');
    expect(composition.content?.beats[0]?.id).toBe('hook');
    expect(composition.scenes[0]?.layers.map(layer => layer.type)).toEqual(['image', 'text', 'audio']);
    expect(composition.scenes[0]?.layers[1]).toMatchObject({ type: 'text', content: 'Open it', textAlign: 'left' });
    expect(composition.scenes[0]?.assetIds).toEqual(['shot-1']);
    expect(composition.scenes[0]?.layers[2]).toMatchObject({ type: 'audio', src: './assets/line.wav', volume: 0.9 });
    expect(composition.export.audio).toBe('bed');
    expect(composition.export.audioVolume).toBe(0.7);
    expect(composition.export.duck).toBeDefined();
  });

  it('takes the palette and the transition, with a shot-level transition winning', () => {
    const { composition } = compileProduction(manifest({
      style: { palette: { bg: '#0b0b0c' }, fonts: { display: 'Fraunces' }, transition: 'fade', texture: 'paper' },
      shots: [
        { id: 's1', sceneId: 'a', action: 'a', durationSeconds: 2 },
        { id: 's2', sceneId: 'a', action: 'b', durationSeconds: 2, transition: 'wipe' },
      ],
    }));
    expect(composition.background).toBe('#0b0b0c');
    expect(composition.texture).toMatchObject({ type: 'paper', color: '#f4f1ea' });
    expect(composition.scenes[0]?.transitionIn).toBeUndefined();
    expect(composition.scenes[1]?.transitionIn).toMatchObject({ type: 'wipe', durationFrames: 12 });
    expect(composition.scenes[0]?.layers[0]).toMatchObject({ fontFamily: 'Fraunces', color: '#f4f1ea' });
  });

  it('reports a shot list that disagrees with the brief and beats nothing renders', () => {
    const { notes } = compileProduction(manifest({
      brief: { prompt: 'p', targetDurationSeconds: 15 },
      script: { beats: [{ id: 'hook', name: 'Hook', onScreen: 'Hi' }, { id: 'outro', name: 'Outro', onScreen: 'Bye' }] },
      shots: [{ id: 's1', sceneId: 'a', action: 'a', durationSeconds: 2, beatId: 'hook' }],
    }));
    expect(notes.join('\n')).toContain('runs 2.0 s; the brief asked for 15 s');
    expect(notes.join('\n')).toContain('beat "outro" is not rendered');
  });

  it('summarises the production without rendering it', () => {
    const summary = productionSummary(manifest({
      characters: [{ id: 'may', name: 'May', description: 'engineer' }],
      script: { beats: [{ id: 'hook', name: 'Hook', onScreen: 'Hi' }] },
      shots: [
        { id: 's1', sceneId: 'open', action: 'a', durationSeconds: 2, beatId: 'hook' },
        { id: 's2', sceneId: 'close', action: 'b', durationSeconds: 1.5, characterIds: ['may'] },
      ],
    }));
    expect(summary).toMatchObject({ shots: 2, scenes: ['open', 'close'], characters: 1, plannedSeconds: 3.5, approvedShots: 0, pendingShots: 2, beats: 1, unusedBeats: [] });
  });
});
