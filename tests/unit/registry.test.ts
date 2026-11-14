import { describe, expect, it } from 'vitest';
import { buildRegistry, describeCapabilities, movesGlossary, registryVersion } from '@ove/ai';

// The capability registry: pure metadata assembled from caller catalogues plus the built-in effects, sounds and React
// kit. It must reject duplicate and malformed ids, and let the planner look capabilities back up by kind and id.
const titleBar = { id: 'title-bar', name: 'Title bar', description: 'A lower third', category: 'titles', kind: 'overlay' as const, durationFrames: 90 };

describe('buildRegistry', () => {
  const registry = buildRegistry({ blocks: [titleBar] });

  it('keeps caller entries and the built-in kit apart by kind', () => {
    expect(registry.counts()).toMatchObject({ block: 1 });
    expect(registry.counts().sound).toBe(13);
    expect(registry.find('component', 'GlassCard')).toBeDefined();
    expect(registry.find('block', 'GlassCard')).toBeUndefined();
    expect(registry.version).toBe(registryVersion);
  });

  it('describes a block with its length and paths', () => {
    const block = registry.find('block', 'title-bar')!;
    expect(block.paths).toEqual(['json']);
    expect(block.fit).toContain('overlay');
    expect(block.durationSeconds).toBe(3);
  });

  it('lists built-in sounds and transitions with their stable ids', () => {
    expect(registry.find('sound', 'sfx:ding')!.paths).toEqual(['json', 'react']);
    expect(registry.find('effect', 'transition-slide')).toBeDefined();
    expect(registry.find('effect', 'transition-fade')!.params.map(p => p.name)).toContain('durationFrames');
  });

  it('registers the named motion moves with a recipe each', () => {
    expect(registry.counts().move).toBeGreaterThanOrEqual(12);
    const kenBurns = registry.find('move', 'ken-burns')!;
    expect(kenBurns.paths).toEqual(['json']);
    expect(kenBurns.example).toContain('"camera"');
    expect(registry.find('move', 'count-up')!.paths).toEqual(['react']);
    // Every move carries the two things consumers need: a prompt glossary hint and a valid-JSON example.
    for (const move of registry.select('move')) {
      expect(move.example, `${move.id} example`).toBeTruthy();
      expect((move as any).hint, `${move.id} hint`).toBeTruthy();
    }
  });

  it('describes the moves to the planner under their own heading', () => {
    const text = describeCapabilities(registry, { width: 1080, height: 1080 });
    expect(text).toContain('Motion moves:');
    expect(text).toContain('  - ken-burns: ');
    expect(movesGlossary).toContain('ken-burns (');
    expect(movesGlossary).toContain('word-cascade (');
  });

  it('refuses duplicate and malformed ids at build time, not at plan time', () => {
    expect(() => buildRegistry({ blocks: [titleBar, titleBar] })).toThrow(/share the id "title-bar"/);
    expect(() => buildRegistry({ blocks: [{ ...titleBar, id: '9bad id' }] })).toThrow(/Capability ids use letters/);
    expect(() => buildRegistry({ blocks: [{ ...titleBar, id: '9bad id' }, titleBar] })).toThrow(/Capability ids use letters/);
  });
});

describe('describeCapabilities', () => {
  const registry = buildRegistry({ blocks: [titleBar] });

  it('lists blocks under their own heading with their fit', () => {
    const text = describeCapabilities(registry, { width: 1080, height: 1080 });
    expect(text).toContain('Blocks:');
    expect(text).toContain('  - title-bar: A lower third (overlay');
    expect(text).not.toContain('Templates');
  });

  it('explains the React kit as reference when react is not allowed', () => {
    const text = describeCapabilities(registry, { width: 1080, height: 1080 });
    expect(text).toContain('React components:');
    expect(text).toContain('this host will not write React code');
    expect(describeCapabilities(registry, { width: 1080, height: 1080, allowReact: true })).not.toContain('this host will not write React code');
  });
});
