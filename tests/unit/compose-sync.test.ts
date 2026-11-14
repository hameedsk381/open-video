import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Dokploy can be pointed at the compose file at the repo root or at infrastructure/dokploy/compose.yml. They are the same stack, so a service
// added to one (the landing page's `site`, a webhook variable) must be in the other, or one of the two deploys quietly lacks it.
const code = (path: string) => readFileSync(path, 'utf8').split('\n').filter(line => !/^\s*#/.test(line)).join('\n').replace(/context: \.\.\/\.\. ,/g, 'context: . ,');

describe('the two Dokploy compose files', () => {
  it('describe the same stack, apart from comments and the build context path', () => {
    expect(code('docker-compose.yml')).toBe(code('infrastructure/dokploy/compose.yml'));
  });

  it('carry the landing page service', () => {
    expect(code('docker-compose.yml')).toMatch(/\n  site:\n/);
  });
});
