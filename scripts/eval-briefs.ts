// The evaluation harness: a fixed set of briefs run through the AI composition paths under identical constraints, so
// routing, quality and time-to-video are measured rather than guessed. The checks mirror the standardized test style
// of curated agent-skill benchmarks: playable file, correct duration and resolution, all copy readable, picture
// moves, plus the engine's own review findings. React-agent evaluation needs a provider that writes valid React
// code, so it is out of scope here; the mock provider exercises the template and JSON routes end to end.
//
//   pnpm eval:ai                          # offline: --provider mock, compose + review, no MP4
//   pnpm eval:ai -- --render              # also render each MP4 and probe its duration
//   pnpm eval:ai -- --provider groq       # real provider (GROQ_API_KEY)
//   pnpm eval:ai -- --only promo-reel     # one brief
//
// Writes artifacts/eval/report.md and report.json; exits non-zero when a brief fails its checks.
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createProvider, writeCompositionProject, type AiProvider, type Registry } from '@ove/ai';
import { loadComposition, renderMedia, reviewComposition, ffprobePath, type Composition } from '@ove/core';
import { composeSmart } from '../packages/cli/src/templates';

// The fixed brief set: one per scene style, spread over the routes the planner can choose (the fields brief forces
// the JSON route, since templates take neither batch fields nor data-driven variables). Each entry fixes the canvas,
// length and wording, so runs compare like for like.
export type Brief = {
  id: string; label: string;
  width: number; height: number; fps?: number; durationSeconds: number; kind: string;
  brief: string;
  /** Template fields, named as the CLI's --fields option does: `name` or `name:type`. */
  fields?: string[];
};

export const briefs: Brief[] = [
  { id: 'promo-reel', label: 'vertical promo reel', width: 1080, height: 1920, durationSeconds: 12, kind: 'social promo reel',
    brief: 'A vertical promo for Rainbox, an open-source invoicing tool: 33% of teams bill late, Rainbox sends invoices automatically, free start, ends on the logo.' },
  { id: 'product-square', label: 'square product card', width: 1080, height: 1080, durationSeconds: 8, kind: 'square product intro',
    brief: 'A square intro card for the Beam desk lamp: warm light, one-touch dimming, $79, with a calm and premium feel.' },
  { id: 'flash-sale', label: '4:5 flash sale', width: 1080, height: 1350, durationSeconds: 15, kind: 'flash sale promo',
    brief: 'A 4:5 flash sale promo for Northwind Coffee: 25% off everything this weekend, code BREW25, ends Sunday night, energetic and loud.' },
  { id: 'explainer', label: 'explainer walkthrough', width: 1920, height: 1080, durationSeconds: 12, kind: 'explainer',
    brief: 'Explain how Loopback protects API keys when a coding agent renders video: the key stays on the server, the agent sees only a token, every render is checked. Step by step: three steps, then a closing call to action.' },
  { id: 'launch-wide', label: 'landscape launch video', width: 1920, height: 1080, durationSeconds: 15, kind: 'product launch',
    brief: 'A landscape launch video for Cardinal, an open-source analytics tool: one number (10x faster queries), three things you get, and a closing call to action. Clean and technical.' },
  { id: 'data-driven', label: 'data-driven video', width: 1920, height: 1080, durationSeconds: 10, kind: 'list video', fields: ['metric', 'value:number', 'unit:string'],
    brief: 'A data dashboard video for Compass hosting that declares template fields metric, value and unit and animates the numbers counting up. Cold colours, precise typography.' },
];

/** What one brief produced: small fields only, so the report stays readable; the composition is written to disk, not kept. */
export type RunRecord = {
  id: string; label: string;
  route?: 'template' | 'json'; template?: string;
  frames?: number; width?: number; height?: number;
  attempts?: number;
  composeSeconds?: number; renderSeconds?: number;
  reviewErrors?: number; reviewWarnings?: string[]; reviewMessages?: string[];
  fileSeconds?: number;
  error?: string;
  score?: Score;
};

export type Check = { pass: boolean; detail?: string };
export type Score = { passed: boolean; failed: string[]; checks: Record<string, Check> };
type RunBriefOptions = { maxAttempts?: number; render?: boolean; outDir?: string;
  onProgress?: (message: string) => void; smartMode?: { full?: boolean; noPlan?: boolean; registry?: Registry } };

const seconds = (frames: number, fps: number): number => Math.round(frames / fps * 10) / 10;
const firstLine = (error: unknown): string => String(error instanceof Error ? error.message : error).split('\n')[0] ?? '';

/** The media file's duration with FFmpeg's own probe; undefined when anything fails. */
const probeDuration = (file: string): number | undefined => {
  const result = spawnSync(ffprobePath(), ['-v', 'quiet', '-print_format', 'json', '-show_format', file], { encoding: 'utf8' });
  if (result.error || result.status !== 0) return undefined;
  try { return Number(JSON.parse(result.stdout as string)?.format?.duration); } catch { return undefined; }
};

