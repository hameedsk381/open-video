// `ove review`: renders sample frames of a composition and checks them for the mistakes that make a video look unfinished: text cut off,
// off the frame, overlapping or too small; text sitting where a platform's UI covers the picture; a busy frame; too many type sizes or text
// colours; long stretches where nothing moves; scenes of identical length; mixed transition styles; shared text teleporting across a hard
// cut; text on screen too briefly to read; several headlines competing; caption lines too fast to read; sounds cut off mid-phrase; and, when
// there is sound, loudness. It also makes a contact sheet. The checks are leads for a person or agent looking at the sheet, not a verdict on taste.
import type { Composition } from '@ove/schema'; import { createRenderer, defaultConcurrency } from '@ove/renderer'; import type { FrameReport, TextNote } from '@ove/graphics'; import { measureLoudness, sourceOf } from './audio'; import { captionTrack, measureSource } from './media'; import { layerWindows } from '@ove/timeline';
export type ReviewIssue = { severity: 'error' | 'warning' | 'info'; code: string; message: string; frame?: number; layer?: string; suggestion?: Record<string, unknown> };
export type ReviewResult = { issues: ReviewIssue[]; sheet: Buffer; sheetFrames: number[]; sampledFrames: number; loudness?: { integrated: number; truePeak: number } };
export type SafeZone = { top?: number; bottom?: number; left?: number; right?: number };
export type ReviewOptions = { allowCode?: boolean; baseDir?: string; every?: number; sheetFrames?: number; columns?: number; concurrency?: number; audio?: boolean; safeZone?: SafeZone; showSafeZones?: boolean; onProgress?: (done: number, total: number) => void };

const area = (a: TextNote) => Math.max(0, a.x1 - a.x0) * Math.max(0, a.y1 - a.y0);
type Rect = { x0: number; y0: number; x1: number; y1: number };
const overlap = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
const seconds = (frame: number, fps: number) => `${(frame/fps).toFixed(1)} s`;
const visible = (t: TextNote) => t.alpha >= 0.95;

export type SafeZoneBand = { name: string; hint: string; x0: number; y0: number; x1: number; y1: number };
/**
 * The rectangles where a platform's own UI covers the picture. The defaults assume the video plays in a 9:16 feed app —
 * Instagram Reels, TikTok and YouTube Shorts draw the same chrome: caption, audio tag and action controls over the bottom
 * of the screen, action buttons down the right edge, search and camera over the top. A tall canvas wider than 9:16 (4:5,
 * square) is letterboxed in that player, so the chrome lands lower on the picture: the insets are where each screen band
 * actually overlaps the video, and bands that land on the letterbox drop out. Insets are fractions of the frame; callers
 * can override any of them (0 turns a band off). A landscape canvas has no app chrome, so there are no bands by default.
 */
export function safeZoneBands(width: number, height: number, override?: SafeZone): SafeZoneBand[] {
  const screen = width * 16 / 9, letterbox = height >= width ? Math.max(0, (screen - height) / 2) : 0;
  const inset = { ...(height >= width
    ? { top: Math.max(0, 0.08 * screen - letterbox) / height, bottom: Math.max(0, 0.18 * screen - letterbox) / height, left: 0.02, right: 0.11 }
    : {}), ...override };
  const bands: SafeZoneBand[] = [];
  if (inset.bottom) bands.push({ name: 'bottom UI band', hint: `Reels and TikTok draw their controls over the bottom ${Math.round(inset.bottom * height)} px: keep text above y ${Math.round(height - inset.bottom * height)}`, x0: 0, y0: height - inset.bottom * height, x1: width, y1: height });
  if (inset.right) bands.push({ name: 'right UI band', hint: `the action buttons cover the right ${Math.round(inset.right * width)} px: keep text left of x ${Math.round(width - inset.right * width)}`, x0: width - inset.right * width, y0: 0, x1: width, y1: height });
  if (inset.top) bands.push({ name: 'top UI band', hint: `search and the camera cover the top ${Math.round(inset.top * height)} px: keep text below y ${Math.round(inset.top * height)}`, x0: 0, y0: 0, x1: width, y1: inset.top * height });
  if (inset.left) bands.push({ name: 'left UI band', hint: `keep text right of x ${Math.round(inset.left * width)}`, x0: 0, y0: 0, x1: inset.left * width, y1: height });
  return bands;
}

