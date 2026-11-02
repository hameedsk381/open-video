// `ove review`: renders sample frames of a composition and checks them for the mistakes that make a video look unfinished: text cut off,
// off the frame, overlapping or too small; a busy frame; too many type sizes or text colours; long stretches where nothing moves;
// scenes of identical length; mixed transition styles; and, when there is sound, loudness. It also makes a contact sheet.
// The checks are leads for a person or agent looking at the sheet, not a verdict on taste.
import type { Composition } from '@ove/schema'; import { createRenderer, defaultConcurrency } from '@ove/renderer'; import type { FrameReport, TextNote } from '@ove/graphics'; import { measureLoudness } from './audio';
export type ReviewIssue = { severity: 'error' | 'warning' | 'info'; code: string; message: string; frame?: number; layer?: string };
export type ReviewResult = { issues: ReviewIssue[]; sheet: Buffer; sheetFrames: number[]; sampledFrames: number; loudness?: { integrated: number; truePeak: number } };
export type ReviewOptions = { baseDir?: string; every?: number; sheetFrames?: number; columns?: number; concurrency?: number; audio?: boolean; onProgress?: (done: number, total: number) => void };

const area = (a: TextNote) => Math.max(0, a.x1 - a.x0) * Math.max(0, a.y1 - a.y0);
const overlap = (a: TextNote, b: TextNote) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
const seconds = (frame: number, fps: number) => `${(frame/fps).toFixed(1)} s`;

