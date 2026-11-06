import { beforeEach, describe, expect, it, vi } from 'vitest';
import { composeVideo, type AiProvider } from '@ove/ai';

// The generation loop can finish with review errors still standing — the heal did not converge, or the rounds ran out.
// That outcome has to reach the caller intact: a surface that reports it as a clean run is how an agent ships a video
// the renderer faults. The review is stubbed here because the fault being tested is the reporting, not the pixels.
vi.mock('@ove/core', async importOriginal => {
  const core = await importOriginal<Record<string, unknown>>();
  return {
    ...core,
    reviewComposition: vi.fn(async () => ({
      issues: [{ severity: 'error', message: 'headline overlaps the support text', frame: 120, layer: 's2-l1' }],
      loudness: -14, sampledFrames: 4, sheetFrames: 4,
    })),
  };
});

const composition = JSON.stringify({
  version: '1.0', id: 'test', name: 'Test', width: 1080, height: 1920, fps: 30, durationFrames: 300,
  scenes: [{ id: 'main', name: 'Main', startFrame: 0, durationFrames: 300,
    layers: [{ id: 'title', type: 'text', content: 'Hello', x: 540, y: 700, fontSize: 72, color: '#ffffff', textAlign: 'center', maxWidth: 900 }] }],
});

const canvas = { width: 1080, height: 1920, fps: 30, durationSeconds: 10, brief: 'a test' };

function provider(responses: string[]): AiProvider {
  const queue = [...responses];
  return { id: 'fake', model: 'fake-1', baseUrl: 'fake://', chat: async () => (queue.length > 1 ? queue.shift()! : queue[0]!) };
}

describe('a review that does not converge', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns the single-call composition with its unresolved errors instead of throwing', async () => {
    const result = await composeVideo(provider([composition]), { ...canvas, review: true, maxAttempts: 2 });
    expect(result.attempts).toBe(2);
    expect(result.issues.filter(issue => issue.severity === 'error')).toHaveLength(1);
    expect(result.issues[0]!.message).toContain('overlaps');
  });

  it('returns the scene composition with its unresolved errors when a scene cannot be healed', async () => {
    const contract = JSON.stringify({ beats: [{ name: 'Hook' }, { name: 'Craft' }, { name: 'Offer' }] });
    const scene = JSON.stringify({ layers: [{ type: 'text', content: 'SLOW COFFEE', x: 540, y: 860, fontSize: 120, color: '#f8fafc', textAlign: 'center', split: { by: 'words', stagger: 4, preset: 'rise' } }] });
    const result = await composeVideo(provider([contract, scene, scene, scene]), { ...canvas, review: true, strategy: 'scenes', maxAttempts: 2 });
    expect(result.issues.filter(issue => issue.severity === 'error')).toHaveLength(1);
    // The rounds that actually ran, not the rounds that were available.
    expect(result.attempts).toBe(1);
  });
});

// The repair path changes what the model asked for — a keyframe with a value that is not a number simply disappears —
// and a video that quietly lost its motion looks like the video that was requested. So every repair is reported, and
// strict mode refuses the answer instead of accepting the repair.
describe('a reply that only works because it was repaired', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  const broken = JSON.stringify({
    version: '1.0', id: 'test', name: 'Test', width: 1080, height: 1920, fps: 30, durationFrames: 300,
    scenes: [{ id: 'main', name: 'Main', startFrame: 0, durationFrames: 300,
      layers: [{ id: 'title', type: 'text', content: 'Hello', x: 540, y: 700, fontSize: 72, color: '#ffffff', textAlign: 'center', maxWidth: 900,
        animations: [{ property: 'y', keyframes: [{ frame: 0, value: 780 }, { frame: 20, value: 'seven hundred' }] }] }] }],
  });

  it('is made anyway with the repairs listed as warnings', async () => {
    const result = await composeVideo(provider([broken]), canvas);
    expect(result.warnings).toEqual(['layer "title": the y keyframe at frame 20 was dropped: "seven hundred" is not a number.']);
  });

  it('is refused when strict is on, after giving the model the exact list', async () => {
    const calls: string[] = [];
    const ai: AiProvider = { id: 'fake', model: 'fake-1', baseUrl: 'fake://', chat: async messages => { calls.push(String(messages[messages.length - 1]!.content)); return broken; } };
    await expect(composeVideo(ai, { ...canvas, strict: true, maxAttempts: 2 })).rejects.toThrow(/Could not get a valid composition after 2 attempts/);
    expect(calls[1]).toContain('the y keyframe at frame 20 was dropped');
    expect(calls[1]).toContain('Strict mode');
  });

  it('is refused on the scene route without falling back to one big call', async () => {
    const contract = JSON.stringify({ beats: [{ name: 'Hook' }, { name: 'Craft' }, { name: 'Offer' }] });
    const scene = JSON.stringify({ layers: [{ type: 'text', content: 'SLOW COFFEE', x: 540, y: 860, fontSize: 120, animations: [{ property: 'y', keyframes: [{ frame: 0, value: 940 }, { frame: 20, value: 'down' }] }] }] });
    const calls: string[] = [];
    const queue = [contract, scene, scene, scene];
    const ai: AiProvider = { id: 'fake', model: 'fake-1', baseUrl: 'fake://', chat: async messages => { calls.push(String(messages[1]!.content)); return queue.shift() ?? 'not scripted'; } };
    await expect(composeVideo(ai, { ...canvas, strategy: 'scenes', strict: true })).rejects.toThrow(/scene 1 \("Hook"\): text layer 1: the y keyframe at frame 20 was dropped/);
    // One contract call plus one per scene — the single-call route was never asked for a whole composition.
    expect(calls).toHaveLength(4);
  });
});
