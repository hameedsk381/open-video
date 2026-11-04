// The composition planner: decides HOW a brief should be produced (fill a template, write a JSON composition, or React
// code) and what the video's beats are, before anything is generated. It reads the capability registry and its answer is
// validated back against that registry, so it can only point at capabilities that exist and fit the canvas. It returns
// undefined when planning cannot be trusted, and the caller falls back to the previous always-working routing.
import type { AiProvider, ChatMessage } from './providers';
import { extractJson } from './json';
import type { MotionBeat } from './prompt';
import { describeCapabilities, sameShape, type GenerationPath, type Registry } from './registry';

export type BuildPlan = {
  path: GenerationPath;
  template?: string;
  theme?: string;
  idea?: string;
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
  /** Which routes the caller will actually act on (default: all; react additionally needs allowReact). */
  paths?: GenerationPath[];
  /** Full JSON compositions and React code can use sounds and clips; templates cannot. */
  assets?: { id: string; type: string; src: string }[];
  allowReact?: boolean;
  maxAttempts?: number;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
};

const paths: GenerationPath[] = ['template', 'json', 'react'];
const allowedPaths = (options: PlanOptions) => (options.paths ?? paths).filter(path => path !== 'react' || options.allowReact);

const systemText = (options: PlanOptions) => `You are the production planner for Open Video Engine. Decide how the brief below should be produced, before anything is generated.
Reply with ONE JSON object and nothing else:
{
  "path": "template" | "json" | "react",
  "template": "<template id>",            // only with "template": the one template that suits the brief
  "theme": "<theme id>",                  // optional, only with a template that takes a theme
  "idea": "<what the video says, in one line>",
  "beats": [{ "name": "Hook", "onScreen": "what is on screen, concretely", "seconds": 3, "motion": "how it moves in" }],
  "reasons": ["why this path suits this brief"]
}
Templates are the primary path: choose "template" whenever one listed template suits the brief's kind and aspect ratio, even when its length differs — a template's length is its own, and a length difference is not a reason to leave the template route. Choose "json" only when no template fits the kind and aspect: a bespoke composition with scene layers, camera moves and kinetic type. Choose "react" only when allowed: it writes React code for bespoke high-end motion graphics. Every beat needs a concrete picture, not a mood.
Reply with "path" set to one of: ${allowedPaths(options).join(' | ')}.
Available capabilities:
${describeCapabilities(options.registry, options)}`;

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
  const { beats, problems: beatProblems } = beatsOf(raw, options.durationSeconds);
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
      beats, reasons,
    },
  };
}

function messages(options: PlanOptions, prior: { text: string; feedback: string } | undefined): ChatMessage[] {
  const base: ChatMessage[] = [
    { role: 'system', content: systemText(options) },
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
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    options.onProgress?.(`Planning the video with ${provider.id} (attempt ${attempt}/${maxAttempts})…`);
    const conversation = messages(options, prior);
    const text = await provider.chat(conversation, { json: true, task: 'fast', temperature: attempt === 1 ? 0.35 : 0.2, maxTokens: 800, signal: options.signal });
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
