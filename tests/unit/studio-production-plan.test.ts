import { describe, expect, it } from 'vitest';
import { assetRef, groupShots, issuesBySection, mediaUrl, newShot, planSeconds, sectionOf, shotMedia } from '../../apps/studio/src/productionPlan';

// The plan workspace's pure parts: where an issue belongs, how a shot's media resolves, and how shots group for
// the storyboard. These are what the page relies on, so they are checked without a browser.
const plan = (overrides: Record<string, unknown> = {}) => ({
  assets: [{ id: 'take', type: 'video', src: './assets/take.mp4' }, { id: 'still', type: 'image', src: './assets/still.png' }],
  shots: [
    { id: 's1', sceneId: 'open', action: 'a', durationSeconds: 2 },
    { id: 's2', sceneId: 'open', action: 'b', durationSeconds: 4 },
    { id: 's3', sceneId: 'close', action: 'c', durationSeconds: 1.5 },
  ],
  ...overrides,
}) as any;

describe('productionPlan helpers', () => {
  it('sends each issue to the section that can fix it', () => {
    expect(sectionOf('brief.prompt')).toBe('brief');
    expect(sectionOf('format.width')).toBe('brief');
    expect(sectionOf('style.palette.bg')).toBe('brief');
    expect(sectionOf('script.beats.0.sourceIds.0')).toBe('script');
    expect(sectionOf('shots.2.durationSeconds')).toBe('shots');
    expect(sectionOf('')).toBe('brief');
    expect(issuesBySection([{ path: 'brief.prompt' }, { path: 'script.beats' }, { path: 'shots.0.action' }, { path: 'shots.1.id' }]))
      .toEqual({ brief: 1, script: 1, storyboard: 0, shots: 2, compile: 0 });
  });

  it('resolves a registered asset id, a project path, and refuses a bare word that is neither', () => {
    expect(assetRef(plan(), 'take')).toBe('./assets/take.mp4');
    expect(assetRef(plan(), './assets/own.png')).toBe('./assets/own.png');
    expect(assetRef(plan(), 'unknown')).toBeUndefined();
    expect(assetRef(plan(), undefined)).toBeUndefined();
  });

  it('builds URLs against the project file base, and leaves remote media alone', () => {
    expect(mediaUrl('/files/spot/', plan(), 'still')).toBe('/files/spot/assets/still.png');
    expect(mediaUrl('/files/spot/', plan(), './assets/own.png')).toBe('/files/spot/assets/own.png');
    expect(mediaUrl('/files/spot/', plan(), 'https://cdn.example/x.png')).toBe('https://cdn.example/x.png');
    expect(mediaUrl('/files/spot/', plan(), 'unknown')).toBeUndefined();
  });

  it('prefers a picture over a video for the storyboard card', () => {
    expect(shotMedia(plan(), '/files/spot/', { media: { image: 'still', video: 'take' } } as any)).toEqual({ kind: 'image', url: '/files/spot/assets/still.png' });
    expect(shotMedia(plan(), '/files/spot/', { media: { video: 'take' } } as any)).toEqual({ kind: 'video', url: '/files/spot/assets/take.mp4' });
    expect(shotMedia(plan(), '/files/spot/', {} as any)).toBeUndefined();
  });

  it('groups consecutive shots that share a scene, splitting when the scene changes', () => {
    expect(groupShots(plan()).map(group => [group.sceneId, group.shots.map(shot => shot.id)])).toEqual([['open', ['s1', 's2']], ['close', ['s3']]]);
    expect(groupShots({ shots: [] } as any)).toEqual([]);
  });

  it('adds up the planned seconds and numbers a new shot without reusing an id', () => {
    expect(planSeconds(plan())).toBe(7.5);
    const added = newShot(plan(), 'close');
    expect(added).toMatchObject({ id: 'shot-4', sceneId: 'close', durationSeconds: 2, camera: { shotSize: 'medium', angle: 'eye-level', movement: 'static' } });
    expect(newShot({ shots: [{ id: 'shot-2' }, { id: 'shot-3' }] } as any).id).toBe('shot-4');
  });
});
