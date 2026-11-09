import { describe, expect, it } from 'vitest';
import { explainerExample, explainerJsonSchema, explainerKindDocs, explainerKinds, explainerSchema, loadComposition } from '@ove/schema';
import { compileExplainer } from '@ove/core';

// An agent writes scripts from these examples, so every one has to be valid and every scene kind has to be covered.
describe('explainer kind docs', () => {
  it('cover every scene kind once, with an example that is a valid scene', () => {
    expect(explainerKindDocs.map(doc => doc.kind).sort()).toEqual([...explainerKinds].sort());
    for (const doc of explainerKindDocs) {
      expect(doc.example.kind, doc.kind).toBe(doc.kind);
      const prompt = doc.kind === 'media' ? { ...doc.example } : doc.example;
      expect(explainerSchema.safeParse({ topic: 'T', scenes: [prompt] }).success, doc.kind).toBe(true);
      expect(doc.shows.length, doc.kind).toBeGreaterThan(20);
    }
  });

  it('give a whole example script that builds into a video', () => {
    const spec = explainerSchema.parse(explainerExample());
    expect(() => loadComposition(compileExplainer(spec).composition)).not.toThrow();
  });

  it('come with a JSON Schema an editor or an agent can read', () => {
    const schema = explainerJsonSchema as { properties?: Record<string, unknown> };
    expect(Object.keys(schema.properties ?? {})).toEqual(expect.arrayContaining(['topic', 'scenes', 'look', 'aspect', 'sources']));
  });
});
