import { describe, expect, it } from 'vitest';
import { limitMessage } from '../../apps/studio/src/limitMessage';

describe('limitMessage', () => {
  it('turns a daily-limit error into a plain message with the wait', () => {
    expect(limitMessage('Rate limit reached for model x on tokens per day (TPD). Please try again in 51m4.608s.')).toMatch(/usage limit.*in about 52 minutes/);
    expect(limitMessage('429 too many requests. try again in 2h10m1s')).toMatch(/in about 2 hours/);
    expect(limitMessage('Rate limit reached')).toMatch(/in a few minutes/);
  });
  it('leaves other failures alone', () => { expect(limitMessage('Invalid API key')).toBeUndefined(); });
});
