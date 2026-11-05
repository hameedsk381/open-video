import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { dur, type Detail, type Scene } from './api';
import {
  Button,
  PauseIcon,
  PlayIcon,
  ShieldIcon,
  StepBackIcon,
  StepForwardIcon,
  MusicIcon,
} from './ui';

export type TimelineScrubberProps = {
  detail: Detail;
  currentFrame: number;
  playing: boolean;
  isVertical: boolean;
  showSafeZone: boolean;
  onTogglePlay: () => void;
  onSeek: (frame: number) => void;
  onToggleSafeZone: () => void;
};

// Scene color palette accents for visual track differentiation
const SCENE_COLORS = [
  { bg: 'rgba(99, 102, 241, 0.18)', border: 'rgba(99, 102, 241, 0.45)', text: '#a5b4fc', active: 'rgba(99, 102, 241, 0.35)' },
  { bg: 'rgba(14, 165, 233, 0.18)', border: 'rgba(14, 165, 233, 0.45)', text: '#7dd3fc', active: 'rgba(14, 165, 233, 0.35)' },
  { bg: 'rgba(168, 85, 247, 0.18)', border: 'rgba(168, 85, 247, 0.45)', text: '#d8b4fe', active: 'rgba(168, 85, 247, 0.35)' },
  { bg: 'rgba(16, 185, 129, 0.18)', border: 'rgba(16, 185, 129, 0.45)', text: '#6ee7b7', active: 'rgba(16, 185, 129, 0.35)' },
  { bg: 'rgba(245, 158, 11, 0.18)', border: 'rgba(245, 158, 11, 0.45)', text: '#fcd34d', active: 'rgba(245, 158, 11, 0.35)' },
  { bg: 'rgba(244, 63, 94, 0.18)', border: 'rgba(244, 63, 94, 0.45)', text: '#fda4af', active: 'rgba(244, 63, 94, 0.35)' },
];

