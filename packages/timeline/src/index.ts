import type { Composition, Layer } from '@ove/schema'; import { evaluateAnimation, ease } from '@ove/animation';
export type EvaluatedLayer = Layer & { evaluated: Record<string, number | string>; localFrame: number; children?: EvaluatedLayer[] };
export const frameToSeconds = (frame:number, fps:number) => frame / fps;
export const secondsToFrame = (seconds:number, fps:number) => Math.round(seconds * fps);
// `frame` is local to the parent (scene or group); children of a group are timed from the group's own start.
function evaluateLayers(layers: Layer[], frame: number): EvaluatedLayer[] { return layers.filter((layer: Layer) => layer.visible && frame >= layer.startFrame && (layer.endFrame === undefined || frame < layer.endFrame)).map((layer: Layer) => { const own=frame-layer.startFrame; const evaluated: Record<string, number | string>=Object.fromEntries(layer.animations.map((a: any) => [a.property, evaluateAnimation(a, own)])); return {...layer, localFrame: frame, evaluated, ...(layer.type === 'group' ? { children: evaluateLayers(layer.children, own) } : {})}; }).sort((a: EvaluatedLayer,b: EvaluatedLayer)=>a.zIndex-b.zIndex); }
type Transition = NonNullable<Composition['scenes'][number]['transitionIn']>;
// Progress runs 0 (hidden) → 1 (fully shown), eased. Every effect is written for progress alone, so the same maths serves `in`
// (progress rising over the first frames) and `out` (falling over the last frames): slide/wipe `direction` is where the scene
// enters from or exits towards.
export function transitionState(effects: { transition: Transition; progress: number }[], width: number, height: number) { let x=0, y=0, opacity=1, scale=1, clip={ x: 0, y: 0, width, height }; let clipped=false;
  for (const { transition, progress } of effects) { const p=ease(progress, transition.easing), dir=transition.direction;
    if (transition.type === 'fade') opacity*=p;
    else if (transition.type === 'zoom') { opacity*=p; scale*=0.85+0.15*p; }
    else if (transition.type === 'slide') { if (dir === 'left') x-=(1-p)*width; else if (dir === 'right') x+=(1-p)*width; else if (dir === 'top') y-=(1-p)*height; else y+=(1-p)*height; }
    else { clipped=true; const visible=dir === 'left' ? { x: 0, y: 0, width: p*width, height } : dir === 'right' ? { x: (1-p)*width, y: 0, width: p*width, height } : dir === 'top' ? { x: 0, y: 0, width, height: p*height } : { x: 0, y: (1-p)*height, width, height: p*height };
      const left=Math.max(clip.x, visible.x), top=Math.max(clip.y, visible.y); clip={ x: left, y: top, width: Math.max(0, Math.min(clip.x+clip.width, visible.x+visible.width)-left), height: Math.max(0, Math.min(clip.y+clip.height, visible.y+visible.height)-top) }; } }
  return { x, y, opacity, scale, clip: clipped ? clip : undefined }; }
// Scenes draw in the order they are listed (a later scene is on top of an earlier one it overlaps); zIndex orders layers within a
// scene. While a transition is running, the scene's layers are wrapped in a group carrying the transition's transform, opacity and clip.
export function evaluateFrame(composition: Composition, frame: number): EvaluatedLayer[] { if(!Number.isInteger(frame) || frame < 0 || frame >= composition.durationFrames) return []; const { width, height }=composition;
  return composition.scenes.flatMap(scene => { if(frame < scene.startFrame || frame >= scene.startFrame+scene.durationFrames) return []; const localFrame=frame-scene.startFrame; const layers=evaluateLayers(scene.layers, localFrame);
    const effects=[scene.transitionIn && { transition: scene.transitionIn, progress: Math.min(1, localFrame/scene.transitionIn.durationFrames) }, scene.transitionOut && { transition: scene.transitionOut, progress: Math.min(1, (scene.durationFrames-localFrame)/scene.transitionOut.durationFrames) }].filter((e): e is { transition: Transition; progress: number } => !!e && e.progress < 1);
    if (!effects.length) return layers; const state=transitionState(effects, width, height);
    return [{ id: `scene:${scene.id}`, type: 'group', startFrame: 0, x: state.x, y: state.y, opacity: state.opacity, scale: state.scale, rotation: 0, originX: width/2, originY: height/2, zIndex: 0, visible: true, animations: [], children: layers, clip: state.clip, evaluated: {}, localFrame } as EvaluatedLayer]; }); }
// Video sources are decoded on the composition's frame grid, so frame k of the source is shown at time k/fps. `ownFrame` is the
// frame relative to the layer's own startFrame; past the end the source either loops or holds its last frame.
export function videoFrameIndex(layer: { trimStart: number; playbackRate: number; loop: boolean }, ownFrame: number, frameCount: number): number { if (frameCount < 1) throw new Error('Video has no frames'); const frame=Math.max(0, Math.floor(layer.trimStart + ownFrame*layer.playbackRate + 1e-9)); return layer.loop ? frame % frameCount : Math.min(frame, frameCount-1); }
export type AudioWindow = { layer: Layer; startFrame: number; endFrame: number };
// Absolute [startFrame, endFrame) during which each sound-producing layer is on screen, clipped by its scene and any parent groups.
export function audioWindows(composition: Composition): AudioWindow[] { const out: AudioWindow[]=[]; const walk=(layers: Layer[], offset: number, limit: number) => { for (const layer of layers) { if (!layer.visible) continue; const start=offset+layer.startFrame, end=Math.min(limit, layer.endFrame === undefined ? Infinity : offset+layer.endFrame); if (end <= start) continue; if (layer.type === 'group') walk(layer.children, start, end); else if (layer.type === 'audio' ? layer.volume > 0 : layer.type === 'video' && !layer.muted && layer.volume > 0) out.push({ layer, startFrame: start, endFrame: end }); } }; for (const scene of composition.scenes) walk(scene.layers, scene.startFrame, Math.min(scene.startFrame+scene.durationFrames, composition.durationFrames)); return out; }