export async function reviewComposition(composition: Composition, options: ReviewOptions = {}): Promise<ReviewResult> { const { fps, width, height, durationFrames }=composition, baseDir=options.baseDir ?? process.cwd();
  const every=Math.max(1, Math.round(options.every ?? fps/2)), frames: number[]=[]; for (let f=0; f < durationFrames; f+=every) frames.push(f); if (frames.at(-1) !== durationFrames-1) frames.push(durationFrames-1);
  const sheetCount=Math.max(1, Math.min(options.sheetFrames ?? 20, durationFrames)), sheetFrames=Array.from({ length: sheetCount }, (_, i) => Math.min(durationFrames-1, Math.round((i+0.5)*durationFrames/sheetCount)));
  const renderer=await createRenderer(composition, { baseDir, concurrency: options.concurrency ?? defaultConcurrency(), scale: Math.min(1, 1280/Math.max(width, height)) });
  let reports: FrameReport[]=[], sheet: Buffer; try { let done=0; reports=await Promise.all(frames.map(f => renderer.inspectFrame(f).then(r => { options.onProgress?.(++done, frames.length); return r; })));
    sheet=await renderer.contactSheet(sheetFrames, { columns: options.columns ?? (width >= height ? 4 : 6) }); } finally { await renderer.close(); }
  const issues: ReviewIssue[]=[], minSide=Math.min(width, height), visible=(t: TextNote) => t.alpha >= 0.95;
  // Problems that last: a layer reported once per kind, at the first sampled frame, and only when it holds for at least `hold` samples
  // in a row (so things sliding in from off-frame, or crossing during a transition, are not flagged).
  const persistent=(code: string, hold: number, test: (t: TextNote, report: FrameReport) => string | undefined, severity: ReviewIssue['severity']) => { const runs=new Map<string, { start: number; count: number; message: string }>(), reported=new Set<string>();
    reports.forEach((report, i) => { const seen=new Set<string>(); for (const t of report.texts) { const message=test(t, report); if (!message) continue; const key=`${t.id}|${message}`; seen.add(key); const run=runs.get(key) ?? { start: frames[i]!, count: 0, message }; run.count++; runs.set(key, run);
        if (run.count >= hold && !reported.has(`${t.id}|${t.text}`)) { reported.add(`${t.id}|${t.text}`); issues.push({ severity, code, message, frame: run.start, layer: t.id }); } }
      for (const key of runs.keys()) if (!seen.has(key)) runs.delete(key); }); };
  // A second of samples: long enough to skip entrances (scale-ins, slides from off-frame) and transitions, where layers pass through
  // tiny sizes and over each other on purpose.
  const hold=Math.max(2, Math.ceil(fps/every)+1), margin=0.01*minSide, smallest=minSide*0.018;
  persistent('text-cut', 1, t => t.truncated ? `"${t.text}" is cut short with "…": give it more room (maxWidth/maxLines) or a minFontSize` : undefined, 'error');
  persistent('off-frame', hold, t => visible(t) && (t.x0 < -margin || t.y0 < -margin || t.x1 > width+margin || t.y1 > height+margin) ? `"${t.text}" runs off the frame` : undefined, 'error');
  persistent('small-text', hold, t => visible(t) && t.size < smallest ? `"${t.text}" is ${Math.round(t.size)} px, too small to read on a phone (labels ${Math.ceil(smallest)}+ px, body ${Math.round(minSide*0.024)}+ px)` : undefined, 'warning');
  persistent('overlap', hold, (t, report) => { if (!visible(t)) return; const other=report.texts.find(o => o !== t && o.id !== t.id && visible(o) && overlap(t, o) > 0.15*Math.min(area(t), area(o)) && (t.kind === 'captions' || o.kind === 'captions' || t.id < o.id));
    return other ? (t.kind === 'captions' || other.kind === 'captions' ? `"${(t.kind === 'captions' ? other : t).text}" sits under the captions: keep content out of the captions band` : `"${t.text}" overlaps "${other.text}"`) : undefined; }, 'error');
  // A busy frame: more words on screen at once than anyone reads in a shot, for a second or more (not just while scenes cross-fade).
  const crowded=reports.map(r => r.texts.filter(t => visible(t) && t.kind === 'text').reduce((n, t) => n+t.words, 0) > 40), busy=crowded.findIndex((_, i) => i+hold <= crowded.length && crowded.slice(i, i+hold).every(Boolean)); if (busy >= 0) issues.push({ severity: 'warning', code: 'busy', message: `More than 40 words on screen at ${seconds(frames[busy]!, fps)}: split it across beats or cut words`, frame: frames[busy] });
  // Type system: distinct base sizes and solid text colours used across the video.
  const texts=reports.flatMap(r => r.texts).filter(t => visible(t) && t.kind === 'text'), sizes=[...new Set(texts.map(t => Math.round(t.baseSize)))].sort((a, b) => b-a), colours=[...new Set(texts.map(t => t.color.toLowerCase()).filter(c => c !== 'gradient'))];
  // Sizes within 12% of each other read as one step of the scale set slightly differently, which looks accidental.
  const steps: number[][]=[]; for (const size of sizes) { const step=steps.at(-1); if (step && step[0]!/size <= 1.12) step.push(size); else steps.push([size]); }
  const near=steps.filter(s => s.length > 1);
  if (steps.length > 8) issues.push({ severity: 'warning', code: 'type-scale', message: `${steps.length} steps of font size (${steps.map(s => s.join('/')).join(', ')}): pick a scale of 5–8 sizes and reuse them` });
  else if (near.length) issues.push({ severity: 'warning', code: 'type-scale', message: `Nearly equal font sizes (${near.map(s => s.join('/')).join(', ')}): use one size for each step of the type scale` });
  if (colours.length > 5) issues.push({ severity: 'warning', code: 'text-colours', message: `${colours.length} text colours (${colours.join(', ')}): use a heading colour, a body colour and one or two accents` });
  // Motion: stretches where the picture does not change (a closing hold may run longer: 6 s rather than 4) (mean change below half a grey level between samples).
  const change=reports.slice(1).map((r, i) => { const a=reports[i]!.thumb.pixels, b=r.thumb.pixels; let sum=0; for (let k=0; k < a.length; k++) sum+=Math.abs(a[k]!-b[k]!); return sum/a.length; });
  let still=-1; for (let i=0; i <= change.length; i++) { const isStill=i < change.length && change[i]! < 0.5; if (isStill && still < 0) still=i; if (!isStill && still >= 0) { const from=frames[still]!, to=frames[i]!; if (to-from >= (to >= durationFrames-1 ? 6 : 4)*fps) issues.push({ severity: 'warning', code: 'frozen', message: `Nothing moves from ${seconds(from, fps)} to ${seconds(to, fps)}: add slow drift or a beat, or shorten the hold`, frame: from }); still=-1; } }
  // Rhythm and transitions across scenes.
  const lengths=composition.scenes.map(s => s.durationFrames), mean=lengths.reduce((a, b) => a+b, 0)/lengths.length;
  if (lengths.length >= 4 && lengths.every(l => Math.abs(l-mean) <= 0.1*mean)) issues.push({ severity: 'warning', code: 'uniform-scenes', message: `All ${lengths.length} scenes are about ${seconds(Math.round(mean), fps)} long: vary their length so the video has a rhythm` });
  const transitions=[...new Set(composition.scenes.flatMap(s => [s.transitionIn?.type, s.transitionOut?.type]).filter(Boolean))];
  if (transitions.length >= 3) issues.push({ severity: 'info', code: 'mixed-transitions', message: `${transitions.length} transition styles (${transitions.join(', ')}): one style through a video usually reads as more deliberate` });
  const loudness=options.audio === false ? undefined : await measureLoudness(composition, baseDir);
  if (loudness) { if (loudness.integrated < -20) issues.push({ severity: 'warning', code: 'quiet', message: `Sound is quiet (${loudness.integrated.toFixed(1)} LUFS): set export.loudness (-14 for social video, -16 for explainers) or raise volumes` });
    else if (loudness.integrated > -11) issues.push({ severity: 'warning', code: 'loud', message: `Sound is loud (${loudness.integrated.toFixed(1)} LUFS): set export.loudness (-14 for social video, -16 for explainers) or lower volumes` });
    if (loudness.truePeak > -1) issues.push({ severity: 'warning', code: 'peaks', message: `Sound peaks at ${loudness.truePeak.toFixed(1)} dBTP and may distort after upload: keep peaks under -1 dBTP (lower volume)` }); }
  const order={ error: 0, warning: 1, info: 2 }; issues.sort((a, b) => order[a.severity]-order[b.severity] || (a.frame ?? -1)-(b.frame ?? -1));
  return { issues, sheet: sheet!, sheetFrames, sampledFrames: frames.length, loudness }; }

