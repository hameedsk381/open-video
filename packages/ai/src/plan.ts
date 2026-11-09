// The composition planner: decides HOW a brief should be produced (write a JSON composition, or React
// code) and what the video's beats are, before anything is generated. It reads the capability registry and its answer is
// validated back against that registry, so it can only point at capabilities that exist and fit the canvas. It returns
// undefined when planning cannot be trusted, and the caller falls back to the previous always-working routing.
import type { AiProvider, ChatMessage } from './providers';
import { extractJson } from './json';
import type { MotionBeat } from './prompt';
import { brandLine } from './brand-look';
import type { BrandPack } from './agent';
import { describeCapabilities, type GenerationPath, type Registry } from './registry';
import { describeStyleFamilies, fontGuide, fontIds, layoutStyles, motionPresets, textureTypes, transitionStyles, type DesignLook, type VideoContent } from '@ove/schema';

export type BuildPlan = {
  path: GenerationPath;
  idea?: string;
  /** The art direction the video must follow: fonts, palette, texture, motion, transition, layout and density. */
  look?: DesignLook;
  beats: MotionBeat[];
  reasons: string[];
};

export type PlanOptions = {
  brief: string;
  width: number;
  height: number;
  fps: number;
  durationSeconds: number;
  kind?: string;
  registry: Registry;
  /** A script that is already written: the planner designs around its beats instead of inventing copy. */
  content?: VideoContent;
  /** Which routes the caller will actually act on (default: all; react additionally needs allowReact). */
  paths?: GenerationPath[];
  /** Sounds and clips the user supplied. */
  assets?: { id: string; type: string; src: string }[];
  allowReact?: boolean;
  /** Send the short capability list: for providers with a small request limit. Chosen automatically for Groq and after a "too large" answer. */
  compact?: boolean;
  /** Colours and fonts the video must use; the planner designs the rest around them. */
  brand?: BrandPack;
  maxAttempts?: number;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
};

const paths: GenerationPath[] = ['json', 'react'];
const allowedPaths = (options: PlanOptions) => (options.paths ?? paths).filter(path => path !== 'react' || options.allowReact);

