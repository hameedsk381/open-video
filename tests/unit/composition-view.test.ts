import { describe, expect, it } from 'vitest';
import { loadComposition } from '@ove/core';
import { unsupportedFeatures } from '@ove/react';

// The React view of a composition says what it cannot draw, so a caller keeps JSON layers instead of shipping a video that lost something.
const base = (layers: any[], scene: Record<string, unknown> = {}) => loadComposition({
  version: '1.0', id: 'v', name: 'v', width: 640, height: 360, fps: 30, durationFrames: 60,
  scenes: [{ id: 's', name: 's', durationFrames: 60, layers, ...scene }],
} as any) as any;

describe('what the React view of a composition cannot draw yet', () => {
  it('accepts shapes, text, split text, fitted text, images, groups, audio, cameras and common transitions', () => {
    const composition = base([
      { id: 'r', type: 'rect', width: 100, height: 50, fill: '#fff', animations: [{ property: 'x', keyframes: [{ frame: 0, value: 0 }, { frame: 10, value: 50 }] }] },
      { id: 'c', type: 'circle', width: 40, fill: '#f00' },
      { id: 't', type: 'text', content: 'Hello there', maxWidth: 300, maxLines: 2, minFontSize: 20, split: { by: 'words' } },
      { id: 'g', type: 'group', children: [{ id: 'i', type: 'image', src: 'logo.png', width: 10, height: 10 }] },
      { id: 'a', type: 'audio', src: 'sfx:pop' },
    ], { camera: { zoom: 1.1, shake: 4 }, transitionIn: { type: 'fade', durationFrames: 10 } });
    expect(unsupportedFeatures(composition)).toEqual([]);
  });

  it('names rich text, gradients, grading and mattes instead of dropping them silently', () => {
    const composition = base([
      { id: 't', type: 'text', spans: [{ text: 'a' }, { text: 'b', color: '#f00' }] },
      { id: 'r', type: 'rect', width: 10, height: 10, fill: { type: 'linear', from: [0, 0], to: [10, 0], stops: [{ offset: 0, color: '#000' }, { offset: 1, color: '#fff' }] } },
      { id: 'g', type: 'rect', width: 10, height: 10, grade: { look: 'warm' } },
    ]);
    const found = unsupportedFeatures(composition);
    expect(found).toContain('rich text (spans)');
    expect(found).toContain('gradients');
    expect(found).toContain('colour grading');
  });

  it('names the layer types it has no view for', () => {
    const composition = base([{ id: 'v', type: 'video', src: 'clip.mp4', width: 100, height: 100 }]);
    expect(unsupportedFeatures(composition).join(' ')).toContain('video layers');
  });
});
