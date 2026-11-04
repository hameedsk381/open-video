import type { Composition, Layer } from '@ove/schema'; import { evaluateAnimation, animationSegment, ease } from '@ove/animation';
// units: for split text, the animated values of each stagger step (step 0 starts first); the drawing runtime maps pieces to steps.
export type UnitValues = { x?: number; y?: number; opacity?: number; scale?: number; rotation?: number; blur?: number; color?: string };
// morph: for a path whose d animates, the two shapes around this frame and the eased progress between them (drawn by the runtime).
export type EvaluatedLayer = Layer & { evaluated: Record<string, number | string>; localFrame: number; children?: EvaluatedLayer[]; units?: UnitValues[]; morph?: { from: string; to: string; t: number } };
type SplitAnimation = { property: string; keyframes: { frame: number; value: number | string; easing?: any }[] };
// Preset animations for split text, with distances in ems so they suit any font size.
export function splitPresetAnimations(preset: string, duration: number, fontSize: number): SplitAnimation[] { const d=duration, fade=Math.max(1, Math.round(d*0.6)), em=fontSize;
  const appear: SplitAnimation={ property: 'opacity', keyframes: [{ frame: 0, value: 0 }, { frame: fade, value: 1 }] };
  switch (preset) {
    case 'fade': return [{ property: 'opacity', keyframes: [{ frame: 0, value: 0 }, { frame: d, value: 1, easing: 'glide' }] }];
    case 'pop': return [{ property: 'opacity', keyframes: [{ frame: 0, value: 0 }, { frame: Math.max(1, Math.round(d*0.35)), value: 1 }] }, { property: 'scale', keyframes: [{ frame: 0, value: 0.6 }, { frame: d, value: 1, easing: 'pop' }] }];
    case 'blur': return [appear, { property: 'blur', keyframes: [{ frame: 0, value: 0.25*em }, { frame: d, value: 0, easing: 'land' }] }, { property: 'scale', keyframes: [{ frame: 0, value: 1.08 }, { frame: d, value: 1, easing: 'land' }] }];
    case 'slide': return [appear, { property: 'x', keyframes: [{ frame: 0, value: 0.6*em }, { frame: d, value: 0, easing: 'land' }] }];
    case 'drop': return [appear, { property: 'y', keyframes: [{ frame: 0, value: -0.5*em }, { frame: d, value: 0, easing: 'land' }] }];
    case 'typewriter': return [{ property: 'opacity', keyframes: [{ frame: 0, value: 0 }, { frame: 1, value: 1, easing: 'hold' }] }];
    default: return [appear, { property: 'y', keyframes: [{ frame: 0, value: 0.45*em }, { frame: d, value: 0, easing: 'land' }] }]; } }
// How many pieces split text has at most (lines can only be counted once laid out, so they get one step per word).
export function splitCount(layer: any): number { const text=layer.spans?.length ? layer.spans.map((s: any) => s.text).join('') : String(layer.content ?? '');
  return Math.max(1, layer.split?.by === 'letters' ? Array.from(text.replace(/\s/g, '')).length : text.split(/\s+/).filter(Boolean).length); }
function splitUnits(layer: any, own: number): UnitValues[] { const split=layer.split, animations: SplitAnimation[]=split.animations?.length ? split.animations : splitPresetAnimations(split.preset, split.duration, layer.fontSize);
  // Steps past the last one whose animation has finished share its values, so long texts do not cost one entry per piece forever.
  return Array.from({ length: splitCount(layer) }, (_, step) => Object.fromEntries(animations.map(a => [a.property, evaluateAnimation(a as any, own-step*split.stagger)])) as UnitValues); }
