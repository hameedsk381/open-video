import { describe, expect, it } from 'vitest';
import type { DesignLook } from '@ove/schema';
import {
  buildRegistry, composeFromTemplate, fillTemplateSource, parseContract, planSystemPrompt, readBuildPlan,
  systemPrompt, userPrompt, type AiProvider, type ChatMessage, type PlanOptions, type TemplateChoice,
} from '@ove/ai';

// The model decides the design: the planner's look is validated, refined onto a template's theme variables, and carried
// into every prompt. These tests hold that contract so no fixed house style creeps back in.
const registry = buildRegistry({
  templates: [{ id: 'intro-card', name: 'Intro card', description: 'A square title card', width: 1080, height: 1080, durationSeconds: 6, themed: true,
    variables: [{ name: 'title', type: 'string' }, { name: 'bg', type: 'color' }] }],
  themes: [{ id: 'midnight', name: 'Midnight', description: 'Dark blues' }],
});
const planOptions: PlanOptions = { brief: 'a craft coffee launch', width: 1080, height: 1080, fps: 30, durationSeconds: 6, registry };
const beat = { name: 'Hook', onScreen: 'the bag on a wooden counter', seconds: 6 };

describe('planner art direction', () => {
  it('reads the chosen look and normalises family and enum spellings', () => {
    const { plan, problems } = readBuildPlan({
      path: 'json', beats: [beat],
      look: {
        fonts: { display: 'space-grotesk', body: 'Source Sans 3' },
        palette: { bg: '#101820', text: '#ffffff', accent: '#ff5a5f', unknown: '#000000' },
        texture: { type: 'Scanlines', color: '#ffffff', opacity: 2 },
        motion: 'Slide', transition: 'Wipe', layout: 'Editorial', density: 9,
      },
    }, planOptions);
    expect(problems).toEqual([]);
    expect(plan!.look).toEqual({
      fonts: { display: 'Space Grotesk', body: 'Source Sans 3' },
      palette: { bg: '#101820', text: '#ffffff', accent: '#ff5a5f' },
      texture: { type: 'scanlines', color: '#ffffff', opacity: 1 },
      motion: 'slide', transition: 'wipe', layout: 'editorial', density: 1.25,
    });
  });

  it('never loses the plan over an unusable look', () => {
    const { plan, problems } = readBuildPlan({ path: 'json', beats: [beat], look: { fonts: { display: 'Comic Sans' }, motion: 'sparkle', palette: { bg: 'not-a-colour' } } }, planOptions);
    expect(problems).toEqual([]);
    expect(plan!.look).toBeUndefined();
  });

  it('asks the planner for fonts, palette, texture, motion, transition and layout', () => {
    const prompt = planSystemPrompt();
    expect(prompt).toContain('"look"');
    expect(prompt).toContain('Space Grotesk');
    expect(prompt).toContain('scanlines');
    expect(prompt).toContain('editorial');
    expect(prompt).toContain('There is no house style');
  });

  it('gives the composer the look verbatim and drops the fixed dark-gradient mandate', () => {
    const look: DesignLook = { fonts: { display: 'Fraunces', body: 'Source Sans 3' }, palette: { bg: '#f4efe6', text: '#1d1a16' }, texture: { type: 'paper' }, motion: 'rise', transition: 'wipe', layout: 'editorial', density: 1.1 };
    const prompt = userPrompt('a craft coffee launch', { width: 1080, height: 1920, fps: 30, durationSeconds: 10, motionPlan: { beats: [{ name: 'Hook', seconds: 10 }], look } });
    expect(prompt).toContain('Art direction');
    expect(prompt).toContain('"Fraunces"');
    expect(prompt).toContain('"paper"');
    expect(prompt).not.toContain('dark gradient');
    expect(userPrompt('a launch', { width: 1080, height: 1920, fps: 30, durationSeconds: 10 })).toContain('choose an art direction');
    expect(systemPrompt()).not.toContain('The background should be a dark gradient');
  });
});

