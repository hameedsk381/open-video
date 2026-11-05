// Scene-scoped orchestration: instead of one big model call for the whole composition — the calls that stall for
// tens of seconds on rate-limited gateways and miscount global constraints ("exactly 2 scenes" came back as one) —
// a small style-contract call, one small call per scene, and a deterministic stitch that owns all timing. Each scene
// call lands in the gateway's fast path (0.2-2 s), fails independently (a bad scene costs its own retry, not the
// video), and the stitch enforces palette, fonts, durations and camera by construction. The calls run in beat order
// on purpose: each scene continues from the previous one's exit, which is what keeps the story coherent. Any failure
// throws, and the caller falls back to the proven single-call path — so the mock provider and offline runs keep
// working untouched.
import type { AiProvider, ChatMessage } from './providers';
import { extractJson } from './json';
import type { MotionPlan } from './prompt';

export type StyleContract = {
  background: string;
  text: string;
  primary: string;
  accent: string;
  secondary: string;
  fonts: { heading: string; body: string };
  /** One motion move per beat, e.g. "word-cascade". */
  moves: string[];
  style: string;
};

export type ScenesBeat = { name: string; onScreen?: string; motion?: string; seconds?: number };

export type ScenesPlan = {
  beats: ScenesBeat[];
  contract: StyleContract;
  /** Frames per scene — decided by code, never by the model. */
  durations: number[];
  /** Where each scene sits on the timeline, for mapping review issues back to scenes. */
  sceneRanges: { start: number; end: number }[];
};

export type ScenesState = { plan: ScenesPlan; raw: any; scenes: any[] };

export type ScenesOptions = {
  brief: string;
  width: number;
  height: number;
  fps: number;
  durationSeconds: number;
  assets?: { id: string; src: string; type: string }[];
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
};

const hex6 = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const match = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.exec(value.trim());
  if (!match) return undefined;
  const digits = match[1]!;
  return `#${(digits.length === 3 ? digits.split('').map(c => c + c).join('') : digits).toLowerCase()}`;
};

const text = (value: unknown, fallback = ''): string => (typeof value === 'string' && value.trim() ? value.trim() : fallback);

/** The beats come back with the contract; 2-8 beats, each with a name. */
export function parseBeats(raw: unknown): ScenesBeat[] {
  if (!Array.isArray(raw)) return [];
  const beats: ScenesBeat[] = [];
  for (const item of raw.slice(0, 8)) {
    const name = text((item as any)?.name);
    if (!name) continue;
    beats.push({ name, onScreen: text((item as any)?.onScreen) || undefined, motion: text((item as any)?.motion) || undefined });
  }
  return beats;
}

/** Turns the model's raw contract reply into a valid StyleContract; anything missing or malformed gets a house default. */
export function parseContract(raw: any): StyleContract {
  if (!raw || typeof raw !== 'object') throw new Error('the style contract reply was not a JSON object');
  const palette = raw.palette && typeof raw.palette === 'object' ? raw.palette : {};
  const fonts = raw.fonts && typeof raw.fonts === 'object' ? raw.fonts : {};
  const moves = Array.isArray(raw.moves) ? raw.moves.map((move: unknown) => text(move)).filter(Boolean) : [];
  const fallbackMoves = ['rise-in', 'ken-burns', 'pop-in', 'drift', 'wipe-reveal', 'word-cascade'];
  const beats = parseBeats(raw.beats);
  return {
    background: hex6(palette.background) ?? '#0b0e14',
    text: hex6(palette.text) ?? '#f8fafc',
    primary: hex6(palette.primary) ?? '#6366f1',
    accent: hex6(palette.accent) ?? '#ec4899',
    secondary: hex6(palette.secondary) ?? '#22d3ee',
    fonts: { heading: text(fonts.heading, 'Inter'), body: text(fonts.body, text(fonts.heading, 'Inter')) },
    moves: beats.map((_, i) => moves[i] ?? fallbackMoves[i % fallbackMoves.length]!),
    style: text(raw.style, 'clean modern motion'),
  };
}

/**
 * Frames per scene, decided entirely by code: weighted by each beat's `seconds` (a deterministic jitter keeps the
 * lengths unequal when the model gives every beat the same weight, which the craft checks require), scaled to the
 * exact requested total, with rounding drift absorbed without dropping any scene below 1.2 s.
 */