export function TimelineScrubber({
  detail,
  currentFrame,
  playing,
  isVertical,
  showSafeZone,
  onTogglePlay,
  onSeek,
  onToggleSafeZone,
}: TimelineScrubberProps) {
  const total = Math.max(1, detail.durationFrames);
  const fps = detail.fps || 30;
  const progressPercent = Math.min(100, Math.max(0, (currentFrame / total) * 100));

  const trackRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hoverFrame, setHoverFrame] = useState<number | null>(null);
  const [audioPeaks, setAudioPeaks] = useState<number[] | null>(null);
  const [hasAudio, setHasAudio] = useState(false);

  // Identify audio assets
  const audioSrc = useMemo(() => {
    const rawAssets = (detail.source.raw as any)?.assets;
    if (Array.isArray(rawAssets)) {
      const match = rawAssets.find((a: any) =>
        a?.type === 'audio' ||
        (typeof a?.src === 'string' && /\.(mp3|wav|ogg|m4a)$/i.test(a.src))
      );
      if (match?.src) {
        return match.src.startsWith('http')
          ? match.src
          : `${location.origin}${detail.source.base}${match.src.replace(/^\//, '')}`;
      }
    }
    const contractAsset = detail.assets?.find(a =>
      a.kind === 'audio' || /\.(mp3|wav|ogg|m4a)$/i.test(a.name)
    );
    if (contractAsset?.path) {
      return `${location.origin}${detail.source.base}${contractAsset.name.replace(/^\//, '')}`;
    }
    return null;
  }, [detail.source, detail.assets]);

  // Decode audio for waveform
  useEffect(() => {
    if (!audioSrc) {
      setAudioPeaks(null);
      setHasAudio(false);
      return;
    }

    let canceled = false;
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();

    fetch(audioSrc)
      .then(res => (res.ok ? res.arrayBuffer() : null))
      .then(buffer => {
        if (!buffer || canceled) return null;
        return audioCtx.decodeAudioData(buffer);
      })
      .then(decoded => {
        if (!decoded || canceled) return;
        const channelData = decoded.getChannelData(0);
        const samples = 140; // Number of peak bars
        const blockSize = Math.floor(channelData.length / samples);
        const peaks: number[] = [];

        for (let i = 0; i < samples; i++) {
          const start = i * blockSize;
          let sum = 0;
          for (let j = 0; j < blockSize; j++) {
            sum += Math.abs(channelData[start + j] || 0);
          }
          peaks.push(Math.min(1, (sum / blockSize) * 2.8));
        }

        setAudioPeaks(peaks);
        setHasAudio(true);
      })
      .catch(() => {
        setAudioPeaks(null);
        setHasAudio(false);
      })
      .finally(() => {
        try {
          audioCtx.close();
        } catch {}
      });

    return () => {
      canceled = true;
      try {
        audioCtx.close();
      } catch {}
    };
  }, [audioSrc]);

  // Render Waveform Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const playRatio = currentFrame / total;

    if (audioPeaks && audioPeaks.length > 0) {
      const barWidth = width / audioPeaks.length;
      const barGap = 1.5;

      for (let i = 0; i < audioPeaks.length; i++) {
        const peak = Math.max(0.06, audioPeaks[i]!);
        const barHeight = peak * (height - 6);
        const x = i * barWidth;
        const y = (height - barHeight) / 2;
        const barRatio = i / audioPeaks.length;

        if (barRatio <= playRatio) {
          ctx.fillStyle = '#38bdf8'; // Played highlight
        } else {
          ctx.fillStyle = 'rgba(148, 163, 184, 0.28)'; // Unplayed
        }

        ctx.beginPath();
        ctx.roundRect(x + barGap / 2, y, Math.max(1, barWidth - barGap), barHeight, 1.5);
        ctx.fill();
      }
    } else {
      // Visual rhythmic tick grid when no audio is decoded
      const seconds = total / fps;
      const step = Math.max(1, Math.round(seconds / 10));
      ctx.fillStyle = 'rgba(148, 163, 184, 0.25)';
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
      ctx.font = '10px monospace';
      ctx.textBaseline = 'middle';

      for (let s = 0; s <= seconds; s += step) {
        const x = (s / seconds) * width;
        ctx.beginPath();
        ctx.moveTo(x, 4);
        ctx.lineTo(x, height - 4);
        ctx.stroke();
        ctx.fillText(`${s}s`, x + 4, height / 2);
      }
    }
  }, [audioPeaks, currentFrame, total, fps]);

  // Frame calculation from mouse/touch event
  const frameFromPointer = useCallback(
    (e: React.MouseEvent | MouseEvent | React.TouchEvent | TouchEvent) => {
      const track = trackRef.current;
      if (!track) return currentFrame;
      const rect = track.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0]?.clientX ?? 0 : (e as MouseEvent).clientX;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return Math.round(ratio * (total - 1));
    },
    [currentFrame, total]
  );

  const handlePointerDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    const f = frameFromPointer(e);
    onSeek(f);
  };

  const handlePointerMove = (e: React.MouseEvent) => {
    const f = frameFromPointer(e);
    setHoverFrame(f);
    if (isDragging) {
      onSeek(f);
    }
  };

  const handlePointerLeave = () => {
    setHoverFrame(null);
  };

  useEffect(() => {
    const handleGlobalMove = (e: MouseEvent) => {
      if (!isDragging) return;
      onSeek(frameFromPointer(e));
    };
    const handleGlobalUp = () => {
      if (isDragging) setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleGlobalMove);
      window.addEventListener('mouseup', handleGlobalUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleGlobalMove);
      window.removeEventListener('mouseup', handleGlobalUp);
    };
  }, [isDragging, frameFromPointer, onSeek]);

  // Stepping helpers
  const stepFrame = (delta: number) => {
    const next = Math.max(0, Math.min(total - 1, currentFrame + delta));
    onSeek(next);
  };

  const activeSceneIndex = detail.scenes.findIndex(
    s => currentFrame >= s.startFrame && currentFrame < s.startFrame + s.durationFrames
  );

  return (
    <div className="timeline-panel" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
      {/* 1. Track Bar (Scenes + Waveform + Playhead) */}
      <div
        ref={trackRef}
        className="timeline-track"
        onMouseDown={handlePointerDown}
        onMouseMove={handlePointerMove}
        onMouseLeave={handlePointerLeave}
        style={{
          position: 'relative',
          height: 64,
          background: 'rgba(15, 23, 42, 0.75)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          overflow: 'hidden',
          cursor: isDragging ? 'grabbing' : 'pointer',
          userSelect: 'none',
        }}
      >
        {/* Scene Blocks Segmented Track */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 24,
            display: 'flex',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          {detail.scenes.map((scene, idx) => {
            const widthPct = (scene.durationFrames / total) * 100;
            const leftPct = (scene.startFrame / total) * 100;
            const color = SCENE_COLORS[idx % SCENE_COLORS.length]!;
            const isActive = activeSceneIndex === idx;

            return (
              <div
                key={scene.id || idx}
                onClick={e => {
                  e.stopPropagation();
                  onSeek(scene.startFrame);
                }}
                title={`${scene.name || scene.id} (${dur(scene.durationFrames / fps)})`}
                style={{
                  position: 'absolute',
                  left: `${leftPct}%`,
                  width: `${widthPct}%`,
                  height: '100%',
                  background: isActive ? color.active : color.bg,
                  borderRight: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 6px',
                  boxSizing: 'border-box',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  color: color.text,
                  fontSize: 11,
                  fontWeight: 600,
                  transition: 'background 0.15s ease',
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {scene.name || scene.id}
                </span>
                <span style={{ fontSize: 9.5, opacity: 0.65, marginLeft: 4 }}>
                  {dur(scene.durationFrames / fps)}
                </span>
              </div>
            );
          })}
        </div>

        {/* Audio Waveform Canvas */}
        <canvas
          ref={canvasRef}
          width={800}
          height={38}
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            width: '100%',
            height: 38,
            pointerEvents: 'none',
          }}
        />

        {/* Audio Track Tag indicator */}
        {hasAudio ? (
          <div
            style={{
              position: 'absolute',
              bottom: 4,
              left: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 10,
              color: 'var(--muted)',
              pointerEvents: 'none',
              opacity: 0.75,
            }}
          >
            <MusicIcon size={10} />
            <span>Audio Stem</span>
          </div>
        ) : null}

        {/* Hover Ghost Cursor */}
        {hoverFrame !== null && !isDragging ? (
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${(hoverFrame / total) * 100}%`,
              width: 1,
              background: 'rgba(255, 255, 255, 0.4)',
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 2,
                left: 4,
                fontSize: 9.5,
                background: 'rgba(0,0,0,0.8)',
                padding: '1px 4px',
                borderRadius: 3,
                color: '#fff',
                fontFamily: 'var(--mono)',
              }}
            >
              f{hoverFrame}
            </div>
          </div>
        ) : null}

        {/* Glowing Current Playhead */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${progressPercent}%`,
            width: 2,
            background: '#38bdf8',
            boxShadow: '0 0 10px rgba(56, 189, 248, 0.8), 0 0 4px #38bdf8',
            pointerEvents: 'none',
            transform: 'translateX(-50%)',
            zIndex: 10,
          }}
        >
          {/* Top handle pill */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 10,
              height: 10,
              background: '#38bdf8',
              borderRadius: '50%',
              boxShadow: '0 1px 4px rgba(0,0,0,0.6)',
            }}
          />
        </div>
      </div>

      {/* 2. Transport Controls & Metadata Bar */}
      <div
        className="timeline-transport"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '6px 12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Step Back 1 Frame */}
          <Button
            size="sm"
            variant="ghost"
            icon={<StepBackIcon size={12} />}
            onClick={() => stepFrame(-1)}
            title="Step Back 1 Frame (Left Arrow)"
          />

          {/* Play / Pause */}
          <Button
            size="sm"
            variant="primary"
            style={{ minWidth: 72 }}
            icon={playing ? <PauseIcon size={12} /> : <PlayIcon size={12} />}
            onClick={onTogglePlay}
          >
            {playing ? 'Pause' : 'Play'}
          </Button>

          {/* Step Forward 1 Frame */}
          <Button
            size="sm"
            variant="ghost"
            icon={<StepForwardIcon size={12} />}
            onClick={() => stepFrame(1)}
            title="Step Forward 1 Frame (Right Arrow)"
          />
        </div>

        {/* Timecode & Frame Counter */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontFamily: 'var(--mono)',
            fontSize: 12.5,
            color: 'var(--text)',
          }}
        >
          <div>
            <span style={{ color: '#38bdf8', fontWeight: 600 }}>{dur(currentFrame / fps)}</span>
            <span style={{ color: 'var(--muted)', margin: '0 4px' }}>/</span>
            <span style={{ color: 'var(--muted)' }}>{dur(total / fps)}</span>
          </div>

          <div
            style={{
              fontSize: 11,
              color: 'var(--muted)',
              background: 'rgba(255, 255, 255, 0.05)',
              padding: '2px 8px',
              borderRadius: 4,
            }}
          >
            Frame {currentFrame} / {total - 1} · {fps} FPS
          </div>
        </div>

        {/* Safe Zone Toggle for Social Content */}
        <div>
          {isVertical ? (
            <Button
              size="sm"
              variant={showSafeZone ? 'secondary' : 'ghost'}
              icon={<ShieldIcon size={13} />}
              onClick={onToggleSafeZone}
              title="Toggle TikTok / Reels / Shorts 9:16 UI Safe Zone"
            >
              {showSafeZone ? 'Hide Safe-Zone' : 'Safe-Zone'}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