const themed: TemplateChoice = {
  themed: true, id: 'craft-card', name: 'Craft card', description: 'A craft backdrop', width: 1080, height: 1080, durationSeconds: 2,
  variables: [
    { name: 'title', type: 'string', default: 'Hello' },
    { name: 'bg', type: 'color', default: '#000000' },
    { name: 'fontDisplay', type: 'string', default: 'Inter' },
    { name: 'texture', type: 'string', default: 'none' },
    { name: 'layout', type: 'string', default: 'left' },
  ],
  composition: {
    version: '1.0', id: 'craft-card', name: 'Craft card', width: 1080, height: 1080, fps: 30, durationFrames: 60,
    variables: {
      title: { type: 'string', default: 'Hello' }, bg: { type: 'color', default: '#000000' },
      fontDisplay: { type: 'string', default: 'Inter' }, texture: { type: 'string', default: 'none' }, layout: { type: 'string', default: 'left' },
    },
    scenes: [{ id: 's', name: 'S', startFrame: 0, durationFrames: 60, layers: [{ id: 't', type: 'text', content: '{{title}}', x: 40, y: 40, fontSize: 64, fontFamily: '{{fontDisplay}}' }] }],
  },
};

describe('look on templates', () => {
  it('lays the look over the theme and leaves tokens the template does not declare alone', () => {
    const source = fillTemplateSource(themed, {}, { id: 'espresso', name: 'Espresso', description: '', variables: { bg: '#1a120b', fontDisplay: 'Fraunces', texture: 'paper', layout: 'left', motion: 'rise' } }, [], {
      fonts: { display: 'Source Sans 3' }, palette: { bg: '#f4efe6' }, layout: 'editorial',
    });
    expect(source.variables.bg.default).toBe('#f4efe6');
    expect(source.variables.fontDisplay.default).toBe('Source Sans 3');
    expect(source.variables.texture.default).toBe('paper');
    expect(source.variables.layout.default).toBe('editorial');
    expect(source.variables.motion).toBeUndefined();
  });

  it('checks layout variants against the arrangements the block accepts and normalises their case', async () => {
    const variant: TemplateChoice = {
      ...themed, id: 'variant-card', variables: [...themed.variables, { name: 'heroVariant', type: 'string', default: 'left' }],
      composition: { ...themed.composition, variables: { ...(themed.composition.variables as Record<string, unknown>), heroVariant: { type: 'string', default: 'left' } } },
    };
    const seen: ChatMessage[][] = [];
    const provider: AiProvider = { id: 'fake', model: 'fake-1', baseUrl: 'fake://', chat: async messages => { seen.push(structuredClone(messages)); return JSON.stringify({ template: 'variant-card', values: { title: 'Coffee', heroVariant: seen.length === 1 ? 'split' : 'Center' } }); } };
    const result = (await composeFromTemplate(provider, [variant], { brief: 'a coffee promo', width: 1080, height: 1080, maxAttempts: 2 }))!;
    expect(result.values.heroVariant).toBe('center');
    expect(String(seen[1]!.at(-1)!.content)).toContain('"heroVariant" must be one of left, center, band');
  });
});

describe('scene contract', () => {
  it('takes the planner look over its own palette and design choices', () => {
    const contract = parseContract({
      palette: { background: '#000000', text: '#111111', primary: '#222222' }, fonts: { heading: 'Inter', body: 'Inter' }, beats: [{ name: 'a' }],
      motion: 'blur', transition: 'fade', layout: 'center', density: 1.2, texture: { type: 'grid', color: '#00ff00', opacity: 0.2 },
    }, { palette: { bg: '#f4efe6', text: '#1d1a16', accent: '#b4693a', accent2: '#2f4f4f' }, fonts: { display: 'Fraunces', body: 'Source Sans 3' }, motion: 'rise', transition: 'wipe', layout: 'editorial', density: 1.1, texture: { type: 'paper', color: '#1d1a16', opacity: 0.05 } });
    expect(contract.background).toBe('#f4efe6');
    expect(contract.fonts).toEqual({ heading: 'Fraunces', body: 'Source Sans 3' });
    expect(contract.primary).toBe('#b4693a');
    expect(contract.motion).toBe('rise');
    expect(contract.transition).toBe('wipe');
    expect(contract.layout).toBe('editorial');
    expect(contract.density).toBe(1.1);
    expect(contract.texture).toEqual({ type: 'paper', color: '#1d1a16', opacity: 0.05, scale: 48 });
  });
});