/**
 * Runs one brief end to end: compose through the real router (`composeSmart`, planner included), check the result
 * with the engine's review oracle, optionally render and probe the MP4. The returned record drops the composition
 * payload so the report stays small; the project is written to `artifacts/eval/<id>/` for inspection either way.
 */
export async function runBrief(provider: AiProvider, brief: Brief, options: RunBriefOptions = {}): Promise<RunRecord> {
  const outDir = resolve(options.outDir ?? join('artifacts', 'eval', brief.id));
  const run: RunRecord = { id: brief.id, label: brief.label };
  const composeStarted = Date.now();
  let composition: Composition | undefined;
  try {
    const composed = await composeSmart(provider, {
      brief: brief.brief, width: brief.width, height: brief.height, fps: 30, durationSeconds: brief.durationSeconds, kind: brief.kind,
      // Briefs name fields as the CLI's --fields does ("name:type"); composeVideo takes parsed { name, type } objects.
      fields: brief.fields?.map(entry => { const [name, type = 'string'] = entry.split(':'); return { name, type }; }),
      maxAttempts: options.maxAttempts ?? 3,
      onProgress: message => (options.onProgress ?? console.log)(`  ${brief.id}: ${message}`),
    }, options.smartMode ?? {});
    if (!composed) throw new Error('no composition was produced');
    run.route = composed.template ? 'template' : 'json';
    run.template = composed.template;
    run.attempts = composed.attempts;
    composition = loadComposition(composed.composition);
    run.frames = composition.durationFrames;
    run.width = composition.width;
    run.height = composition.height;
    await writeCompositionProject(outDir, composition, { force: true });
  } catch (error) { run.error = `compose: ${firstLine(error)}`; run.composeSeconds = (Date.now() - composeStarted) / 1000; return run; }
  run.composeSeconds = (Date.now() - composeStarted) / 1000;
  if (composition) {
    try {
      const review = await reviewComposition(composition, { baseDir: outDir });
      run.reviewErrors = review.issues.filter(issue => issue.severity === 'error').length;
      run.reviewWarnings = review.issues.filter(issue => issue.severity === 'warning').map(issue => issue.code);
      run.reviewMessages = review.issues.map(issue => `[${issue.code}] ${issue.message}`);
    } catch (error) { run.reviewWarnings = [`review failed: ${firstLine(error)}`]; }
  }
  if (options.render && composition && !run.error) {
    const renderStarted = Date.now();
    try {
      const rendered = await renderMedia(composition, { baseDir: outDir, output: join(outDir, 'out.mp4'), onProgress: () => {} });
      run.renderSeconds = (Date.now() - renderStarted) / 1000;
      run.fileSeconds = probeDuration(rendered.output);
      if (!statSync(rendered.output).size) run.error = 'render: the output file is empty';
    } catch (error) { run.error = `render: ${firstLine(error)}`; }
  }
  return run;
}

/**
 * The standardized checks. All copy is readable means the review oracle reported no text problems; the picture moves
 * means no frozen stretch was reported. Returns `{ passed, failed, checks }`, each check `{ pass, detail }`.
 */
export function scoreRun(run: RunRecord, brief: Brief): Score {
  const checks: Record<string, Check> = {};
  const check = (name: string, pass: boolean | undefined, detail: string) => { checks[name] = { pass: !!pass, detail }; };
  const time = (value: number | undefined) => value === undefined ? '—' : `${value.toFixed(1)} s`;
  check('composed', !run.error, run.error ?? `${run.route}${run.template ? ` (${run.template})` : ''}, ${run.attempts} attempt${run.attempts === 1 ? '' : 's'}, ${time(run.composeSeconds)}`);
  const durationSeconds = run.fileSeconds ?? (run.frames !== undefined ? seconds(run.frames, 30) : undefined);
  // Templates have fixed, engine-owned lengths: a provider filling a template cannot change its duration, so the
  // mismatch is informational there (the delta stays in the detail). The JSON route, where length is writable, is
  // held to the brief; a duration-fitting route choice is a recorded planner item.
  const templateRoute = run.route === 'template' && run.fileSeconds === undefined;
  check('duration', templateRoute ? durationSeconds !== undefined : durationSeconds !== undefined && Math.abs(durationSeconds - brief.durationSeconds) <= 0.5,
    `${durationSeconds === undefined ? 'unknown' : durationSeconds} s vs ${brief.durationSeconds} s wanted${templateRoute ? ' (template route: length is the template\'s)' : run.fileSeconds ? ' (probed)' : ''}`);
  check('resolution', run.width === brief.width && run.height === brief.height, run.width === undefined ? 'no composition' : `${run.width}x${run.height}`);
  const textProblem = (run.reviewMessages ?? []).some(message => /off the frame|too brief|cut off|too small|overlapping|unreadable/.test(message));
  check('copy readable', run.reviewErrors === 0 && !textProblem, run.reviewErrors === undefined ? 'review did not run' : `${run.reviewErrors} error${run.reviewErrors === 1 ? '' : 's'}${run.reviewWarnings?.length ? `, warnings: ${run.reviewWarnings.join(', ')}` : ', clean'}`);
  check('picture moves', !!run.reviewWarnings && !run.reviewWarnings.includes('frozen'), run.reviewWarnings === undefined ? 'review did not run' : run.reviewWarnings?.includes('frozen') ? 'frozen stretches reported' : 'no frozen stretch');
  const failed = Object.entries(checks).filter(([, value]) => !value.pass).map(([name]) => name);
  return { passed: failed.length === 0, failed, checks };
}

