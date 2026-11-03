// A video written as React components. `ove build examples/react-video/video.tsx` bundles it next to this file; render it with --allow-code
// (it is your JavaScript running while rendering). In your own project import from 'open-video-engine/react' instead of '@ove/react'.
import { AbsoluteFill, Easing, Series, interpolate, random, spring, useCurrentFrame, useVideoConfig } from '@ove/react';

export const config = { id: 'react-video', name: 'A video written in React', width: 1920, height: 1080, fps: 30, durationInFrames: 270, background: '#0b1020', export: { loudness: -16 }, props: { title: 'Components, frame by frame', accent: '#22d3ee' } };
// Plain OVE layers can sit beside the component: here, two sound effects.
export const layers = [
  { id: 'whoosh', type: 'audio', src: 'sfx:whoosh', startFrame: 4, volume: 0.45 },
  { id: 'ding', type: 'audio', src: 'sfx:ding', startFrame: 150, volume: 0.4 },
];

const Title = ({ text, accent }: { text: string; accent: string }) => {
  const frame = useCurrentFrame(), { fps } = useVideoConfig();
  const words = text.split(' ');
  return (
    <div style={{ position: 'absolute', left: 160, top: 300, right: 160, fontFamily: 'Inter', fontWeight: 800, fontSize: 130, color: '#f5f7fb', lineHeight: 1.08 }}>
      {words.map((word, i) => {
        const rise = spring({ frame: frame - i * 5, fps, damping: 14, stiffness: 110, from: 60, to: 0 });
        const opacity = interpolate(frame - i * 5, [0, 8], [0, 1]);
        return <span key={i} style={{ display: 'inline-block', marginRight: 28, transform: `translateY(${rise}px)`, opacity, color: i === words.length - 1 ? accent : undefined }}>{word}</span>;
      })}
    </div>
  );
};

const Bars = ({ accent }: { accent: string }) => {
  const frame = useCurrentFrame();
  const values = [42, 68, 55, 90, 76, 100];
  return (
    <svg width={1500} height={420} style={{ position: 'absolute', left: 210, top: 420 }}>
      {values.map((value, i) => {
        const grow = interpolate(frame, [i * 6, i * 6 + 24], [0, 1], { easing: Easing.out(Easing.cubic) });
        const height = value * 4 * grow;
        return <rect key={i} x={i * 250} y={400 - height} width={170} height={height} rx={14} fill={accent} opacity={0.35 + 0.65 * (value / 100)} />;
      })}
      <line x1={0} y1={402} x2={1500} y2={402} stroke="#9aa6c4" strokeWidth={2} opacity={0.5} />
    </svg>
  );
};

const Stars = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      {Array.from({ length: 70 }, (_, i) => {
        const x = random(`x${i}`) * 1920, y = (random(`y${i}`) * 1080 + frame * (0.3 + random(`s${i}`))) % 1080, size = 2 + random(`z${i}`) * 4;
        return <div key={i} style={{ position: 'absolute', left: x, top: y, width: size, height: size, borderRadius: '50%', background: i % 3 ? '#22d3ee' : '#a78bfa', opacity: 0.2 + 0.4 * random(`o${i}`) }} />;
      })}
    </AbsoluteFill>
  );
};

export default function Video({ title, accent }: { title: string; accent: string }) {
  const frame = useCurrentFrame();
  const fade = interpolate(frame, [250, 270], [1, 0], { clamp: true });
  return (
    <AbsoluteFill style={{ opacity: fade }}>
      <Stars />
      <Series>
        <Series.Sequence durationInFrames={120}><Title text={title} accent={accent} /></Series.Sequence>
        <Series.Sequence durationInFrames={150}>
          <div style={{ position: 'absolute', left: 210, top: 200, fontFamily: 'Inter', fontWeight: 700, fontSize: 64, color: '#f5f7fb' }}>Growth, drawn with SVG</div>
          <Bars accent={accent} />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
}