const systemText = (options: PlanOptions, compact: boolean) => `You are the creative director for MotionRender. Decide how the brief below should be produced, and the art direction it deserves, before anything is generated.
Reply with ONE JSON object and nothing else:
{
  "path": "json" | "react",
  "idea": "<what the video says, in one line>",
  "look": {
    "fonts": { "display": "<family>", "body": "<family>" },
    "palette": { "bg": "#hex", "surface": "#hex", "text": "#hex", "muted": "#hex", "accent": "#hex", "accent2": "#hex" },
    "texture": { "type": "none" | "grid" | "dots" | "scanlines" | "paper", "color": "#hex", "opacity": 0.04 },
    "motion": "rise" | "blur" | "slide" | "pop" | "fade",
    "transition": "push" | "fade" | "slide" | "wipe" | "zoom" | "dip",
    "layout": "left" | "center" | "split" | "editorial",
    "density": 1
  },
  "beats": [{ "name": "Hook", "onScreen": "the words the viewer reads (copy, not a description of the shot)", "seconds": 3, "motion": "how it moves in" }],
  "reasons": ["why this path and look suit this brief"]
}
The design is YOURS to decide. There is no house style: choose the fonts, palette, texture and motion that this specific subject calls for.
- Fonts must be one of: ${fontGuide}. Pair a distinct display face with a readable body face; do not default to Inter for both.
- Palette: derive it from the subject and its industry. A warm artisan brand should not look like a dark tech gradient, and a children's topic should not look like a cyberpunk terminal. Ensure strong text contrast on the background.
- Style families are starting points from very different visual worlds, not a menu to choose from by default. Name the world this subject belongs to, take its tokens or depart from them on purpose, and let the brief's own subject, audience and mood pull the result away from every other video. A dark gradient with glass cards is one family among ten and fits software products only:
${describeStyleFamilies(options.brief)}${options.brand ? `
${brandLine(options.brand)}` : ''}
- Texture: a grid for engineered/technical, dots for editorial/print, scanlines for games/broadcast, paper for warm/organic, none for clean graphic fields.
- Motion craft (from the motion-design skill): pick ONE personality for the whole video (playful, premium, corporate or energetic) and keep its easing and duration; entrances decelerate (ease-out) and exits accelerate (ease-in) and run about 30% shorter; never linear easing for movement across the frame; one hero motion per beat, staggers under half a second in total, and no more than a third of the elements moving at once; give each beat a primary motion plus a quieter secondary one and slow ambient life, not opacity alone.
- Motion and transition: one entrance style and one transition style for the whole video. Match the energy: pop for playful, slide for product, blur for premium, rise for editorial, fade for calm. Density 0.8-1.2 scales spacing.
- This look applies to JSON videos directly and to React videos as their design tokens.

Choose the route the brief actually needs, not the most convenient one:
- "json": a tailored composition built from the blocks, effects and moves listed below. Use it for structured, typographic, data-, product- or brand-led videos whose scenes you can describe with those capabilities.
- "react" (only when listed as an allowed path): hand-written React motion graphics — 3D, WebGL or canvas work, particles or simulations, custom illustration or SVG, real camera moves, UI that looks alive, type set as an image, unusual transitions, and any composition the blocks would only approximate.${allowedPaths(options).includes('react') ? `
React is the default for a video that should look designed rather than assembled: brand films, product stories, launches, explainers with a point of view, anything whose look and motion should be specific to this subject. It is the route that can make a video unlike the last one. Choose "json" instead only for plainly structured pieces (a list, a table of figures, a caption-led clip) that blocks express fully.` : ''}
Every beat needs a concrete picture, not a mood. In "motion", name the move — use a motion move from the capability list below (such as "word-cascade" or "ken-burns") and say what carries into the next beat.
${options.content ? `A content script is already written. Its beats are fixed (do not rewrite their copy, numbers or order):
${JSON.stringify(options.content.beats.map(beat => ({ name: beat.name, onScreen: beat.onScreen, seconds: beat.seconds })))}
Repeat them in "beats" with the same onScreen wording and design around them. Never invent a figure, date, name or claim.` : ''}
Reply with "path" set to one of: ${allowedPaths(options).join(' | ')}.
Available capabilities:
${describeCapabilities(options.registry, { ...options, compact })}`;

