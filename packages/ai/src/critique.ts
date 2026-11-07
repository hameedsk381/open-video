// The art-director pass: the model looks at stills of the video it just built and says what a person with taste would
// say. The heuristic review in @ove/core finds broken things (clipped text, low contrast); it cannot tell that a clean
// video is generic. This pass can, so a build that compiles and passes review is still sent back when it looks like every
// other video. Failure is never fatal: a provider that cannot read images simply yields no critique.
import type { Composition } from '@ove/core';
import type { VideoContent } from '@ove/schema';
import type { CreativeDirection } from './direction';
import { extractJson } from './json';
import type { AiProvider, ChatMessage } from './providers';

export type CritiqueFrame = { label: string; png: Buffer };

export type Critique = {
  /** 1 to 10, craft overall. */
  score: number;
  /** Nothing left worth a rewrite: a score of 8 or more with no problem that matters. */
  ready: boolean;
  /** Each one names a frame, what is wrong, and a change to make in code. */
  problems: string[];
  /** What the critic says it can literally see, per frame, so a model that ignored the images is easy to spot. */
  seen: { label: string; seen: string }[];
};

export type CritiqueOptions = {
  brief: string;
  width: number;
  height: number;
  direction?: CreativeDirection;
  content?: VideoContent;
  frames: CritiqueFrame[];
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
};

const readyScore = 8;
const maxProblems = 4;
const oneLine = (value: unknown, max: number): string => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/**
 * Reads the critic's answer. A reply that does not describe what it saw is refused: a model that cannot see images tends
 * to invent a critique, and a rewrite driven by an invented critique makes the video worse.
 */
export function readCritique(reply: unknown, labels: string[]): { critique?: Critique; problems: string[] } {
  if (!reply || typeof reply !== 'object' || Array.isArray(reply)) return { problems: ['The reply must be one JSON object'] };
  const raw = reply as Record<string, any>;
  const seen = (Array.isArray(raw.frames) ? raw.frames : [])
    .map((entry: any) => ({ label: oneLine(entry?.label, 80), seen: oneLine(entry?.seen, 240) }))
    .filter((entry: { label: string; seen: string }) => entry.label && entry.seen.split(' ').length >= 3);
  if (!seen.length) return { problems: ['"frames" must say, for each frame, what is literally on screen (at least a short sentence)'] };
  if (labels.length > 1 && seen.length < Math.ceil(labels.length / 2)) return { problems: [`"frames" describes ${seen.length} of ${labels.length} frames; describe what is on screen in each`] };
  const score = Number(raw.score);
  if (!Number.isFinite(score)) return { problems: ['"score" must be a number from 1 to 10'] };
  const problems: string[] = [];
  for (const entry of (Array.isArray(raw.problems) ? raw.problems : []).slice(0, maxProblems)) {
    const problem = oneLine(entry?.problem, 300);
    if (!problem) continue;
    const frame = oneLine(entry?.frame, 80), fix = oneLine(entry?.fix, 300);
    problems.push(`${frame ? `${frame}: ` : ''}${problem}${fix ? ` Fix: ${fix}` : ''}`);
  }
  const clamped = Math.max(1, Math.min(10, score));
  // Nothing actionable means nothing to rewrite, whatever the score says.
  const ready = problems.length === 0 || (raw.ready === true && clamped >= readyScore);
  return { problems: [], critique: { score: clamped, ready, problems, seen } };
}

/** The frames worth looking at: a settled moment in each scene, or evenly spread moments when one scene holds the whole video. */
export function critiqueFrameNumbers(composition: Pick<Composition, 'scenes' | 'durationFrames' | 'fps'>, max = 5): { frame: number; label: string }[] {
  const last = Math.max(0, composition.durationFrames - 1);
  const scenes = composition.scenes.filter(scene => scene.id !== 'narration' && scene.id !== 'captions');
  const at = (frame: number) => Math.max(0, Math.min(last, Math.round(frame)));
  const picks: { frame: number; name?: string }[] = scenes.length >= 2
    ? scenes.map(scene => ({ frame: at(scene.startFrame + scene.durationFrames * 0.65), name: scene.name }))
    : [0.15, 0.4, 0.65, 0.9].map(fraction => ({ frame: at(composition.durationFrames * fraction) }));
  const chosen = picks.length <= max ? picks : Array.from({ length: max }, (_, index) => picks[Math.round(index * (picks.length - 1) / (max - 1))]!);
  return chosen.map((pick, index) => ({ frame: pick.frame, label: `${index + 1}. ${pick.name ? `${pick.name}, ` : ''}frame ${pick.frame} (${(pick.frame / composition.fps).toFixed(1)} s)` }));
}

