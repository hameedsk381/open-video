import { describe, expect, it } from 'vitest';
import { checkSafeZoneCollision, resolveSafeZone, type CanvasTextItem } from '../../apps/studio/src/safeZone';

// Vertical video must keep clear of the platform's buttons and captions; one move has to clear every zone an item touches.
const item = (x: number, y: number, width = 300, height = 80, extra: Partial<CanvasTextItem> = {}) => ({ x, y, width, height, content: 'Spring sale', fontSize: 60, textAlign: 'left', ...extra }) as CanvasTextItem;
describe('resolveSafeZone', () => {
  it('is null for an item already in the clear, and for landscape video', () => {
    expect(resolveSafeZone(item(100, 600), 1080, 1920)).toBeNull();
    expect(resolveSafeZone(item(0, 0), 1920, 1080)).toBeNull();
  });
  it('wraps text that is wider than the room between the buttons, since sliding it can never clear it', () => {
    const wide = item(60, 900, 1020, 80, { content: 'Introducing the all new spring collection today', fontSize: 90 });
    const move = resolveSafeZone(wide, 1080, 1920)!;
    expect(move.maxWidth).toBeGreaterThan(600); expect(move.maxWidth).toBeLessThan(0.89 * 1080 - 0.02 * 1080);
    expect(move.dx).toBeLessThan(0);
    const lines = Math.ceil((wide.content.length * 90 * 0.56) / move.maxWidth!);
    const wrapped = item(60 + move.dx, 900 + move.dy, move.maxWidth!, lines * 90 * 1.3);
    expect(checkSafeZoneCollision(wrapped, 1080, 1920)).toBeNull();
  });
  it('keeps a centred or right-aligned block anchored on its own edge when it wraps', () => {
    const centred = item(0, 900, 1080, 80, { textAlign: 'center', content: 'x'.repeat(60) });
    const move = resolveSafeZone(centred, 1080, 1920)!;
    expect(move.maxWidth).toBeDefined();
    expect(540 + move.dx - move.maxWidth! / 2).toBeGreaterThanOrEqual(0.02 * 1080);
    expect(540 + move.dx + move.maxWidth! / 2).toBeLessThanOrEqual(0.89 * 1080);
  });
  it('clears two zones at once for an item in a corner', () => {
    const corner = item(900, 1800);
    expect(checkSafeZoneCollision(corner, 1080, 1920)).not.toBeNull();
    const move = resolveSafeZone(corner, 1080, 1920)!;
    expect(move.dx).toBeLessThan(0); expect(move.dy).toBeLessThan(0);
    expect(checkSafeZoneCollision(item(900 + move.dx, 1800 + move.dy), 1080, 1920)).toBeNull();
  });
});