export function sceneDurations(beats: ScenesBeat[], durationSeconds: number, fps: number): number[] {
  const count = Math.max(1, beats.length);
  const jitter = [1, 1.2, 0.85, 1.1, 0.95, 1.15, 0.9, 1.05];
  const sameWeight = new Set(beats.map(beat => (typeof beat.seconds === 'number' && Number.isFinite(beat.seconds) && beat.seconds > 0 ? beat.seconds : 1))).size === 1;
  const weights = beats.map((beat, i) => {
    const seconds = typeof beat.seconds === 'number' && Number.isFinite(beat.seconds) && beat.seconds > 0 ? beat.seconds : 1;
    return count > 1 && sameWeight ? seconds * jitter[i % jitter.length]! : seconds;
  });
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const totalFrames = Math.max(count, Math.round(durationSeconds * fps));
  const minFrames = Math.max(1, Math.round(1.2 * fps));
  const frames = weights.map(weight => Math.max(minFrames, Math.round(weight / totalWeight * totalFrames)));
  let drift = frames.reduce((sum, value) => sum + value, 0) - totalFrames;
  const order = frames.map((value, i) => [value, i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    while (drift > 0 && frames[i]! > minFrames) {
      frames[i]!--;
      drift -= 1;
    }
    if (drift <= 0) break;
  }
  for (const [, i] of order) {
    while (drift < 0) {
      frames[i]! += 1;
      drift += 1;
    }
    if (drift >= 0) break;
  }
  return frames;
}

/** Where each scene sits on the timeline (the loader's rule: each starts where the previous ends, minus its overlap). */
export function sceneRanges(durations: number[], overlaps: number[] = []): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  let end = 0;
  for (const [i, frames] of durations.entries()) {
    const start = i === 0 ? 0 : Math.max(0, end - (overlaps[i] ?? 0));
    end = start + frames;
    ranges.push({ start, end });
  }
  return ranges;
}

const contractMessages = (options: ScenesOptions, plan?: MotionPlan): ChatMessage[] => {
  const beatLines = plan?.beats?.length
    ? plan.beats.map((beat, i) => `${i + 1}. ${beat.name}${beat.onScreen ? `: ${beat.onScreen}` : ''}`).join('\n')
    : undefined;
  const look = plan?.look && Object.keys(plan.look).length ? `\nLook decided earlier: ${JSON.stringify(plan.look)}` : '';
  return [
    { role: 'system', content: 'You are a motion-design director. Reply with ONE JSON object and nothing else.' },
    { role: 'user', content: `Brief: ${options.brief.trim()}
${beatLines ? `The video follows these beats:\n${beatLines}\n` : 'Split the brief into 3-6 short beats (one idea each, unequal weight).\n'}
Decide the visual system all scenes will share. Reply ONLY JSON:
{ "beats": [{ "name": "...", "onScreen": "what is on screen, concretely", "seconds": 3 }],
  "palette": { "background": "#hex", "text": "#hex", "primary": "#hex", "accent": "#hex", "secondary": "#hex" },
  "fonts": { "heading": "Font", "body": "Font" },
  "moves": ["one motion move per beat, e.g. word-cascade, ken-burns, pop-in, rise-in, drift, wipe-reveal"],
  "style": "3-6 words on the visual mood" }${look}` },
  ];
};

