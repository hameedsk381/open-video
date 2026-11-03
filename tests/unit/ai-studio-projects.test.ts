import { describe, expect, it } from 'vitest';
import { loadComposition } from '@ove/schema';
import { projectMode, projectVariables, setVariableValues, slugify, textLayers } from '../../packages/cli/src/ai-studio-projects';
import { aiStudioPage } from '../../packages/cli/src/ai-studio-page';

const template = { version: '1.0', id: 't', name: 'T', width: 100, height: 100, fps: 30, durationFrames: 30, variables: { headline: { type: 'string', default: 'Hi' }, accent: { type: 'color', default: '#ff0000' } },
  components: { card: { params: { text: { type: 'string', default: 'x' } }, layers: [{ id: 'c', type: 'text', content: '{{text}}', fontSize: 20 }] } },
  scenes: [{ id: 's', name: 'S', startFrame: 0, durationFrames: 30, layers: [{ use: 'card', id: 'card-1', with: { text: '{{headline}}' } }] }] };

describe('Studio project helpers', () => {
  it('tells a template (components in use) from a finished video', () => {
    expect(projectMode(template)).toBe('template');
    expect(projectMode(loadComposition(template))).toBe('finished');
    expect(projectMode({ scenes: [{ layers: [{ type: 'text' }] }] })).toBe('finished');
  });
  it('lists variables with their values and changes defaults on a copy, refusing unknown names', () => {
    expect(projectVariables(template).map(v => [v.name, v.value])).toEqual([['headline', 'Hi'], ['accent', '#ff0000']]);
    const next = setVariableValues(template, { headline: 'Bye' });
    expect(next.variables.headline.default).toBe('Bye'); expect(template.variables.headline.default).toBe('Hi'); expect(next.components).toEqual(template.components);
    expect(() => setVariableValues(template, { nope: 1 })).toThrow(/not something/);
    expect(() => setVariableValues(template, { accent: 'not a colour' })).toThrow();
  });
  it('finds every text layer with a path that points at it', () => {
    const composition = loadComposition(template), rows = textLayers(composition);
    expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ content: 'Hi', fontSize: 20, scene: 'S' });
    const layer = rows[0]!.path.split(/\.|\[|\]/).filter(Boolean).reduce((node: any, key) => node[key], composition);
    expect(layer.content).toBe('Hi');
  });
  it('makes safe folder names', () => { expect(slugify('Spring Sale 2026!')).toBe('spring-sale-2026'); expect(slugify('***')).toBe('untitled'); expect(slugify('Ünïcode Café')).toBe('unicode-cafe'); });
});

describe('Studio page', () => {
  it('has a script that parses, and the screens it promises', () => {
    const script = /<script>([\s\S]*)<\/script>/.exec(aiStudioPage)?.[1] ?? '';
    expect(script.length).toBeGreaterThan(5000);
    expect(() => new Function(script)).not.toThrow();
    for (const name of ["'/api/projects'", "'/api/compose'", "'/api/refine'", "'/api/variables'", "'/api/text'", "'/api/theme'", "'/api/add-block'", "'/api/restore'", "'/api/render'", '/player.js', '/api/upload']) expect(script, name).toContain(name);
    expect(aiStudioPage).toContain('OVE AI studio');
  });
});
