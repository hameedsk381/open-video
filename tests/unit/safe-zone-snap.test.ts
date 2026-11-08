import { describe, expect, it } from 'vitest';
import { checkSafeZoneCollision, resolveSafeZone, type CanvasTextItem } from '../../apps/studio/src/safeZone';

// Vertical video must keep clear of the platform's buttons and captions; one move has to clear every zone an item touches.
const item = (x: number, y: number, width = 300, height = 80) => ({ x, y, width, height }) as CanvasTextItem;
describe('resolveSafeZone', () => {
  it('is null for an item already in the clear, and for landscape video', () => {
    expect(resolveSafeZone(item(100, 600), 1080, 1920)).toBeNull();
    expect(resolveSafeZone(item(0, 0), 1920, 1080)).toBeNull();
  });
  it('clears two zones at once for an item in a corner', () => {
    const corner = item(900, 1800);
    expect(checkSafeZoneCollision(corner, 1080, 1920)).not.toBeNull();
    const move = resolveSafeZone(corner, 1080, 1920)!;
    expect(move.dx).toBeLessThan(0); expect(move.dy).toBeLessThan(0);
    expect(checkSafeZoneCollision(item(900 + move.dx, 1800 + move.dy), 1080, 1920)).toBeNull();
  });
});