const sceneMessages = (contract: StyleContract, beat: ScenesBeat, index: number, total: number, frames: number, previous: string | undefined, options: ScenesOptions): ChatMessage[] => {
  const assets = (options.assets ?? []).filter(asset => asset.type === 'image');
  const margin = Math.round(options.width * 0.08);
  return [
    { role: 'system', content: `You design ONE scene of a ${options.width}x${options.height} motion-graphics video (${options.fps} fps). Reply with ONE JSON object and nothing else:
{ "background": { "type": "color", "color": "#hex from the palette" },
  "layers": [ ...2 to 4 layers... ] }

Layer shapes (x and y are the layer's CENTRE in pixels):
- text: { "type": "text", "text": "...", "x": <centre x>, "y": <centre y>, "fontSize": <px>, "color": "#hex from the palette", "fontFamily": "<the heading or body font>", "align": "center", "split": { "by": "words", "stagger": 4, "preset": "rise" }, "animations": [{ "property": "y", "keyframes": [{ "frame": 0, "value": <y+80> }, { "frame": 20, "value": <y>, "easing": "land" }] }] }
- rect: { "type": "rect", "x": ..., "y": ..., "width": ..., "height": ..., "radius": ..., "fill": "#hex from the palette", "opacity": 0.2, "animations": [...] }
- circle: { "type": "circle", "x": ..., "y": ..., "width": ..., "height": ..., "fill": "#hex from the palette", "opacity": 0.25, "animations": [...] }${assets.length ? `
- image: { "type": "image", "src": "<one of the asset srcs below, verbatim>", "x": ..., "y": ..., "width": ..., "height": ..., "animations": [...] }` : ''}

House rules:
- Use ONLY the palette colours: background ${contract.background}, text ${contract.text}, primary ${contract.primary}, accent ${contract.accent}, secondary ${contract.secondary}.
- Fonts: headings in ${contract.fonts.heading}, supporting text in ${contract.fonts.body}.
- Keep every layer fully inside the frame: x within ${margin}-${options.width - margin}, y within ${margin}-${options.height - margin}.
- The scene's headline (largest text) MUST carry "split": { "by": "words", "stagger": 4, "preset": "rise" }.
- Every layer MUST have at least one animation. An animation is { "property": "x"|"y"|"opacity"|"rotation"|"scale"|"fontSize"|"blur", "keyframes": [{ "frame": 0, "value": <start> }, { "frame": <end>, "value": <end value>, "easing": "land" }] } — keyframes are relative to the scene start (frame 0), the easing sits on the keyframe being arrived at, and every frame must stay within the scene's ${frames} frames. Easings: land, snap, glide, pop, drift, spring, easeInOut.
- Headline fontSize about ${Math.round(options.height * 0.09)} px, supporting text about ${Math.round(options.height * 0.045)} px.
- Decoration (rect/circle) stays subtle: opacity at most 0.35, behind the text.` },
    { role: 'user', content: `Scene ${index + 1} of ${total} — "${beat.name}"${beat.onScreen ? `: ${beat.onScreen}` : ''}.
Motion: ${beat.motion ?? contract.moves[index] ?? 'a clean entrance'}. Scene length: ${frames} frames (~${(frames / options.fps).toFixed(1)} s).${assets.length ? `\nAvailable image assets (use src verbatim): ${assets.map(asset => asset.src).join(' | ')}` : ''}${previous ? `\nThe previous scene ends on: ${previous}. Do not repeat it; continue the story.` : 'This is the opening scene: land the hook fast.'}
Design this scene. Reply ONLY the scene JSON.` },
  ];
};

/** Coerces one scene reply into a schema-safe scene body; throws when the model produced nothing usable.
 *  Animations are normalized to the schema's keyframes form — both the correct `{ property, keyframes }` shape and
 *  a from/to shorthand the model may invent (`{ property, from, to, startFrame, endFrame, easing }`) are accepted. */
export function parseScene(raw: any, frames: number): any {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('the scene reply was not a JSON object');
  const layers = Array.isArray(raw.layers) ? raw.layers.filter((layer: any) => layer && typeof layer === 'object' && ['text', 'rect', 'circle', 'image'].includes(layer.type)) : [];
  if (!layers.length) throw new Error('the scene reply has no usable layers');
  for (const layer of layers) {
    if (layer.type === 'text') {
      if (!layer.content && layer.text) layer.content = layer.text;
      if (!layer.text && layer.content) layer.text = layer.content;
      if (!text(layer.content ?? layer.text)) throw new Error('a text layer has no text');
    }
    if (Array.isArray(layer.animations)) layer.animations = layer.animations.map((animation: any) => normalizeAnimation(animation, frames)).filter(Boolean);
  }
  return {
    background: raw.background && typeof raw.background === 'object' ? raw.background : undefined,
    layers,
  };
}

