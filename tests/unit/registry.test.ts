import { describe, expect, it } from 'vitest';
import { buildRegistry, describeCapabilities, registryVersion, sameShape } from '@ove/ai';

// The capability registry: pure metadata assembled from caller catalogues plus the built-in effects, sounds and React
// kit. It must reject duplicate and malformed ids, and let the planner look capabilities back up by kind and id.
const squareTemplate = {
  id: 'intro-card', name: 'Intro card', description: 'A square title card',
  width: 1080, height: 1080, durationSeconds: 6, themed: true,
  variables: [{ name: 'title', type: 'string', description: 'The headline' }, { name: 'accent', type: 'color' }],
};

describe('buildRegistry', () => {
  const registry = buildRegistry({
    templates: [squareTemplate],
    themes: [{ id: 'midnight', name: 'Midnight', description: 'Dark blues' }],
    blocks: [{ id: 'title-bar', name: 'Title bar', description: 'A lower third', category: 'titles', kind: 'overlay', durationFrames: 90 }],
  });

  it('keeps caller entries and the built-in kit apart by kind', () => {
    expect(registry.counts()).toMatchObject({ template: 1, theme: 1, block: 1 });
    expect(registry.counts().sound).toBe(7);
    expect(registry.find('component', 'GlassCard')).toBeDefined();
    expect(registry.find('template', 'GlassCard')).toBeUndefined();
    expect(registry.version).toBe(registryVersion);
  });

  it('gives templates their shape facts so the planner can match a canvas', () => {
    const template = registry.find('template', 'intro-card')!;
    expect(template.width).toBe(1080); expect(template.height).toBe(1080);
    expect(template.takesTheme).toBe(true);
    expect(template.params).toHaveLength(2);
    expect(template.params[0]).toMatchObject({ name: 'title', type: 'string', description: 'The headline' });
    expect(template.fit).toContain('1080x1080');
    expect(template.paths).toEqual(['template', 'json']);
  });

  it('lists built-in sounds and transitions with their stable ids', () => {
    expect(registry.find('sound', 'sfx:ding')!.paths).toEqual(['json', 'react']);
    expect(registry.find('effect', 'transition-slide')).toBeDefined();
    expect(registry.find('effect', 'transition-fade')!.params.map(p => p.name)).toContain('durationFrames');
  });

  it('refuses duplicate and malformed ids at build time, not at plan time', () => {
    expect(() => buildRegistry({ templates: [squareTemplate, squareTemplate] })).toThrow(/share the id "intro-card"/);
    expect(() => buildRegistry({ templates: [{ ...squareTemplate, id: '9bad id' }] })).toThrow(/Capability ids use letters/);
    expect(() => buildRegistry({ templates: [{ ...squareTemplate, id: '9bad id' }, squareTemplate] })).toThrow(/Capability ids use letters/);
  });
});

describe('sameShape', () => {
  it('accepts the same aspect within 2% and everything else not', () => {
    expect(sameShape({ width: 1080, height: 1080 }, { width: 1080, height: 1080 })).toBe(true);
    expect(sameShape({ width: 1078, height: 1085 }, { width: 1080, height: 1080 })).toBe(true);
    expect(sameShape({ width: 1920, height: 1080 }, { width: 1080, height: 1080 })).toBe(false);
    expect(sameShape({}, { width: 1080, height: 1080 })).toBe(false);
  });
});

describe('describeCapabilities', () => {
  const registry = buildRegistry({ templates: [squareTemplate, { ...squareTemplate, id: 'wide-intro', width: 1920, height: 1080 }] });

  it('marks templates of another aspect so the planner does not pick them for this canvas', () => {
    const text = describeCapabilities(registry, { width: 1080, height: 1080 });
    expect(text).toContain('  - intro-card: A square title card (1080x1080');
    expect(text).toContain('  - wide-intro: A square title card (1920x1080');
    expect(text).toContain('[other aspect]');
    expect(text.indexOf('- intro-card')).toBeLessThan(text.indexOf('[other aspect]'));
  });

  it('explains the React kit as reference when react is not allowed', () => {
    const text = describeCapabilities(registry, { width: 1080, height: 1080 });
    expect(text).toContain('React components:');
    expect(text).toContain('another command produces React videos');
    expect(describeCapabilities(registry, { width: 1080, height: 1080, allowReact: true })).not.toContain('another command produces React videos');
  });
});
