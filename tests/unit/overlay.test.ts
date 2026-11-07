import { describe, expect, it } from 'vitest';
import { loadComposition } from '@ove/core';

const scene = (id: string, frames: number, extra: Record<string, unknown> = {}) => ({ id, name: id, durationFrames: frames, layers: [{ id: `${id}-box`, type: 'rect', width: 50, height: 50, fill: '#fff' }], ...extra });
const make = (extra: Record<string, unknown>) => loadComposition({ version: '1.0', id: 'o', name: 'o', width: 320, height: 180, fps: 30, durationFrames: 'auto', scenes: [scene('a', 60), scene('b', 90, { transitionIn: { type: 'fade', durationFrames: 15 } })], ...extra } as any) as any;

describe('overlay: layers that stay for the whole video', () => {
  it('becomes one last scene as long as the video, after the content scenes', () => {
    const composition = make({ overlay: [{ id: 'header', type: 'text', content: 'Chapter', x: 10, y: 10 }] });
    const ids = composition.scenes.map((s: any) => s.id);
    expect(ids).toEqual(['a', 'b', 'overlay']);                              // last, so it draws over the others
    const overlay = composition.scenes[2];
    expect(overlay.startFrame).toBe(0);
    expect(overlay.durationFrames).toBe(composition.durationFrames);
    expect(overlay.transitionIn).toBeUndefined();                            // scene transitions never act on it
    expect(composition.overlay).toBeUndefined();                             // lifted, not drawn twice
  });

  it('does not stretch an automatic duration, and changes nothing when there is no overlay', () => {
    const plain = make({}), withOverlay = make({ overlay: [{ id: 'h', type: 'rect', width: 5, height: 5 }] });
    expect(withOverlay.durationFrames).toBe(plain.durationFrames);
    expect(plain.scenes.map((s: any) => s.id)).toEqual(['a', 'b']);
  });

  it('takes {{variables}} and repeat like any layer list, with frames counted from the start of the video', () => {
    const composition = make({
      variables: { title: { type: 'string', default: 'Part one' } },
      overlay: [
        { id: 'title', type: 'text', content: '{{title}}', startFrame: 20, animations: [{ property: 'opacity', keyframes: [{ frame: 0, value: 0 }, { frame: 10, value: 1 }] }] },
        { repeat: [1, 2], as: 'n', each: [{ id: 'dot-{{n}}', type: 'circle', width: 8, x: '{{n}}' }] },
      ],
    });
    const layers = composition.scenes.at(-1).layers;
    expect(layers.map((l: any) => l.id)).toEqual(['title', 'dot-1', 'dot-2']);
    expect(layers[0].content).toBe('Part one');
    expect(layers[0].startFrame).toBe(20);
  });
});

describe('highlight: the highlighter swipe on rich text', () => {
  const text = (extra: Record<string, unknown> = {}) => (make({}) as any, loadComposition({
    version: '1.0', id: 'h', name: 'h', width: 320, height: 180, fps: 30, durationFrames: 30,
    scenes: [{ id: 's', name: 's', durationFrames: 30, layers: [{ id: 't', type: 'text', spans: [{ text: 'a ' }, { text: 'b', background: '#ff0' }], ...extra }] }],
  } as any) as any).scenes[0].layers[0];

  it('defaults to fully drawn, so existing videos do not change', () => {
    expect(text().highlight).toBe(1);
  });

  it('is a number from 0 to 1 that can be animated', () => {
    const layer = text({ animations: [{ property: 'highlight', keyframes: [{ frame: 0, value: 0 }, { frame: 20, value: 1 }] }] });
    expect(layer.animations[0].property).toBe('highlight');
    expect(() => text({ highlight: 2 })).toThrow();
  });
});
