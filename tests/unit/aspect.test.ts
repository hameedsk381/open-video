import { describe, expect, it } from 'vitest';
import {
  adaptCompositionAspect,
  parseAspectRatio,
  loadComposition
} from '@ove/core';

describe('Responsive Multi-Aspect Ratio Engine', () => {
  describe('parseAspectRatio', () => {
    it('parses standard aspect ratios correctly', () => {
      expect(parseAspectRatio('9:16')).toEqual([1080, 1920]);
      expect(parseAspectRatio('16:9')).toEqual([1920, 1080]);
      expect(parseAspectRatio('1:1')).toEqual([1080, 1080]);
      expect(parseAspectRatio('4:5')).toEqual([1080, 1350]);
      expect(parseAspectRatio('3:4')).toEqual([1080, 1440]);
      expect(parseAspectRatio('21:9')).toEqual([2560, 1080]);
    });

    it('parses custom WxH dimensions', () => {
      expect(parseAspectRatio('1200x630')).toEqual([1200, 630]);
      expect(parseAspectRatio('720x1280')).toEqual([720, 1280]);
    });

    it('throws meaningful error on invalid aspect', () => {
      expect(() => parseAspectRatio('invalid')).toThrow(/Invalid aspect ratio "invalid"/);
      expect(() => parseAspectRatio('0x0')).toThrow(/Invalid aspect ratio/);
    });
  });

  describe('canvas expression variables', () => {
    it('evaluates canvas aspect and responsive helpers in expressions', () => {
      const raw = {
        version: '1.0',
        id: 'canvas-test',
        name: 'Responsive Test',
        width: 1080,
        height: 1920,
        fps: 30,
        durationFrames: 60,
        scenes: [{
          id: 'main',
          name: 'Main',
          startFrame: 0,
          durationFrames: 60,
          layers: [{
            id: 'title',
            type: 'text',
            content: '{{canvas.aspect}} {{canvas.isVertical ? "mobile" : "desktop"}}',
            x: 540,
            y: 960,
            fontSize: 48,
          }]
        }]
      };

      const comp = loadComposition(raw);
      const textLayer = comp.scenes[0]!.layers[0] as any;
      expect(textLayer.content).toBe('9:16 mobile');
    });

    it('supports clamp() function in expressions', () => {
      const raw = {
        version: '1.0',
        id: 'clamp-test',
        name: 'Clamp Test',
        width: 1920,
        height: 1080,
        fps: 30,
        durationFrames: 30,
        variables: {
          val: { type: 'number', default: 150 }
        },
        scenes: [{
          id: 'main',
          name: 'Main',
          durationFrames: 30,
          layers: [{
            id: 'box',
            type: 'rect',
            x: '{{clamp(val, 20, 100)}}',
            y: 100,
            width: 200,
            height: 100
          }]
        }]
      };

      const comp = loadComposition(raw);
      const box = comp.scenes[0]!.layers[0] as any;
      expect(box.x).toBe(100);
    });
  });

  describe('adaptCompositionAspect', () => {
    const sampleWidescreen = loadComposition({
      version: '1.0',
      id: 'test-wide',
      name: 'Launch Promo',
      width: 1920,
      height: 1080,
      fps: 30,
      durationFrames: 90,
      background: {
        type: 'linear',
        from: [0, 0],
        to: [1920, 1080],
        stops: [{ offset: 0, color: '#000000' }, { offset: 1, color: '#112233' }]
      },
      scenes: [{
        id: 'scene-1',
        name: 'Scene 1',
        startFrame: 0,
        durationFrames: 90,
        camera: { x: 960, y: 540, zoom: 1 },
        layers: [
          {
            id: 'backdrop',
            type: 'rect',
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
            fill: '#05070f'
          },
          {
            id: 'hero-title',
            type: 'text',
            content: 'Scale Your Video Workflows',
            x: 960, // Centered
            y: 540, // Centered
            textAlign: 'center',
            fontSize: 72,
            maxWidth: 1600,
            animations: [{
              property: 'y',
              keyframes: [{ frame: 0, value: 580 }, { frame: 20, value: 540 }]
            }]
          },
          {
            id: 'cta-button',
            type: 'rect',
            x: 960,
            y: 900, // Near bottom in landscape
            width: 320,
            height: 80,
            fill: '#38bdf8'
          }
        ]
      }]
    });

    it('adapts a 16:9 widescreen composition to a 9:16 vertical reel', () => {
      const adapted = adaptCompositionAspect(sampleWidescreen, '9:16');

      expect(adapted.width).toBe(1080);
      expect(adapted.height).toBe(1920);

      // Background linear gradient adapts to target bounds
      const bg = adapted.background as any;
      expect(bg.to).toEqual([1080, 1920]);

      // Scene 1
      const scene = adapted.scenes[0]!;
      expect(scene.camera?.x).toBe(540);
      expect(scene.camera?.y).toBe(960);

      // Backdrop full-bleed rect adapts
      const backdrop = scene.layers.find(l => l.id === 'backdrop') as any;
      expect(backdrop.width).toBe(1080);
      expect(backdrop.height).toBe(1920);

      // Hero title remains centered
      const title = scene.layers.find(l => l.id === 'hero-title') as any;
      expect(title.x).toBe(540);
      expect(title.y).toBe(960);
      expect(title.maxWidth).toBeLessThanOrEqual(1080 * 0.9);
      expect(title.fontSize).toBeLessThan(72); // Scaled down for narrower screen
      expect(title.animations[0].keyframes[1].value).toBe(960);

      // CTA button shifts into vertical safe zone
      const cta = scene.layers.find(l => l.id === 'cta-button') as any;
      expect(cta.y).toBeLessThanOrEqual(Math.round(1920 * 0.78));
    });

    it('adapts a 9:16 vertical reel to a 1:1 square canvas', () => {
      const verticalReel = loadComposition({
        version: '1.0',
        id: 'test-reel',
        name: 'Vertical Reel',
        width: 1080,
        height: 1920,
        fps: 30,
        durationFrames: 60,
        scenes: [{
          id: 'scene-1',
          name: 'Scene 1',
          startFrame: 0,
          durationFrames: 60,
          layers: [{
            id: 'title',
            type: 'text',
            content: 'Hello Reel',
            x: 540,
            y: 960,
            fontSize: 48,
          }]
        }]
      });

      const square = adaptCompositionAspect(verticalReel, '1:1');
      expect(square.width).toBe(1080);
      expect(square.height).toBe(1080);

      const title = square.scenes[0]!.layers[0] as any;
      expect(title.x).toBe(540);
      expect(title.y).toBe(540);
    });

    it('returns identical copy if target aspect matches current dimensions', () => {
      const same = adaptCompositionAspect(sampleWidescreen, '16:9');
      expect(same.width).toBe(1920);
      expect(same.height).toBe(1080);
      expect(same).toEqual(sampleWidescreen);
    });
  });
});
