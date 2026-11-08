import type { Animation } from '@ove/schema';
export const easingNames = ['linear','easeIn','easeOut','easeInOut','easeInCubic','easeOutCubic','easeInOutCubic','easeInQuart','easeOutQuart','easeInOutQuart','easeInExpo','easeOutExpo','easeInOutExpo','easeInBack','easeOutBack','spring','hold','land','snap','glide','pop','move','exit','drift','anticipate','bounce'] as const;
// A named curve, or [x1, y1, x2, y2] control points of a CSS-style cubic Bézier from (0,0) to (1,1).
export type Easing = typeof easingNames[number] | readonly [number, number, number, number];
const back = 1.70158;
// Curves named for the job they do, as cubic Béziers. Entries: land (most of the travel early, then a long soft settle; the default
// choice), snap (almost all of it in the first few frames, for a hero element or a call to action), glide (a gentler ease-out for
// supporting elements), pop (lands with a small overshoot, for badges). Within the frame: move (accelerates and decelerates, for
// something repositioning). Leaving: exit (accelerates away). Slow continuous motion: drift (close to linear, soft at both ends).
const roleCurves: Record<string, readonly [number, number, number, number]> = { land: [0.16, 1, 0.3, 1], snap: [0.05, 0.9, 0.1, 1], glide: [0.25, 0.8, 0.35, 1], pop: [0.34, 1.45, 0.64, 1], move: [0.76, 0, 0.24, 1], exit: [0.5, 0, 0.75, 0], drift: [0.35, 0.15, 0.65, 0.85] };
// Damped oscillation scaled so it ends exactly at 1: overshoots by about 10% around a third of the way, then settles.
const springCurve = (t: number) => 1 - Math.exp(-7*t)*Math.cos(3*Math.PI*t), springEnd = springCurve(1);
// Solves x(s) = t for the curve parameter s (Newton steps, falling back to bisection), then returns y(s).
export function cubicBezier(x1: number, y1: number, x2: number, y2: number, t: number): number { const bez=(a: number, b: number, s: number) => 3*(1-s)*(1-s)*s*a + 3*(1-s)*s*s*b + s*s*s; const slope=(a: number, b: number, s: number) => 3*(1-s)*(1-s)*a + 6*(1-s)*s*(b-a) + 3*s*s*(1-b);
  let s=t; for (let i=0; i<8; i++) { const error=bez(x1,x2,s)-t, d=slope(x1,x2,s); if (Math.abs(error) < 1e-7) return bez(y1,y2,s); if (Math.abs(d) < 1e-6) break; s-=error/d; }
  let lo=0, hi=1; s=t; for (let i=0; i<60; i++) { const x=bez(x1,x2,s); if (Math.abs(x-t) < 1e-7) break; if (x < t) lo=s; else hi=s; s=(lo+hi)/2; } return bez(y1,y2,s); }
export function ease(t: number, kind: Easing = 'linear'): number { if (t <= 0) return 0; if (t >= 1) return 1; if (typeof kind !== 'string') return cubicBezier(kind[0], kind[1], kind[2], kind[3], t);
  switch (kind) {
    case 'easeIn': return t*t; case 'easeOut': return 1-(1-t)*(1-t); case 'easeInOut': return t < .5 ? 2*t*t : 1-Math.pow(-2*t+2,2)/2;
    case 'easeInCubic': return t*t*t; case 'easeOutCubic': return 1-Math.pow(1-t,3); case 'easeInOutCubic': return t < .5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2;
    case 'easeInQuart': return t*t*t*t; case 'easeOutQuart': return 1-Math.pow(1-t,4); case 'easeInOutQuart': return t < .5 ? 8*t*t*t*t : 1-Math.pow(-2*t+2,4)/2;
    case 'easeInExpo': return Math.pow(2,10*t-10); case 'easeOutExpo': return 1-Math.pow(2,-10*t); case 'easeInOutExpo': return t < .5 ? Math.pow(2,20*t-10)/2 : (2-Math.pow(2,-20*t+10))/2;
    case 'easeInBack': return (back+1)*t*t*t - back*t*t; case 'easeOutBack': return 1 + (back+1)*Math.pow(t-1,3) + back*Math.pow(t-1,2);
    case 'spring': return springCurve(t)/springEnd; case 'hold': return 0;
    // Pulls back a little first, then launches past the target and settles: the wind-up and follow-through of one move.
    case 'anticipate': return cubicBezier(0.68, -0.6, 0.32, 1.6, t);
    case 'bounce': { const n=7.5625, d=2.75; if (t < 1/d) return n*t*t; if (t < 2/d) return n*(t-=1.5/d)*t+0.75; if (t < 2.5/d) return n*(t-=2.25/d)*t+0.9375; return n*(t-=2.625/d)*t+0.984375; } default: { const c=roleCurves[kind]; return c ? cubicBezier(c[0], c[1], c[2], c[3], t) : t; } } }
