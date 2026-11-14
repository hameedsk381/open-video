import { describe, expect, it } from 'vitest';
import { explainerSchema } from '@ove/schema';
import { compileExplainer } from '@ove/core';

// Scenes are drawn from the top of a 1080x1920 column. The compiler centres each scene's content between the header and the lower band that
// reel apps cover, and a scene may choose its own layout, so the video is neither top-heavy nor one template from start to end.
const steps = { kind: 'steps', items: [{ title: 'One', detail: 'first' }, { title: 'Two', detail: 'second' }] };
const compile = (scenes: unknown[], extra: Record<string, unknown> = {}) => compileExplainer(explainerSchema.parse({ topic: 'T', scenes, ...extra })).composition as any;
const layer = (composition: any, scene: number, id: string) => composition.scenes[scene].layers.find((item: any) => item.id === id);

describe('explainer vertical placement', () => {
  it('moves a short scene down into the middle of the usable band, keyframes with it', () => {
    const centred = compile([steps]), top = compile([{ ...steps, place: 'top' }]);
    const shifted = layer(centred, 0, 'step-0'), pinned = layer(top, 0, 'step-0');
    expect(pinned.y).toBe(320);
    expect(shifted.y).toBeGreaterThan(pinned.y + 100);
    const shift = shifted.y - pinned.y, ends = (item: any) => item.animations.find((beat: any) => beat.property === 'y').keyframes.map((key: any) => key.value);
    expect(ends(shifted)).toEqual(ends(pinned).map((value: number) => value + shift));
  });

  it('keeps the header and kicker where they are, and leaves sounds alone', () => {
    const composition = compile([{ ...steps, step: 'STEP 1' }]);
    expect(layer(composition, 0, 'kicker-0').y).toBe(218);
    expect(composition.scenes[0].layers.filter((item: any) => item.type === 'audio').every((item: any) => item.y === undefined)).toBe(true);
  });

  it('keeps every layer at the top of the scene, with its id, so the editor can still find it', () => {
    const composition = compile([steps]);
    expect(composition.scenes[0].layers.some((item: any) => item.type === 'group')).toBe(false);
    expect(layer(composition, 0, 'step-on-1')).toBeTruthy();
  });

  it('does not move pile and media scenes, whose frames are fixed', () => {
    const composition = compile([{ kind: 'pile', title: 'REQUESTS', count: 20 }]);
    expect(composition.scenes[0].layers.some((item: any) => item.id === 'picture')).toBe(false);
  });
});

describe('explainer scene layouts', () => {
  it('lets a scene choose editorial while the others stay cards', () => {
    const composition = compile([{ ...steps, layout: 'editorial' }, steps], { design: { layout: 'card' } });
    const ids = (scene: number) => composition.scenes[scene].layers.map((item: any) => item.id as string);
    expect(ids(0).some((id: string) => id.startsWith('step-n-'))).toBe(false);
    expect(ids(1).some((id: string) => id.startsWith('step-n-'))).toBe(true);
  });

  it('does not leak one scene\'s layout into the next', () => {
    const composition = compile([{ ...steps, layout: 'editorial' }, steps, { ...steps, layout: 'card' }]);
    const cards = (scene: number) => composition.scenes[scene].layers.some((item: any) => String(item.id).startsWith('step-n-'));
    expect([cards(0), cards(1), cards(2)]).toEqual([false, true, true]);
  });
});

describe('explainer freeform scenes', () => {
  const freeform = { kind: 'freeform', elements: [
    { type: 'box', x: 100, y: 500, w: 300, h: 120, fill: 'surface', stroke: 'accent', motion: 'pop' },
    { type: 'text', text: 'Hello', x: 250, y: 540, size: 60, align: 'center', color: 'accent2' },
    { type: 'box', x: 100, y: 700, w: 400, h: 6, fill: 'accent', motion: 'draw', at: 0.4 },
    { type: 'circle', x: 800, y: 600, d: 120, fill: '#ff0000' },
  ], caption: 'A custom board.' };

  it('puts every element where the script says, with the look\'s colours as tokens', () => {
    const composition = compile([freeform]);
    expect(layer(composition, 0, 'ff-box-0')).toMatchObject({ x: 100, y: 500, width: 300, height: 120, stroke: '{{accent}}', fill: '{{surface}}' });
    expect(layer(composition, 0, 'ff-text-1')).toMatchObject({ x: 250, y: 540, fontSize: 60, color: '{{accent2}}', textAlign: 'center' });
    expect(layer(composition, 0, 'ff-circle-3')).toMatchObject({ x: 800, y: 600, width: 120, fill: '#ff0000' });
  });

  it('draws a bar by growing its width, and does not move the scene', () => {
    const bar = layer(compile([freeform]), 0, 'ff-box-2');
    expect(bar.y).toBe(700);
    const widths = bar.animations.find((beat: any) => beat.property === 'width').keyframes.map((key: any) => key.value);
    expect(widths[0]).toBe(0);
    expect(widths.at(-1)).toBe(400);
  });

  it('keeps the scene at least as long as asked', () => {
    const composition = compile([{ ...freeform, duration: 12 }]);
    expect(composition.scenes[0].durationFrames).toBeGreaterThanOrEqual(360);
  });

  it('refuses a colour or a position that cannot be drawn', () => {
    expect(explainerSchema.safeParse({ topic: 'T', scenes: [{ kind: 'freeform', elements: [{ type: 'box', x: 0, y: 0, w: 10, h: 10, fill: 'orange' }] }] }).success).toBe(false);
    expect(explainerSchema.safeParse({ topic: 'T', scenes: [{ kind: 'freeform', elements: [{ type: 'text', text: 'x', x: 0, y: 5000 }] }] }).success).toBe(false);
    expect(explainerSchema.safeParse({ topic: 'T', scenes: [{ kind: 'freeform', elements: [] }] }).success).toBe(false);
  });
});