export const frameToSeconds = (frame:number, fps:number) => frame / fps;
export const secondsToFrame = (seconds:number, fps:number) => Math.round(seconds * fps);
// `frame` is local to the parent (scene or group); children of a group are timed from the group's own start.
function evaluateLayers(layers: Layer[], frame: number): EvaluatedLayer[] { return layers.filter((layer: Layer) => layer.visible && frame >= layer.startFrame && (layer.endFrame === undefined || frame < layer.endFrame)).map((layer: Layer) => { const own=frame-layer.startFrame; const evaluated: Record<string, number | string>=Object.fromEntries(layer.animations.filter((a: any) => a.property !== 'd').map((a: any) => [a.property, evaluateAnimation(a, own)])); const shape=layer.animations.find((a: any) => a.property === 'd'); return {...layer, localFrame: frame, evaluated, ...(shape ? { morph: animationSegment(shape as any, own) as { from: string; to: string; t: number } } : {}), ...(layer.type === 'group' ? { children: evaluateLayers(layer.children, own) } : {}), ...(layer.type === 'text' && (layer as any).split ? { units: splitUnits(layer, own) } : {})}; }).sort((a: EvaluatedLayer,b: EvaluatedLayer)=>a.zIndex-b.zIndex); }
type Transition = NonNullable<Composition['scenes'][number]['transitionIn']>;
// Progress runs 0 (hidden) → 1 (fully shown), eased. Every effect is written for progress alone, so the same maths serves `in`
// (progress rising over the first frames) and `out` (falling over the last frames): slide/wipe `direction` is where the scene
// enters from or exits towards.
// iris clips to a circle (clipPath) growing from x, y to past the farthest corner; dip hides the scene for the first half and draws a
// colour over everything (overlay) that peaks in the middle; blur goes in or out of focus while fading; push moves like slide (the scene
// it pushes out is moved in evaluateFrame).
export function transitionState(effects: { transition: Transition; progress: number }[], width: number, height: number) { let x=0, y=0, opacity=1, scale=1, clip={ x: 0, y: 0, width, height }; let clipped=false, clipPath: string | undefined, blur=0, overlay: { color: string; opacity: number } | undefined;
  for (const { transition, progress } of effects) { const p=ease(progress, transition.easing), dir=transition.direction;
    if (transition.type === 'fade') opacity*=p;
    else if (transition.type === 'zoom') { opacity*=p; scale*=0.85+0.15*p; }
    else if (transition.type === 'iris') { const cx=transition.x ?? width/2, cy=transition.y ?? height/2, r=Math.max(0.01, p*Math.hypot(Math.max(cx, width-cx), Math.max(cy, height-cy))); clipPath=`M${cx-r} ${cy}A${r} ${r} 0 1 0 ${cx+r} ${cy}A${r} ${r} 0 1 0 ${cx-r} ${cy}Z`; }
    else if (transition.type === 'dip') { if (progress < 0.5) opacity=0; overlay={ color: transition.color, opacity: 1-Math.abs(2*progress-1) }; }
    else if (transition.type === 'blur') { opacity*=Math.min(1, p*1.5); blur=Math.max(blur, (1-p)*0.02*Math.max(width, height)); }
    else if (transition.type === 'slide' || transition.type === 'push') { if (dir === 'left') x-=(1-p)*width; else if (dir === 'right') x+=(1-p)*width; else if (dir === 'top') y-=(1-p)*height; else y+=(1-p)*height; }
    else { clipped=true; const visible=dir === 'left' ? { x: 0, y: 0, width: p*width, height } : dir === 'right' ? { x: (1-p)*width, y: 0, width: p*width, height } : dir === 'top' ? { x: 0, y: 0, width, height: p*height } : { x: 0, y: (1-p)*height, width, height: p*height };
      const left=Math.max(clip.x, visible.x), top=Math.max(clip.y, visible.y); clip={ x: left, y: top, width: Math.max(0, Math.min(clip.x+clip.width, visible.x+visible.width)-left), height: Math.max(0, Math.min(clip.y+clip.height, visible.y+visible.height)-top) }; } }
  return { x, y, opacity, scale, clip: clipped ? clip : undefined, clipPath, blur, overlay }; }
// Scenes draw in the order they are listed (a later scene is on top of an earlier one it overlaps); zIndex orders layers within a
// scene. While a transition is running, the scene's layers are wrapped in a group carrying the transition's transform, opacity and clip.
// Smooth, repeatable wobble in −1…1: three sines at unrelated rates, a different phase per axis.
const wobble = (t: number, phase: number) => (Math.sin(t*1.31+phase) + 0.6*Math.sin(t*2.93+phase*2.1) + 0.3*Math.sin(t*5.37+phase*3.7))/1.9;
// Where the scene camera is at a scene-local frame: the scene point at the centre of the frame, zoom and rotation, with shake added.
export function cameraState(camera: NonNullable<Composition['scenes'][number]['camera']>, frame: number, width: number, height: number) { const value=(name: string, fallback: number) => { const a=camera.animations.find(x => x.property === name); return a ? Number(evaluateAnimation(a as any, frame)) : fallback; };
  const shake=value('shake', camera.shake); return { x: value('x', camera.x ?? width/2) + shake*wobble(frame*0.9, 0.3), y: value('y', camera.y ?? height/2) + shake*wobble(frame*0.9, 2.1), zoom: value('zoom', camera.zoom), rotation: value('rotation', camera.rotation) + shake*0.04*wobble(frame*0.7, 4.2) }; }
