import { describe, expect, it } from 'vitest';
import { composeByScenes, healScenes, parseBeats, parseContract, parseScene, sceneDurations, sceneRanges, stitchScenes, summarizeExit, type ScenesOptions } from '@ove/ai';
import type { AiProvider, ChatMessage, ChatOptions } from '@ove/ai';

// Scene-scoped orchestration: one small call for the style contract, one per scene, deterministic stitch and
// targeted scene heal. The model never owns timing; the stitch owns palette, fonts, ids, camera and durations.
const options: ScenesOptions = { brief: 'Launch reel for a coffee brand', width: 1080, height: 1920, fps: 30, durationSeconds: 10 };

const contractReply = JSON.stringify({
  beats: [
    { name: 'Hook', onScreen: 'steam rising over beans', seconds: 3 },
    { name: 'Craft', onScreen: 'the pour', seconds: 4 },
    { name: 'Offer', onScreen: '20% off this week', seconds: 3 },
  ],
  palette: { background: '#1a120b', text: '#f5efe6', primary: '#c98a4b', accent: '#e2574c', secondary: '#7fb069' },
  fonts: { heading: 'Fraunces', body: 'Inter' },
  moves: ['ken-burns', 'word-cascade', 'pop-in'],
  style: 'warm artisan craft',
});

const sceneReply = (headline: string, support: string) => JSON.stringify({
  background: { type: 'color', color: '#1a120b' },
  layers: [
    { type: 'text', text: headline, x: 540, y: 860, fontSize: 170, color: '#f5efe6', fontFamily: 'Fraunces', align: 'center', split: { by: 'words', stagger: 4, preset: 'rise' }, animations: [{ property: 'y', keyframes: [{ frame: 0, value: 940 }, { frame: 20, value: 860, easing: 'land' }] }] },
    { type: 'text', text: support, x: 540, y: 1100, fontSize: 80, color: '#c98a4b', fontFamily: 'Inter', animations: [{ property: 'opacity', keyframes: [{ frame: 10, value: 0 }, { frame: 30, value: 1, easing: 'glide' }] }] },
  ],
});

/** A provider that replays scripted replies in order and records every call for assertions. */
function scriptedProvider(replies: string[], failing = 0): AiProvider & { calls: { messages: ChatMessage[]; options: ChatOptions }[] } {
  const calls: { messages: ChatMessage[]; options: ChatOptions }[] = [];
  let served = 0;
  return {
    id: 'scripted',
    model: 'scripted-1',
    baseUrl: 'scripted://',
    calls,
    async chat(messages: ChatMessage[], callOptions: ChatOptions = {}) {
      calls.push({ messages, options: callOptions });
      if (served < failing) { served++; throw new Error('gateway 502'); }
      const reply = replies[served++] ?? 'not scripted';
      if (reply === 'FAIL') throw new Error('gateway 502');
      return reply;
    },
  };
}

describe('parseContract', () => {
  it('keeps valid evidence and defaults the rest', () => {
    const contract = parseContract(JSON.parse(contractReply));
    expect(contract.background).toBe('#1a120b');
    expect(contract.fonts.heading).toBe('Fraunces');
    expect(contract.moves).toEqual(['ken-burns', 'word-cascade', 'pop-in']);
    const broken = parseContract({ palette: { background: 'not-a-colour', primary: '#abc' }, fonts: {}, moves: ['ken-burns'], beats: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] });
    expect(broken.background).toBe('#0b0e14');       // house default
    expect(broken.primary).toBe('#aabbcc');          // 3-digit hex expanded
    expect(broken.moves).toHaveLength(3);            // padded from the fallback list
  });

  it('parses beats leniently', () => {
    expect(parseBeats([{ name: 'Hook', onScreen: 'beans' }, { onScreen: 'no name' }, 'junk']).map(beat => beat.name)).toEqual(['Hook']);
  });
});

describe('sceneDurations', () => {
  it('scales beats to the exact total and keeps lengths unequal', () => {
    const beats = parseBeats(JSON.parse(contractReply).beats);
    const durations = sceneDurations(beats, 10, 30);
    expect(durations.reduce((sum, frames) => sum + frames, 0)).toBe(300);
    expect(new Set(durations).size).toBeGreaterThan(1);
    expect(durations.every(frames => frames >= Math.round(1.2 * 30))).toBe(true);
  });

  it('jitters identical weights so the craft check for unequal lengths holds', () => {
    const beats = [{ name: 'a' }, { name: 'b' }, { name: 'c' }];
    const durations = sceneDurations(beats, 10, 30);
    expect(new Set(durations).size).toBeGreaterThan(1);
    expect(durations.reduce((sum, frames) => sum + frames, 0)).toBe(300);
  });
});