// Colours interpolate per channel in sRGB, including alpha. Accepts the same forms as the schema: #rgb, #rgba, #rrggbb, #rrggbbaa,
// rgb()/rgba() and transparent.
export function parseColor(value: string): [number, number, number, number] { const v=value.trim().toLowerCase(); if (v === 'transparent') return [0,0,0,0];
  const hex=/^#([0-9a-f]{3,8})$/.exec(v); if (hex && [3,4,6,8].includes(hex[1]!.length)) { const h=hex[1]!, full=h.length <= 4 ? [...h].map(c => c+c).join('') : h; const n=(i: number) => parseInt(full.slice(i, i+2), 16); return [n(0), n(2), n(4), full.length === 8 ? n(6)/255 : 1]; }
  const fn=/^rgba?\(([^)]+)\)$/.exec(v); if (fn) { const parts=fn[1]!.split(/[\s,/]+/).filter(Boolean).map((p, i) => p.endsWith('%') ? parseFloat(p)*(i === 3 ? .01 : 2.55) : parseFloat(p)); if ((parts.length === 3 || parts.length === 4) && parts.every(Number.isFinite)) return [parts[0]!, parts[1]!, parts[2]!, parts[3] ?? 1]; }
  throw new Error(`Cannot animate colour "${value}"`); }
export function mixColors(from: string, to: string, t: number): string { const a=parseColor(from), b=parseColor(to), c=a.map((x, i) => x+(b[i]!-x)*t); return `rgba(${Math.round(c[0]!)},${Math.round(c[1]!)},${Math.round(c[2]!)},${Math.round(c[3]!*10000)/10000})`; }
export function interpolate(frame: number, input: readonly number[], output: readonly number[], easing: Easing = 'linear'): number { if (input.length !== output.length || !input.length) throw new Error('interpolate requires equally sized non-empty ranges'); if (frame <= input[0]!) return output[0]!; const final = input.length - 1; if (frame >= input[final]!) return output[final]!; for(let i=1;i<input.length;i++) if(frame <= input[i]!) { const t=(frame-input[i-1]!)/(input[i]!-input[i-1]!); return output[i-1]!+(output[i]!-output[i-1]!)*ease(t,easing); } return output[final]!; }
// Each segment uses the easing of the keyframe it arrives at. Numbers interpolate; colour strings mix per channel.
// The keyframe pair around a frame and the eased progress between them (repeat and reverse applied). Before the first keyframe and
// after the last, from and to are the same keyframe.
export function animationSegment(animation: { keyframes: readonly { frame: number; value: unknown; easing?: Easing }[]; repeat?: number; reverse?: boolean }, frame: number): { from: unknown; to: unknown; t: number } { const keys=animation.keyframes; const duration=keys.at(-1)!.frame; let f=duration === 0 ? 0 : frame; if (animation.repeat !== undefined && duration > 0) { const cycle=Math.min(Math.floor(f/duration), animation.repeat); f=f-cycle*duration; if(animation.reverse && cycle%2) f=duration-f; }
  if (f <= keys[0]!.frame) return { from: keys[0]!.value, to: keys[0]!.value, t: 0 }; if (f >= keys.at(-1)!.frame) return { from: keys.at(-1)!.value, to: keys.at(-1)!.value, t: 1 };
  const i=keys.findIndex(k => k.frame >= f), from=keys[i-1]!, to=keys[i]!; return { from: from.value, to: to.value, t: ease((f-from.frame)/(to.frame-from.frame), to.easing ?? 'linear') }; }