// frame may be fractional (motion blur draws sub-frames between whole frames); layers and animations interpolate between frames.
export function evaluateFrame(composition: Composition, frame: number): EvaluatedLayer[] { if(!Number.isFinite(frame) || frame < 0 || frame >= composition.durationFrames) return []; const { width, height }=composition;
  // A scene pushing in moves every scene listed before it that is still on screen out the same way, at the same speed.
  const pushes=composition.scenes.map((scene, index) => ({ scene, index })).filter(({ scene }) => scene.transitionIn?.type === 'push' && frame >= scene.startFrame && frame < scene.startFrame+scene.transitionIn.durationFrames)
    .map(({ scene, index }) => { const t=scene.transitionIn!, p=ease(Math.min(1, (frame-scene.startFrame)/t.durationFrames), t.easing), dir=t.direction; return { index, dx: dir === 'left' ? p*width : dir === 'right' ? -p*width : 0, dy: dir === 'top' ? p*height : dir === 'bottom' ? -p*height : 0 }; });
  return composition.scenes.flatMap((scene, index) => { if(frame < scene.startFrame || frame >= scene.startFrame+scene.durationFrames) return []; const localFrame=frame-scene.startFrame; let layers=evaluateLayers(scene.layers, localFrame);
    // The camera: a group whose transform puts the camera's point at the frame's centre, zoomed and turned; fixed layers stay outside it.
    if (scene.camera) { const cam=cameraState(scene.camera, localFrame, width, height), moving=layers.filter(l => !l.fixed), fixed=layers.filter(l => l.fixed);
      layers=[{ id: `camera:${scene.id}`, type: 'group', startFrame: 0, x: width/2-cam.x, y: height/2-cam.y, originX: cam.x, originY: cam.y, scale: cam.zoom, rotation: -cam.rotation, opacity: 1, zIndex: 0, visible: true, fixed: false, animations: [], children: moving, evaluated: {}, localFrame } as unknown as EvaluatedLayer, ...fixed]; }
    const effects=[scene.transitionIn && { transition: scene.transitionIn, progress: Math.min(1, localFrame/scene.transitionIn.durationFrames) }, scene.transitionOut && { transition: scene.transitionOut, progress: Math.min(1, (scene.durationFrames-localFrame)/scene.transitionOut.durationFrames) }].filter((e): e is { transition: Transition; progress: number } => !!e && e.progress < 1);
    const pushed=pushes.filter(p => p.index > index).reduce((o, p) => ({ dx: o.dx+p.dx, dy: o.dy+p.dy }), { dx: 0, dy: 0 });
    if (!effects.length && !pushed.dx && !pushed.dy) return layers; const state=transitionState(effects, width, height); state.x+=pushed.dx; state.y+=pushed.dy;
    const overlay=state.overlay && state.overlay.opacity > 0 ? [{ id: `dip:${scene.id}`, type: 'rect', startFrame: 0, x: 0, y: 0, width, height, fill: state.overlay.color, opacity: state.overlay.opacity, scale: 1, rotation: 0, originX: 0, originY: 0, zIndex: 0, visible: true, animations: [], evaluated: {}, localFrame } as unknown as EvaluatedLayer] : [];
    return [{ id: `scene:${scene.id}`, type: 'group', startFrame: 0, x: state.x, y: state.y, opacity: state.opacity, scale: state.scale, rotation: 0, originX: width/2, originY: height/2, zIndex: 0, visible: true, animations: [], children: layers, clip: state.clip, clipPath: state.clipPath, blur: state.blur, evaluated: {}, localFrame } as EvaluatedLayer, ...overlay]; }); }
