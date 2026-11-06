// Prompt-to-composition with a self-correcting loop: generate, parse, validate with the real schema, feed the exact
// errors back, repeat. Optional review rounds use the same renderer/design checks as `ove review`, so the model is
// corrected against what the video actually looks like rather than only against the schema.
import { describeError, loadComposition, reviewComposition, type Composition, type ReviewIssue } from '@ove/core';
import type { AiProvider, ChatMessage } from './providers';
import { extractJson } from './json';
import { assetProblems, refinePolicy, restoreSuppliedSources } from './assets';
import { isMotionPlan, planSystemPrompt, planUserPrompt, refineOutlineChars, refineOutlinePrompt, refineUserPrompt, systemPrompt, userPrompt, type MotionPlan, type PromptOptions } from './prompt';
import { readLook } from './plan';
import { applyFixes, isFixReply, patchFeedback } from './patch';
import { composeByScenes, healScenes, normalizeAnimation, type ScenesOptions } from './scenes';

export type ComposeOptions = PromptOptions & {
  brief: string;
  maxAttempts?: number;
  /** Run `ove review`-style checks between attempts and feed design errors back. Slow; off by default. */
  review?: boolean;
  /** Plan beats and look first (Claude-style motion graphics), then write the composition. */
  plan?: boolean;
  /**
   * Refuse a reply that only became usable because we repaired it — an invented animation property, a keyframe with a
   * value that is not a number, a split preset that does not exist. Off by default: the repair happens either way and
   * is reported in `warnings`; on, the model is told exactly what was altered and asked again.
   */
  strict?: boolean;
  /** How the composition is generated: one big call, or a style contract plus one small call per scene (OVE_COMPOSE_STRATEGY=scenes). */
  strategy?: 'single' | 'scenes';
  baseDir?: string;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
};

export type ComposeResult = {
  composition: Composition;
  attempts: number;
  issues: ReviewIssue[];
  warnings: string[];
};

const numeric = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^\d+(\.\d+)?$/.test(value.trim())) return Number(value);
  return undefined;
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A reply that only passed because it was repaired, raised when `strict` is on. Distinct from an ordinary failure so
 *  the scene route does not mistake it for "the scene strategy is broken" and quietly fall back to one big call. */
class StrictReplyError extends Error {
  readonly notes: string[];

  constructor(notes: string[]) {
    super(`Strict mode: the answer was only usable after ${notes.length} repair${notes.length === 1 ? '' : 's'}, so it was refused.\n${notes.map(note => `- ${note}`).join('\n')}\nWithout strict mode the same video is made from the repaired answer and these are reported as warnings.`);
    this.name = 'StrictReplyError';
    this.notes = notes;
  }
}

/** What each repair did to the layer it touched, phrased for the person reading the warnings. */
const layerNote = (layer: any) => (message: string) => `${layer?.id ? `layer "${layer.id}"` : 'a layer'}: ${message}`;

function cleanLayer(layer: any, frames = 300, notes: string[] = []) {
  if (!layer || typeof layer !== 'object') return;
  if ('fontWeight' in layer && typeof layer.fontWeight === 'string') {
    const s = layer.fontWeight.trim().toLowerCase();
    if (/^\d+$/.test(s)) layer.fontWeight = parseInt(s, 10);
    else if (s === 'bold') layer.fontWeight = 700;
    else if (s === 'normal' || s === 'regular') layer.fontWeight = 400;
    else if (s === 'semibold' || s === 'semi-bold') layer.fontWeight = 600;
    else if (s === 'medium') layer.fontWeight = 500;
    else if (s === 'light') layer.fontWeight = 300;
  }
  if (typeof layer.x === 'string') {
    const num = Number(layer.x.replace(/px$/, ''));
    if (Number.isFinite(num)) layer.x = num;
  }
  if (typeof layer.y === 'string') {
    const num = Number(layer.y.replace(/px$/, ''));
    if (Number.isFinite(num)) layer.y = num;
  }
  if (typeof layer.fontSize === 'string') {
    const num = Number(layer.fontSize.replace(/px$/, ''));
    if (Number.isFinite(num) && num > 0) layer.fontSize = num;
  }
  if (typeof layer.opacity === 'string') {
    const num = Number(layer.opacity.replace(/%$/, ''));
    if (Number.isFinite(num)) layer.opacity = num > 1 ? num / 100 : Math.max(0, num);
  }
  if (Array.isArray(layer.animations)) {
    layer.animations = layer.animations.map((a: any) => {
      if (!a || typeof a !== 'object') return a;
      const held: string[] = [];
      const clean = normalizeAnimation(a, frames, message => held.push(message));
      // An animation that cannot be normalized at all stays exactly as the model wrote it, so the schema rejects it
      // and the model is told the real error — reporting a "repair" here would describe something that did not happen.
      if (clean === undefined) return a;
      const note = layerNote(layer);
      for (const message of held) notes.push(note(message));
      return clean;
    });
  }
  if (Array.isArray(layer.children)) layer.children.forEach((c: any) => cleanLayer(c, frames, notes));
  if (Array.isArray(layer.spans)) layer.spans.forEach((s: any) => cleanLayer(s, frames, notes));
}

