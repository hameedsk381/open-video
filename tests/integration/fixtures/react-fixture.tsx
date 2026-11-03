import { Sequence, interpolate, random, useCurrentFrame, useVideoConfig } from '@ove/react';

// A small React video for the tests: a box that slides with the frame, a deterministic dot, an optional picture, a late sequence.
export const config = { id: 'fixture', width: 320, height: 180, fps: 30, durationInFrames: 60, background: '#101820', assets: [{ id: 'dot', type: 'image', src: 'dot.png' }], props: { color: '#ffcc00', showImage: false } };

export default function Fixture({ color, showImage }: { color: string; showImage: boolean }) {
  const frame = useCurrentFrame(), { width } = useVideoConfig();
  const x = interpolate(frame, [0, 59], [10, width - 70]);
  return (
    <div style={{ position: 'absolute', left: x, top: 60, width: 60, height: 60, background: color }}>
      {showImage ? <img src="dot" style={{ width: 60, height: 60 }} /> : null}
      <i style={{ position: 'absolute', left: Math.round(random('seed') * 40), top: 70, width: 8, height: 8, background: '#fff' }} />
      <Sequence from={30} layout="none"><b data-late="yes" style={{ position: 'absolute', top: -30, color: '#fff', font: '700 20px Inter' }}>late</b></Sequence>
    </div>
  );
}
