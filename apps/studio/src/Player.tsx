import { forwardRef, useEffect, useImperativeHandle, useRef, useState, useCallback } from 'react';
import { type Detail } from './api';
import type { ReactNode } from 'react';
import { TimelineScrubber } from './TimelineScrubber';
import { Badge, Button } from './ui';
import { CanvasDirectOverlay } from './CanvasDirectOverlay';
import type { LayerMove } from './safeZone';

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

export type CompareTarget = {
  n: number;
  label: string;
  raw: any;
};

export type PlayerViewProps = {
  detail: Detail;
  startFrame: number;
  selectedSceneId?: string | null;
  onSelectScene?: (sceneId: string) => void;
  compareTarget?: CompareTarget | null;
  onCloseCompare?: () => void;
  onRestoreCompare?: (n: number) => void;
  onFrame?: (frame: number) => void;
  selectedLayerPath?: string | null;
  onSelectLayerPath?: (path: string | null) => void;
  onSaveLayerText?: (path: string, content: string, variableName?: string) => Promise<void>;
  onSnapLayers?: (moves: LayerMove[]) => Promise<void>;
  /** Shown at the top of the timeline: which scene is being edited, and adding one. */
  timelineHeader?: ReactNode;
};

export const PlayerView = forwardRef<PlayerHandle, PlayerViewProps>(function PlayerView(
  {
    detail,
    startFrame,
    selectedSceneId = null,
    onSelectScene,
    compareTarget = null,
    onCloseCompare,
    onRestoreCompare,
    onFrame,
    selectedLayerPath = null,
    onSelectLayerPath,
    onSaveLayerText,
    onSnapLayers,
    timelineHeader,
  },
  ref
) {
  const host = useRef<HTMLDivElement>(null);
  const compareHost = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const player = useRef<LivePlayer | null>(null);
  const comparePlayer = useRef<LivePlayer | null>(null);
  const [frame, setFrame] = useState(startFrame);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');
  const [showSafeZone, setShowSafeZone] = useState(false);

  // Compare mode state
  const [splitPercent, setSplitPercent] = useState(50);
  const [isDraggingDivider, setIsDraggingDivider] = useState(false);
  const [compareMode, setCompareMode] = useState<'split' | 'side-by-side' | 'flip'>('split');
  const [flipShowBefore, setFlipShowBefore] = useState(false);

  // The parent hands in a new onFrame on every render, and every played frame renders it. Held in refs, they are read when needed and
  // never restart the player: it is rebuilt only when the video itself changes.
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;
  const startFrameRef = useRef(startFrame);
  startFrameRef.current = startFrame;

  const total = detail.durationFrames;
  const isVertical = detail.height >= detail.width;

  useImperativeHandle(
    ref,
    () => ({
      seek: f => {
        void player.current?.seek(f);
        void comparePlayer.current?.seek(f);
        setFrame(f);
        onFrameRef.current?.(f);
      },
      frame: () => player.current?.frame ?? frame,
    }),
    [frame]
  );

  // Primary player initialization
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
        p.on('frame', f => {
          const currentF = typeof f === 'number' ? f : p.frame;
          setFrame(currentF);
          onFrameRef.current?.(currentF);
          if (comparePlayer.current && Math.abs(comparePlayer.current.frame - currentF) > 1) {
            void comparePlayer.current.seek(currentF);
          }
        });
        p.on('play', () => {
          setPlaying(true);
          void comparePlayer.current?.play();
        });
        p.on('pause', () => {
          setPlaying(false);
          comparePlayer.current?.pause();
        });
        p.on('ended', () => {
          setPlaying(false);
          comparePlayer.current?.pause();
        });
        p.on('error', e => setError(String(e?.message ?? e)));
        if (startFrameRef.current) void p.seek(startFrameRef.current);
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

  // Compare player initialization when compareTarget is provided
  useEffect(() => {
    if (!compareTarget || !compareHost.current) {
      if (comparePlayer.current) {
        try { comparePlayer.current.destroy(); } catch {}
        comparePlayer.current = null;
      }
      return;
    }

    let dead = false;
    let madeCompare: LivePlayer | undefined;
    const el = compareHost.current;
    el.innerHTML = '';

    const load = new Function('url', 'return import(url)') as (
      url: string
    ) => Promise<{ createPlayer: (container: HTMLElement, options: unknown) => Promise<LivePlayer> }>;

    load('/player.js')
      .then(m =>
        m.createPlayer(el, {
          composition: compareTarget.raw,
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
        madeCompare = p;
        comparePlayer.current = p;
        const currentF = player.current?.frame ?? frame;
        void p.seek(currentF);
      })
      .catch(() => {});

    return () => {
      dead = true;
      comparePlayer.current = null;
      try {
        madeCompare?.destroy();
      } catch {}
    };
  }, [compareTarget, detail.source.base, detail.source.media, frame]);

  const toggle = useCallback(() => {
    const p = player.current;
    if (!p) return;
    if (p.playing) {
      p.pause();
      comparePlayer.current?.pause();
    } else {
      void p.play();
      void comparePlayer.current?.play();
    }
  }, []);

  const seekTo = useCallback((f: number) => {
    const p = player.current;
    if (p?.playing) p.pause();
    comparePlayer.current?.pause();
    void p?.seek(f);
    void comparePlayer.current?.seek(f);
    setFrame(f);
    onFrameRef.current?.(f);
  }, []);

  // Divider drag handlers
  const handleDividerPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    setIsDraggingDivider(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleDividerPointerMove = (e: React.PointerEvent) => {
    if (!isDraggingDivider || !screenRef.current) return;
    const rect = screenRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const x = e.clientX - rect.left;
    const pct = Math.max(2, Math.min(98, (x / rect.width) * 100));
    setSplitPercent(pct);
  };

  const handleDividerPointerUp = (e: React.PointerEvent) => {
    setIsDraggingDivider(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
  };

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
      {compareTarget ? (
        <div className="compare-bar" style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '8px 14px',
          background: 'var(--surface-2)',
          border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)',
          borderRadius: 'var(--radius-sm)',
          marginBottom: 10,
          flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Badge tone="purple" dot>Before / After Comparison</Badge>
            <span style={{ fontSize: 13, color: 'var(--text)' }}>
              Comparing <b>v#{compareTarget.n}</b> ({compareTarget.label || 'Previous'}) with <b>Current Live</b>
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div className="segmented" style={{ transform: 'scale(0.92)' }}>
              <button
                className={compareMode === 'split' ? 'on' : ''}
                onClick={() => setCompareMode('split')}
                title="Draggable vertical divider slider"
              >
                Split Slider
              </button>
              <button
                className={compareMode === 'side-by-side' ? 'on' : ''}
                onClick={() => setCompareMode('side-by-side')}
                title="View Before and After side by side"
              >
                Side by Side
              </button>
              <button
                className={compareMode === 'flip' ? 'on' : ''}
                onClick={() => {
                  setCompareMode('flip');
                  setFlipShowBefore(prev => !prev);
                }}
                title="Toggle between 100% Before and 100% After"
              >
                {compareMode === 'flip' ? (flipShowBefore ? 'Showing: Before' : 'Showing: After') : 'A/B Flip'}
              </button>
            </div>

            {onRestoreCompare ? (
              <Button size="sm" variant="secondary" onClick={() => onRestoreCompare(compareTarget.n)}>
                Revert to #{compareTarget.n}
              </Button>
            ) : null}

            {onCloseCompare ? (
              <Button size="sm" variant="ghost" onClick={onCloseCompare} title="Exit comparison mode">
                ✕ Exit Compare
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div
        ref={screenRef}
        className={`screen ${compareTarget && compareMode === 'side-by-side' ? 'side-by-side-screen' : ''}`}
        style={{
          position: 'relative',
          overflow: 'hidden',
          display: compareTarget && compareMode === 'side-by-side' ? 'grid' : 'block',
          gridTemplateColumns: compareTarget && compareMode === 'side-by-side' ? '1fr 1fr' : undefined,
          gap: compareTarget && compareMode === 'side-by-side' ? 8 : undefined,
          userSelect: isDraggingDivider ? 'none' : 'auto',
        }}
      >
        {/* Live / After Player (Primary) */}
        <div
          style={{
            width: '100%',
            display: compareTarget && compareMode === 'flip' && flipShowBefore ? 'none' : 'block',
            position: 'relative',
          }}
        >
          {compareTarget && compareMode === 'side-by-side' ? (
            <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 10 }}>
              <Badge tone="green" dot>After · Live</Badge>
            </div>
          ) : null}
          <div ref={host} style={{ width: '100%' }} />
        </div>

        {/* Reference / Before Player (Compare) */}
        {compareTarget ? (
          <div
            ref={compareHost}
            style={
              compareMode === 'side-by-side'
                ? {
                    width: '100%',
                    position: 'relative',
                  }
                : compareMode === 'flip'
                ? {
                    width: '100%',
                    display: flipShowBefore ? 'block' : 'none',
                    position: 'relative',
                  }
                : {
                    position: 'absolute',
                    inset: 0,
                    pointerEvents: 'none',
                    clipPath: `inset(0 calc(100% - ${splitPercent}%) 0 0)`,
                    zIndex: 2,
                  }
            }
          />
        ) : null}

        {/* Split Screen Slider Overlay */}
        {compareTarget && compareMode === 'split' ? (
          <>
            {/* Split Divider Handle */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${splitPercent}%`,
                width: 2,
                transform: 'translateX(-50%)',
                background: 'var(--accent)',
                boxShadow: '0 0 10px color-mix(in srgb, var(--accent) 80%, transparent)',
                zIndex: 4,
                cursor: 'ew-resize',
                pointerEvents: 'auto',
              }}
              onPointerDown={handleDividerPointerDown}
              onPointerMove={handleDividerPointerMove}
              onPointerUp={handleDividerPointerUp}
            >
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  background: 'var(--surface)',
                  border: '1px solid var(--accent)',
                  borderRadius: 20,
                  padding: '4px 8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  color: 'var(--text)',
                  fontSize: 11,
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                  cursor: 'ew-resize',
                  userSelect: 'none',
                }}
              >
                <span>◀ Before</span>
                <span style={{ opacity: 0.4 }}>|</span>
                <span>After ▶</span>
              </div>
            </div>

            {/* Badges on canvas */}
            <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 3, pointerEvents: 'none' }}>
              <Badge tone="purple">Before · v#{compareTarget.n}</Badge>
            </div>
            <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 3, pointerEvents: 'none' }}>
              <Badge tone="blue">After · Live</Badge>
            </div>
          </>
        ) : null}

        {/* Safe Zone Overlay */}
        {showSafeZone && isVertical ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--accent) 40%, transparent)',
              zIndex: 5,
            }}
          >
            {/* Top Navigation & Status Bar Safe Area (8%) */}
            <div
              style={{
                height: '8%',
                background: 'color-mix(in srgb, var(--red) 16%, transparent)',
                borderBottom: '1px dashed color-mix(in srgb, var(--red) 60%, transparent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fca5a5',
                fontSize: 12,
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
                  background: 'color-mix(in srgb, var(--red) 16%, transparent)',
                  borderLeft: '1px dashed color-mix(in srgb, var(--red) 60%, transparent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  writingMode: 'vertical-rl',
                  color: '#fca5a5',
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  padding: 4,
                }}
              >
                Engagement Buttons (Like / Share / Profile)
              </div>
            </div>

            {/* Feed Overlay Margin */}
            <div
              style={{
                height: '18%',
                background: 'color-mix(in srgb, var(--red) 16%, transparent)',
                borderTop: '1px dashed color-mix(in srgb, var(--red) 60%, transparent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fca5a5',
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              Feed Overlay Margin (Account / Caption / Music Tag)
            </div>
          </div>
        ) : null}

        {/* Direct Canvas Text Selection & Inline Editing Overlay */}
        {!compareTarget ? (
          <CanvasDirectOverlay
            detail={detail}
            currentFrame={frame}
            selectedPath={selectedLayerPath ?? null}
            onSelectPath={onSelectLayerPath ?? (() => {})}
            onSaveText={onSaveLayerText ?? (async () => {})}
            onSnapLayers={onSnapLayers}
            disabled={playing}
          />
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
        selectedLayerPath={selectedLayerPath}
        onSelectLayerPath={onSelectLayerPath}
        header={timelineHeader}
      />
    </>
  );
});