function normalize(raw: any, options: ComposeOptions, notes: string[] = []): any {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('The response must be one JSON object');
  if (raw.background && typeof raw.background === 'object' && raw.background.type === 'color' && typeof raw.background.color === 'string') {
    raw.background = raw.background.color;
  }
  raw.version = '1.0';
  raw.$schema = './composition.schema.json';
  raw.width = options.width ?? (typeof raw.width === 'number' && raw.width > 0 ? raw.width : 1080);
  raw.height = options.height ?? (typeof raw.height === 'number' && raw.height > 0 ? raw.height : 1920);
  raw.fps = options.fps ?? (typeof raw.fps === 'number' && raw.fps > 0 ? raw.fps : 30);
  const fps = raw.fps;
  const durationSeconds = options.durationSeconds ?? (typeof raw.durationFrames === 'number' && raw.durationFrames > 0 ? raw.durationFrames / fps : 15);
  raw.durationFrames = Math.max(1, Math.round(durationSeconds * fps));
  if (typeof raw.id !== 'string' || !raw.id.trim()) raw.id = 'ai-video';
  if (typeof raw.name !== 'string' || !raw.name.trim()) raw.name = 'AI video';
  if (options.plan) {
    if (typeof raw.grain !== 'number') raw.grain = 0.03;
    if (!raw.motionBlur || typeof raw.motionBlur !== 'object') raw.motionBlur = { samples: 8, shutter: 180 };
    const loudness = options.narration ? -16 : -14;
    raw.export = { format: 'mp4', ...(raw.export && typeof raw.export === 'object' ? raw.export : {}), loudness: typeof raw.export?.loudness === 'number' ? raw.export.loudness : loudness };
  }
  restoreSuppliedSources(raw, options.assets);
  if (Array.isArray(raw.scenes)) {
    for (const scene of raw.scenes) {
      if (!scene || typeof scene !== 'object') continue;
      if (scene && typeof scene === 'object' && 'background' in scene) delete scene.background;
      const start = Number(scene.startFrame) || 0;
      if (start >= raw.durationFrames) {
        scene.startFrame = Math.max(0, raw.durationFrames - 1);
        scene.durationFrames = 1;
      } else if (start + (Number(scene.durationFrames) || 0) > raw.durationFrames) {
        scene.durationFrames = Math.max(1, raw.durationFrames - start);
      }
      const sceneFrames = Number(scene.durationFrames) || raw.durationFrames || 300;
      for (const layer of scene?.layers ?? []) cleanLayer(layer, sceneFrames, notes);
    }
  }
  return raw;
}

// Checks the schema cannot express: the thing must actually be renderable from the assets at hand, must cover the
// video, and template variables must be used or a batch would produce identical videos.
function inspect(composition: Composition, raw: any, options: ComposeOptions): string[] {
  const problems: string[] = [];
  const first = composition.scenes[0];
  if (first && first.startFrame !== 0) problems.push(`The first scene must start at frame 0, not ${first.startFrame}.`);
  const end = Math.max(0, ...composition.scenes.map(scene => scene.startFrame + scene.durationFrames));
  if (end < composition.durationFrames) problems.push(`The scenes end at frame ${end}, but the video is ${composition.durationFrames} frames; extend the last scene or add one so the video is full.`);
  const allowed = new Map((options.assets ?? []).map(asset => [asset.id, asset.src]));
  const textOf = JSON.stringify(raw);
  for (const field of options.fields ?? []) {
    if (!new RegExp(`\\{\\{\\s*${escapeRegExp(field.name)}\\b`).test(textOf)) problems.push(`Template variable "${field.name}" is declared but never used: put {{${field.name}}} in the content so each row changes the video.`);
  }
  const walk = (layers: any[]) => {
    for (const layer of layers ?? []) {
      if (!layer || typeof layer !== 'object') continue;
      if (layer.type === 'text') {
        const content = typeof layer.content === 'string' ? layer.content : '';
        if (!content.trim()) problems.push(`Text layer "${layer.id}" has no content.`);
        const size = numeric(layer.fontSize) ?? 32;
        if (size < 20) problems.push(`Text layer "${layer.id}" is ${size}px, too small to read; use at least 24px.`);
      }
      if (layer.type === 'rect' && (numeric(layer.width) === undefined || numeric(layer.height) === undefined)) problems.push(`Rect "${layer.id}" needs a numeric width and height.`);
      if (layer.type === 'circle' && numeric(layer.width) === undefined) problems.push(`Circle "${layer.id}" needs a numeric width (its diameter).`);
      if (layer.type === 'group') walk(layer.children ?? []);
      if (layer.type === 'path' && typeof layer.d !== 'string') problems.push(`Path "${layer.id}" needs "d" with SVG path data.`);
    }
  };
  for (const scene of composition.scenes) walk(scene.layers as any[]);
  problems.push(...assetProblems(composition, { assets: allowed }));
  problems.push(...craftProblems(composition, options));
  return problems;
}

