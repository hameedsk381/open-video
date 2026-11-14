// `mr make`: the whole check-and-build loop in one call, for agents and people who would otherwise run validate, compile, still, review and
// render one after another. It reads either an explainer script or a composition, validates it, builds it, runs the design review and writes
// one contact sheet of the whole video, and (only when asked) renders it, as a quick draft or at full quality. Every problem comes back in one
// report with where it is, so one fix and one more call is the usual loop.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { explainerSchema, type Explainer } from '@ove/schema';
import { defaultConcurrency, loadComposition, renderMedia, reviewComposition, type Composition, type ReviewIssue } from '@ove/core';
import { buildExplainer } from './explainer';

export type MakeRender = 'draft' | 'final';
export type MakeOptions = {
  /** An explainer script or a composition. */ file: string;
  /** Render an MP4 after the checks: a quick draft (half size, fast encode) or the full-quality video. Default: no render. */ render?: MakeRender;
  /** The video file (default: draft.mp4 or out.mp4 beside the input). */ output?: string;
  /** Contact sheet path (default: review.png beside the input). */ sheet?: string;
  /** Record the explainer's spoken lines (default true). Without it scenes are as long as their pictures need and the video is silent. */ voice?: boolean;
  voiceName?: string;
  /** Run React, code and p5 layers while checking and rendering (only for files you trust). */ allowCode?: boolean;
  /** Check every Nth frame instead of the default spacing (a larger number is faster and less thorough). */ every?: number;
  log?: (message: string) => void;
};
export type MakeResult = {
  ok: boolean;
  kind: 'explainer' | 'composition';
  /** Problems that stopped the build, with their paths. Empty when the file was built. */ problems: string[];
  composition?: string;
  summary?: { scenes: number; seconds: number; width: number; height: number; fps: number; spoken?: number };
  review?: { sheet: string; sheetFrames: number[]; errors: ReviewIssue[]; warnings: ReviewIssue[]; notes: ReviewIssue[]; loudness?: { integrated: number; truePeak: number } };
  video?: { output: string; draft: boolean; seconds: number; frames: number; renderSeconds: number };
  notes: string[];
  timings: Record<string, number>;
  next: string[];
};

const hasCodeLayers = (composition: Composition) => composition.scenes.some(scene => scene.layers.some(layer => layer.type === 'react' || layer.type === 'code' || layer.type === 'p5'));
const readJson = async (file: string) => JSON.parse((await readFile(file, 'utf8')).replace(/^﻿/, ''));
const seconds = (since: number) => Math.round((Date.now() - since) / 100) / 10;

/** An explainer script has a `topic` (the example script from `explainer example` carries a `version` too); a composition has a `version` and no `topic`. */
export const kindOfFile = (raw: any): 'explainer' | 'composition' => (raw && typeof raw === 'object' && 'version' in raw && !('topic' in raw) ? 'composition' : 'explainer');

/** What the draft render changes: half the size, a fast encode, no motion blur. It is for checking how the video moves, not for sending. */
export const draftSettings = { scale: 0.5, preset: 'ultrafast' as const, crf: 32, motionBlur: false };