const systemText = (options: CritiqueOptions) => `You are the art director reviewing frames of a ${options.width}x${options.height} motion-graphics video before it ships. You see still frames in order, each labelled. Judge only what you can literally see.
Reply with ONE JSON object and nothing else:
{
  "frames": [{ "label": "<the frame's label>", "seen": "<what is literally on screen, in one sentence>" }],
  "score": <1 to 10, craft overall>,
  "problems": [{ "frame": "<label, or all>", "problem": "<what is wrong, specifically>", "fix": "<a concrete change to make in the code>" }],
  "ready": true | false
}
Judge, in this order:
1. Does it match the concept and art direction it was given?
2. Is it distinctive, or the generic default (dark navy gradient, centred title in a neutral sans, glass cards, glow orbs)? A generic look is a problem even when nothing is broken.
3. Hierarchy: one clear focal point per frame, strong contrast between the largest and smallest type.
4. Composition: the whole frame is used; balance, margins and spacing are deliberate; nothing is cramped, floating or empty without reason.
5. Type: legible, not clipped, set with intent.
6. Consistency: the frames read as one piece.
7. Does each frame show what its beat says?
Rules: ready is true only when the score is ${readyScore} or more and no problem matters. Give at most ${maxProblems} problems, most important first. Each fix must name something to change (a size, a colour, a layout, an element, a move), never "improve it". Do not praise. A blank or unreadable frame is a problem.`;

function userContent(options: CritiqueOptions): any[] {
  const direction = options.direction ? `Concept: ${options.direction.concept}\nArt direction: ${options.direction.art}\n` : '';
  const beats = options.content ? `Beats: ${options.content.beats.map(beat => `${beat.name}: "${beat.onScreen}"`).join(' | ')}\n` : '';
  const parts: any[] = [{ type: 'text', text: `Brief: ${options.brief}\n${direction}${beats}Frames, in order: ${options.frames.map(frame => frame.label).join(' ; ')}` }];
  for (const frame of options.frames) {
    parts.push({ type: 'text', text: frame.label });
    parts.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${frame.png.toString('base64')}` } });
  }
  return parts;
}

/** Looks at the frames and returns the critique, or undefined when no usable critique could be had. */
export async function critiqueVideo(provider: AiProvider, options: CritiqueOptions): Promise<Critique | undefined> {
  if (!options.frames.length) return undefined;
  const labels = options.frames.map(frame => frame.label);
  const messages: ChatMessage[] = [{ role: 'system', content: systemText(options) }, { role: 'user', content: userContent(options) }];
  let last = '';
  for (let attempt = 1; attempt <= 2; attempt++) {
    let text: string;
    try {
      text = await provider.chat(messages, { json: true, task: 'vision', temperature: 0.2, maxTokens: 1200, signal: options.signal });
    } catch (error) {
      if (options.signal?.aborted) throw error;
      options.onProgress?.(`The art-director pass could not run (${(error as Error).message.split('\n')[0]}); keeping the build as it is.`);
      return undefined;
    }
    let reply: unknown;
    try { reply = extractJson(text); } catch (error) { last = (error as Error).message; messages.push({ role: 'assistant', content: text }, { role: 'user', content: `That cannot be read: ${last}\nReply with the corrected JSON only.` }); continue; }
    const { critique, problems } = readCritique(reply, labels);
    if (critique) return critique;
    last = problems.join('; ');
    messages.push({ role: 'assistant', content: text }, { role: 'user', content: `That critique cannot be used:\n${problems.join('\n')}\nReply with the corrected JSON only.` });
  }
  options.onProgress?.(`The art-director pass gave no usable critique (${last}); keeping the build as it is.`);
  return undefined;
}

/** What the code-writing model is told after a critique: only the findings, so what already works is left alone. */
export const polishRequest = (critique: Critique) =>
  `An art director looked at frames from the rendered video (score ${critique.score}/10) and found:\n${critique.problems.map(problem => `- ${problem}`).join('\n')}\n\nFix these problems. Keep what already works: the concept, palette, type system and timing. Do not add defaults to compensate. Output the full corrected video.tsx.`;