function craftProblems(composition: Composition, options: ComposeOptions): string[] {
  if (!options.plan || options.fields?.length || options.durationSeconds < 8) return [];
  const problems: string[] = [];
  const scenes = composition.scenes;
  if (scenes.length < 3) problems.push(`A motion-graphics video of ${options.durationSeconds}s needs at least 3 scenes of unequal length (one idea each), not ${scenes.length}.`);
  if (scenes.length >= 3 && new Set(scenes.map(scene => scene.durationFrames)).size === 1) {
    problems.push('Scene lengths are identical; give each beat a different duration so it does not read as a slideshow.');
  }
  let split = false, camera = scenes.some(scene => !!scene.camera), motion = scenes.some(scene => (scene.camera?.animations?.length ?? 0) > 0);
  const walk = (layers: any[]) => {
    for (const layer of layers ?? []) {
      if (!layer || typeof layer !== 'object') continue;
      if (layer.type === 'text' && layer.split) split = true;
      if (Array.isArray(layer.animations) && layer.animations.length) motion = true;
      if (layer.type === 'group') walk(layer.children ?? []);
    }
  };
  for (const scene of scenes) walk(scene.layers as any[]);
  if (!split) problems.push('Add kinetic type: at least one headline text layer with "split": { "by": "words", "stagger": 4, "preset": "rise" }.');
  if (!camera) problems.push('Give at least one content scene a camera with a slow zoom or pan.');
  if (!motion) problems.push('Animate layers: land-in keyframes, drifting glows, or group motion — a static layout is not motion graphics.');
  return problems;
}

// A repair is a patch when the model's last composition is known (patch.ts): it sends back only what changes. History is cut to
// the brief and the latest composition, so retries do not grow and the free tier's per-minute token limit is not hit by them.
const resolveReply = (reply: unknown, previous: any) => isFixReply(reply) ? applyFixes(previous, reply.fixes) : reply;
function retryMessages(messages: ChatMessage[], text: string, current: any, intro: string, outline = false) {
  messages.splice(2);
  // A large composition is never sent back in full: the model sees its own fixes and what was wrong with them.
  if (outline) { messages.push({ role: 'assistant', content: text }, { role: 'user', content: `${intro}\n\nReply with corrected fixes only, using the paths from the outline.` }); return; }
  if (current && typeof current === 'object') messages.push({ role: 'assistant', content: JSON.stringify(current) }, { role: 'user', content: patchFeedback(intro) });
  else messages.push({ role: 'assistant', content: text }, { role: 'user', content: `${intro}\n\nFix every problem and return the complete composition JSON again. Keep everything that was already correct.` });
}

async function acceptComposition(rawInput: unknown, options: ComposeOptions, extraNotes: string[] = []): Promise<{ composition: Composition; raw: any; current: any; notes: string[] }> {
  const current = rawInput;
  const notes: string[] = [];
  const raw = normalize(structuredClone(current), options, notes);
  const composition = loadComposition(raw);
  const problems = inspect(composition, raw, options);
  const repaired = [...extraNotes, ...notes];
  if (options.strict && repaired.length) throw new StrictReplyError(repaired);
  if (problems.length) throw new Error(problems.join('\n'));
  return { composition, raw, current, notes: repaired };
}

