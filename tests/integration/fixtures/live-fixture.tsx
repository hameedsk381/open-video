import { useLayoutEffect, useRef, useState } from 'react';
import { continueRender, delayRender, useCurrentFrame } from '@ove/react';

// A React video that needs a real page: a 2D canvas, a WebGL canvas, work finished after a timer (delayRender) and a rule added to the
// page's stylesheet with insertRule (what css-in-js libraries do). Four panels, each with one colour to look for.
export const config = { id: 'live', width: 320, height: 180, fps: 30, durationInFrames: 40, background: '#101820' };

export default function Live() {
  const frame = useCurrentFrame(), flat = useRef<HTMLCanvasElement>(null), gl = useRef<HTMLCanvasElement>(null), [late, setLate] = useState('#000000');
  useLayoutEffect(() => { const ctx = flat.current!.getContext('2d')!; ctx.fillStyle = frame < 20 ? '#ff0000' : '#0000ff'; ctx.fillRect(0, 0, 100, 100); }, [frame]);
  useLayoutEffect(() => { const g = gl.current!.getContext('webgl', { preserveDrawingBuffer: true })!; if (frame < 20) g.clearColor(0, 1, 0, 1); else g.clearColor(1, 1, 0, 1); g.clear(g.COLOR_BUFFER_BIT); }, [frame]);
  useLayoutEffect(() => { const handle = delayRender('late colour'); const timer = setTimeout(() => { setLate('#ff00ff'); setTimeout(() => continueRender(handle), 10); }, 40); return () => clearTimeout(timer); }, []);
  useLayoutEffect(() => { const style = document.createElement('style'); document.head.appendChild(style); style.sheet!.insertRule('.live-css { background: #00ffff; }', 0); return () => { style.remove(); }; }, []);
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <canvas ref={flat} width={100} height={100} style={{ position: 'absolute', left: 0, top: 0 }} />
      <canvas ref={gl} width={100} height={100} style={{ position: 'absolute', left: 110, top: 0 }} />
      <div style={{ position: 'absolute', left: 220, top: 0, width: 100, height: 100, background: late }} />
      <div className="live-css" style={{ position: 'absolute', left: 0, top: 110, width: 100, height: 60 }} />
    </div>
  );
}