describe('sceneRanges', () => {
  it('follows the loader rule: each scene starts where the previous ends, minus its overlap', () => {
    const ranges = sceneRanges([90, 120, 90], [0, 8, 8]);
    expect(ranges).toEqual([{ start: 0, end: 90 }, { start: 82, end: 202 }, { start: 194, end: 284 }]);
  });
});

describe('parseScene', () => {
  it('clamps animation keyframes into the scene, sorts them, and drops unusable layers', () => {
    const scene = parseScene({
      layers: [
        { type: 'text', text: 'Hi', x: 540, y: 900, animations: [{ property: 'y', keyframes: [{ frame: 40, value: 900 }, { frame: 999, value: 980 }] }, { property: 'bogus' }] },
        { type: 'shader', code: 'nope' },
      ],
    }, 90);
    expect(scene.layers).toHaveLength(1);
    expect(scene.layers[0]!.animations[0]!.keyframes).toEqual([{ frame: 40, value: 900 }, { frame: 90, value: 980 }]);
  });

  it('converts a from/to shorthand into the schema\'s keyframes form', () => {
    const scene = parseScene({
      layers: [{ type: 'text', text: 'Hi', x: 540, y: 900, animations: [{ property: 'y', from: 980, to: 900, startFrame: 0, endFrame: 20, easing: 'land' }] }],
    }, 90);
    expect(scene.layers[0]!.animations[0]).toEqual({ property: 'y', keyframes: [{ frame: 0, value: 980 }, { frame: 20, value: 900, easing: 'land' }] });
  });

  it('rejects a scene without usable layers', () => {
    expect(() => parseScene({ layers: [{ type: 'text' }] }, 90)).toThrow();
    expect(() => parseScene({ layers: [] }, 90)).toThrow();
  });
});

describe('stitchScenes', () => {
  it('owns ids, durations, transitions, camera and the split backstop', () => {
    const beats = parseBeats(JSON.parse(contractReply).beats);
    const contract = parseContract(JSON.parse(contractReply));
    const plan = { beats, contract, durations: [105, 135, 60], sceneRanges: sceneRanges([105, 135, 60], [0, 8, 8]) };
    const scenes = [sceneReply('SLOW COFFEE', 'small batch'), sceneReply('THE POUR', '45 seconds'), sceneReply('20% OFF', 'this week')].map(reply => parseScene(JSON.parse(reply), 135));
    const raw = stitchScenes(scenes, plan, options, 'Slow coffee');
    expect(raw.scenes).toHaveLength(3);
    expect(raw.scenes.map((scene: any) => scene.id)).toEqual(['scene-1', 'scene-2', 'scene-3']);
    expect(raw.scenes.map((scene: any) => scene.durationFrames)).toEqual([105, 135, 60]);
    expect(raw.durationFrames).toBe(284);            // 105 + (135-8) + (60-8)
    expect(raw.scenes[1]!.transitionIn).toEqual({ type: 'fade', durationFrames: 8 });
    expect(raw.scenes.every((scene: any) => scene.camera?.animations?.length)).toBe(true);  // house camera injected
    expect(raw.scenes.every((scene: any) => scene.layers.every((layer: any) => /^s\d+-l\d+$/.test(layer.id)))).toBe(true);
    // The split backstop: the biggest headline of the longest scene carries the split even if a scene omitted it.
    const noSplit = parseScene({ layers: [{ type: 'text', text: 'PLAIN', x: 540, y: 900, fontSize: 170 }] }, 135);
    const raw2 = stitchScenes([noSplit, scenes[1]!, scenes[2]!], plan, options);
    expect(raw2.scenes[1]!.layers.some((layer: any) => layer.split)).toBe(true);
  });
});

describe('summarizeExit', () => {
  it('names the biggest headline and where it rests', () => {
    const scene = parseScene(JSON.parse(sceneReply('SLOW COFFEE', 'small batch')), 105);
    expect(summarizeExit(scene)).toBe('"SLOW COFFEE" at x=540, y=860');
  });
});