async function maybeReview(composition: Composition, options: ComposeOptions, attempt: number, maxAttempts: number, retry: (intro: string, issues?: ReviewIssue[]) => void, notes: string[] = []): Promise<ComposeResult | undefined> {
  if (!options.review) return { composition, attempts: attempt, issues: [], warnings: notes };
  options.onProgress?.('Reviewing the generated composition with the renderer…');
  let review;
  try {
    review = await reviewComposition(composition, { baseDir: options.baseDir ?? process.cwd(), audio: false });
  } catch (error) {
    throw new Error(`Could not review the generated composition: ${describeError(error)}`);
  }
  const errors = review.issues.filter(issue => issue.severity === 'error');
  if (errors.length && attempt < maxAttempts) {
    retry(`The renderer's design review found errors:\n${errors.map(issue => `- ${issue.frame === undefined ? '' : `frame ${issue.frame}: `}${issue.message}${issue.layer ? ` [${issue.layer}]` : ''}`).join('\n')}`, errors);
    return undefined;
  }
  return { composition, attempts: attempt, issues: review.issues, warnings: [...notes, ...review.issues.filter(issue => issue.severity === 'warning').map(issue => issue.message)] };
}

export async function composeVideo(provider: AiProvider, options: ComposeOptions): Promise<ComposeResult> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  let motionPlan: MotionPlan | undefined = options.motionPlan;
  if (options.plan && !motionPlan) {
    options.onProgress?.(`Planning motion-graphics beats with ${provider.id}…`);
    try {
      const planText = await provider.chat([
        { role: 'system', content: planSystemPrompt() },
        { role: 'user', content: planUserPrompt(options.brief, options) },
      ], { json: true, task: 'fast', temperature: 0.55, signal: options.signal });
      const planned = extractJson(planText);
      if (isMotionPlan(planned)) motionPlan = { ...planned, look: readLook(planned.look) };
      else {
        try {
          const accepted = await acceptComposition(planned, options);
          const reviewed = await maybeReview(accepted.composition, options, 1, maxAttempts, () => {});
          if (reviewed) return reviewed;
        } catch { /* not a usable composition; write one from scratch */ }
      }
    } catch { /* planning failed; write the composition without a plan */ }
  }
  const composeOptions = motionPlan ? { ...options, motionPlan } : options;
  // Scene-scoped strategy: a style contract plus one small call per scene, deterministic timing, targeted scene heal.
  // Opt-in with strategy: 'scenes' or OVE_COMPOSE_STRATEGY=scenes; freellmapi uses scenes for fast multi-scene speed.
  // Any failure falls through to the single-call loop.
  const useScenes = composeOptions.strategy === 'scenes' || (composeOptions.strategy === undefined && (process.env.OVE_COMPOSE_STRATEGY === 'scenes' || provider.id === 'freellmapi'));
  if (useScenes) {
    const scenesOptions: ScenesOptions = {
      brief: options.brief,
      width: composeOptions.width,
      height: composeOptions.height,
      fps: composeOptions.fps,
      durationSeconds: composeOptions.durationSeconds,
      assets: composeOptions.assets,
      look: motionPlan?.look,
      signal: options.signal,
      onProgress: options.onProgress,
    };
    try {
      let state = await composeByScenes(provider, scenesOptions, motionPlan);
      let reviewIssues: ReviewIssue[] | undefined;
      let lastAccepted: { composition: Composition; raw: any; current: any; notes: string[] } | undefined;
      let attempt = 0;
      for (attempt = 1; attempt <= maxAttempts; attempt++) {
        // The brief's requested length stays the requirement: validating the stitched scenes against the duration they
        // themselves produced would make every timing mistake self-certifying.
        const accepted = await acceptComposition(state.raw, composeOptions, state.notes.flat());
        lastAccepted = accepted;
        const reviewed = await maybeReview(accepted.composition, composeOptions, attempt, maxAttempts, (intro, issues) => { reviewIssues = issues; }, accepted.notes);
        if (reviewed) return reviewed;
        if (!reviewIssues?.some(issue => issue.frame !== undefined)) break;
        try {
          state = await healScenes(provider, state, reviewIssues, scenesOptions);
        } catch {
          break;
        }
      }
      if (lastAccepted) {
        // Unresolved review errors are returned, not thrown: the composition is written and the caller decides what to
        // do with a video the renderer still finds fault with. `issues` carries the errors so no surface can mistake
        // this for a clean run.
        return { composition: lastAccepted.composition, attempts: Math.min(attempt, maxAttempts), issues: reviewIssues ?? [], warnings: lastAccepted.notes };
      }
      throw new Error('the scene rounds did not converge');
    } catch (error) {
      // Strict mode refusing a repaired reply is a verdict on the answer, not the scene strategy breaking; falling
      // back to one big call would run the same repair past the check the user asked for.
      if (error instanceof StrictReplyError) throw error;
      options.onProgress?.(`Scene-by-scene composing fell back to one call (${describeError(error)}).`);
    }
  }
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt(composeOptions) },
    { role: 'user', content: userPrompt(options.brief, composeOptions) },
  ];
  let lastError = 'no attempt was made';
  let previous: any;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    options.onProgress?.(`Asking ${provider.id} for a composition (attempt ${attempt}/${maxAttempts})…`);
    const text = await provider.chat(messages, { json: true, task: 'compose', temperature: attempt === 1 ? 0.5 : 0.2, signal: options.signal });
    let current: any;
    try {
      current = resolveReply(extractJson(text), previous);
      const accepted = await acceptComposition(current, options);
      const reviewed = await maybeReview(accepted.composition, options, attempt, maxAttempts, intro => {
        retryMessages(messages, text, current, intro);
        previous = current;
        lastError = intro;
      }, accepted.notes);
      if (!reviewed) continue;
      return reviewed;
    } catch (error) {
      lastError = describeError(error);
      retryMessages(messages, text, current, `That composition cannot be used yet:\n${lastError}`);
      previous = current;
      continue;
    }
  }
  throw new Error(`Could not get a valid composition after ${maxAttempts} attempt${maxAttempts === 1 ? '' : 's'}.\nLast problem:\n${lastError}`);
}

