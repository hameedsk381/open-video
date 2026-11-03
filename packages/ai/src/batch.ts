// Prompt-to-batch: one generated template, one video per row. Every row is resolved and every output path checked
// before the first render, so a bad row or a duplicate filename fails before spending time on video.
import { resolve } from 'node:path';
import { interpolate, prepareComposition, renderMedia, resolveVariables, variablesSchema, type Composition, type RenderMediaOptions } from '@ove/core';

export type BatchSettings = Pick<RenderMediaOptions, 'preset' | 'crf' | 'bitrate' | 'audioBitrate' | 'scale' | 'loudness' | 'format' | 'codec' | 'transparent' | 'concurrency' | 'motionBlur' | 'frameRange'>;

export type BatchJob = { row: number; values: Record<string, unknown>; composition: Composition; output: string };
export type BatchPlan = { jobs: BatchJob[] };

const fileSafe = (values: Record<string, unknown>) => Object.fromEntries(Object.entries(values).map(([key, value]) => [key,
  String(value).replace(/[\r\n\t]+/g, ' ').replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').trim()]));

export async function planBatch(composition: Composition, rows: Record<string, unknown>[], pattern: string, baseDir: string): Promise<BatchPlan> {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('The batch file must be a JSON array with at least one object of variable values');
  if (!/\{\{/.test(pattern)) throw new Error('The output pattern needs {{variables}} in it, e.g. "out/{{product}}.mp4", so each row gets its own file');
  const declarations = variablesSchema.parse(composition.variables);
  const jobs: BatchJob[] = [];
  for (const [index, row] of rows.entries()) {
    let values: Record<string, unknown>;
    try { values = resolveVariables(declarations, row); } catch (error) { throw new Error(`Row ${index + 1}: ${(error as Error).message}`); }
    let prepared: Composition;
    try { prepared = await prepareComposition(composition, row, baseDir); } catch (error) { throw new Error(`Row ${index + 1}: ${(error as Error).message}`); }
    jobs.push({ row: index, values, composition: prepared, output: resolve(interpolate(pattern, fileSafe(values))) });
  }
  const seen = new Map<string, number>();
  jobs.forEach((job, index) => {
    const first = seen.get(job.output);
    if (first !== undefined) throw new Error(`Rows ${first + 1} and ${index + 1} both write ${job.output}; make the output pattern depend on a variable that differs`);
    seen.set(job.output, index);
  });
  return { jobs };
}

export async function renderBatch(plan: BatchPlan, baseDir: string, settings: BatchSettings, options: { limit?: number; signal?: AbortSignal; onProgress?: (message: string) => void } = {}) {
  const jobs = options.limit ? plan.jobs.slice(0, options.limit) : plan.jobs;
  const outputs: string[] = [];
  for (const [index, job] of jobs.entries()) {
    options.onProgress?.(`[${index + 1}/${jobs.length}] ${job.output}`);
    const result = await renderMedia(job.composition, { ...settings, baseDir, output: job.output, signal: options.signal,
      onProgress: progress => { if (progress.rendered === progress.total || progress.rendered % 30 === 0) options.onProgress?.(`  ${progress.rendered}/${progress.total} frames`); } });
    outputs.push(result.output);
  }
  return { outputs };
}