describe('composeByScenes', () => {
  it('makes one contract call then one call per scene, in beat order, and stitches the result', async () => {
    const provider = scriptedProvider([contractReply, sceneReply('SLOW COFFEE', 'a'), sceneReply('THE POUR', 'b'), sceneReply('20% OFF', 'c')]);
    const state = await composeByScenes(provider, options);
    expect(provider.calls).toHaveLength(4);
    expect(provider.calls[0]!.options.task).toBe('fast');
    expect(provider.calls[1]!.messages.map(message => message.content).join('\n')).toContain('Scene 1 of 3');
    expect(provider.calls[2]!.messages.map(message => message.content).join('\n')).toContain('Scene 2 of 3');
    expect(provider.calls[2]!.messages.map(message => message.content).join('\n')).toContain('The previous scene ends on: "SLOW COFFEE"');
    expect(state.raw.scenes).toHaveLength(3);
    expect(state.plan.durations.reduce((sum, frames) => sum + frames, 0)).toBe(300);
    expect(state.raw.scenes.every((scene: any) => scene.camera?.animations?.length)).toBe(true);
  });

  it('retries a failed scene once with the error fed back, and throws when it fails again', async () => {
    const provider = scriptedProvider([contractReply, 'FAIL', sceneReply('SLOW COFFEE', 'a'), sceneReply('THE POUR', 'b'), sceneReply('20% OFF', 'c')]);
    const state = await composeByScenes(provider, options);
    expect(provider.calls).toHaveLength(5);          // contract + scene 1 (fail, retry) + scenes 2-3
    expect(provider.calls[2]!.messages.map(message => message.content).join('\n')).toContain('Scene 1 of 3');
    expect(state.raw.scenes).toHaveLength(3);

    const hopeless = scriptedProvider([contractReply, 'FAIL', 'FAIL', sceneReply('THE POUR', 'b'), sceneReply('20% OFF', 'c')]);
    await expect(composeByScenes(hopeless, options)).rejects.toThrow(/scene 1 .* failed twice/);
  });

  it('throws when the contract call fails twice or returns no beats', async () => {
    await expect(composeByScenes(scriptedProvider(['FAIL', 'FAIL']), options)).rejects.toThrow(/style contract call failed twice/);
    await expect(composeByScenes(scriptedProvider([JSON.stringify({ beats: [] })]), options)).rejects.toThrow(/no usable beats/);
  });
});

describe('healScenes', () => {
  it('re-calls only the flagged scenes with the findings, and re-stitches', async () => {
    const provider = scriptedProvider([contractReply, sceneReply('SLOW COFFEE', 'a'), sceneReply('THE POUR', 'b'), sceneReply('20% OFF', 'c')]);
    const state = await composeByScenes(provider, options);
    const healer = scriptedProvider([sceneReply('THE POUR, FIXED', 'b')]);
    const healed = await healScenes(healer, state, [
      { frame: state.plan.sceneRanges[1]!.start + 5, message: 'text overlaps the headline', layer: 'THE POUR' },
      { frame: 999_999, message: 'past the end of the video, maps to no scene' },
    ], options);
    expect(healer.calls).toHaveLength(1);
    expect(healer.calls[0]!.messages.map(message => message.content).at(-1)).toContain('text overlaps the headline');
    expect(healed.scenes[1]!.layers[0]!.text).toBe('THE POUR, FIXED');
    expect(healed.scenes[0]!.layers[0]!.text).toBe('SLOW COFFEE');   // untouched
    expect(healed.raw.scenes[1]!.layers[0]!.text).toBe('THE POUR, FIXED');
  });

  it('throws when nothing maps or the heal returns the same scene', async () => {
    const provider = scriptedProvider([contractReply, sceneReply('SLOW COFFEE', 'a'), sceneReply('THE POUR', 'b'), sceneReply('20% OFF', 'c')]);
    const state = await composeByScenes(provider, options);
    await expect(healScenes(scriptedProvider([]), state, [{ message: 'no frame here' }], options)).rejects.toThrow(/no review issue mapped/);
    const same = await (async () => sceneReply('THE POUR', 'b'))();
    await expect(healScenes(scriptedProvider([same]), state, [{ frame: state.plan.sceneRanges[1]!.start + 2, message: 'overlap' }], options)).rejects.toThrow(/could not be healed/);
  });
});