function normalizeAnimation(animation: any, frames: number): any | undefined {
  if (!animation || typeof animation !== 'object' || typeof animation.property !== 'string') return undefined;
  if (Array.isArray(animation.keyframes) && animation.keyframes.length) {
    const keyframes = animation.keyframes
      .map((keyframe: any) => ({ frame: Math.max(0, Math.min(frames, Math.round(Number(keyframe?.frame) || 0))), value: keyframe?.value, easing: keyframe?.easing }))
      .sort((a: any, b: any) => a.frame - b.frame);
    return { property: animation.property, keyframes, ...(Number.isFinite(Number(animation.repeat)) ? { repeat: Math.max(0, Math.round(Number(animation.repeat))) } : {}) };
  }
  // The from/to shorthand: two keyframes, the easing on the one being arrived at.
  if (animation.from !== undefined && animation.to !== undefined) {
    const start = Math.max(0, Math.round(Number(animation.startFrame) || 0));
    const end = Math.min(frames, Math.max(start + 1, Math.round(Number(animation.endFrame) || frames)));
    return { property: animation.property, keyframes: [{ frame: start, value: animation.from }, { frame: end, value: animation.to, easing: animation.easing }] };
  }
  return undefined;
}

const houseCamera = (frames: number) => ({
  animations: [{ property: 'zoom', keyframes: [{ frame: 0, value: 1 }, { frame: Math.max(2, frames), value: 1.06, easing: 'drift' }] }],
});

/** The largest-font text layer's content and position, so the next scene knows where the story stands. */
export function summarizeExit(scene: any): string | undefined {
  const texts = ((scene?.layers ?? []) as any[]).filter((layer: any) => layer.type === 'text' && text(layer.text));
  if (!texts.length) return undefined;
  const headline = texts.reduce((big: any, layer: any) => (Number(layer.fontSize) || 0) > (Number(big.fontSize) || 0) ? layer : big, texts[0]!);
  return `"${text(headline.text).slice(0, 60)}" at x=${Math.round(Number(headline.x) || 0)}, y=${Math.round(Number(headline.y) || 0)}`;
}

/**
 * Stitches scene bodies into a full composition: code-owned ids, durations, transitions and camera (the house slow
 * push goes on every scene missing one, which also guarantees the craft checks for camera and motion), plus the
 * kinetic-type backstop for compositions where no scene carried a split headline.
 */
export function stitchScenes(scenes: any[], plan: ScenesPlan, options: ScenesOptions, name?: string): any {
  const overlaps = scenes.map((_, i) => (i === 0 ? 0 : 8));
  const ranges = sceneRanges(plan.durations, overlaps);
  if (!scenes.some(scene => (scene.layers ?? []).some((layer: any) => layer.type === 'text' && layer.split))) {
    // Backstop: the biggest headline of the longest scene gets the kinetic split so the craft check holds.
    const target = scenes[plan.durations.indexOf(Math.max(...plan.durations))];
    const texts = ((target?.layers ?? []) as any[]).filter((layer: any) => layer.type === 'text');
    if (texts.length) {
      const biggest = texts.reduce((big: any, layer: any) => (Number(layer.fontSize) || 0) > (Number(big.fontSize) || 0) ? layer : big, texts[0]!);
      biggest.split = { by: 'words', stagger: 4, preset: 'rise' };
    }
  }
  const stitched = scenes.map((scene, i) => ({
    id: `scene-${i + 1}`,
    name: plan.beats[i]?.name ?? `Scene ${i + 1}`,
    startFrame: ranges[i]!.start,
    durationFrames: plan.durations[i]!,
    ...(i > 0 ? { transitionIn: { type: 'fade', durationFrames: overlaps[i] } } : {}),
    camera: scene.camera ?? houseCamera(plan.durations[i]!),
    layers: (scene.layers ?? []).map((layer: any, j: number) => ({ ...structuredClone(layer), id: `s${i + 1}-l${j + 1}` })),
  }));
  return {
    version: '1.0',
    $schema: './composition.schema.json',
    id: 'ai-video',
    name: name ?? 'AI video',
    width: options.width,
    height: options.height,
    fps: options.fps,
    durationFrames: ranges[ranges.length - 1]!.end,
    background: plan.contract.background,
    scenes: stitched,
  };
}