// Video sources are decoded on the composition's frame grid, so frame k of the source is shown at time k/fps. `ownFrame` is the
// frame relative to the layer's own startFrame; past the end the source either loops or holds its last frame.
export function videoFrameIndex(layer: { trimStart: number; playbackRate: number; loop: boolean }, ownFrame: number, frameCount: number): number { if (frameCount < 1) throw new Error('Video has no frames'); const frame=Math.max(0, Math.floor(layer.trimStart + ownFrame*layer.playbackRate + 1e-9)); return layer.loop ? frame % frameCount : Math.min(frame, frameCount-1); }
export type LayerWindow = { layer: Layer; startFrame: number; endFrame: number; scene?: Composition['scenes'][number] }; export type AudioWindow = LayerWindow;
// Absolute [startFrame, endFrame) during which each matching layer is on screen, clipped by its scene and any parent groups.
export function layerWindows(composition: Composition, include: (layer: Layer) => boolean): LayerWindow[] { const out: LayerWindow[]=[]; const walk=(layers: Layer[], offset: number, limit: number, scene?: Composition['scenes'][number]) => { for (const layer of layers) { if (!layer.visible) continue; const start=offset+layer.startFrame, end=Math.min(limit, layer.endFrame === undefined ? Infinity : offset+layer.endFrame); if (end <= start) continue; if (layer.type === 'group') walk(layer.children, start, end, scene); else if (include(layer)) out.push({ layer, startFrame: start, endFrame: end, scene }); } }; for (const scene of composition.scenes) walk(scene.layers, scene.startFrame, Math.min(scene.startFrame+scene.durationFrames, composition.durationFrames), scene); return out; }
// Sound-producing layers: audio layers, and video layers that are not muted.
export const audioWindows = (composition: Composition): AudioWindow[] => layerWindows(composition, layer => layer.type === 'audio' ? layer.volume > 0 : layer.type === 'video' && !layer.muted && layer.volume > 0);
// Sound timing for ducking and volume automation. Times are seconds; envelopes are clip-relative [time, gain] points joined linearly.
export type SoundMedia = Record<string, { duration: number; segments: { start: number; end: number }[] }>;
export type Duck = { amount: number; attackFrames: number; releaseFrames: number; by?: string[] };
// When each sound layer is actually audible in the video: its measured phrases (source time mapped through trimStart and playbackRate)
// inside its on-screen window, or the whole window when it was not measured. `media` is keyed by asset id (the layer's src).
export function soundIntervals(composition: Composition, media: SoundMedia = {}): { layer: Layer; intervals: [number, number][] }[] { const fps = composition.fps;
  return audioWindows(composition).map(({ layer, startFrame, endFrame }: any) => { const from = startFrame/fps, to = endFrame/fps, info = media[layer.src];
    if (!info) return { layer, intervals: [[from, to]] as [number, number][] }; const trim = (layer.trimStart ?? 0)/fps, rate = layer.playbackRate ?? 1;
    const intervals = info.segments.map(s => [from + (s.start - trim)/rate, from + (s.end - trim)/rate] as [number, number]).map(([a, b]) => [Math.max(a, from), Math.min(b, to)] as [number, number]).filter(([a, b]) => b > a);
    return { layer, intervals }; }); }
// The volume of one clip over its own time (0 = when it starts): its animated or static volume, times the ducking from the sounds it
// ducks under. Returns undefined when the volume never changes, so a plain gain can be used.
export function volumeEnvelope(options: { layer: any; fps: number; start: number; duration: number; duck?: Duck; others: { layer: Layer; intervals: [number, number][] }[] }): [number, number][] | undefined {
  const { layer, fps, start, duration, duck } = options; const animation = (layer.animations ?? []).find((a: any) => a.property === 'volume');
  const triggers = duck ? options.others.filter(o => o.layer !== layer && (!duck.by || duck.by.includes((o.layer as any).id))).flatMap(o => o.intervals).map(([a, b]) => [a - start, b - start] as [number, number]).filter(([a, b]) => b > 0 && a < duration).sort((x, y) => x[0] - y[0]) : [];
  if (!animation && !triggers.length) return undefined; // At least 1 ms each way, so an instant duck is a sharp step rather than a ramp from the previous point.
  const attack = Math.max(1e-3, (duck?.attackFrames ?? 0)/fps), release = Math.max(1e-3, (duck?.releaseFrames ?? 0)/fps);
  const merged: [number, number][] = []; for (const [a, b] of triggers) { const last = merged.at(-1); if (last && a - last[1] < attack + release) last[1] = Math.max(last[1], b); else merged.push([a, b]); }
  // Ducking factor: 1 away from sounds, ramping down over `attack` before each and back up over `release` after it.
  const duckAt = (t: number) => merged.reduce((f, [a, b]) => Math.min(f, t >= a && t <= b ? duck!.amount : t < a && t > a - attack ? 1 - (1 - duck!.amount)*(t - (a - attack))/attack : t > b && t < b + release ? duck!.amount + (1 - duck!.amount)*(t - b)/release : 1), 1);
  const volumeAt = (t: number) => animation ? Number(evaluateAnimation(animation, t*fps)) : layer.volume ?? 1;
  const times = new Set<number>([0, duration]); if (animation) for (let k = 0; k <= Math.ceil(duration*fps); k++) times.add(Math.min(duration, k/fps));
  for (const [a, b] of merged) for (const t of [a - attack, a, b, b + release]) if (t > 0 && t < duration) times.add(t);
  const points = [...times].sort((a, b) => a - b).map(t => [t, Math.max(0, volumeAt(t)*duckAt(t))] as [number, number]);
  // Drops points in the middle of straight runs, which keeps the FFmpeg expression and the Web Audio schedule short.
  return points.filter((p, i) => { const prev = points[i-1], next = points[i+1]; if (!prev || !next) return true; const expected = prev[1] + (next[1] - prev[1])*(p[0] - prev[0])/(next[0] - prev[0]); return Math.abs(expected - p[1]) > 1e-4; }); }
