// Every shipped template: valid with its defaults, themeable, drawable by the React view, free of structural review errors.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadComposition } from '@ove/core';
import { unsupportedFeatures } from '@ove/react';
import { templatesDir } from '../../packages/cli/src/templates';

const ids = (await readdir(templatesDir, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();

describe('shipped templates', () => {
  it('ships the full set', () => {
    expect(ids).toEqual(['event-promo', 'hook-reel', 'kinetic-type', 'logo-sting', 'product-spotlight', 'quote-card', 'sale-flash', 'starter', 'stats-showcase', 'tutorial-steps']);
  });
  for (const id of ids) {
    it(`${id} is valid, themed, and convertible to React`, async () => {
      const raw = JSON.parse(await readFile(join(templatesDir, id, 'composition.json'), 'utf8'));
      const meta = JSON.parse(await readFile(join(templatesDir, id, 'template.json'), 'utf8'));
      expect(meta.name && meta.description && meta.brief).toBeTruthy();
      expect(raw.variables.bg && raw.variables.accent2).toBeTruthy();                // "themed": takes a theme
      for (const [name, variable] of Object.entries<any>(raw.variables)) expect(variable.description, `${id}.${name} needs a description`).toBeTruthy();
      const composition = loadComposition(raw);
      expect(composition.durationFrames).toBeGreaterThan(0);
      expect(unsupportedFeatures(composition)).toEqual([]);
    });
  }
});
