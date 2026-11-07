// The effects the fx-* blocks draw: a counting number, a timecode, a highlighted word and a struck-through rewrite. One bundle serves
// every block; a react layer picks its effect with props.effect and sizes it with props.size, which the block computes from the canvas.
// Rebuild with `pnpm build:fx` (it runs `ove build` on this file and keeps only fx.bundle.js).
import { Easing, interpolate, useCurrentFrame } from '@ove/react';

export const config = { id: 'fx', width: 1080, height: 1080, fps: 30, durationInFrames: 150, props: {} };

type Props = Record<string, unknown>;
const land = Easing.bezier(0.16, 1, 0.3, 1);
const number = (value: unknown, fallback: number) => (value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : fallback);
const text = (value: unknown, fallback = '') => (value === undefined || value === null ? fallback : String(value));

/** A number that counts up from 0 to `value` over `duration` frames, then holds. */
function Counter(props: Props) {
  const frame = useCurrentFrame();
  const shown = Math.round(interpolate(frame, [0, number(props.duration, 70)], [0, number(props.value, 0)], { easing: land }));
  return (
    <div style={{ fontFamily: 'Inter', fontWeight: number(props.weight, 800) as number, fontSize: number(props.size, 96), lineHeight: 1, color: text(props.color, '#ffffff'), textAlign: text(props.align, 'left') as 'left' | 'center', letterSpacing: text(props.letterSpacing, 'normal') }}>
      {text(props.prefix)}{shown}{text(props.suffix)}
    </div>
  );
}

/** A clock that reads 00:00 and ticks up to 00:0<max> between two frames. */
function Timecode(props: Props) {
  const frame = useCurrentFrame();
  const seconds = Math.round(interpolate(frame, [number(props.start, 0), number(props.end, 150)], [0, number(props.max, 5)]));
  return <div style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: number(props.size, 28), lineHeight: 'normal', color: text(props.color, '#ffffff'), letterSpacing: '.04em' }}>00:0{seconds}</div>;
}

/** A word with a marker bar that sweeps in behind it. */
function Highlight(props: Props) {
  const frame = useCurrentFrame();
  const sweep = interpolate(frame, [8, 34], [0, 1], { easing: land });
  const accent = text(props.accent, '#22d3ee');
  return (
    <div style={{ fontFamily: 'Inter', fontWeight: 900, fontSize: number(props.size, 110), color: '#ffffff', letterSpacing: '-0.02em', display: 'flex', justifyContent: 'center' }}>
      <span style={{ padding: '0 .18em', background: `linear-gradient(${accent}, ${accent}) no-repeat left center`, backgroundSize: `${sweep * 100}% 86%` }}>{text(props.word)}</span>
    </div>
  );
}

/** A line that is struck through, then replaced by a corrected one rising in beneath it. */
function Rewrite(props: Props) {
  const frame = useCurrentFrame();
  const unit = number(props.unit, 1080);                       // the canvas's shorter side; every size below is a share of it
  const strike = interpolate(frame, [24, 44], [0, 1], { easing: land });
  const reveal = interpolate(frame, [52, 72], [0, 1], { easing: land });
  return (
    <div style={{ fontFamily: 'Inter' }}>
      <div style={{ position: 'relative', display: 'inline-block', fontWeight: 700, fontSize: Math.round(unit * 0.055), color: '#ffffff' }}>
        {text(props.old)}
        <div style={{ position: 'absolute', left: '-2%', top: '54%', height: Math.round(unit * 0.008), width: `${strike * 104}%`, background: '#ff4d4d', borderRadius: 4 }} />
      </div>
      <div style={{ marginTop: Math.round(unit * 0.025), fontWeight: 800, fontSize: Math.round(unit * 0.065), color: text(props.accent2, '#a78bfa'), opacity: reveal, transform: `translateY(${(1 - reveal) * 30}px)` }}>{text(props.corrected)}</div>
    </div>
  );
}

export default function Fx(props: Props) {
  switch (props.effect) {
    case 'counter': return <Counter {...props} />;
    case 'timecode': return <Timecode {...props} />;
    case 'highlight': return <Highlight {...props} />;
    case 'rewrite': return <Rewrite {...props} />;
    default: throw new Error(`fx has no effect "${String(props.effect)}"`);
  }
}
