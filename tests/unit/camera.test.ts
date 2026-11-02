import { describe, it, expect } from 'vitest';
import { parseComposition } from '@ove/schema'; import { evaluateFrame, cameraState } from '@ove/timeline';
const comp = (camera: any, extra: any = {}) => parseComposition({ version: '1.0', id: 'c', name: 'C', width: 200, height: 100, fps: 30, durationFrames: 60, ...extra, scenes: [{ id: 's', name: 'S', startFrame: 0, durationFrames: 60, camera,
  layers: [{ id: 'a', type: 'rect', width: 10, height: 10 }, { id: 'hud', type: 'rect', fixed: true, width: 10, height: 10 }] }] });
describe('scene camera', () => {
  it('defaults to the frame centre, so a still camera changes nothing', () => { const c = comp({}); expect(cameraState(c.scenes[0]!.camera!, 0, 200, 100)).toEqual({ x: 100, y: 50, zoom: 1, rotation: 0 });
    const cam: any = evaluateFrame(c, 0)[0]; expect(cam).toMatchObject({ id: 'camera:s', x: 0, y: 0, originX: 100, originY: 50, scale: 1, rotation: -0 }); expect(cam.children.map((l: any) => l.id)).toEqual(['a']); expect(evaluateFrame(c, 0)[1]!.id).toBe('hud'); });
  it('puts the camera point at the frame centre, zoomed and turned', () => { const c = comp({ animations: [{ property: 'x', keyframes: [{ frame: 0, value: 100 }, { frame: 10, value: 150 }] }, { property: 'zoom', keyframes: [{ frame: 0, value: 1 }, { frame: 10, value: 2 }] }], rotation: 10 });
    const cam: any = evaluateFrame(c, 10)[0]; expect(cam).toMatchObject({ x: 100-150, y: 0, originX: 150, originY: 50, scale: 2, rotation: -10 });
    // A scene point maps to centre + zoom × (point − camera): the camera's own point lands on the frame centre.
    const toScreen = (px: number, py: number) => [cam.x+cam.originX + cam.scale*(px-cam.originX), cam.y+cam.originY + cam.scale*(py-cam.originY)]; expect(toScreen(150, 50)).toEqual([100, 50]); expect(toScreen(160, 50)).toEqual([120, 50]); });
  it('shakes by a repeatable few pixels and leaves no camera without layers out', () => { const camera = comp({ shake: 8 }).scenes[0]!.camera!; const a = cameraState(camera, 7, 200, 100), b = cameraState(camera, 7, 200, 100), c = cameraState(camera, 8, 200, 100);
    expect(a).toEqual(b); expect(a.x).not.toBe(c.x); expect(Math.abs(a.x-100)).toBeLessThanOrEqual(8); expect(Math.abs(a.y-50)).toBeLessThanOrEqual(8); });
  it('evaluates fractional frames for motion blur, and checks its settings', () => { const c = comp(undefined, { motionBlur: {} }); expect(c.motionBlur).toEqual({ samples: 8, shutter: 180 }); expect(evaluateFrame(c, 2.5).map(l => l.id)).toEqual(['a', 'hud']); expect(evaluateFrame(c, 60)).toEqual([]);
    expect(() => comp(undefined, { motionBlur: { samples: 1 } })).toThrow(); expect(() => comp({ animations: [{ property: 'opacity', keyframes: [{ frame: 0, value: 1 }] }] })).toThrow(); });
});
