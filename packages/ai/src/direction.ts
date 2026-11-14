// The creative direction stage: before any code is written, the model decides what the video is and what it looks,
// sounds and moves like. The result guides the coding pass — a concept, an art direction, type, palette, motion and
// a beat structure — and is never a template or a house style.
import { describeStyleFamilies, fontGuide, fontIds } from '@ove/schema';
import type { BrandPack } from './agent';
import { extractJson } from './json';
import type { BuildPlan } from './plan';
import type { AiProvider, ChatMessage } from './providers';

export type DirectionBeat = { name: string; seconds: number; idea: string };

/** The decision made before the structure: which shape the video takes, and the shapes passed over. */
export type DirectionTreatment = { candidates: { structure: string; why?: string }[]; chosen: number; logline?: string; signature?: string };

export type CreativeDirection = {
  treatment?: DirectionTreatment;
  concept: string;
  art: string;
  type?: { display?: string; body?: string; treatment?: string };
  palette?: { bg?: string; surface?: string; text?: string; muted?: string; accent?: string; accent2?: string };
  motion?: string;
  sound?: string;
  structure: DirectionBeat[];
  avoid: string[];
};

/** The planner's first pass, when it ran, so the direction refines it instead of contradicting it. */
export type DirectionPlanInput = Pick<BuildPlan, 'idea' | 'look' | 'beats'>;

export type DirectionOptions = {
  brief: string;
  width: number;
  height: number;
  fps: number;
  durationSeconds: number;
  brand?: BrandPack;
  plan?: DirectionPlanInput;
  /** Shapes of videos already made (see directionShape). A direction with the same shape is sent back once, so a batch does not share one skeleton. */
  avoidShapes?: string[];
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
  maxAttempts?: number;
};

const oneLine = (value: unknown, max: number): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const text = value.replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : undefined;
};

const colourPattern = /^(#[0-9a-fA-F]{3,8}|rgba?\(.+\)|transparent)$/;

/** A bundled family, matched case- and separator-insensitively so "space-grotesk" still lands on Space Grotesk. */
const family = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const wanted = value.trim().toLowerCase().replace(/[-_]+/g, ' ');
  return fontIds.find(id => id.toLowerCase().replace(/[-_]+/g, ' ') === wanted);
};

/**
 * Reads the direction the model wrote. Everything that cannot be used is dropped rather than failing the whole stage:
 * the direction is guidance, and losing a palette entry must not cost the video. The concept and at least one beat are
 * the only hard requirements.
 */