/** Runs the small calls in beat order: one style contract, then one call per scene (2 attempts each). */
export async function composeByScenes(provider: AiProvider, options: ScenesOptions, motionPlan?: MotionPlan): Promise<ScenesState> {
  options.onProgress?.('Agreeing the visual system (small call)…');
  let contractRaw: any;
  let lastError = 'no attempt was made';
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const reply = await provider.chat(contractMessages(options, motionPlan), { json: true, task: 'fast', temperature: attempt === 1 ? 0.4 : 0.2, maxTokens: 1200, signal: options.signal });
      contractRaw = extractJson(reply);
      break;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  if (contractRaw === undefined) throw new Error(`the style contract call failed twice: ${lastError}`);
  const beats = parseBeats(contractRaw.beats);
  if (!beats.length) throw new Error('the style contract had no usable beats');
  const contract = parseContract(contractRaw);
  const durations = sceneDurations(beats, options.durationSeconds, options.fps);
  const plan: ScenesPlan = { beats, contract, durations, sceneRanges: sceneRanges(durations) };

  options.onProgress?.(`Designing ${beats.length} scenes, one small call each…`);
  const scenes: any[] = [];
  for (const [index, beat] of beats.entries()) {
    const frames = durations[index]!;
    const previous = index > 0 ? summarizeExit(scenes[index - 1]) : undefined;
    let lastSceneError = 'no attempt was made';
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const reply = await provider.chat(sceneMessages(contract, beat, index, beats.length, frames, previous, options), { json: true, task: 'fast', temperature: attempt === 1 ? 0.5 : 0.2, maxTokens: 1800, signal: options.signal });
        scenes[index] = parseScene(extractJson(reply), frames);
        break;
      } catch (error) {
        lastSceneError = error instanceof Error ? error.message : String(error);
      }
    }
    if (!scenes[index]) throw new Error(`scene ${index + 1} ("${beat.name}") failed twice: ${lastSceneError}`);
  }
  const raw = stitchScenes(scenes, plan, options, motionPlan?.idea);
  return { plan, raw, scenes };
}

/** Maps review issues (by frame) back to their scenes and re-designs only those, feeding the exact findings back. */
export async function healScenes(provider: AiProvider, state: ScenesState, issues: { frame?: number; message: string; layer?: string }[], options: ScenesOptions): Promise<ScenesState> {
  const flagged = new Map<number, string[]>();
  for (const issue of issues) {
    if (issue.frame === undefined) continue;
    // findLastIndex needs lib es2023; a reverse scan is the same and keeps the tsconfig untouched.
    let index = -1;
    for (let candidate = state.plan.sceneRanges.length - 1; candidate >= 0; candidate--) {
      const range = state.plan.sceneRanges[candidate]!;
      if (issue.frame! >= range.start && issue.frame! < range.end) { index = candidate; break; }
    }
    if (index < 0) continue;
    flagged.set(index, [...flagged.get(index) ?? [], `${issue.message}${issue.layer ? ` [${issue.layer}]` : ''}`]);
  }
  if (!flagged.size) throw new Error('no review issue mapped to a scene');
  options.onProgress?.(`Re-designing ${flagged.size} scene(s) from the review…`);
  const scenes = structuredClone(state.scenes);
  for (const [index, findings] of flagged) {
    const frames = state.plan.durations[index]!;
    const beat = state.plan.beats[index]!;
    const previous = index > 0 ? summarizeExit(scenes[index - 1]) : undefined;
    const messages = sceneMessages(state.plan.contract, beat, index, state.plan.beats.length, frames, previous, options);
    messages.push({ role: 'assistant', content: JSON.stringify(scenes[index]) }, { role: 'user', content: `The design review found these problems in this scene:\n${findings.map(finding => `- ${finding}`).join('\n')}\nFix ONLY these problems. Reply with the corrected scene JSON only.` });
    let healed = false;
    let lastError = 'no attempt was made';
    for (let attempt = 1; attempt <= 2 && !healed; attempt++) {
      try {
        const reply = await provider.chat(messages, { json: true, task: 'fast', temperature: 0.2, maxTokens: 1800, signal: options.signal });
        const candidate = parseScene(extractJson(reply), frames);
        if (JSON.stringify(candidate) !== JSON.stringify(scenes[index])) {
          scenes[index] = candidate;
          healed = true;
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }
    if (!healed) throw new Error(`scene ${index + 1} ("${beat.name}") could not be healed: ${lastError}`);
  }
  const raw = stitchScenes(scenes, state.plan, options, state.raw.name);
  return { plan: state.plan, raw, scenes };
}
