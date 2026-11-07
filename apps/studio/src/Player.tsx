import { forwardRef, useEffect, useImperativeHandle, useRef, useState, useCallback } from 'react';
import { dur, type Detail } from './api';
import { TimelineScrubber } from './TimelineScrubber';

type LivePlayer = {
  readonly frame: number;
  readonly playing: boolean;
  play(): Promise<void>;
  pause(): void;
  seek(frame: number): Promise<void>;
  on(event: string, listener: (detail: any) => void): () => void;
  destroy(): void;
};

export type PlayerHandle = { seek(frame: number): void; frame(): number };

export const PlayerView = forwardRef<PlayerHandle, {
  detail: Detail;
  startFrame: number;
  selectedSceneId?: string | null;
  onSelectScene?: (sceneId: string) => void;
}>(function PlayerView(
  { detail, startFrame, selectedSceneId = null, onSelectScene },
  ref
) {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<LivePlayer | null>(null);
  const [frame, setFrame] = useState(startFrame);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');
  const [showSafeZone, setShowSafeZone] = useState(false);

  const total = detail.durationFrames;
  const isVertical = detail.height >= detail.width;

  useImperativeHandle(
    ref,
    () => ({
      seek: f => {
        void player.current?.seek(f);
        setFrame(f);
      },
      frame: () => player.current?.frame ?? frame,
    }),
    [frame]
  );

  useEffect(() => {
    let dead = false;
    let made: LivePlayer | undefined;
    const el = host.current!;
    el.innerHTML = '';
    setError('');

    const load = new Function('url', 'return import(url)') as (
      url: string
    ) => Promise<{ createPlayer: (container: HTMLElement, options: unknown) => Promise<LivePlayer> }>;

    load('/player.js')
      .then(m =>
        m.createPlayer(el, {
          composition: detail.source.raw,
          media: detail.source.media,
          assetBase: location.origin + detail.source.base,
          allowCode: true,
          controls: false,
        })
      )
      .then(p => {
        if (dead) {
          p.destroy();
          return;
        }
        made = p;
        player.current = p;
        p.on('frame', f => setFrame(typeof f === 'number' ? f : p.frame));
        p.on('play', () => setPlaying(true));
        p.on('pause', () => setPlaying(false));
        p.on('ended', () => setPlaying(false));
        p.on('error', e => setError(String(e?.message ?? e)));
        if (startFrame) void p.seek(startFrame);
      })
      .catch(e => {
        if (!dead) setError(`Could not start preview player: ${e.message}`);
      });

    return () => {
      dead = true;
      player.current = null;
      try {
        made?.destroy();
      } catch {
        /* already gone */
      }
    };
  }, [detail.source]);

  const toggle = useCallback(() => {
    const p = player.current;
    if (!p) return;
    if (p.playing) p.pause();
    else void p.play();
  }, []);

  const seekTo = useCallback((f: number) => {
    const p = player.current;
    if (p?.playing) p.pause();
    void p?.seek(f);
    setFrame(f);
  }, []);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (event.key === ' ') {
        event.preventDefault();
        toggle();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        const delta = event.shiftKey ? 10 : 1;
        seekTo(Math.max(0, (player.current?.frame ?? frame) - delta));
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        const delta = event.shiftKey ? 10 : 1;
        seekTo(Math.min(total - 1, (player.current?.frame ?? frame) + delta));
      }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [toggle, seekTo, frame, total]);

  return (
    <>
      <div className="screen" style={{ position: 'relative' }}>
        <div ref={host} style={{ width: '100%' }} />

        {showSafeZone && isVertical ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: 'inset 0 0 0 1px rgba(99, 102, 241, 0.4)',
            }}
          >
            {/* Top Navigation & Status Bar Safe Area (8%) */}
            <div
              style={{
                height: '8%',
                background: 'rgba(239, 68, 68, 0.16)',
                borderBottom: '1px dashed rgba(239, 68, 68, 0.6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fca5a5',
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              Header Safe Margin (Stories / Reels / TikTok UI)
            </div>

            <div style={{ flex: 1, display: 'flex' }}>
              <div style={{ flex: 1 }} />
              {/* Right Engagement Column Safe Area (11%) */}
              <div
                style={{
                  width: '12%',
                  background: 'rgba(239, 68, 68, 0.16)',
                  borderLeft: '1px dashed rgba(239, 68, 68, 0.6)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  writingMode: 'vertical-rl',
                  color: '#fca5a5',
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  padding: 4,
                }}
              >
                Engagement Buttons (Like / Share / Profile)
              </div>
            </div>

            {/* Bottom Caption & Audio Bar Safe Area (18%) */}
            <div
              style={{
                height: '18%',
                background: 'rgba(239, 68, 68, 0.16)',
                borderTop: '1px dashed rgba(239, 68, 68, 0.6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fca5a5',
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              Feed Overlay Margin (Account / Caption / Music Tag)
            </div>
          </div>
        ) : null}

        {error ? <div className="notice error" style={{ margin: 16 }}>{error}</div> : null}
      </div>

      <TimelineScrubber
        detail={detail}
        currentFrame={frame}
        playing={playing}
        isVertical={isVertical}
        showSafeZone={showSafeZone}
        onTogglePlay={toggle}
        onSeek={seekTo}
        onToggleSafeZone={() => setShowSafeZone(v => !v)}
        selectedSceneId={selectedSceneId}
        onSelectScene={onSelectScene}
      />
    </>
  );
});
