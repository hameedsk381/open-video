import { describe, expect, it } from 'vitest';
import { slotName } from '../../apps/studio/src/slotName';

// The editor shows these instead of the ids of the layers behind each text slot.
describe('slotName', () => {
  it('turns layer ids into names a person would use', () => {
    expect(slotName('Hook', 'kicker')).toBe('Eyebrow');
    expect(slotName('Hook', 'title')).toBe('Headline');
    expect(slotName('Hook', 'detail')).toBe('Supporting text');
  });
  it('drops a leading word that repeats the scene name, and a phrase that repeats it whole', () => {
    expect(slotName('Three steps', 'steps-kicker')).toBe('Eyebrow');
    expect(slotName('Three steps', 'steps-list')).toBe('List');
    expect(slotName('Call to action', 'cta-title')).toBe('Headline');
    expect(slotName('Call to action', 'cta-note')).toBe('Note');
  });
  it('keeps an id it does not know readable', () => {
    expect(slotName('Scene 2', 'price_tag')).toBe('Price tag');
    expect(slotName('Scene 2', 'x')).toBe('X');
  });
});