const colorPattern = /^(#[0-9a-fA-F]{3,8}|rgba?\(.+\)|transparent)$/;
const canonical = <T extends string>(value: unknown, options: readonly T[]): T | undefined => {
  if (typeof value !== 'string') return undefined;
  const wanted = value.trim().toLowerCase().replace(/[-_]+/g, ' ');
  return options.find(option => option.toLowerCase().replace(/[-_]+/g, ' ') === wanted);
};

/**
 * Reads the planner's art direction. Anything malformed is left out rather than failing the whole plan: the look is a
 * refinement, and losing it must not cost the video its routing and beats. Enums are matched case-insensitively so a
 * model writing "Space-Grotesk" or "Slide" still gets what it asked for.
 */
export function readLook(raw: unknown): DesignLook | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const source = raw as Record<string, any>;
  const look: DesignLook = {};
  const fonts = source.fonts && typeof source.fonts === 'object' ? source.fonts : {};
  const display = canonical(fonts.display, fontIds), body = canonical(fonts.body, fontIds);
  if (display || body) look.fonts = { ...(display ? { display } : {}), ...(body ? { body } : {}) };
  const paletteIn = source.palette && typeof source.palette === 'object' ? source.palette : {};
  const palette: NonNullable<DesignLook['palette']> = {};
  for (const name of ['bg', 'surface', 'text', 'muted', 'accent', 'accent2'] as const) {
    const value = paletteIn[name];
    if (typeof value === 'string' && colorPattern.test(value.trim())) palette[name] = value.trim();
  }
  if (Object.keys(palette).length) look.palette = palette;
  const textureIn = source.texture && typeof source.texture === 'object' ? source.texture : undefined;
  if (textureIn) {
    const type = canonical(textureIn.type, textureTypes);
    const color = typeof textureIn.color === 'string' && colorPattern.test(textureIn.color.trim()) ? textureIn.color.trim() : undefined;
    const opacity = Number.isFinite(Number(textureIn.opacity)) ? Math.max(0, Math.min(1, Number(textureIn.opacity))) : undefined;
    const scale = Number.isFinite(Number(textureIn.scale)) && Number(textureIn.scale) > 0 ? Number(textureIn.scale) : undefined;
    if (type || color || opacity !== undefined || scale) look.texture = { ...(type ? { type } : {}), ...(color ? { color } : {}), ...(opacity !== undefined ? { opacity } : {}), ...(scale ? { scale } : {}) };
  }
  const motion = canonical(source.motion, motionPresets); if (motion) look.motion = motion;
  const transition = canonical(source.transition, transitionStyles); if (transition) look.transition = transition;
  const layout = canonical(source.layout, layoutStyles); if (layout) look.layout = layout;
  if (Number.isFinite(Number(source.density))) look.density = Math.max(0.75, Math.min(1.25, Number(source.density)));
  return Object.keys(look).length ? look : undefined;
}

function beatsOf(raw: any, durationSeconds: number): { beats: MotionBeat[]; problems: string[] } {
  const problems: string[] = [], beats: MotionBeat[] = [];
  if (!Array.isArray(raw?.beats) || raw.beats.length === 0) return { beats, problems: ['"beats" must be a list of 1-8 beats, each with a "name" and what is "onScreen"'] };
  for (const [index, beat] of raw.beats.slice(0, 8).entries()) {
    if (!beat || typeof beat !== 'object' || Array.isArray(beat) || typeof beat.name !== 'string' || !beat.name.trim()) {
      problems.push(`beats[${index}].name must be text that names the beat`); continue;
    }
    const onScreen = typeof beat.onScreen === 'string' ? beat.onScreen.trim() :
      typeof beat.takeaway === 'string' && beat.takeaway.trim() ? beat.takeaway.trim() : '';
    if (!onScreen) problems.push(`beats[${index}].onScreen must give the words the viewer reads, not a description of the shot`);
    beats.push({ name: beat.name.trim(), onScreen, seconds: Number.isFinite(Number(beat.seconds)) ? Number(beat.seconds) : undefined, motion: typeof beat.motion === 'string' && beat.motion.trim() ? beat.motion.trim() : undefined });
  }
  // Beats should cover the video: scale what the planner gave, or split it evenly, so a planned video is never 2 seconds long.
  const given = beats.map(beat => beat.seconds).filter((seconds): seconds is number => Number.isFinite(seconds) && (seconds as number) > 0);
  const sum = given.reduce((total, value) => total + value, 0);
  if (given.length === beats.length && given.length > 0) {
    const scale = Math.abs(sum - durationSeconds) < 0.2 ? 1 : durationSeconds / sum;
    for (const beat of beats) beat.seconds = Math.round((beat.seconds as number) * scale * 10) / 10;
  } else if (given.length === 0 && beats.length > 0) {
    const each = Math.round(durationSeconds / beats.length * 10) / 10;
    for (const beat of beats) beat.seconds = each;
  } else {
    problems.push('"beats" must give a "seconds" per beat, or no seconds at all');
  }
  return { beats, problems };
}