function evaluateKeyframes(animation: Animation, frame: number): number | string { const keys=animation.keyframes; const duration=keys.at(-1)!.frame; let f=duration === 0 ? 0 : frame; if (animation.repeat !== undefined && duration > 0) { const cycle=Math.min(Math.floor(f/duration), animation.repeat); f=f-cycle*duration; if(animation.reverse && cycle%2) f=duration-f; }
  if (f <= keys[0]!.frame) return keys[0]!.value; if (f >= keys.at(-1)!.frame) return keys.at(-1)!.value;
  const i=keys.findIndex(k => k.frame >= f), from=keys[i-1]!, to=keys[i]!, t=ease((f-from.frame)/(to.frame-from.frame), to.easing ?? 'linear');
  return typeof from.value === 'string' || typeof to.value === 'string' ? mixColors(String(from.value), String(to.value), t) : from.value+(to.value-from.value)*t; }
// A repeatable random number in [-1, 1] for an integer step and seed: the same everywhere, so a render and the Player agree.
const hashNoise = (step: number, seed: number) => { let x=Math.imul((step|0) ^ Math.imul((seed|0)+1, 0x9e3779b1), 0x27d4eb2d); x=Math.imul(x ^ (x >>> 15), 0x85ebca6b); x=Math.imul(x ^ (x >>> 13), 0xc2b2ae35); return (((x ^ (x >>> 16)) >>> 0) / 4294967295)*2-1; };
/**
 * Procedural wobble added to an animated number: secondary motion, handheld drift, a floating idle. `every` is the number of frames between new
 * random targets (smoothly eased between them); with `hold` each target is kept until the next, which is how a hand-redrawn "boil" jumps
 * a few times a second instead of gliding. Depends only on the frame and the seed, so it is the same in every render.
 */
export function wiggleOffset(wiggle: { amount: number; every?: number; seed?: number; hold?: boolean }, frame: number): number {
  const every=Math.max(1, wiggle.every ?? 12), seed=wiggle.seed ?? 0, k=Math.floor(frame/every);
  if (wiggle.hold) return wiggle.amount*hashNoise(k, seed);
  const t=frame/every-k, s=t*t*(3-2*t); return wiggle.amount*(hashNoise(k, seed)*(1-s)+hashNoise(k+1, seed)*s); }
export function evaluateAnimation(animation: Animation, frame: number): number | string { const value=evaluateKeyframes(animation, frame);
  const wiggle=(animation as { wiggle?: { amount: number; every?: number; seed?: number; hold?: boolean } }).wiggle;
  return wiggle && typeof value === 'number' ? value+wiggleOffset(wiggle, frame) : value; }
export function spring(frame: number, fps: number, config: { damping?: number; stiffness?: number; mass?: number } = {}): number { const t=frame/fps, d=config.damping ?? 12, k=config.stiffness ?? 100, m=config.mass ?? 1, w=Math.sqrt(k/m), z=d/(2*Math.sqrt(k*m)); return z<1 ? 1-Math.exp(-z*w*t)*(Math.cos(w*Math.sqrt(1-z*z)*t)+(z/Math.sqrt(1-z*z))*Math.sin(w*Math.sqrt(1-z*z)*t)) : 1-Math.exp(-w*t); }
