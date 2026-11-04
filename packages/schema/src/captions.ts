import { z } from 'zod';
// Captions: timed lines of text, optionally with the timing of each word so the spoken word can be highlighted. Times are seconds
// from the start of the captions layer (usually the start of the narration clip they belong to).
export const captionWordSchema = z.object({ text: z.string(), start: z.number().nonnegative(), end: z.number().nonnegative() });
export const captionCueSchema = z.object({ text: z.string(), start: z.number().nonnegative(), end: z.number().nonnegative(), words: z.array(captionWordSchema).optional() });
export type CaptionWord = z.infer<typeof captionWordSchema>; export type CaptionCue = z.infer<typeof captionCueSchema>;
const clock = (value: string) => { const m = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})$/.exec(value.trim()); if (!m) throw new Error(`Bad caption time "${value}"`); return Number(m[1] ?? 0)*3600 + Number(m[2])*60 + Number(m[3]) + Number(m[4]!.padEnd(3, '0'))/1000; };
// SRT and WebVTT: blocks of "start --> end" followed by text lines. Formatting tags are dropped; VTT headers, notes and styles are skipped.
function parseTimedText(text: string): CaptionCue[] { const cues: CaptionCue[] = [];
  for (const block of text.replace(/\r/g, '').split(/\n{2,}/)) { const lines = block.split('\n').filter(l => l.trim()); const at = lines.findIndex(l => l.includes('-->')); if (at < 0) continue;
    const [from, to] = lines[at]!.split('-->').map(s => s.trim().split(/\s+/)[0]!); const body = lines.slice(at + 1).join(' ').replace(/<[^>]+>/g, '').replace(/\{[^}]+\}/g, '').trim();
    if (body) cues.push({ text: body, start: clock(from!), end: clock(to!) }); } return cues; }
// Turns timed words into lines: a line ends after a sentence (. ! ?), after a comma, semicolon or colon once it has 3 words (phrases
// read better than word counts), at a pause longer than 0.35 s, or at maxWords words. Word timings that run each word up to the next
// (as text-to-speech engines report them) have no pauses, so punctuation does most of the work.
export function groupCaptionWords(words: CaptionWord[], maxWords = 7): CaptionCue[] { const cues: CaptionCue[] = []; let line: CaptionWord[] = [];
  const flush = () => { if (line.length) cues.push({ text: line.map(w => w.text).join(' '), start: line[0]!.start, end: line[line.length-1]!.end, words: line }); line = []; };
  words.forEach((word, i) => { line.push(word); const next = words[i+1];
    if (!next || /[.!?]["')\]]?$/.test(word.text) || (/[,;:]["')\]]?$/.test(word.text) && line.length >= 3) || next.start - word.end > 0.35 || line.length >= maxWords) flush(); }); return cues; }
// Accepts SRT, WebVTT or JSON: { "words": [...] }, { "cues": [...] }, or a bare array of either. `name` (a file name) picks the format
// when the text alone is ambiguous.
export function parseCaptions(text: string, name = '', maxWords = 7): CaptionCue[] { const trimmed = text.trim().replace(/^﻿/, '');
  if (/\.json$/i.test(name) || trimmed.startsWith('{') || trimmed.startsWith('[')) { const data = JSON.parse(trimmed); const list = Array.isArray(data) ? data : data.cues ?? data.words;
    if (!Array.isArray(list)) throw new Error('Caption JSON needs "words" or "cues" (or a list of them)');
    const isWords = !Array.isArray(data) ? !!data.words && !data.cues : list.every((item: any) => typeof item?.text === 'string' && !/\s/.test(item.text.trim()));
    return isWords ? groupCaptionWords(z.array(captionWordSchema).parse(list), maxWords) : z.array(captionCueSchema).parse(list); }
  return parseTimedText(trimmed); }
const stamp = (seconds: number, separator: string) => { const ms = Math.max(0, Math.round(seconds*1000)); const h = Math.floor(ms/3600000), m = Math.floor(ms/60000)%60, s = Math.floor(ms/1000)%60; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}${separator}${String(ms%1000).padStart(3,'0')}`; };
export function formatCaptions(cues: CaptionCue[], format: 'srt' | 'vtt'): string { const body = cues.map((cue, i) => `${format === 'srt' ? `${i+1}\n` : ''}${stamp(cue.start, format === 'srt' ? ',' : '.')} --> ${stamp(cue.end, format === 'srt' ? ',' : '.')}\n${cue.text}`).join('\n\n');
  return (format === 'vtt' ? 'WEBVTT\n\n' : '') + body + '\n'; }
// The lines a captions layer shows: lines from a file are used as they are; word timings are grouped by maxWords.
// Filler words and stutters: dropped from word timings (and from plain cue text) when a captions layer has dropFillers.
const fillers = new Set(['um','umm','uh','uhh','uhm','er','erm','ah','ahh','hmm','mm','mhm']); export { fillers }; export const captionKey = (word: string) => word.toLowerCase().replace(/[^\p{L}\p{N}']+/gu, '');
export function dropFillerWords(cues: CaptionCue[]): CaptionCue[] { return cues.map(cue => { if (cue.words?.length) { const words = cue.words.filter((w, i, all) => { const k = captionKey(w.text); return k !== '' && !fillers.has(k) && !(i > 0 && captionKey(all[i-1]!.text) === k && !/[.,!?;:]$/.test(all[i-1]!.text)); });
    return { ...cue, words, text: words.map(w => w.text).join(' ') }; } return { ...cue, text: cue.text.split(/\s+/).filter(w => !fillers.has(captionKey(w))).join(' ') }; }).filter(cue => cue.text.trim() !== ''); }
export const captionLines = (cues: CaptionCue[], maxWords: number): CaptionCue[] => cues.flatMap(cue => cue.words && cue.words.length > maxWords ? groupCaptionWords(cue.words, maxWords) : [cue]);