describe('explainer auto layout', () => {
  const short = { kind: 'steps', layout: 'auto', items: [{ title: 'Hash it' }, { title: 'Pick a slot' }] };
  const long = { kind: 'steps', layout: 'auto', items: [
    { title: 'The browser says hello and what it supports', detail: 'And a random number that the server will need later' },
    { title: 'The server replies with its certificate', detail: 'The certificate names the site and is signed by an authority' }] };
  const isEditorial = (composition: any) => composition.scenes[0].layers.some((item: any) => String(item.id).startsWith('step-line-'));

  it('keeps cards for short copy and goes editorial for text-heavy copy', () => {
    expect(isEditorial(compile([short]))).toBe(false);
    expect(isEditorial(compile([long]))).toBe(true);
  });

  it('decides each scene on its own words', () => {
    const composition = compile([short, long]);
    const editorial = (scene: number) => composition.scenes[scene].layers.some((item: any) => String(item.id).startsWith('step-line-'));
    expect([editorial(0), editorial(1)]).toEqual([false, true]);
  });
});

describe('explainer captions and chapter bar', () => {
  const words = [{ text: 'Hash', start: 0, end: 0.4 }, { text: 'the', start: 0.4, end: 0.6 }, { text: 'key.', start: 0.6, end: 1.1 }, { text: 'Pick', start: 1.2, end: 1.6 }, { text: 'a', start: 1.6, end: 1.7 }, { text: 'slot.', start: 1.7, end: 2.3 }];
  const spoken = { src: 'assets/voice-1.wav', seconds: 2.5, words };
  const build = (extra: Record<string, unknown> = {}, audio: any[] = [spoken, spoken]) =>
    compileExplainer(explainerSchema.parse({ topic: 'T', scenes: [{ ...steps, caption: 'A line.', say: 'x' }, { ...steps, say: 'y' }], ...extra }), { audio }).composition as any;

  it('draws the spoken words as captions timed to the real speech, with the word being said picked out', () => {
    const captions = layer(build(), 0, 'captions');
    expect(captions).toMatchObject({ type: 'captions', mode: 'words', highlightColor: '{{accent}}', startFrame: 8, y: 1380 });
    expect(captions.cues.length).toBeGreaterThan(0);
    expect(captions.cues.flatMap((cue: any) => cue.words.map((word: any) => word.text))).toEqual(['Hash', 'the', 'key.', 'Pick', 'a', 'slot.']);
    expect(captions.cues[0].words[0]).toMatchObject({ start: 0, end: 0.4 });
  });

  it('leaves out the scene\'s own caption line when captions say the words, and keeps it without them', () => {
    expect(layer(build(), 0, 'caption')).toBeUndefined();
    expect(layer(build(), 0, 'caption-note')).toMatchObject({ content: 'A line.', fontSize: 30, color: '{{muted}}' });
    expect(layer(build(), 0, 'caption-note').y).toBeLessThan(layer(build(), 0, 'captions').y);
    expect(layer(build({ captions: false }), 0, 'caption')).toBeTruthy();
    expect(layer(build({}, [undefined, undefined]), 0, 'caption')).toBeTruthy();
  });

  it('has no captions in a silent build, or when the script turns them off', () => {
    expect(layer(build({}, [undefined, undefined]), 0, 'captions')).toBeUndefined();
    expect(layer(build({}, [{ src: 'a.wav', seconds: 2 }, { src: 'b.wav', seconds: 2 }]), 0, 'captions')).toBeUndefined();
    expect(layer(build({ captions: false }), 0, 'captions')).toBeUndefined();
  });

  it('keeps scene content above the captions', () => {
    const withCaptions = layer(build(), 0, 'step-0'), without = layer(build({ captions: false }), 0, 'step-0');
    expect(withCaptions.y).toBeLessThanOrEqual(without.y);
  });

  it('draws one progress segment per scene and a count, filling the current one', () => {
    const composition = build();
    expect([0, 1].map(k => layer(composition, 0, `chapter-${k}`)?.type)).toEqual(['rect', 'rect']);
    expect(layer(composition, 0, 'chapter-count').content).toBe('01 / 02');
    expect(layer(composition, 1, 'chapter-count').content).toBe('02 / 02');
    expect(layer(composition, 1, 'chapter-0').opacity).toBeGreaterThan(layer(composition, 0, 'chapter-0').opacity);
    expect(layer(composition, 0, 'chapter-fill').animations[0].property).toBe('width');
    expect(layer(build({ chapters: false }), 0, 'chapter-count')).toBeUndefined();
  });
});
