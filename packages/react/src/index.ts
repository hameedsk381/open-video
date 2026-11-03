// Write a video as React components. A component is a pure function of the frame: useCurrentFrame() gives the frame, useVideoConfig() the
// size and length, and what it renders is drawn for that frame. `ove build video.tsx` bundles the component into a `react` layer, which
// the renderer mounts it live in a page every frame (real effects, canvas and WebGL work) and draws the result like an html layer, so the output
// stays frame-exact and goes through the same encoder, audio and review as any other composition. Derive everything from the frame.
import { Children, createContext, createElement, isValidElement, useContext, type Context, type CSSProperties, type HTMLAttributes, type ImgHTMLAttributes, type ReactElement, type ReactNode } from 'react';
import { interpolate, spring } from '@ove/builder';

export { interpolate, spring };
export type VideoConfig = { id?: string; width: number; height: number; fps: number; durationInFrames: number };

// The contexts live on globalThis so the bundle's render function and your components share them whichever copy of this file each imported.
const shared = ((globalThis as any).__oveReact ??= { frame: createContext<number | null>(null), config: createContext<VideoConfig | null>(null) }) as { frame: Context<number | null>; config: Context<VideoConfig | null> };

/** The frame being drawn, counted from 0 (inside a Sequence: from the start of the sequence). */
export function useCurrentFrame(): number {
  const frame = useContext(shared.frame);
  if (frame === null) throw new Error('useCurrentFrame() only works inside a component rendered by OVE (ove build)');
  return frame;
}
/** The video's width, height, fps and length in frames. */
export function useVideoConfig(): VideoConfig {
  const config = useContext(shared.config);
  if (!config) throw new Error('useVideoConfig() only works inside a component rendered by OVE (ove build)');
  return config;
}

/** Holds the frame until continueRender(handle) is called, for work that is not finished when the component first renders (loading a model, decoding an image). Gives a handle. */
export function delayRender(label?: string): number {
  const pending = ((globalThis as any).__oveDelays ??= new Map<number, string>()) as Map<number, string>;
  const handle = ((globalThis as any).__oveDelayId = ((globalThis as any).__oveDelayId ?? 0) + 1) as number;
  pending.set(handle, label ?? ''); return handle;
}
/** Releases a delayRender handle; the frame is drawn once every handle is released. */
export function continueRender(handle: number): void { ((globalThis as any).__oveDelays as Map<number, string> | undefined)?.delete(handle); }

// Audio and Video are found when you run ove build, which renders the component once per frame and turns each run of frames where one is
// shown into an audio or video layer (so the mixer and the decoder do their usual frame-exact work). They draw nothing themselves.
type MediaProps = { src: string; /** Frames of the source to skip. */ startFrom?: number; volume?: number; playbackRate?: number; loop?: boolean; /** Tells apart two clips with the same src shown together. */ name?: string };
const mediaMarker = (kind: 'audio' | 'video', props: MediaProps & Record<string, unknown>, extra: Record<string, unknown> = {}): ReactElement => createElement('i', {
  hidden: true, 'data-ove-media': kind, 'data-src': props.src, 'data-trim': props.startFrom ?? 0, 'data-volume': props.volume ?? 1, 'data-rate': props.playbackRate ?? 1, 'data-loop': props.loop ? 1 : 0, 'data-name': props.name ?? '', ...extra });
