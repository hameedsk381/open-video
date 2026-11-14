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
