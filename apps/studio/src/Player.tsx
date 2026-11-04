import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { dur, type Detail } from './api';
import { Button } from './ui';

// The browser Player (the same drawing code as renders) is served by the studio at /player.js. It is not part of this bundle.
type LivePlayer = { readonly frame: number; readonly playing: boolean; play(): Promise<void>; pause(): void; seek(frame: number): Promise<void>; on(event: string, listener: (detail: any) => void): () => void; destroy(): void };
export type PlayerHandle = { seek(frame: number): void; frame(): number };

export const PlayerView = forwardRef<PlayerHandle, { detail: Detail; startFrame: number }>(function PlayerView({ detail, startFrame }, ref) {
  const host = useRef<HTMLDivElement>(null), player = useRef<LivePlayer | null>(null);
  const [frame, setFrame] = useState(startFrame), [playing, setPlaying] = useState(false), [error, setError] = useState('');
  const [showSafeZone, setShowSafeZone] = useState(false);
  const total = detail.durationFrames;
  const isVertical = detail.height >= detail.width;
  useImperativeHandle(ref, () => ({ seek: f => { void player.current?.seek(f); setFrame(f); }, frame: () => player.current?.frame ?? frame }), [frame]);
  useEffect(() => {
    let dead = false, made: LivePlayer | undefined; const el = host.current!; el.innerHTML = ''; setError('');
    const load = new Function('url', 'return import(url)') as (url: string) => Promise<{ createPlayer: (container: HTMLElement, options: unknown) => Promise<LivePlayer> }>;
    load('/player.js').then(m => m.createPlayer(el, { composition: detail.source.raw, media: detail.source.media, assetBase: location.origin + detail.source.base, allowCode: false, controls: false })).then(p => {
      if (dead) { p.destroy(); return; }
      made = p; player.current = p; p.on('frame', f => setFrame(typeof f === 'number' ? f : p.frame)); p.on('play', () => setPlaying(true)); p.on('pause', () => setPlaying(false)); p.on('ended', () => setPlaying(false));
      p.on('error', e => setError(String(e?.message ?? e))); if (startFrame) void p.seek(startFrame);
    }).catch(e => { if (!dead) setError(`The preview could not start: ${e.message}`); });
    return () => { dead = true; player.current = null; try { made?.destroy(); } catch { /* already gone */ } };
  }, [detail.source]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === ' ' && event.target === document.body) { event.preventDefault(); toggle(); } };
    document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key);
  });
  const toggle = () => { const p = player.current; if (!p) return; if (p.playing) p.pause(); else void p.play(); };
  return <>
    <div className="screen" style={{ position: 'relative' }}>
      <div ref={host} style={{ width: '100%' }} />
      {showSafeZone && isVertical ? (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'flex', flexDirection: 'column' }}>
          {/* Top Safe Zone Bar (8%) */}
          <div style={{ height: '8%', background: 'rgba(239, 68, 68, 0.25)', borderBottom: '1px dashed #ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fca5a5', fontSize: 11, fontWeight: 600 }}>
            Top UI Safe Zone (Search / Bar)
          </div>
          <div style={{ flex: 1, display: 'flex' }}>
            <div style={{ flex: 1 }} />
            {/* Right Safe Zone Band (11%) */}
            <div style={{ width: '11%', background: 'rgba(239, 68, 68, 0.25)', borderLeft: '1px dashed #ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', writingMode: 'vertical-rl', color: '#fca5a5', fontSize: 10, fontWeight: 600 }}>
              Action Controls
            </div>
          </div>
          {/* Bottom Safe Zone Bar (18%) */}
          <div style={{ height: '18%', background: 'rgba(239, 68, 68, 0.25)', borderTop: '1px dashed #ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fca5a5', fontSize: 11, fontWeight: 600 }}>
            Bottom Feed UI (Caption / Audio / Actions)
          </div>
        </div>
      ) : null}
      {error ? <div className="notice error" style={{ margin: 16 }}>{error}</div> : null}
    </div>
    <div className="xport">
      <Button size="sm" variant="primary" style={{ minWidth: 68 }} onClick={toggle}>{playing ? 'Pause' : 'Play'}</Button>
      <input type="range" min={0} max={Math.max(1, total - 1)} step={1} value={Math.min(frame, total - 1)} onChange={e => { const f = Number(e.target.value); const p = player.current; if (p?.playing) p.pause(); void p?.seek(f); setFrame(f); }} />
      <span className="time">{dur(frame / detail.fps)} / {dur(total / detail.fps)}</span>
      {isVertical ? (
        <Button size="sm" variant={showSafeZone ? 'secondary' : 'ghost'} onClick={() => setShowSafeZone(v => !v)} title="Toggle Reels/TikTok 9:16 safe-zone overlay">
          {showSafeZone ? 'Hide Safe Zone' : 'Safe Zone'}
        </Button>
      ) : null}
    </div>
  </>;
});