export type RefineOptions = {
  instruction: string;
  maxAttempts?: number;
  /** Run `ove review`-style checks between attempts and feed design errors back. */
  review?: boolean;
  /** Pictures, clips and sounds newly made available; what the composition already uses stays allowed. */
  assets?: { id: string; src: string }[];
  baseDir?: string;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
};

export async function refineVideo(
  provider: AiProvider,
  currentComposition: Composition | any,
  options: RefineOptions
): Promise<ComposeResult> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  // A big composition (a template video, say) goes to the model as an outline and comes back as fixes by path, not as a full copy.
  const outline = JSON.stringify(currentComposition).length > refineOutlineChars;
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt() },
    { role: 'user', content: outline ? refineOutlinePrompt(currentComposition, options.instruction) : refineUserPrompt(currentComposition, options.instruction) },
  ];
  // The model may keep using what the composition already uses; anything new has to have been supplied.
  const policy = refinePolicy(currentComposition, options.assets);
  let lastError = 'no attempt was made';
  let previous: any = outline ? structuredClone(currentComposition) : undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    options.onProgress?.(`Refining composition with ${provider.id} (attempt ${attempt}/${maxAttempts})…`);
    const text = await provider.chat(messages, { json: true, temperature: 0.2, signal: options.signal });
    let composition: Composition;
    let raw: any;
    let current: any;
    try {
      current = resolveReply(extractJson(text), previous);
      if (!current || typeof current !== 'object' || Array.isArray(current)) throw new Error('The response must be one JSON object');
      raw = structuredClone(current);
      raw.version = '1.0';
      raw.$schema = './composition.schema.json';
      composition = loadComposition(raw);
      const problems = assetProblems(composition, policy);
      if (problems.length) throw new Error(problems.join('\n'));
    } catch (error) {
      lastError = describeError(error);
      retryMessages(messages, text, current, `That composition cannot be used yet:\n${lastError}`, outline);
      if (!outline) previous = current;
      continue;
    }
    if (options.review) {
      options.onProgress?.('Reviewing the refined composition with the renderer…');
      let review;
      try {
        review = await reviewComposition(composition, { baseDir: options.baseDir ?? process.cwd(), audio: false });
      } catch (error) {
        throw new Error(`Could not review the refined composition: ${describeError(error)}`);
      }
      const errors = review.issues.filter(issue => issue.severity === 'error');
      if (errors.length && attempt < maxAttempts) {
        retryMessages(messages, text, current, `The renderer's design review found errors:\n${errors.map(issue => `- ${issue.frame === undefined ? '' : `frame ${issue.frame}: `}${issue.message}${issue.layer ? ` [${issue.layer}]` : ''}`).join('\n')}`, outline);
        if (!outline) previous = current;
        lastError = errors.map(issue => issue.message).join('; ');
        continue;
      }
      const warnings = review.issues.filter(issue => issue.severity === 'warning').map(issue => issue.message);
      return { composition, attempts: attempt, issues: review.issues, warnings };
    }
    return { composition, attempts: attempt, issues: [], warnings: [] };
  }
  throw new Error(`Could not refine composition after ${maxAttempts} attempt${maxAttempts === 1 ? '' : 's'}.\nLast problem:\n${lastError}`);
}
