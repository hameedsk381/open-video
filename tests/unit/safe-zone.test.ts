import { describe, it, expect } from 'vitest';
import { safeZoneBands } from '../../packages/core/src/review';
import { systemPrompt, userPrompt } from '@ove/ai';

describe('safeZoneBands', () => {
  it('gives a 9:16 canvas bottom, right, top and left UI bands in that order', () => {
    const bands = safeZoneBands(1080, 1920);
    expect(bands.map(b => b.name)).toEqual(['bottom UI band', 'right UI band', 'top UI band', 'left UI band']);
    const [bottom, right, top, left] = bands;
    expect(bottom!.y0).toBeCloseTo(1920 * 0.82); expect(bottom!.y1).toBe(1920); expect(bottom!.x0).toBe(0); expect(bottom!.x1).toBe(1080);
    expect(right!.x0).toBeCloseTo(1080 * 0.89); expect(right!.x1).toBe(1080); expect(right!.y0).toBe(0); expect(right!.y1).toBe(1920);
    expect(top!.y0).toBe(0); expect(top!.y1).toBeCloseTo(1920 * 0.08);
    expect(left!.x0).toBe(0); expect(left!.x1).toBeCloseTo(1080 * 0.02);
  });

  it('shrinks the bands for a letterboxed 4:5 canvas and drops the ones that land on the letterbox', () => {
    const bands = safeZoneBands(1080, 1350);
    // The player is 9:16 (1920 tall for a 1080-wide video); 285 px of letterbox sit above and below the picture,
    // so the screen's bottom band overlaps the video by 345.6 - 285 = 60.6 px and the top band misses it entirely.
    expect(bands.map(b => b.name)).toEqual(['bottom UI band', 'right UI band', 'left UI band']);
    expect(bands[0]!.y0).toBeCloseTo(1350 - (0.18 * 1920 - 285));
    expect(safeZoneBands(1080, 1080).map(b => b.name)).toEqual(['right UI band', 'left UI band']);
  });

  it('gives a landscape canvas no bands', () => {
    expect(safeZoneBands(1920, 1080)).toEqual([]);
  });

  it('lets an override turn bands off or reshape them', () => {
    expect(safeZoneBands(1080, 1920, { bottom: 0 })).toHaveLength(3);
    expect(safeZoneBands(1080, 1920, { bottom: 0.5 })[0]!.y0).toBe(960);
    expect(safeZoneBands(1080, 1920, { top: 0, bottom: 0, left: 0, right: 0 })).toEqual([]);
  });
});

// The bands used to be retyped as percentages in three prompts, so the model was asked to obey numbers the renderer
// never checked (and a landscape canvas got rules that do not exist). One table now feeds both sides.
describe('the prompts state the bands the review enforces', () => {
  it('lists the pixel areas for a vertical canvas', () => {
    const reel = userPrompt('a launch reel', { width: 1080, height: 1920, fps: 30, durationSeconds: 10 });
    expect(reel).toContain('keep text above y 1574');
    expect(reel).toContain('keep text left of x 961');
  });

  it('invents no platform UI rules for a landscape canvas', () => {
    expect(userPrompt('a promo', { width: 1920, height: 1080, fps: 30, durationSeconds: 10 })).not.toContain('platform UI areas');
  });

  it('keeps the percentages out of the static cheat sheet', () => {
    expect(systemPrompt()).not.toContain('bottom 18%');
    expect(systemPrompt()).toContain('listed for this canvas in the task message');
  });
});