export async function reviewComposition(composition: Composition, options: ReviewOptions = {}): Promise<ReviewResult> { const { fps, width, height, durationFrames }=composition, baseDir=options.baseDir ?? process.cwd();
  // Half a second apart, but never more than about 400 samples: a long explainer is reviewed at a coarser step instead of for minutes.
  const every=Math.max(1, Math.round(options.every ?? Math.max(fps/2, durationFrames/400))), frames: number[]=[]; for (let f=0; f < durationFrames; f+=every) frames.push(f); if (frames.at(-1) !== durationFrames-1) frames.push(durationFrames-1);
  // 20 frames by default, or one per scene for a video with more scenes than that (up to 48), so every panel of a long video is on the sheet.
  const sheetCount=Math.max(1, Math.min(options.sheetFrames ?? Math.min(48, Math.max(20, composition.scenes.filter(scene => scene.id !== 'overlay').length)), durationFrames)), sheetFrames=Array.from({ length: sheetCount }, (_, i) => Math.min(durationFrames-1, Math.round((i+0.5)*durationFrames/sheetCount)));
  const bands=safeZoneBands(width, height, options.safeZone);
  const safeBands = options.showSafeZones ? bands.map(b => ({ x0: b.x0 / width, y0: b.y0 / height, x1: b.x1 / width, y1: b.y1 / height })) : undefined;
  const renderer=await createRenderer(composition, { baseDir, concurrency: options.concurrency ?? defaultConcurrency(), scale: Math.min(1, 1280/Math.max(width, height)), allowCode: options.allowCode });
  let reports: FrameReport[]=[], sheet: Buffer; try { let done=0; reports=await Promise.all(frames.map(f => renderer.inspectFrame(f).then(r => { options.onProgress?.(++done, frames.length); return r; })));
    sheet=await renderer.contactSheet(sheetFrames, { columns: options.columns ?? (width >= height ? 4 : 6), safeBands }); } finally { await renderer.close(); }
  const issues: ReviewIssue[]=[], minSide=Math.min(width, height);
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
  // Platform UI bands: on a vertical canvas the app's own chrome covers the bottom and right of the frame, so text there is
  // hidden behind the caption, audio tag and action buttons in the feed. Flagged as a warning — the text is still readable
  // when the video is played full-screen, it just loses the fight with the app UI.
  if (bands.length) persistent('safe-zone', hold, t => { if (!visible(t)) return; const band=bands.find(b => overlap(t, b) > 0.25*area(t));
    return band ? `"${t.text}" sits in the ${band.name}: ${band.hint}` : undefined; }, 'warning');
  // A busy frame: more words on screen at once than anyone reads in a shot, for a second or more (not just while scenes cross-fade).
  const crowded=reports.map(r => r.texts.filter(t => visible(t) && t.kind === 'text').reduce((n, t) => n+t.words, 0) > 40), busy=crowded.findIndex((_, i) => i+hold <= crowded.length && crowded.slice(i, i+hold).every(Boolean)); if (busy >= 0) issues.push({ severity: 'warning', code: 'busy', message: `More than 40 words on screen at ${seconds(frames[busy]!, fps)}: split it across beats or cut words`, frame: frames[busy] });
  // Type system: distinct base sizes and solid text colours used across the video.
  const texts=reports.flatMap(r => r.texts).filter(t => visible(t) && t.kind === 'text'), sizes=[...new Set(texts.map(t => Math.round(t.baseSize)))].sort((a, b) => b-a), colours=[...new Set(texts.map(t => t.color.toLowerCase()).filter(c => c !== 'gradient'))];
  // Sizes within 12% of each other read as one step of the scale set slightly differently, which looks accidental.
  const steps: number[][]=[]; for (const size of sizes) { const step=steps.at(-1); if (step && step[0]!/size <= 1.12) step.push(size); else steps.push([size]); }
  const near=steps.filter(s => s.length > 1);
  if (steps.length > 8) issues.push({ severity: 'warning', code: 'type-scale', message: `${steps.length} steps of font size (${steps.map(s => s.join('/')).join(', ')}): pick a scale of 5–8 sizes and reuse them` });
  else if (near.length) {
    const replace = Object.fromEntries(near.flatMap(group => group.slice(1).map(s => [String(s), group[0]!])));
    issues.push({ severity: 'warning', code: 'type-scale', message: `Nearly equal font sizes (${near.map(s => s.join('/')).join(', ')}): use one size for each step of the type scale`, suggestion: { replace } });
  }
  if (colours.length > 5) issues.push({ severity: 'warning', code: 'text-colours', message: `${colours.length} text colours (${colours.join(', ')}): use a heading colour, a body colour and one or two accents` });
  // Motion: stretches where the picture does not change (a closing hold may run longer: 6 s rather than 4) (mean change below half a grey level between samples).
  const change=reports.slice(1).map((r, i) => { const a=reports[i]!.thumb.pixels, b=r.thumb.pixels; let sum=0; for (let k=0; k < a.length; k++) sum+=Math.abs(a[k]!-b[k]!); return sum/a.length; });
  let still=-1; for (let i=0; i <= change.length; i++) { const isStill=i < change.length && change[i]! < 0.5; if (isStill && still < 0) still=i; if (!isStill && still >= 0) { const from=frames[still]!, to=frames[i]!; if (to-from >= (to >= durationFrames-1 ? 6 : 4)*fps) issues.push({ severity: 'warning', code: 'frozen', message: `Nothing moves from ${seconds(from, fps)} to ${seconds(to, fps)}: add slow drift or a beat, or shorten the hold`, frame: from, suggestion: { from, to } }); still=-1; } }
  // Rhythm and transitions across scenes.
  // The overlay scene (persistent layers) is as long as the video and is no part of its rhythm or its cuts.
  const content=composition.scenes.filter(s => s.id !== 'overlay');
  const lengths=content.map(s => s.durationFrames), mean=lengths.reduce((a, b) => a+b, 0)/lengths.length;
  // A long series of equal panels (a dozen or more scenes) is a format, not a lack of rhythm.
  if (lengths.length >= 4 && lengths.length < 12 && lengths.every(l => Math.abs(l-mean) <= 0.1*mean)) issues.push({ severity: 'warning', code: 'uniform-scenes', message: `All ${lengths.length} scenes are about ${seconds(Math.round(mean), fps)} long: vary their length so the video has a rhythm` });
  const transitions=[...new Set(content.flatMap(s => [s.transitionIn?.type, s.transitionOut?.type]).filter(Boolean))];
  if (transitions.length >= 3) issues.push({ severity: 'info', code: 'mixed-transitions', message: `${transitions.length} transition styles (${transitions.join(', ')}): one style through a video usually reads as more deliberate` });
  // Continuity across hard cuts: an element that survives a cut should keep its place.
  issues.push(...continuityIssues(composition, reports, frames, fps));
  const loudness=options.audio === false ? undefined : await measureLoudness(composition, baseDir);
  if (loudness) { if (loudness.integrated < -20) issues.push({ severity: 'warning', code: 'quiet', message: `Sound is quiet (${loudness.integrated.toFixed(1)} LUFS): set export.loudness (-14 for social video, -16 for explainers) or raise volumes` });
    else if (loudness.integrated > -11) issues.push({ severity: 'warning', code: 'loud', message: `Sound is loud (${loudness.integrated.toFixed(1)} LUFS): set export.loudness (-14 for social video, -16 for explainers) or lower volumes` });
    if (loudness.truePeak > -1) issues.push({ severity: 'warning', code: 'peaks', message: `Sound peaks at ${loudness.truePeak.toFixed(1)} dBTP and may distort after upload: keep peaks under -1 dBTP (lower volume)` }); }
  // Reading time: each text block's longest unbroken stretch on screen (fully visible) against what its words need: about a quarter of a
  // second per word plus half a second to find it. Blocks that end with the video are left alone (they may be cut by the render range).
  const stretches=new Map<string, { text: string; words: number; best: number; run: number; first: number; start: number; layer: string }>();
  reports.forEach((report, i) => { const here=new Set<string>(); for (const t of report.texts) { if (!visible(t) || t.kind !== 'text' || t.words < 3) continue; const key=`${t.id}|${t.text}`; here.add(key);
      const s=stretches.get(key) ?? { text: t.text, words: t.words, best: 0, run: 0, first: frames[i]!, start: frames[i]!, layer: t.id }; if (s.run === 0) s.start=frames[i]!; s.run++; if (s.run > s.best) { s.best=s.run; s.first=s.start; } stretches.set(key, s); }
    for (const [key, s] of stretches) if (!here.has(key)) s.run=0; });
  for (const s of stretches.values()) { const shown=s.best*every/fps, needs=0.5+s.words*0.25; if (shown < needs && s.first+s.best*every < durationFrames-1) issues.push({ severity: 'warning', code: 'read-time', message: `"${s.text}" is readable for about ${shown.toFixed(1)} s; its ${s.words} words need about ${needs.toFixed(1)} s: hold it longer or cut words`, frame: s.first, layer: s.layer }); }
  // One hero per frame: headline-size text (6% of the short side or more), more than two at once for a second.
  // Blocks stacked as one headline (touching vertically, overlapping horizontally, like a title set one word per line) count once.
  const clusters=(texts: TextNote[]) => { const groups: TextNote[][]=[]; for (const t of [...texts].sort((a, b) => a.y0-b.y0)) { const near=groups.find(g => g.some(o => t.y0-o.y1 < 0.5*Math.min(t.size, o.size) && o.y0-t.y1 < 0.5*Math.min(t.size, o.size) && Math.min(t.x1, o.x1) > Math.max(t.x0, o.x0))); if (near) near.push(t); else groups.push([t]); } return groups; };
  const headlines=reports.map(r => clusters(r.texts.filter(t => visible(t) && t.kind === 'text' && t.size >= minSide*0.06)).map(g => ({ text: g.map(t => t.text).join(' ') }))), crowdedHeads=headlines.findIndex((_, i) => i+hold <= headlines.length && headlines.slice(i, i+hold).every(h => h.length > 2));
  if (crowdedHeads >= 0) issues.push({ severity: 'warning', code: 'headlines', message: `${headlines[crowdedHeads]!.length} headline-size texts at once at ${seconds(frames[crowdedHeads]!, fps)} (${headlines[crowdedHeads]!.map(t => `"${t.text}"`).join(', ')}): give the frame one hero and make the rest smaller`, frame: frames[crowdedHeads] });
  // Captions: lines that flash by, or that run faster than people read subtitles (about 20 characters a second).
  let flashes=0, fastest=0, fastestAt=-1; for (const cue of captionTrack(composition)) { const length=cue.end-cue.start, cps=cue.text.length/Math.max(0.01, length); if (length < 0.7) flashes++; if (cps > fastest) { fastest=cps; fastestAt=Math.round(cue.start*fps); } }
  if (flashes) issues.push({ severity: 'warning', code: 'caption-flash', message: `${flashes} caption line${flashes === 1 ? ' is' : 's are'} on screen for under 0.7 s: raise maxWords so short phrases join their neighbours` });
  if (fastest > 20) issues.push({ severity: 'warning', code: 'caption-speed', message: `Captions reach ${fastest.toFixed(0)} characters a second at ${seconds(fastestAt, fps)} (comfortable reading is up to about 20): lower maxWords or slow the voice`, frame: fastestAt });
  // Sounds cut off: an audio layer whose clip ends while its source is still mid-phrase (a scene or endFrame ending too soon).
  for (const { layer, endFrame, startFrame } of layerWindows(composition, l => l.type === 'audio' && !(l as any).loop)) { const l: any=layer; const measured=await measureSource(await sourceOf(composition, l.src, baseDir)).catch(() => undefined); if (!measured) continue;
    const from=l.trimStart/fps, until=from+(endFrame-startFrame)/fps*l.playbackRate, cut=measured.sounds.find(([a, b]) => a < until-0.05 && b > until+0.15);
    if (cut && endFrame < durationFrames) issues.push({ severity: 'warning', code: 'sound-cut', message: `"${l.id}" (${l.src}) is cut off mid-sound at ${seconds(endFrame, fps)}, ${(cut[1]-until).toFixed(1)} s before its phrase ends: lengthen its scene or end it at a pause`, frame: endFrame, layer: l.id }); }
  const order={ error: 0, warning: 1, info: 2 }; issues.sort((a, b) => order[a.severity]-order[b.severity] || (a.frame ?? -1)-(b.frame ?? -1));
  return { issues, sheet: sheet!, sheetFrames, sampledFrames: frames.length, loudness }; }

