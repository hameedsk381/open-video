// Writes an explainer script from a brief. The model only chooses scenes and words; it never draws, so a small model is enough and every
// answer is checked against the explainer schema. A reply that does not fit is sent back with the exact problems, a few times at most.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { explainerSchema, type Explainer } from '@ove/schema';
import { synthesizeEdgeSpeech } from './edge-tts';
import { indicLanguageFor } from './indic-tts/models';
import { extractJson } from './json';
import type { Fact } from './facts';
import type { AiProvider, ChatMessage } from './providers';

export type WriteExplainerOptions = {
  /** How many scenes to aim for (default 5). */
  scenes?: number;
  /** The language of the spoken lines and labels, such as "English" or "Hinglish (Hindi in Latin letters)". */
  language?: string;
  /** Picture and video files the video has (such as assets/city.mp4). Only these can appear, in media scenes; with none, there are no media scenes. */
  media?: string[];
  /** The provider can draw pictures: media scenes may then give a prompt to draw instead of a file (at most two). */
  images?: boolean;
  /** Checked facts with their sources (see researchFacts). Every number and claim the script states as fact must come from these. */
  facts?: Fact[];
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
- stat: one big number that makes the point. {kind:"stat", value:"87%", label, note?, tone?, say}
- chart: compare amounts (type "bars") or show a change over time (type "line"). {kind:"chart", type, items:[{label, value}] (2-8, values are plain numbers), unit?, highlight?, caption?, say}
- timeline: what happened or happens, in order. {kind:"timeline", events:[{when, title, detail?}] (2-6), caption?, say}
- pile: many small things fall into a container and pile up, to show load, volume or overflow. {kind:"pile", title?:"REQUESTS", bucket?:"SERVER", count?:5-120, shape?:"circle"|"rect", tone?:"mixed"|"gold"|"mint"|"red", caption?, say}
- phone: a phone screen shows a short conversation or notifications, for apps, messages and alerts. {kind:"phone", app:"Chat", messages:[{side:"in"|"out", text}] (1-5), caption?, say}
- hex: a map of hexagon cells with a few lit, for regions, zones, cells or sharding. {kind:"hex", columns?:3-7, rows?:2-6, lit?:[cell numbers], tags?:["Zone A"] (up to 3), caption?, say}
- closing: the takeaway. {kind:"closing", title, points?:[up to 3], cta?:"Follow for more", say}
"tone" is one of gold, mint, red, muted.`;

const imageGuide = '- media (drawn): a picture made by an image model fills a frame on the board. {kind:"media", prompt:"<one clear picture described plainly: subject, setting, style; no words, letters or logos>", title?:"large text", caption?, say}. Use at most two, and only where a picture shows the idea better than a diagram.';
const mediaGuide = (files: string[]) => `- media: a picture or video of the project fills a frame on the board. {kind:"media", src:"<one of the files below>", title?:"large text", caption?, credit?, say}\nAvailable media files (the only pictures and footage the video has; use each at most once): ${files.join(', ')}`;

const factsBlock = (facts: Fact[]) => `Facts you may use, each with its source and date. State no number, date or claim as fact unless it is here, and name the source in the scene's note (stat) or caption (chart), such as "World Bank, 2025":\n${facts.map((fact, i) => `[${i + 1}] ${fact.text} (${fact.source}${fact.date ? `, ${fact.date}` : ''})`).join('\n')}`;

export function explainerPrompt(brief: string, options: WriteExplainerOptions = {}): ChatMessage[] {
  const scenes = options.scenes ?? 5, language = options.language ?? 'English';
  const system = [
    'You write scripts for short vertical explainer videos: one idea, taught one scene at a time, with a spoken line over each scene.',
    `Reply with one JSON object and nothing else: {"version":"1.0","topic":"SHORT UPPER CASE TOPIC","scenes":[...]}${options.voice ? `, and "voice":"${options.voice}"` : ''}.`,
    [GUIDE, ...(options.media?.length ? [mediaGuide(options.media)] : []), ...(options.images ? [imageGuide] : [])].join('\n'),
    ...(options.facts?.length ? [factsBlock(options.facts)] : []),
    'Rules:',
    ...(options.media?.length || options.images ? [] : ['- Do not use a media scene: this video has no pictures or footage.']),
    `- About ${scenes} scenes. Start with a title and end with a closing. Use a kind only when it shows the idea better than another; use each kind at most twice. Use stat, chart and timeline only for numbers and events you know to be true; never invent figures.`,
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
      if (parsed.success) return { explainer: { ...parsed.data, ...(options.voice && !parsed.data.voice ? { voice: options.voice } : {}), ...(options.facts?.length ? { sources: options.facts } : {}) }, attempts: attempt };
      problems = parsed.error.issues.slice(0, 12).map(issue => `- ${issue.path.join('.') || 'script'}: ${issue.message}`).join('\n');
    } catch (error) {
      problems = `- ${(error as Error).message}`;
    }
    messages.push({ role: 'assistant', content: reply }, { role: 'user', content: `That script has problems:\n${problems}\nReply with the corrected JSON object only.` });
  }
  throw new Error(`The model's script could not be used after ${limit} attempts:\n${problems}`);
}

/** The length of a PCM WAV recording in seconds, read from its header (which is all the spoken lines need). */
export function wavSeconds(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), tag = (at: number) => String.fromCharCode(...bytes.slice(at, at + 4));
  if (bytes.length < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('That is not a WAV recording');
  let byteRate = 0;
  for (let at = 12; at + 8 <= bytes.length;) {
    const size = view.getUint32(at + 4, true);
    if (tag(at) === 'fmt ') byteRate = view.getUint32(at + 16, true);
    if (tag(at) === 'data') { if (!byteRate) break; return Math.min(size, bytes.length - at - 8) / byteRate; }
    at += 8 + size + (size % 2);
  }
  throw new Error('That WAV recording has no readable length');
}

/** Records a scene's line to `file`, or reuses the recording made earlier for the same words, voice and engine. */
export async function speakLine(text: string, voice: string | undefined, file: string, provider?: AiProvider, askedLanguage?: string, rate?: number): Promise<{ seconds: number; fresh: boolean }> {
  // A language written for the script ("Hinglish (Hindi in Latin letters)") is not one the on-device voice can be asked for: leave it to the voice.
  const language = provider?.speechEngine === 'indic' && askedLanguage && !indicLanguageFor(askedLanguage) ? undefined : askedLanguage;
  const stamp = createHash('sha1').update(`${provider?.speechEngine ?? 'edge'}\n${language ?? ''}\n${voice ?? ''}\n${rate ? `rate ${rate}\n` : ''}${text}`).digest('hex'), mark = `${file}.txt`;
  const same = await readFile(mark, 'utf8').then(saved => saved === stamp, () => false);
  if (same) { const bytes = await readFile(file).catch(() => undefined); if (bytes) return { seconds: wavSeconds(bytes), fresh: false }; }
  const speech = provider?.speak ? await provider.speak(text, { voice, language }) : await synthesizeEdgeSpeech(text, { voice, rate });
  if (!/wav/i.test(speech.extension)) throw new Error(`The voice answered with ${speech.extension} audio; only WAV is read here`);
  const bytes = Buffer.from(speech.data);
  await writeFile(file, bytes); await writeFile(mark, stamp);
  return { seconds: wavSeconds(bytes), fresh: true };
}
