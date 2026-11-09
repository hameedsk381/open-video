import { describe, expect, it } from 'vitest';
import type { DesignLook } from '@ove/schema';
import {
  buildRegistry, parseContract, planSystemPrompt, readBuildPlan,
  systemPrompt, userPrompt, type PlanOptions,
} from '@ove/ai';

// The model decides the design: the planner's look is validated and carried
// into every prompt. These tests hold that contract so no fixed house style creeps back in.
const registry = buildRegistry({});
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
