import { describe, expect, it } from 'vitest';
import { briefHints, canvasFor } from '@ove/jobs';

describe('briefHints', () => {
  it('reads a stated length', () => {
    expect(briefHints('A 6 second title card that says Hello').seconds).toBe(6);
    expect(briefHints('a 15-second showreel').seconds).toBe(15);
    expect(briefHints('A 30s teaser').seconds).toBe(30);
    expect(briefHints('A 2 minute explainer').seconds).toBe(120);
  });
  it('ignores lengths that are not a video length, and anything past the key points', () => {
    expect(briefHints('A launch video for the 1 second generation').seconds).toBeUndefined();
    expect(briefHints('A product video\n\nKey Message Points:\nready in 3 seconds').seconds).toBeUndefined();
    expect(briefHints('Show 5000 seconds of footage').seconds).toBeUndefined();
  });
  it('reads a stated shape', () => {
    expect(briefHints('A vertical reel').aspect).toBe('9:16');
    expect(briefHints('A square product post').aspect).toBe('1:1');
    expect(briefHints('A landscape explainer').aspect).toBe('16:9');
    expect(briefHints('A title card').aspect).toBeUndefined();
  });
  it('fills the canvas only where the form left Auto', () => {
    expect(canvasFor({ kind: 'reel', brief: 'A 6 second square title card' })).toMatchObject({ durationSeconds: 6, width: 1080, height: 1080 });
    expect(canvasFor({ kind: 'reel', brief: 'A 6 second title card', duration: '12', aspect: '16:9' })).toMatchObject({ durationSeconds: 12, width: 1920, height: 1080 });
    expect(canvasFor({ kind: 'reel', brief: 'A title card' })).toMatchObject({ durationSeconds: 20, width: 1080, height: 1920 });
  });
});
