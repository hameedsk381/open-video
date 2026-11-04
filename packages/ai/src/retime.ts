// Template retiming: a template's length is its own, but a brief's length is the brief's. retimeComposition
// stretches or trims every scene proportionally so the whole video hits the requested duration, scaling the
// timing inside each scene by the same factor — layer start and end frames, animation keyframes, split
// entrances, camera moves, scene transitions and audio fades — and recomputing the scene starts the same way
// the loader does (each scene begins where the previous one ends, minus its overlap). Rounding drift goes to
// the longest scene, so the total is exact. Source positions (video and audio trimStart) are left alone: they
// point into the media, not into the timeline. Call this before narration or captions are added — spoken word
// timings are seconds and cannot stretch. Pure and unit-tested; composeSmart applies it when a filled
// template's length differs from the brief's.
import type { Composition } from '@ove/core';

const scaled = (frames: number, factor: number, min = 0) => Math.max(min, Math.round(frames * factor));

const scaleAnimation = (animation: any, factor: number) => ({
  ...animation,
  keyframes: animation.keyframes.map((keyframe: any) => ({ ...keyframe, frame: scaled(keyframe.frame, factor) })),
});

function scaleLayer(layer: any, factor: number): any {
  const out: any = { ...layer };
  if (typeof out.startFrame === 'number') out.startFrame = scaled(out.startFrame, factor);
  if (typeof out.endFrame === 'number') out.endFrame = Math.max(1, scaled(out.endFrame, factor));
  if (Array.isArray(out.animations)) out.animations = out.animations.map((animation: any) => scaleAnimation(animation, factor));
  if (out.split && typeof out.split === 'object') out.split = {
    ...out.split,
    ...(typeof out.split.duration === 'number' ? { duration: Math.max(1, scaled(out.split.duration, factor, 1)) } : {}),
    ...(typeof out.split.stagger === 'number' ? { stagger: scaled(out.split.stagger, factor) } : {}),
  };
  if (out.type === 'audio') {
    if (typeof out.fadeInFrames === 'number') out.fadeInFrames = scaled(out.fadeInFrames, factor);
    if (typeof out.fadeOutFrames === 'number') out.fadeOutFrames = scaled(out.fadeOutFrames, factor);
  }
  if (Array.isArray(out.children)) out.children = out.children.map((child: any) => scaleLayer(child, factor));
  return out;
}

function scaleScene(scene: any, factor: number): any {
  const next: any = { ...scene };
  if (typeof next.durationFrames === 'number') next.durationFrames = Math.max(1, scaled(next.durationFrames, factor, 1));
  if (typeof next.overlap === 'number') next.overlap = scaled(next.overlap, factor);
  if (next.transitionIn?.durationFrames !== undefined) next.transitionIn = { ...next.transitionIn, durationFrames: Math.max(1, scaled(next.transitionIn.durationFrames, factor, 1)) };
  if (next.transitionOut?.durationFrames !== undefined) next.transitionOut = { ...next.transitionOut, durationFrames: Math.max(1, scaled(next.transitionOut.durationFrames, factor, 1)) };
  next.layers = (next.layers ?? []).map((layer: any) => scaleLayer(layer, factor));
  if (next.camera?.animations?.length) next.camera = { ...next.camera, animations: next.camera.animations.map((animation: any) => scaleAnimation(animation, factor)) };
  return next;
}

/** The frames a scene overlaps its predecessor when its startFrame is left out — the loader's rule. */
const overlapOf = (scene: any) => (typeof scene.overlap === 'number' ? scene.overlap : scene.transitionIn?.durationFrames ?? 0);

/**
 * Stretches or trims a composition to the requested length in seconds. Scenes keep their relative lengths and
 * everything inside them scales by the same factor; the composition is returned unchanged when it already has
 * the requested length.
 */
export function retimeComposition(composition: Composition, targetSeconds: number): Composition {
  const targetFrames = Math.max(1, Math.round(targetSeconds * composition.fps));
  if (targetFrames === composition.durationFrames) return composition;
  const factor = targetFrames / composition.durationFrames;
  const scenes = composition.scenes.map(scene => scaleScene(scene as any, factor));
  // Scene starts follow the loader's rule: each begins where the previous one ends, minus its own overlap.
  let end = 0;
  for (const [i, scene] of scenes.entries()) {
    if (i > 0) scene.startFrame = Math.max(0, end - overlapOf(scene));
    end = (scene.startFrame ?? 0) + scene.durationFrames;
  }
  // Rounding drift goes to the longest scene, so the total lands exactly on the target.
  const total = end;
  if (total !== targetFrames) {
    const longest = scenes.reduce((a, b) => (b.durationFrames > a.durationFrames ? b : a));
    longest.durationFrames = Math.max(1, longest.durationFrames + targetFrames - total);
    end = longest.startFrame + longest.durationFrames;
    for (const scene of scenes.slice(scenes.indexOf(longest) + 1)) {
      scene.startFrame = Math.max(0, end - overlapOf(scene));
      end = scene.startFrame + scene.durationFrames;
    }
  }
  return { ...composition, scenes, durationFrames: targetFrames } as Composition;
}
