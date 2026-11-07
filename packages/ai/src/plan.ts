// The composition planner: decides HOW a brief should be produced (fill a template, write a JSON composition, or React
// code) and what the video's beats are, before anything is generated. It reads the capability registry and its answer is
// validated back against that registry, so it can only point at capabilities that exist and fit the canvas. It returns
// undefined when planning cannot be trusted, and the caller falls back to the previous always-working routing.
import type { AiProvider, ChatMessage } from './providers';
import { extractJson } from './json';
import type { MotionBeat } from './prompt';
import { brandLine } from './brand-look';
import type { BrandPack } from './agent';
import { describeCapabilities, sameShape, type GenerationPath, type Registry } from './registry';
import { describeStyleFamilies, fontGuide, fontIds, layoutStyles, motionPresets, textureTypes, transitionStyles, type DesignLook, type VideoContent } from '@ove/schema';

export type BuildPlan = {
  path: GenerationPath;
  template?: string;
  theme?: string;
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
  /** Full JSON compositions and React code can use sounds and clips; templates cannot. */
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

const paths: GenerationPath[] = ['template', 'json', 'react'];
const allowedPaths = (options: PlanOptions) => (options.paths ?? paths).filter(path => path !== 'react' || options.allowReact);

const systemText = (options: PlanOptions, compact: boolean) => `You are the creative director for MotionRender. Decide how the brief below should be produced, and the art direction it deserves, before anything is generated.
Reply with ONE JSON object and nothing else:
{
  "path": "template" | "json" | "react",
  "template": "<template id>",            // only with "template": the one template whose scenes and look already match the brief
  "theme": "<theme id>",                  // optional, only with a template that takes a theme
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
  "beats": [{ "name": "Hook", "onScreen": "what is on screen, concretely", "seconds": 3, "motion": "how it moves in" }],
  "reasons": ["why this path and look suit this brief"]
}
The design is YOURS to decide. There is no house style: choose the fonts, palette, texture and motion that this specific subject calls for.
- Fonts must be one of: ${fontGuide}. Pair a distinct display face with a readable body face; do not default to Inter for both.
- Palette: derive it from the subject and its industry. A warm artisan brand should not look like a dark tech gradient, and a children's topic should not look like a cyberpunk terminal. Ensure strong text contrast on the background.
- Style families are starting points from very different visual worlds, not a menu to choose from by default. Name the world this subject belongs to, take its tokens or depart from them on purpose, and let the brief's own subject, audience and mood pull the result away from every other video. A dark gradient with glass cards is one family among ten and fits software products only:
${describeStyleFamilies(options.brief)}${options.brand ? `
${brandLine(options.brand)}` : ''}
- Texture: a grid for engineered/technical, dots for editorial/print, scanlines for games/broadcast, paper for warm/organic, none for clean graphic fields.
- Motion and transition: one entrance style and one transition style for the whole video. Match the energy: pop for playful, slide for product, blur for premium, rise for editorial, fade for calm. Density 0.8-1.2 scales spacing.
- This look applies to JSON videos directly and refines the chosen theme for a template.

Choose the route the brief actually needs, not the most convenient one:
- "template": only when a listed template already matches the brief's narrative structure AND the look above. A template is chosen because you would make that same video anyway, not because it shares the topic.
- "json": a tailored composition built from the blocks, effects and moves listed below. Use it for structured, typographic, data-, product- or brand-led videos whose scenes you can describe with those capabilities.
- "react" (only when listed as an allowed path): hand-written React motion graphics — 3D, WebGL or canvas work, particles or simulations, custom illustration or SVG, real camera moves, UI that looks alive, type set as an image, unusual transitions, and any composition the blocks would only approximate.${allowedPaths(options).includes('react') ? `
React is the default for a video that should look designed rather than assembled: brand films, product stories, launches, explainers with a point of view, anything whose look and motion should be specific to this subject. It is the route that can make a video unlike the last one. Choose "json" instead only for plainly structured pieces (a list, a table of figures, a caption-led clip) that blocks express fully, and "template" only on a strong match.` : ''}
If no template matches both the structure and the look, write the video ("json" or "react"); never force a near-miss template.
When a template is the right route, pick the one that specifically fits the brief's narrative style:
- Testimonials, customer stories, quotes, metrics, or personal founder stories: choose "story-tall" or "quote-card".
- Multi-feature tours, app UI cards, feature lists, and product showcases: choose "showcase-tall", "product-wide" or "product-card".
- Quick tips, 3-step processes, how-to guides, and numbered reels: choose "social-reel".
- Company keynotes, presentations, and product launch films: choose "keynote-wide", "launch-wide" or "case-study".

Themes are named presets of the same look (palette, type, texture, motion). For a template that takes a theme, name the closest theme AND still give the look you actually want; the look refines the theme:
- "midnight": modern tech, SaaS, B2B, cloud, finance (deep slate navy, sky blue).
- "neon": gaming, nightlife, social apps, crypto, cutting-edge AI (dark violet, hot magenta, electric lime).
- "espresso": artisan craft, food & beverage, coffee, lifestyle, podcasts, warmth (dark espresso, amber gold).
- "paper": clean editorial, education, publishing, thought leadership (clean light aesthetic, deep ink).
- "signal": high-impact, fitness, sports, breaking news, urgency (bold monochrome with alert red).
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
    if (!onScreen) problems.push(`beats[${index}].onScreen must say what viewers see, concretely`);
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
  if (typeof raw.template === 'string' && raw.path !== 'template') problems.push(`"template" only makes sense with path "template"`);
  if (raw.path === 'template') {
    const template = typeof raw.template === 'string' ? options.registry.find('template', raw.template) : undefined;
    if (!template || !sameShape(template, options) ) problems.push(`"template" must be a listed template that fits the ${options.width}x${options.height} canvas`);
    if (typeof raw.theme === 'string' && raw.theme) {
      if (!template?.takesTheme) problems.push(`"theme" only applies to a template that takes a theme`);
      else if (!options.registry.find('theme', raw.theme)) problems.push(`"theme" must be a listed theme, not "${raw.theme}"`);
    }
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
      template: raw.path === 'template' ? String(raw.template) : undefined,
      theme: raw.path === 'template' && typeof raw.theme === 'string' && raw.theme ? raw.theme : undefined,
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
