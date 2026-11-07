// The React route for AI composition: a brief the catalogue cannot serve is written by the same agent loop `mr agent`
// uses, then handed back as an ordinary composition so review, narration and rendering stay unchanged.
//
// Only the user's own machine may offer this route. The component runs its JavaScript inside the renderer, so a hosted
// worker that offered it would execute code a prompt chose.
import { readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { loadComposition, renderStill, reviewComposition, type ReviewIssue } from '@ove/core';
import { critiqueFrameNumbers, drawableBrand, runVideoAgent, type AiProvider, type BuildPlan, type ComposeOptions, type CritiqueFrame, type SmartMode, type SmartResult } from '@ove/ai';
import { buildReact } from './build';

type VisualCheck = (videoPath: string, compositionPath: string) => Promise<{ passed: boolean; report: string; sheet?: Buffer }>;

/**
 * Renders a few frames and runs the renderer's design review over a built React video, so the agent can repair one that
 * compiles but does not look right. `onReview` receives what the last check found.
 */
export function reactVisualCheck(baseDir: string, onReview?: (issues: ReviewIssue[]) => void): VisualCheck {
  return async (_videoPath, compositionPath) => {
    let raw: string;
    try { raw = await readFile(compositionPath, 'utf8'); } catch { return { passed: true, report: '' }; }
    const composition = loadComposition(JSON.parse(raw));
    const totalFrames = composition.durationFrames;
    // Four frames spread over the video. A video whose scenes all draw something never repeats a frame exactly; two identical frames
    // mean a stretch shows nothing new, which the layout review cannot see because there is no element to measure.
    const frames: { frame: number; png: Buffer }[] = [];
    for (const fraction of [0.15, 0.4, 0.65, 0.9]) {
      const frame = Math.min(totalFrames - 1, Math.round(fraction * totalFrames));
      try { frames.push({ frame, png: await renderStill(composition, { frame, baseDir, allowCode: true }) }); }
      catch { /* the review below reports why */ }
    }
    const review = await reviewComposition(composition, { baseDir, allowCode: true, audio: false });
    const found = [...review.issues];
    const repeated = frames.find((a, i) => frames.some((b, j) => j > i && a.png.equals(b.png)));
    if (repeated) {
      const twins = frames.filter(other => other.png.equals(repeated.png)).map(other => other.frame);
      found.push({ severity: 'error', code: 'frames-identical', message: `Frames ${twins.join(' and ')} are exactly the same, so part of the video shows nothing new (usually blank). Inside a <Sequence>, useCurrentFrame() counts from the start of that sequence, so an element that waits for an absolute start frame (such as 270) never appears: use frames relative to the sequence.` } as ReviewIssue);
    }
    onReview?.(found);
    const errors = found.filter(issue => issue.severity === 'error');
    if (!errors.length) return { passed: true, report: '', sheet: review.sheet };
    return { passed: false, report: errors.map(issue => `${issue.code}: ${issue.message}`).join('\n'), sheet: review.sheet };
  };
}

/**
 * Renders the stills the art director looks at: a settled moment in each scene (or evenly spread moments for a video that
 * is one scene). `OVE_AI_CRITIQUE=0` turns the pass off, for models that cannot read images or runs that must stay cheap.
 */
export function reactCritiqueFrames(baseDir: string): ((compositionPath: string) => Promise<CritiqueFrame[]>) | undefined {
  if (process.env.OVE_AI_CRITIQUE === '0') return undefined;
  return async compositionPath => {
    const composition = loadComposition(JSON.parse(await readFile(compositionPath, 'utf8')));
    const frames: CritiqueFrame[] = [];
    for (const { frame, label } of critiqueFrameNumbers(composition)) frames.push({ label, png: await renderStill(composition, { frame, baseDir, allowCode: true }) });
    return frames;
  };
}

/**
 * Writes a planned video as a React component and returns the composition it was built into. The plan is the planner's
 * first pass (idea, look, beats), which the direction stage refines, and a written script fixes the beats on top of
 * that. A failure throws, and the router writes a plain composition instead of losing the job.
 */
export async function reactFromPlan(provider: AiProvider, plan: BuildPlan, options: ComposeOptions, _mode: SmartMode): Promise<SmartResult> {
  if (!options.baseDir) throw new Error('React authoring needs a project folder to write the component into');
  const baseDir = options.baseDir;
  const before = new Set(await readdir(baseDir).catch(() => [] as string[]));
  let checked: ReviewIssue[] = [];
  // A failed attempt must leave the folder as it found it: the router writes a plain composition there next, and that
  // refuses a folder that already holds files. Only what this attempt created is removed.
  const tidy = async () => { for (const name of await readdir(baseDir).catch(() => [] as string[])) if (!before.has(name)) await rm(join(baseDir, name), { recursive: true, force: true }); };
  let result: Awaited<ReturnType<typeof runVideoAgent>>;
  try { result = await runVideoAgent(provider, {
    brief: options.brief,
    dir: options.baseDir,
    // Resolve the format from the canvas actually planned: a 9:16 project is a reel even when the brief never says so.
    format: options.height >= options.width ? 'reel' : 'landscape',
    width: options.width, height: options.height,
    durationSeconds: options.durationSeconds, fps: options.fps,
    content: options.content || undefined,
    brand: drawableBrand(options.brand),
    plan: { idea: plan.idea, look: plan.look, beats: plan.beats },
    onProgress: options.onProgress,
    signal: options.signal,
    visualCheck: reactVisualCheck(options.baseDir, issues => { checked = issues; }),
    critiqueFrames: reactCritiqueFrames(options.baseDir),
  }, buildReact); } catch (error) { await tidy(); throw error; }
  if (!result.composition) { await tidy(); throw new Error('The React video was written but produced no composition'); }
  const issues = options.review ? checked : [];
  // An art director's notes that were never resolved travel with the result, so no surface presents the video as approved.
  const notes = result.critique && !result.critique.ready ? result.critique.problems.map(problem => `Art director: ${problem}`) : [];
  return {
    composition: result.composition,
    attempts: result.attempts,
    issues,
    warnings: [...issues.filter(issue => issue.severity === 'warning').map(issue => issue.message), ...notes],
  };
}