/** Plays a sound (an audio asset id, a file, or sfx:name) for as long as it is shown, counted from when it appears. */
export function Audio(props: MediaProps): ReactElement { return mediaMarker('audio', props); }
/** Plays a video clip under the component (or over it with layer="front"). left, top, width and height place it, and may change with the frame (the clip then moves or resizes); the default fills the video. */
export function Video(props: MediaProps & { muted?: boolean; left?: number; top?: number; width?: number; height?: number; objectFit?: 'cover' | 'contain' | 'fill'; /** 'back' (default) draws the clip under the component, 'front' over it. */ layer?: 'back' | 'front' }): ReactElement {
  return mediaMarker('video', props, { 'data-left': props.left ?? 0, 'data-top': props.top ?? 0, 'data-width': props.width ?? 0, 'data-height': props.height ?? 0, 'data-fit': props.objectFit ?? 'cover', 'data-layer': props.layer ?? 'back', 'data-muted': props.muted ? 1 : 0 });
}
/** A picture: an asset id declared in config.assets, or a file path. Same as <img>. */
export function Img(props: ImgHTMLAttributes<HTMLImageElement>): ReactElement { return createElement('img', props); }

/** A box that fills the video (position: absolute, all four sides 0), for stacking layers. */
export function AbsoluteFill({ style, children, ...rest }: HTMLAttributes<HTMLDivElement> & { style?: CSSProperties }): ReactElement {
  return createElement('div', { style: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', ...style }, ...rest }, children);
}

/** Shows its children from frame `from` for `durationInFrames`, with the frame counted from the start of the sequence. */
export function Sequence({ from = 0, durationInFrames = Infinity, layout = 'absolute-fill', children }: { from?: number; durationInFrames?: number; layout?: 'absolute-fill' | 'none'; name?: string; children?: ReactNode }): ReactElement | null {
  const frame = useCurrentFrame();
  if (frame < from || frame >= from + durationInFrames) return null;
  const inner = createElement(shared.frame.Provider, { value: frame - from }, children);
  return layout === 'none' ? inner : createElement(AbsoluteFill, null, inner);
}

/** Plays its Series.Sequence children one after another. */
export function Series({ children }: { children?: ReactNode }): ReactElement {
  let start = 0;
  const parts = Children.toArray(children).map((child, i) => {
    if (!isValidElement(child)) return child;
    const { durationInFrames, offset = 0, children: inner } = child.props as { durationInFrames: number; offset?: number; children?: ReactNode };
    if (!(durationInFrames > 0)) throw new Error('Every Series.Sequence needs a durationInFrames');
    start += offset;
    const element = createElement(Sequence, { key: i, from: start, durationInFrames }, inner);
    start += durationInFrames;
    return element;
  });
  return createElement('div', { style: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } }, ...parts);
}
Series.Sequence = function SeriesSequence(_props: { durationInFrames: number; offset?: number; children?: ReactNode }): ReactElement | null { return null; };

/** Easing functions for interpolate: `interpolate(frame, [0, 30], [0, 1], { easing: Easing.out(Easing.cubic) })`. */
export const Easing = {
  linear: (t: number) => t, quad: (t: number) => t * t, cubic: (t: number) => t * t * t, sin: (t: number) => 1 - Math.cos((t * Math.PI) / 2),
  in: (f: (t: number) => number) => f, out: (f: (t: number) => number) => (t: number) => 1 - f(1 - t),
  inOut: (f: (t: number) => number) => (t: number) => t < 0.5 ? f(t * 2) / 2 : 1 - f((1 - t) * 2) / 2,
  bezier(x1: number, y1: number, x2: number, y2: number) {
    const at = (a: number, b: number, t: number) => 3 * a * (1 - t) ** 2 * t + 3 * b * (1 - t) * t ** 2 + t ** 3;
    return (x: number) => { if (x <= 0) return 0; if (x >= 1) return 1; let lo = 0, hi = 1, t = x; for (let i = 0; i < 40; i++) { const value = at(x1, x2, t); if (Math.abs(value - x) < 1e-6) break; if (value < x) lo = t; else hi = t; t = (lo + hi) / 2; } return at(y1, y2, t); };
  },
};

/** A number from 0 up to 1 that is the same for the same seed on every render (Math.random is not). */
export function random(seed: string | number): number {
  let h = 1779033703 ^ String(seed).length;
  for (const ch of String(seed)) { h = Math.imul(h ^ ch.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
  h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