export function readDirection(reply: unknown, durationSeconds: number): { direction?: CreativeDirection; problems: string[] } {
  if (!reply || typeof reply !== 'object' || Array.isArray(reply)) return { problems: ['The reply must be one JSON object'] };
  const raw = reply as Record<string, any>;
  const problems: string[] = [];
  const concept = oneLine(raw.concept, 280);
  if (!concept) problems.push('"concept" must say what this video is, in one sentence');

  const beats: DirectionBeat[] = [];
  if (!Array.isArray(raw.structure) || raw.structure.length === 0) problems.push('"structure" must be a list of 1-8 beats');
  else for (const [index, beat] of raw.structure.slice(0, 8).entries()) {
    if (!beat || typeof beat !== 'object' || Array.isArray(beat)) { problems.push(`structure[${index}] must be an object`); continue; }
    const name = oneLine(beat.name, 60), idea = oneLine(beat.idea ?? beat.onScreen, 220);
    if (!name || !idea) { problems.push(`structure[${index}] needs a "name" and what happens on screen in "idea"`); continue; }
    beats.push({ name, idea, seconds: Number(beat.seconds) > 0 ? Number(beat.seconds) : 0 });
  }
  if (problems.length) return { problems };

  // The beats have to cover the video: scale the model's seconds to the requested length, or split it evenly when
  // some are missing. A direction that is 2 seconds long is not a direction.
  const given = beats.map(beat => beat.seconds).filter(seconds => Number.isFinite(seconds) && seconds > 0);
  if (given.length === beats.length) {
    const sum = given.reduce((total, seconds) => total + seconds, 0);
    const scale = Math.abs(sum - durationSeconds) < 0.2 ? 1 : durationSeconds / sum;
    for (const beat of beats) beat.seconds = Math.round(beat.seconds * scale * 10) / 10;
  } else {
    const each = Math.round(durationSeconds / beats.length * 10) / 10;
    for (const beat of beats) beat.seconds = each;
  }

  const typeIn = raw.type && typeof raw.type === 'object' && !Array.isArray(raw.type) ? raw.type : {};
  const display = family(typeIn.display), body = family(typeIn.body), treatment = oneLine(typeIn.treatment, 240);
  const type = display || body || treatment ? { ...(display ? { display } : {}), ...(body ? { body } : {}), ...(treatment ? { treatment } : {}) } : undefined;

  const paletteIn = raw.palette && typeof raw.palette === 'object' && !Array.isArray(raw.palette) ? raw.palette : {};
  const palette: NonNullable<CreativeDirection['palette']> = {};
  for (const role of ['bg', 'surface', 'text', 'muted', 'accent', 'accent2'] as const) {
    const value = paletteIn[role];
    if (typeof value === 'string' && colourPattern.test(value.trim())) palette[role] = value.trim();
  }

  const decision = readTreatment(raw.treatment);
  const avoid = Array.isArray(raw.avoid)
    ? raw.avoid.map((entry: unknown) => oneLine(entry, 140)).filter((entry: string | undefined): entry is string => Boolean(entry)).slice(0, 5)
    : [];
  const motion = oneLine(raw.motion, 600), sound = oneLine(raw.sound, 240);

  return {
    problems: [],
    direction: {
      ...(decision ? { treatment: decision } : {}),
      concept: concept!,
      art: oneLine(raw.art, 600) ?? '',
      ...(type ? { type } : {}),
      ...(Object.keys(palette).length ? { palette } : {}),
      ...(motion ? { motion } : {}),
      ...(sound ? { sound } : {}),
      structure: beats,
      avoid,
    },
  };
}

/** The treatment, when the model wrote a usable one; dropped otherwise, like every other part of the direction that is only guidance. */
function readTreatment(raw: unknown): DirectionTreatment | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const value = raw as Record<string, any>;
  const candidates = (Array.isArray(value.candidates) ? value.candidates : []).slice(0, 4).flatMap((entry: any) => {
    const structure = oneLine(typeof entry === 'string' ? entry : entry?.structure, 200);
    const why = typeof entry === 'object' && entry ? oneLine(entry.why, 200) : undefined;
    return structure ? [{ structure, ...(why ? { why } : {}) }] : [];
  });
  const chosen = Number(value.chosen);
  if (candidates.length < 2 || !Number.isInteger(chosen) || chosen < 0 || chosen >= candidates.length) return undefined;
  const logline = oneLine(value.logline, 240), signature = oneLine(value.signature, 200);
  return { candidates, chosen, ...(logline ? { logline } : {}), ...(signature ? { signature } : {}) };
}

/** A direction's shape: its beat names in order. Two videos with the same shape have the same skeleton, whatever they look like. */
export const directionShape = (direction: Pick<CreativeDirection, 'structure'>): string => direction.structure.map(beat => beat.name.trim().toLowerCase()).join(' > ');

