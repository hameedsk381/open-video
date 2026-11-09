// Writes an explainer script from a brief. The model only chooses scenes and words; it never draws, so a small model is enough and every
// answer is checked against the explainer schema. A reply that does not fit is sent back with the exact problems, a few times at most.
import { explainerSchema, type Explainer } from '@ove/schema';
import { extractJson } from './json';
import type { AiProvider, ChatMessage } from './providers';

export type WriteExplainerOptions = {
  /** How many scenes to aim for (default 5). */
  scenes?: number;
  /** The language of the spoken lines and labels, such as "English" or "Hinglish (Hindi in Latin letters)". */
  language?: string;
  /** The Edge voice to put in the script, if one is wanted. */
  voice?: string;
  maxAttempts?: number;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
};

const GUIDE = `Scene kinds (each scene has a "kind", an optional "step" label in UPPER CASE such as "STEP 2 · HOW IT WORKS", and an optional "say" line that is spoken over it):
- title: opens the video. {kind:"title", brand?:"big name", chip?:"SMALL BOXED LABEL", lines:[up to 3 short lines; the middle of three is large and gold], say}
- flow: things sending to a destination through something in between. {kind:"flow", sources:[2-7 short ids like "App","D17"], buffer:"QUEUE", sink:"SERVER", spike?:"10× SPIKE", note?:{text,tone}, result?:{text:"0 LOST ✓",tone:"mint"}, caption?, say}
- grid: a board of cells. mode "counters" shows a number in every cell and one changes; mode "heatmap" colours cells red (busy) to green (quiet). {kind:"grid", mode, rows?:3-9, cols?:3-8, hot?:{row,col}, callout?, result?:"name of the picture", resultNote?, caption?, say}
- steps: 2-5 numbered steps shown one after another. {kind:"steps", items:[{title, detail?}], caption?, say}
- compare: a problem side (red) against an answer side (green). {kind:"compare", left:{title, points:[1-4]}, right:{title, points:[1-4]}, caption?, say}
- closing: the takeaway. {kind:"closing", title, points?:[up to 3], cta?:"Follow for more", say}
"tone" is one of gold, mint, red, muted.`;

export function explainerPrompt(brief: string, options: WriteExplainerOptions = {}): ChatMessage[] {
  const scenes = options.scenes ?? 5, language = options.language ?? 'English';
  const system = [
    'You write scripts for short vertical explainer videos: one idea, taught one scene at a time, with a spoken line over each scene.',
    `Reply with one JSON object and nothing else: {"version":"1.0","topic":"SHORT UPPER CASE TOPIC","scenes":[...]}${options.voice ? `, and "voice":"${options.voice}"` : ''}.`,
    GUIDE,
    'Rules:',
    `- About ${scenes} scenes. Start with a title and end with a closing. Use a kind only when it shows the idea better than another; use each kind at most twice.`,
    `- Write the spoken lines ("say") and every label in ${language}. Spoken lines are short sentences a person can say in one breath, 12 to 22 words, one idea each, and they must not repeat the on-screen text word for word.`,
    '- Labels, ids and the topic are short; the topic and "step" lines are UPPER CASE. Keep every text within a few words, because it is drawn in a box.',
    '- Be concrete and correct. Teach the real mechanism, with the names people use for it. Do not invent numbers or claims.',
  ].join('\n');
  return [{ role: 'system', content: system }, { role: 'user', content: `Write the explainer script for: ${brief.trim()}` }];
}

/** Asks the model for a script and returns it checked; throws with the remaining problems when it cannot be made to fit. */
export async function writeExplainer(provider: AiProvider, brief: string, options: WriteExplainerOptions = {}): Promise<{ explainer: Explainer; attempts: number }> {
  if (!brief.trim()) throw new Error('Say what the video should explain');
  const messages = explainerPrompt(brief, options), limit = Math.max(1, options.maxAttempts ?? 3);
  let problems = '';
  for (let attempt = 1; attempt <= limit; attempt++) {
    options.onProgress?.(attempt === 1 ? `Writing the script with ${provider.id}…` : `Fixing the script (attempt ${attempt})…`);
    const reply = await provider.chat(messages, { signal: options.signal });
    try {
      const parsed = explainerSchema.safeParse(extractJson(reply));
      if (parsed.success) return { explainer: options.voice && !parsed.data.voice ? { ...parsed.data, voice: options.voice } : parsed.data, attempts: attempt };
      problems = parsed.error.issues.slice(0, 12).map(issue => `- ${issue.path.join('.') || 'script'}: ${issue.message}`).join('\n');
    } catch (error) {
      problems = `- ${(error as Error).message}`;
    }
    messages.push({ role: 'assistant', content: reply }, { role: 'user', content: `That script has problems:\n${problems}\nReply with the corrected JSON object only.` });
  }
  throw new Error(`The model's script could not be used after ${limit} attempts:\n${problems}`);
}