/**
 * Continuity across hard cuts: text that survives a cut should keep its place. For each scene, a text's resting spot is
 * the cluster of sampled centres it holds most often (entrances and exits sample off-rest, so the mode skips them; a
 * text needs at least two samples in the scene to be judged). The same content sitting somewhere else across a cut with
 * no transition reads as a teleport; scenes joined by a transition are skipped, because the transition moves everything.
 */
export function continuityIssues(composition: Composition, reports: FrameReport[], frames: number[], fps: number): ReviewIssue[] {
  const minSide=Math.min(composition.width, composition.height), grid=Math.max(8, Math.round(0.02*minSide)), jumpLimit=0.08*minSide;
  const restOf=(scene: Composition['scenes'][number]) => {
    const cells=new Map<string, Map<string, { x: number; y: number; size: number; id: string; n: number }>>();
    reports.forEach((report, i) => { const frame=frames[i]!;
      if (frame < scene.startFrame || frame >= scene.startFrame+scene.durationFrames) return;
      for (const t of report.texts) { if (!visible(t) || t.kind !== 'text') continue;
        const key=`${Math.round((t.x0+t.x1)/2/grid)},${Math.round((t.y0+t.y1)/2/grid)}`, byCell=cells.get(t.text) ?? new Map();
        const cell=byCell.get(key) ?? { x: 0, y: 0, size: 0, id: t.id, n: 0 };
        cell.x+=(t.x0+t.x1)/2; cell.y+=(t.y0+t.y1)/2; cell.size+=t.size; cell.id=t.id; cell.n++; byCell.set(key, cell); cells.set(t.text, byCell); } });
    const rest=new Map<string, { x: number; y: number; size: number; id: string; n: number }>();
    for (const [text, byCell] of cells) { const best=[...byCell.values()].sort((a, b) => b.n-a.n)[0]!;
      rest.set(text, { x: best.x/best.n, y: best.y/best.n, size: best.size/best.n, id: best.id, n: best.n }); }
    return rest; };
  const issues: ReviewIssue[]=[];
  for (let i=1; i < composition.scenes.length; i++) {
    const incoming=composition.scenes[i]!, previous=composition.scenes[i-1]!;
    if (incoming.id === 'overlay') continue;
    if (incoming.transitionIn) continue;
    const before=restOf(previous), after=restOf(incoming);
    for (const [text, was] of before) { const now=after.get(text);
      if (!now || was.n < 2 || now.n < 2) continue;
      const distance=Math.hypot(now.x-was.x, now.y-was.y);
      if (distance > jumpLimit) issues.push({ severity: 'warning', code: 'continuity',
        message: `"${text}" jumps about ${Math.round(distance)} px across the cut at ${seconds(incoming.startFrame, fps)}: keep shared elements in one place across the cut, or join the scenes with a transition`,
        frame: incoming.startFrame, layer: now.id }); } }
  return issues; }