/** Parses and validates one reply against the registry. Returns the plan, or the problems to send back to the model. */
export function readBuildPlan(reply: unknown, options: PlanOptions): { plan?: BuildPlan; problems: string[] } {
  if (!reply || typeof reply !== 'object' || Array.isArray(reply)) return { problems: ['The reply must be one JSON object'] };
  const raw = reply as any;
  const problems: string[] = [];
  const allowed = allowedPaths(options);
  if (typeof raw.path !== 'string' || !allowed.includes(raw.path)) {
    return { problems: [`"path" must be one of: ${allowed.join(', ')}`] };
  }
  const { beats, problems: beatProblems } = beatsOf(options.content
    ? { beats: options.content.beats.map(beat => ({ name: beat.name, onScreen: beat.onScreen, seconds: beat.seconds, motion: beat.motion })) }
    : raw, options.durationSeconds);
  problems.push(...beatProblems);
  if (problems.length) return { problems };
  const reasons = Array.isArray(raw.reasons) ? raw.reasons.filter((reason: unknown): reason is string => typeof reason === 'string' && reason.trim() !== '').slice(0, 4) : [];
  return {
    problems: [],
    plan: {
      path: raw.path as GenerationPath,
      idea: typeof raw.idea === 'string' && raw.idea.trim() ? raw.idea.trim().slice(0, 200) : undefined,
      look: readLook(raw.look),
      beats, reasons,
    },
  };
}

function messages(options: PlanOptions, prior: { text: string; feedback: string } | undefined, compact: boolean): ChatMessage[] {
  const base: ChatMessage[] = [
    { role: 'system', content: systemText(options, compact) },
    { role: 'user', content: `Brief: ${options.brief}\nFormat: ${options.kind ?? 'video'}\nCanvas: ${options.width}x${options.height}, ${options.durationSeconds} s at ${options.fps} fps.${options.assets?.length ? `\nAssets supplied by the user (ids): ${options.assets.map(asset => asset.id).join(', ')}` : ''}` },
  ];
  if (prior) base.push({ role: 'assistant', content: prior.text }, { role: 'user', content: `That plan cannot be used:\n${prior.feedback}\nReply with the corrected plan JSON.` });
  return base;
}

/**
 * Plans the video. Returns a validated plan, or undefined when the planner cannot be trusted (no reply within the attempt
 * budget or non-plan-shaped output), so callers fall back to the routing that always worked.
 */
export async function planBuild(provider: AiProvider, options: PlanOptions): Promise<BuildPlan | undefined> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 2);
  let prior: { text: string; feedback: string } | undefined;
  let last = '';
  // The full capability list is about ten thousand tokens. Groq's on-demand tier allows eight thousand a minute, so it gets the short one.
  let compact = options.compact ?? (provider.id === 'groq' || process.env.OVE_AI_COMPACT === '1');
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    options.onProgress?.(`Planning the video with ${provider.id} (attempt ${attempt}/${maxAttempts})…`);
    const conversation = messages(options, prior, compact);
    let text: string;
    try { text = await provider.chat(conversation, { json: true, task: 'direct', temperature: attempt === 1 ? 0.7 : 0.3, maxTokens: compact ? 1500 : 2200, signal: options.signal }); }
    catch (error) {
      // Any provider can say a request is too large; the short list is the answer, once, without costing an attempt.
      if (!compact && /too large|reduce your message size|context length|maximum context/i.test((error as Error).message)) {
        compact = true; options.onProgress?.('That request is too large for this provider; sending a shorter capability list.'); attempt--; continue;
      }
      throw error;
    }
    let reply: unknown;
    try { reply = extractJson(text); } catch (error) { prior = { text, feedback: (error as Error).message }; last = prior.feedback; continue; }
    const { plan, problems } = readBuildPlan(reply, options);
    if (plan) return plan;
    prior = { text, feedback: problems.join('\n') };
    last = prior.feedback;
  }
  options.onProgress?.(`No usable plan: ${last.split('\n')[0] ?? 'the planner did not answer in plan form'}.`);
  return undefined;
}
