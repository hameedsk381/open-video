// The React route for AI composition: a brief the catalogue cannot serve is written by the same agent loop `mr agent`
// uses, then handed back as an ordinary composition so review, narration and rendering stay unchanged.
//
// Only the user's own machine may offer this route. The component runs its JavaScript inside the renderer, so a hosted
// worker that offered it would execute code a prompt chose.
import { readFile } from 'node:fs/promises';
import { loadComposition, renderStill, reviewComposition, type ReviewIssue } from '@ove/core';
import { runVideoAgent, type AiProvider, type BuildPlan, type ComposeOptions, type SmartMode, type SmartResult } from '@ove/ai';
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
    for (const fraction of [0.2, 0.5, 0.8]) {
      try { await renderStill(composition, { frame: Math.min(totalFrames - 1, Math.round(fraction * totalFrames)), baseDir, allowCode: true }); }
      catch { /* the review below reports why */ }
    }
    const review = await reviewComposition(composition, { baseDir, allowCode: true, audio: false });
    onReview?.(review.issues);
    const errors = review.issues.filter(issue => issue.severity === 'error');
    if (!errors.length) return { passed: true, report: '', sheet: review.sheet };
    return { passed: false, report: errors.map(issue => `${issue.code}: ${issue.message}`).join('\n'), sheet: review.sheet };
  };
}

/**
 * Writes a planned video as a React component and returns the composition it was built into. The plan is the planner's
 * first pass (idea, look, beats), which the direction stage refines, and a written script fixes the beats on top of
 * that. A failure throws, and the router writes a plain composition instead of losing the job.
 */
export async function reactFromPlan(provider: AiProvider, plan: BuildPlan, options: ComposeOptions, _mode: SmartMode): Promise<SmartResult> {
  if (!options.baseDir) throw new Error('React authoring needs a project folder to write the component into');
  let checked: ReviewIssue[] = [];
  const result = await runVideoAgent(provider, {
    brief: options.brief,
    dir: options.baseDir,
    // Resolve the format from the canvas actually planned: a 9:16 project is a reel even when the brief never says so.
    format: options.height >= options.width ? 'reel' : 'landscape',
    width: options.width, height: options.height,
    durationSeconds: options.durationSeconds, fps: options.fps,
    content: options.content || undefined,
    plan: { idea: plan.idea, look: plan.look, beats: plan.beats },
    onProgress: options.onProgress,
    signal: options.signal,
    visualCheck: reactVisualCheck(options.baseDir, issues => { checked = issues; }),
  }, buildReact);
  if (!result.composition) throw new Error('The React video was written but produced no composition');
  const issues = options.review ? checked : [];
  return {
    composition: result.composition,
    attempts: result.attempts,
    issues,
    warnings: issues.filter(issue => issue.severity === 'warning').map(issue => issue.message),
  };
}