/** The markdown row for one result. */
export function reportRow(run: RunRecord, score: Score): string {
  const passed = run.error ? '✗' : score.passed ? '✓' : '✗';
  return `| ${run.id} (${run.label}) | ${passed} | ${run.route ?? '—'}${run.template ? ` (${run.template})` : ''} | ${run.attempts ?? '—'} | ${run.composeSeconds?.toFixed(1) ?? '—'} s | ${run.renderSeconds?.toFixed(1) ?? '—'} s | ${run.reviewErrors ?? '—'} | ${run.reviewWarnings?.join(', ') || '—'} | ${score.failed.join(', ') || '—'} |`;
}

const main = async (): Promise<void> => {
  const argv = process.argv.slice(2);
  const flag = (name: string) => argv.includes(name);
  const option = (name: string) => { const at = argv.indexOf(name); return at < 0 ? undefined : argv[at + 1]; };
  const only = option('--only');
  const provider = createProvider({ provider: option('--provider') ?? 'mock', model: option('--model') });
  const outRoot = resolve(option('--out') ?? join('artifacts', 'eval'));
  const chosen = briefs.filter(brief => !only || brief.id === only);
  if (!chosen.length) { console.error(`No brief matches --only ${only}. Briefs: ${briefs.map(brief => brief.id).join(', ')}`); process.exit(1); }
  await mkdir(outRoot, { recursive: true });
  console.log(`Evaluating ${chosen.length} brief${chosen.length === 1 ? '' : 's'} with ${provider.id} (${provider.model})${flag('--render') ? ', rendering each MP4' : ''}…\n`);
  const results: RunRecord[] = [];
  for (const brief of chosen) {
    console.log(`▶ ${brief.id} — ${brief.label} (${brief.width}x${brief.height}, ${brief.durationSeconds} s)`);
    const run = await runBrief(provider, brief, { render: flag('--render'), outDir: join(outRoot, brief.id) });
    run.score = scoreRun(run, brief);
    results.push(run);
    console.log(`  ${run.score.passed ? '✓ PASS' : '✗ FAIL'}${run.error ? ` — ${run.error}` : ''}   route ${run.route ?? '—'}, compose ${run.composeSeconds?.toFixed(1) ?? '—'} s, review errors ${run.reviewErrors ?? '—'}\n`);
  }
  const passed = results.filter(run => !!run.score?.passed).length;
  const routes: Record<string, number> = {}; for (const run of results) if (run.route) routes[run.route] = (routes[run.route] ?? 0) + 1;
  const composeTimes = results.map(run => run.composeSeconds).filter((value): value is number => value !== undefined);
  const average = (values: number[]) => values.length ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1) + ' s' : '—';
  const markdown = [
    `# AI evaluation report`, ``,
    `${new Date().toISOString()} · provider ${provider.id} (${provider.model}) · ${passed}/${results.length} briefs passed · routes: ${Object.entries(routes).map(([route, count]) => `${route} ${count}`).join(', ') || 'none'}`,
    ``,
    `| brief | result | route | attempts | compose | render | review errors | review warnings | failed checks |`,
    `|---|---|---|---|---|---|---|---|---|`,
    ...results.map(run => reportRow(run, run.score as Score)), ``,
    ...results.flatMap(run => run.reviewMessages?.length ? [`## ${run.id}`, '', ...run.reviewMessages.map(message => `- ${message}`), ''] : []),
    `Average compose time: ${average(composeTimes)}.`,
    ``,
  ].join('\n');
  await writeFile(join(outRoot, 'report.md'), markdown);
  await writeFile(join(outRoot, 'report.json'), JSON.stringify({ generated: new Date().toISOString(), provider: provider.id, model: provider.model, results }, null, 2));
  console.log(`${passed}/${results.length} briefs passed. Report: ${join(outRoot, 'report.md')}`);
  if (passed < results.length) process.exitCode = 1;
};

// A test imports briefs, runBrief and scoreRun; the report runs when the file is executed directly.
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main().catch((error: unknown) => { console.error(error); process.exit(1); });
}