/** Renders the direction as the section of the coding prompt it becomes. */
export function directionSection(direction: CreativeDirection): string {
  const lines = [`Concept: ${direction.concept}`];
  if (direction.treatment) {
    const chosen = direction.treatment.candidates[direction.treatment.chosen]!;
    lines.push(`Chosen shape: ${chosen.structure}${direction.treatment.logline ? ` — ${direction.treatment.logline}` : ''}`);
    if (direction.treatment.signature) lines.push(`Signature moment (the one people remember; build it with the most care): ${direction.treatment.signature}`);
  }
  if (direction.art) lines.push(`Art direction: ${direction.art}`);
  if (direction.type) {
    const parts = [
      direction.type.display ? `display ${direction.type.display}` : '',
      direction.type.body ? `body ${direction.type.body}` : '',
      direction.type.treatment ?? '',
    ].filter(Boolean);
    if (parts.length) lines.push(`Typography: ${parts.join('; ')}.`);
  }
  if (direction.palette) lines.push(`Palette: ${Object.entries(direction.palette).map(([role, value]) => `${role} ${value}`).join(', ')}.`);
  if (direction.motion) lines.push(`Motion: ${direction.motion}`);
  if (direction.sound) lines.push(`Sound: ${direction.sound}`);
  const total = direction.structure.reduce((seconds, beat) => seconds + beat.seconds, 0);
  lines.push(`Structure (${total.toFixed(1)} s):`);
  direction.structure.forEach((beat, index) => lines.push(`${index + 1}. ${beat.name} (${beat.seconds.toFixed(1)} s) — ${beat.idea}`));
  if (direction.avoid.length) lines.push(`Avoid: ${direction.avoid.join('; ')}.`);
  return lines.join('\n');
}

const brandText = (brand: BrandPack): string => {
  const parts: string[] = [];
  if (brand.name) parts.push(`name ${brand.name}`);
  const colours = brand.colors
    ? [brand.colors.primary && `primary ${brand.colors.primary}`, brand.colors.secondary && `secondary ${brand.colors.secondary}`,
      brand.colors.accent && `accent ${brand.colors.accent}`, brand.colors.background && `background ${brand.colors.background}`,
      brand.colors.text && `text ${brand.colors.text}`].filter(Boolean).join(', ')
    : '';
  if (colours) parts.push(`colours ${colours}`);
  const fonts = brand.fonts ? [brand.fonts.heading && `heading ${brand.fonts.heading}`, brand.fonts.body && `body ${brand.fonts.body}`].filter(Boolean).join(', ') : '';
  if (fonts) parts.push(`fonts ${fonts}`);
  if (brand.style) parts.push(`style ${brand.style}`);
  return parts.length ? `Brand constraints (fixed, expressed through your direction): ${parts.join('; ')}.` : '';
};

const systemText = (options: DirectionOptions): string => {
  const duration = Math.round(options.durationSeconds);
  const brand = options.brand ? brandText(options.brand) : '';
  const shapes = options.avoidShapes?.length
    ? ['', '- Videos already made used these structures (beat names in order); yours must not repeat one:', ...options.avoidShapes.map(shape => `  ${shape}`)].join(String.fromCharCode(10))
    : '';
  const plan = options.plan ? `The planner already made a first pass at this brief; keep what is right and replace what is not, rather than repeating a look you disagree with:
${JSON.stringify({ idea: options.plan.idea, look: options.plan.look, beats: options.plan.beats.map(beat => ({ name: beat.name, onScreen: beat.onScreen, seconds: beat.seconds })) })}` : '';
  return `You are the creative director for this video. Before any code is written, decide what this video is and what it looks, sounds and moves like. The direction you give is what the developer builds.
Reply with ONE JSON object and nothing else:
{
  "treatment": { "candidates": [{ "structure": "one shape the video could take", "why": "what it does well" }, "... three genuinely different shapes"], "chosen": 0, "logline": "what the viewer knows at the end that they did not at the start", "signature": "the one moment people will remember" },
  "concept": "what this video is, in one sentence, specific to the brief",
  "art": "the visual language: composition, space, texture, light, colour logic and what makes it recognisable",
  "type": { "display": "<family>", "body": "<family>", "treatment": "how the type is set and moves" },
  "palette": { "bg": "#hex", "surface": "#hex", "text": "#hex", "muted": "#hex", "accent": "#hex", "accent2": "#hex" },
  "motion": "the motion language: entrances, pacing, camera behaviour, transitions",
  "sound": "how sound supports the cut, or the single word silent",
  "structure": [{ "name": "Hook", "seconds": 3, "idea": "what happens on screen" }],
  "avoid": ["the visual clichés this particular video must not fall into"]
}
- Treatment first: weigh three genuinely different shapes before you decide (a single journey, a before and after, a countdown, a list that turns, one worked example, one unbroken take). The first shape that comes to mind is usually the cliché, so choose from what this subject needs and say why. The structure below follows the chosen shape; something happens in the first 3 seconds, and the ending echoes the opening.${shapes}
- The direction is yours to invent. There is no house style: a luxury watch, a documentary opener, a children's story and a developer tool must not share a composition, palette, type or motion.
- Do not reach for defaults. Glass cards, bento grids, neon glow, floating dark gradients and a slow continuous zoom are not starting points; use one only if this brief genuinely earns it.
- These worlds are starting points, listed in no order of preference. Name the one this subject belongs to, or invent a different one, and then make it specific to this brief rather than copying its tokens:
${describeStyleFamilies(options.brief)}
- Type must be a family bundled with the renderer: ${fontGuide}. Pair a distinct display face with a readable body face, and say how the type is set, spaced and moved.
- Palette: derive it from the subject and its industry, keep strong contrast between text and background, and give every colour a role.
- Motion: describe entrances, timing, camera behaviour and transitions as one coherent language. Name the move, not the mood.
- Structure: 1 to 8 beats whose seconds add up to ${duration}; each beat is a concrete picture, not a topic.
- Sound: say what supports the cut — music, a specific effect, or silence.
- "avoid": name the clichés this brief would most easily fall into, so the developer can steer clear.
The video is ${options.width}x${options.height} at ${options.fps} fps, ${duration} s. It is built in React with CSS, SVG and canvas and rendered frame by frame, deterministically: design what that runtime can actually draw.
${brand}
${plan}`.trim();
};