export async function makeVideo(options: MakeOptions): Promise<MakeResult> {
  const log = options.log ?? (() => {}), file = resolve(options.file), dir = dirname(file), timings: Record<string, number> = {}, notes: string[] = [];
  let started = Date.now();
  const raw = await readJson(file), kind = kindOfFile(raw);
  const fail = (problems: string[]): MakeResult => ({ ok: false, kind, problems, notes, timings, next: ['Fix the problems listed and run make again.'] });

  // 1. Check and build.
  let compositionPath = file, composition: Composition, spoken: number | undefined;
  if (kind === 'explainer') {
    const parsed = explainerSchema.safeParse(raw);
    if (!parsed.success) return fail(parsed.error.issues.map(issue => `${issue.path.join('.') || 'script'}: ${issue.message}`));
    log('Building the video…');
    let built;
    try { built = await buildExplainer(parsed.data as Explainer, { output: join(dir, 'composition.json'), voice: options.voice !== false, voiceName: options.voiceName, log }); }
    catch (error) { return fail([(error as Error).message]); }
    compositionPath = built.output; spoken = built.spoken; notes.push(...built.notes);
    composition = loadComposition(await readJson(compositionPath));
  } else {
    try { composition = loadComposition(raw); }
    catch (error) { return fail([(error as Error).message]); }
  }
  timings.build = seconds(started);
  const baseDir = dirname(compositionPath), allowCode = options.allowCode === true;
  if (hasCodeLayers(composition) && !allowCode) return fail(['This composition has react, code or p5 layers, which run JavaScript while checking and rendering. Run make again with allowCode (--allow-code) if you trust the file.']);
  const summary = { scenes: composition.scenes.filter(scene => scene.id !== 'overlay').length, seconds: Math.round((composition.durationFrames / composition.fps) * 10) / 10, width: composition.width, height: composition.height, fps: composition.fps, ...(spoken === undefined ? {} : { spoken }) };

  // 2. Review: automated checks and one contact sheet of the whole video.
  started = Date.now();
  log('Checking the design and drawing the contact sheet…');
  const reviewed = await reviewComposition(composition, { baseDir, allowCode, every: options.every });
  const sheet = resolve(options.sheet ?? join(baseDir, 'review.png'));
  await writeFile(sheet, reviewed.sheet);
  timings.review = seconds(started);
  const bySeverity = (severity: ReviewIssue['severity']) => reviewed.issues.filter(issue => issue.severity === severity);
  const review = { sheet, sheetFrames: reviewed.sheetFrames, errors: bySeverity('error'), warnings: bySeverity('warning'), notes: bySeverity('info'), loudness: reviewed.loudness };
  const clean = review.errors.length === 0;

  // 3. Render, only when asked, and not over unresolved errors.
  let video: MakeResult['video'];
  if (options.render && clean) {
    started = Date.now();
    const draft = options.render === 'draft', output = resolve(options.output ?? join(baseDir, draft ? 'draft.mp4' : 'out.mp4'));
    log(draft ? 'Rendering a quick draft…' : 'Rendering the final video…');
    const rendered = await renderMedia(composition, { baseDir, output, allowCode, concurrency: defaultConcurrency(), ...(draft ? draftSettings : {}) });
    timings.render = seconds(started);
    video = { output: rendered.output, draft, seconds: rendered.durationSeconds, frames: rendered.frames, renderSeconds: timings.render };
  } else if (options.render) notes.push('Not rendered: the review found errors. Fix them first.');

  const rel = (path: string) => path;
  const next: string[] = [];
  if (!clean) next.push('Fix the review errors (see "errors"), then run make again.');
  else if (!video) next.push(`Look at the contact sheet (${rel(sheet)}) to check the whole video, then run make again with render "draft" to see it move, or "final" for the finished video.`);
  else if (video.draft) next.push('If the draft moves the way you want, run make again with render "final".');
  return { ok: clean, kind, problems: [], composition: compositionPath, summary, review, video, notes, timings, next };
}

/** The report as text, short enough to read in one go: what was built, what is wrong, where the files are. */
export function makeReport(result: MakeResult): string {
  const lines: string[] = [];
  if (!result.ok && result.problems.length) {
    lines.push(`Could not build the ${result.kind}:`, ...result.problems.map(problem => `- ${problem}`), '', ...result.next);
    return lines.join('\n');
  }
  const s = result.summary!;
  lines.push(`${result.ok ? 'Built' : 'Built, with errors'}: ${result.composition} (${s.scenes} scene${s.scenes === 1 ? '' : 's'}, ${s.seconds} s, ${s.width}x${s.height}${s.spoken === undefined ? '' : `, ${s.spoken} spoken line${s.spoken === 1 ? '' : 's'}`})`);
  const r = result.review!;
  lines.push(`Review: ${r.errors.length} error${r.errors.length === 1 ? '' : 's'}, ${r.warnings.length} warning${r.warnings.length === 1 ? '' : 's'}, ${r.notes.length} note${r.notes.length === 1 ? '' : 's'}. Contact sheet of the whole video: ${r.sheet}`);
  const show = (issue: ReviewIssue, label: string) => `  ${label} ${issue.frame === undefined ? '' : `frame ${issue.frame}: `}${issue.message}${issue.layer ? ` [${issue.layer}]` : ''}`;
  for (const issue of r.errors) lines.push(show(issue, 'ERROR'));
  for (const issue of r.warnings.slice(0, 8)) lines.push(show(issue, 'warn '));
  if (r.warnings.length > 8) lines.push(`  …and ${r.warnings.length - 8} more warnings`);
  for (const note of result.notes) lines.push(`Note: ${note}`);
  if (result.video) lines.push(`${result.video.draft ? 'Draft video' : 'Video'}: ${result.video.output} (${result.video.seconds.toFixed(1)} s, rendered in ${result.video.renderSeconds} s)`);
  lines.push(`Time: ${Object.entries(result.timings).map(([step, took]) => `${step} ${took} s`).join(', ')}`);
  lines.push('', ...result.next);
  return lines.join('\n');
}