const messages = (options: DirectionOptions, prior: { text: string; feedback: string } | undefined): ChatMessage[] => {
  const base: ChatMessage[] = [
    { role: 'system', content: systemText(options) },
    { role: 'user', content: `Brief: ${options.brief}` },
  ];
  if (prior) base.push({ role: 'assistant', content: prior.text }, { role: 'user', content: `That direction cannot be used:\n${prior.feedback}\nReply with the corrected direction JSON.` });
  return base;
};

/**
 * Writes the video's creative direction. Failure is never fatal: a caller that gets no direction still builds the video,
 * just without the fixed concept. Provider errors are collected like malformed replies, except for an aborted run.
 */
export async function writeDirection(provider: AiProvider, options: DirectionOptions): Promise<{ direction?: CreativeDirection; problems: string[] }> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 2);
  let prior: { text: string; feedback: string } | undefined;
  let last = '';
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    options.onProgress?.(`Directing the video with ${provider.id} (attempt ${attempt}/${maxAttempts})…`);
    let text: string;
    try {
      text = await provider.chat(messages(options, prior), { json: true, task: 'direct', temperature: attempt === 1 ? 0.8 : 0.5, maxTokens: 2200, signal: options.signal });
    } catch (error) {
      if (options.signal?.aborted) throw error;
      last = (error as Error).message;
      continue;
    }
    let reply: unknown;
    try { reply = extractJson(text); } catch (error) { last = (error as Error).message; prior = { text, feedback: last }; continue; }
    const { direction, problems } = readDirection(reply, options.durationSeconds);
    if (direction) {
      const repeated = options.avoidShapes?.includes(directionShape(direction));
      if (!repeated) return { direction, problems: [] };
      // The first answer that repeats a video already made goes back once; a second one is kept, because a direction that repeats a shape still beats none.
      if (attempt < maxAttempts) { last = `The structure (${directionShape(direction)}) is the same as a video that was already made. Weigh the candidate shapes again and choose a different one.`; prior = { text, feedback: last }; continue; }
      return { direction, problems: ['The structure repeats a video that was already made.'] };
    }
    last = problems.join('\n');
    prior = { text, feedback: last };
  }
  return { direction: undefined, problems: [last || 'The direction stage did not answer in direction form.'] };
}
