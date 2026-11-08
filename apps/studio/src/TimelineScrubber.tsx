import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { dur, type Detail } from './api';
import {
  Button,
  PauseIcon,
  PlayIcon,
  ShieldIcon,
  StepBackIcon,
  StepForwardIcon,
  MusicIcon,
  LayersIcon,
  TypeIcon,
  ImagesIcon,
  FilmIcon,
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
  selectedSceneId?: string | null;
  onSelectScene?: (sceneId: string) => void;
  selectedLayerPath?: string | null;
  onSelectLayerPath?: (path: string | null) => void;
};

export type MultiTrackItem = {
  id: string;
  path: string;
  sceneId: string;
  sceneName: string;
  category: 'scene' | 'text' | 'media' | 'audio';
  type: string;
  name: string;
  snippet?: string;
  startFrame: number;
  endFrame: number;
  durationFrames: number;
  startPct: number;
  widthPct: number;
};

// Scenes alternate between the accent and a neutral so neighbours read apart: colour is not a scene's identity, and the interface keeps one accent.
const SCENE_COLORS = [
  { bg: 'color-mix(in srgb, var(--accent) 18%, transparent)', border: 'color-mix(in srgb, var(--accent) 45%, transparent)', text: 'var(--accent-2)', active: 'color-mix(in srgb, var(--accent) 35%, transparent)' },
  { bg: 'color-mix(in srgb, var(--muted) 16%, transparent)', border: 'color-mix(in srgb, var(--muted) 40%, transparent)', text: 'var(--text)', active: 'color-mix(in srgb, var(--muted) 30%, transparent)' },
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
  selectedSceneId = null,
  onSelectScene,
  selectedLayerPath = null,
  onSelectLayerPath,
}: TimelineScrubberProps) {
  const total = Math.max(1, detail.durationFrames);
  const fps = detail.fps || 30;
  const progressPercent = Math.min(100, Math.max(0, (currentFrame / total) * 100));

  const trackRef = useRef<HTMLDivElement>(null);
  const multiTrackGridRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragSource, setDragSource] = useState<'main' | 'drawer' | null>(null);
  const [hoverFrame, setHoverFrame] = useState<number | null>(null);
  const [audioPeaks, setAudioPeaks] = useState<number[] | null>(null);
  const [hasAudio, setHasAudio] = useState(false);

  // Multi-track timeline expansion state (persisted per session)
  const [showMultiTrack, setShowMultiTrack] = useState(() => {
    try {
      return sessionStorage.getItem('ove_multitrack_expanded') === 'true';
    } catch {
      return false;
    }
  });

  const toggleMultiTrack = () => {
    setShowMultiTrack(prev => {
      const next = !prev;
      try { sessionStorage.setItem('ove_multitrack_expanded', String(next)); } catch {}
      return next;
    });
  };

  const [trackFilter, setTrackFilter] = useState<'all' | 'scenes' | 'text' | 'media' | 'audio'>('all');

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

  // Extract multi-track layer spans across scenes
  const multiTrackData = useMemo(() => {
    const raw = detail.source.raw as any;
    const sceneItems: MultiTrackItem[] = detail.scenes.map((s, idx) => ({
      id: s.id,
      path: `scenes[${idx}]`,
      sceneId: s.id,
      sceneName: s.name || s.id,
      category: 'scene',
      type: 'scene',
      name: s.name || `Scene ${idx + 1}`,
      snippet: dur(s.durationFrames / fps),
      startFrame: s.startFrame,
      endFrame: s.startFrame + s.durationFrames,
      durationFrames: s.durationFrames,
      startPct: (s.startFrame / total) * 100,
      widthPct: (s.durationFrames / total) * 100,
    }));

    const textItems: MultiTrackItem[] = [];
    const mediaItems: MultiTrackItem[] = [];
    const audioItems: MultiTrackItem[] = [];

    if (raw && Array.isArray(raw.scenes)) {
      for (let sIdx = 0; sIdx < raw.scenes.length; sIdx++) {
        const scene = raw.scenes[sIdx];
        const sStart = Number(scene.startFrame) || 0;
        const sDur = Number(scene.durationFrames) || 1;
        const sEnd = sStart + sDur;

        const walk = (layers: any[], basePath: string) => {
          if (!Array.isArray(layers)) return;
          for (let lIdx = 0; lIdx < layers.length; lIdx++) {
            const layer = layers[lIdx];
            if (!layer || layer.visible === false) continue;
            const currentPath = `${basePath}[${lIdx}]`;

            const lStart = Number(layer.startFrame) || 0;
            const lEnd = layer.endFrame !== undefined 
              ? Number(layer.endFrame) 
              : (layer.durationFrames !== undefined ? lStart + Number(layer.durationFrames) : sDur);
            const absStart = sStart + lStart;
            const absEnd = Math.min(sEnd, sStart + lEnd);
            const durFrames = Math.max(1, absEnd - absStart);
            const startPct = (absStart / total) * 100;
            const widthPct = (durFrames / total) * 100;

            if (layer.type === 'group') {
              walk(layer.children, `${currentPath}.children`);
            } else if (layer.type === 'text' || layer.type === 'captions') {
              let snippet = typeof layer.content === 'string' ? layer.content : '';
              if (!snippet && Array.isArray(layer.spans)) {
                snippet = layer.spans.map((sp: any) => sp.text || '').join('');
              }
              if (layer.type === 'captions' && Array.isArray(layer.cues)) {
                snippet = `${layer.cues.length} caption cues`;
              }
              textItems.push({
                id: layer.id || `text-${sIdx}-${lIdx}`,
                path: currentPath,
                sceneId: scene.id,
                sceneName: scene.name || scene.id,
                category: 'text',
                type: layer.type,
                name: layer.id || 'Text Layer',
                snippet: snippet ? (snippet.length > 24 ? snippet.slice(0, 24) + '…' : snippet) : undefined,
                startFrame: absStart,
                endFrame: absEnd,
                durationFrames: durFrames,
                startPct,
                widthPct,
              });
            } else if (layer.type === 'image' || layer.type === 'video' || layer.type === 'shape' || layer.type === 'circle' || layer.type === 'rect') {
              const srcName = typeof layer.src === 'string' ? layer.src.split('/').pop()?.split('?')[0] : undefined;
              mediaItems.push({
                id: layer.id || `media-${sIdx}-${lIdx}`,
                path: currentPath,
                sceneId: scene.id,
                sceneName: scene.name || scene.id,
                category: 'media',
                type: layer.type,
                name: layer.id || srcName || layer.type,
                snippet: srcName,
                startFrame: absStart,
                endFrame: absEnd,
                durationFrames: durFrames,
                startPct,
                widthPct,
              });
            } else if (layer.type === 'audio') {
              const srcName = typeof layer.src === 'string' ? layer.src.split('/').pop()?.split('?')[0] : undefined;
              audioItems.push({
                id: layer.id || `audio-${sIdx}-${lIdx}`,
                path: currentPath,
                sceneId: scene.id,
                sceneName: scene.name || scene.id,
                category: 'audio',
                type: layer.type,
                name: layer.id || srcName || 'Audio Clip',
                snippet: srcName,
                startFrame: absStart,
                endFrame: absEnd,
                durationFrames: durFrames,
                startPct,
                widthPct,
              });
            }
          }
        };

        walk(scene.layers, `scenes[${sIdx}].layers`);
      }
    }

    // Top-level or asset audio if no audio layers explicitly in scenes
    if (audioItems.length === 0 && (hasAudio || audioSrc)) {
      audioItems.push({
        id: 'global-audio',
        path: 'assets.audio',
        sceneId: '',
        sceneName: 'Master Track',
        category: 'audio',
        type: 'audio',
        name: 'Master Audio / Voiceover',
        snippet: audioSrc ? audioSrc.split('/').pop()?.split('?')[0] : 'Audio Stem',
        startFrame: 0,
        endFrame: total,
        durationFrames: total,
        startPct: 0,
        widthPct: 100,
      });
    }

    return { sceneItems, textItems, mediaItems, audioItems };
  }, [detail, total, fps, hasAudio, audioSrc]);

  const totalLayerCount =
    multiTrackData.sceneItems.length +
    multiTrackData.textItems.length +
    multiTrackData.mediaItems.length +
    multiTrackData.audioItems.length;

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
          ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#4693f1';
        } else {
          ctx.fillStyle = 'rgba(148, 163, 184, 0.28)';
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

  // Frame calculation from mouse/touch event on track
  const frameFromPointer = useCallback(
    (e: React.MouseEvent | MouseEvent | React.TouchEvent | TouchEvent, targetEl?: HTMLElement | null) => {
      const track = targetEl || trackRef.current;
      if (!track) return currentFrame;
      const rect = track.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0]?.clientX ?? 0 : (e as MouseEvent).clientX;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return Math.round(ratio * (total - 1));
    },
    [currentFrame, total]
  );

  const handlePointerDown = (e: React.MouseEvent, source: 'main' | 'drawer' = 'main') => {
    setIsDragging(true);
    setDragSource(source);
    const targetEl = source === 'drawer' ? multiTrackGridRef.current : trackRef.current;
    const f = frameFromPointer(e, targetEl);
    onSeek(f);
  };

  const handlePointerMove = (e: React.MouseEvent, source: 'main' | 'drawer' = 'main') => {
    const targetEl = source === 'drawer' ? multiTrackGridRef.current : trackRef.current;
    const f = frameFromPointer(e, targetEl);
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
      const targetEl = dragSource === 'drawer' ? multiTrackGridRef.current : trackRef.current;
      onSeek(frameFromPointer(e, targetEl));
    };
    const handleGlobalUp = () => {
      if (isDragging) {
        setIsDragging(false);
        setDragSource(null);
      }
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleGlobalMove);
      window.addEventListener('mouseup', handleGlobalUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleGlobalMove);
      window.removeEventListener('mouseup', handleGlobalUp);
    };
  }, [isDragging, dragSource, frameFromPointer, onSeek]);

  // Stepping helpers
  const stepFrame = (delta: number) => {
    const next = Math.max(0, Math.min(total - 1, currentFrame + delta));
    onSeek(next);
  };

  const activeSceneIndex = detail.scenes.findIndex(
    s => currentFrame >= s.startFrame && currentFrame < s.startFrame + s.durationFrames
  );

  // Time ruler ticks across video duration
  const rulerTicks = useMemo(() => {
    const totalSeconds = total / fps;
    const step = totalSeconds <= 15 ? 1 : totalSeconds <= 60 ? 2 : 5;
    const ticks: { second: number; pct: number; label: string }[] = [];
    for (let s = 0; s <= totalSeconds; s += step) {
      const pct = (s / totalSeconds) * 100;
      ticks.push({
        second: s,
        pct,
        label: `${s}s`,
      });
    }
    return ticks;
  }, [total, fps]);

  return (
    <div className="timeline-panel" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
      {/* 1. Primary Track Bar (Scenes + Waveform + Playhead) */}
      <div
        ref={trackRef}
        className="timeline-track"
        onMouseDown={e => handlePointerDown(e, 'main')}
        onMouseMove={e => handlePointerMove(e, 'main')}
        onMouseLeave={handlePointerLeave}
        style={{
          position: 'relative',
          height: 64,
          background: 'var(--surface-2)',
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
            borderBottom: '1px solid var(--border)',
          }}
        >
          {detail.scenes.map((scene, idx) => {
            const widthPct = (scene.durationFrames / total) * 100;
            const leftPct = (scene.startFrame / total) * 100;
            const color = SCENE_COLORS[idx % SCENE_COLORS.length]!;
            const isActive = activeSceneIndex === idx;
            const isSelected = selectedSceneId === scene.id;

            return (
              <div
                key={scene.id || idx}
                onClick={e => {
                  e.stopPropagation();
                  onSeek(scene.startFrame);
                  onSelectScene?.(scene.id);
                }}
                title={`${scene.name || scene.id} (${dur(scene.durationFrames / fps)})`}
                style={{
                  position: 'absolute',
                  left: `${leftPct}%`,
                  width: `${widthPct}%`,
                  height: '100%',
                  background: isSelected || isActive ? color.active : color.bg,
                  boxShadow: isSelected ? `inset 0 0 0 2px ${color.text}` : undefined,
                  borderRight: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 6px',
                  boxSizing: 'border-box',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  color: color.text,
                  fontSize: 12,
                  fontWeight: 600,
                  transition: 'background 0.15s ease',
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {scene.name || scene.id}
                </span>
                <span style={{ fontSize: 12, opacity: 0.65, marginLeft: 4 }}>
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
              fontSize: 12,
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
              background: 'color-mix(in srgb, var(--text) 40%, transparent)',
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 2,
                left: 4,
                fontSize: 12,
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
            background: 'var(--accent)',
            boxShadow: '0 0 10px color-mix(in srgb, var(--accent) 80%, transparent), 0 0 4px var(--accent)',
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
              background: 'var(--accent)',
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
          gap: 10,
          flexWrap: 'wrap',
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
            variant="secondary"
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

          {/* Multi-Track Expansion Toggle */}
          <Button
            size="sm"
            variant={showMultiTrack ? 'secondary' : 'ghost'}
            icon={<LayersIcon size={13} />}
            onClick={toggleMultiTrack}
            title={showMultiTrack ? 'Collapse Multi-Track Lanes' : 'Expand Multi-Track Timeline Lanes'}
            style={{
              border: showMultiTrack ? '1px solid var(--accent)' : undefined,
              color: showMultiTrack ? 'var(--accent)' : undefined,
              marginLeft: 4,
            }}
          >
            Tracks {totalLayerCount ? `(${totalLayerCount})` : ''}
          </Button>
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
            <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{dur(currentFrame / fps)}</span>
            <span style={{ color: 'var(--muted)', margin: '0 4px' }}>/</span>
            <span style={{ color: 'var(--muted)' }}>{dur(total / fps)}</span>
          </div>

          <div
            style={{
              fontSize: 12,
              color: 'var(--muted)',
              background: 'var(--surface-2)',
              padding: '2px 8px',
              borderRadius: 4,
            }}
          >
            Frame {currentFrame} / {total - 1} · {fps} FPS
          </div>
        </div>

        {/* Safe Zone Toggle for Social Content */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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

      {/* 3. Expandable Multi-Track Timeline Drawer */}
      {showMultiTrack ? (
        <div
          className="multitrack-drawer"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)',
          }}
        >
          {/* Drawer Header & Track Filter Pills */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 12px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--surface-2)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)', marginRight: 6 }}>
                Lanes
              </span>
              {(
                [
                  { id: 'all', label: `All (${totalLayerCount})` },
                  { id: 'scenes', label: `Scenes (${multiTrackData.sceneItems.length})`, icon: <FilmIcon size={11} /> },
                  { id: 'text', label: `Text (${multiTrackData.textItems.length})`, icon: <TypeIcon size={11} /> },
                  { id: 'media', label: `Media (${multiTrackData.mediaItems.length})`, icon: <ImagesIcon size={11} /> },
                  { id: 'audio', label: `Audio (${multiTrackData.audioItems.length})`, icon: <MusicIcon size={11} /> },
                ] as const
              ).map(filter => {
                const isActive = trackFilter === filter.id;
                return (
                  <button
                    key={filter.id}
                    onClick={() => setTrackFilter(filter.id)}
                    style={{
                      background: isActive ? 'var(--accent)' : 'transparent',
                      color: isActive ? '#fff' : 'var(--muted)',
                      border: 0,
                      borderRadius: 4,
                      padding: '3px 8px',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {'icon' in filter ? filter.icon : null}
                    <span>{filter.label}</span>
                  </button>
                );
              })}
            </div>

            <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
              Click any layer to jump & select
            </span>
          </div>

          {/* Timeline Grid: Track Headers (Left) + Multi-Lane Area (Right) */}
          <div style={{ display: 'flex', position: 'relative', width: '100%', minHeight: 140 }}>
            {/* Left Column: Track Labels */}
            <div
              style={{
                width: 124,
                flexShrink: 0,
                borderRight: '1px solid var(--border)',
                background: 'var(--surface)',
                display: 'flex',
                flexDirection: 'column',
                zIndex: 5,
              }}
            >
              {/* Ruler Header Spacer */}
              <div
                style={{
                  height: 22,
                  borderBottom: '1px solid var(--border)',
                  background: 'var(--surface-2)',
                  display: 'flex',
                  alignItems: 'center',
                  paddingLeft: 8,
                  fontSize: 10,
                  color: 'var(--muted)',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                }}
              >
                Track
              </div>

              {/* Scenes Lane Label */}
              {trackFilter === 'all' || trackFilter === 'scenes' ? (
                <div
                  style={{
                    height: 34,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '0 8px',
                    borderBottom: '1px solid var(--border)',
                    fontSize: 11.5,
                    fontWeight: 600,
                    color: 'var(--text)',
                  }}
                >
                  <FilmIcon size={12} style={{ color: 'var(--accent)' }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Scenes</span>
                  <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 'auto' }}>
                    {multiTrackData.sceneItems.length}
                  </span>
                </div>
              ) : null}

              {/* Text Lane Label */}
              {trackFilter === 'all' || trackFilter === 'text' ? (
                <div
                  style={{
                    height: 34,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '0 8px',
                    borderBottom: '1px solid var(--border)',
                    fontSize: 11.5,
                    fontWeight: 600,
                    color: 'var(--text)',
                  }}
                >
                  <TypeIcon size={12} style={{ color: '#38bdf8' }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Text & Titles</span>
                  <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 'auto' }}>
                    {multiTrackData.textItems.length}
                  </span>
                </div>
              ) : null}

              {/* Media Lane Label */}
              {trackFilter === 'all' || trackFilter === 'media' ? (
                <div
                  style={{
                    height: 34,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '0 8px',
                    borderBottom: '1px solid var(--border)',
                    fontSize: 11.5,
                    fontWeight: 600,
                    color: 'var(--text)',
                  }}
                >
                  <ImagesIcon size={12} style={{ color: '#34d399' }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Media & Assets</span>
                  <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 'auto' }}>
                    {multiTrackData.mediaItems.length}
                  </span>
                </div>
              ) : null}

              {/* Audio Lane Label */}
              {trackFilter === 'all' || trackFilter === 'audio' ? (
                <div
                  style={{
                    height: 34,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '0 8px',
                    borderBottom: '1px solid var(--border)',
                    fontSize: 11.5,
                    fontWeight: 600,
                    color: 'var(--text)',
                  }}
                >
                  <MusicIcon size={12} style={{ color: '#fbbf24' }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Audio & Voice</span>
                  <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 'auto' }}>
                    {multiTrackData.audioItems.length}
                  </span>
                </div>
              ) : null}
            </div>

            {/* Right Column: Multi-Lane Tracks Grid */}
            <div
              ref={multiTrackGridRef}
              onMouseDown={e => handlePointerDown(e, 'drawer')}
              onMouseMove={e => handlePointerMove(e, 'drawer')}
              onMouseLeave={handlePointerLeave}
              style={{
                flex: 1,
                position: 'relative',
                overflow: 'hidden',
                background: 'var(--surface-2)',
                cursor: isDragging ? 'grabbing' : 'pointer',
                userSelect: 'none',
              }}
            >
              {/* Top Ruler Bar */}
              <div
                style={{
                  height: 22,
                  position: 'relative',
                  borderBottom: '1px solid var(--border)',
                  background: 'var(--surface-2)',
                }}
              >
                {rulerTicks.map(t => (
                  <div
                    key={t.second}
                    style={{
                      position: 'absolute',
                      left: `${t.pct}%`,
                      top: 0,
                      bottom: 0,
                      borderLeft: '1px solid var(--border)',
                      paddingLeft: 3,
                      fontSize: 9.5,
                      fontFamily: 'var(--mono)',
                      color: 'var(--muted)',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    {t.label}
                  </div>
                ))}
              </div>

              {/* Scene Boundary Vertical Guidelines across all tracks */}
              {detail.scenes.map(s => (
                <div
                  key={`guide-${s.id}`}
                  style={{
                    position: 'absolute',
                    top: 22,
                    bottom: 0,
                    left: `${(s.startFrame / total) * 100}%`,
                    width: 1,
                    borderLeft: '1px dashed color-mix(in srgb, var(--border) 70%, transparent)',
                    pointerEvents: 'none',
                    zIndex: 2,
                  }}
                />
              ))}

              {/* Track Lane 1: Scenes */}
              {trackFilter === 'all' || trackFilter === 'scenes' ? (
                <div
                  style={{
                    height: 34,
                    position: 'relative',
                    borderBottom: '1px solid var(--border)',
                    boxSizing: 'border-box',
                  }}
                >
                  {multiTrackData.sceneItems.map((scene, idx) => {
                    const color = SCENE_COLORS[idx % SCENE_COLORS.length]!;
                    const isActive = currentFrame >= scene.startFrame && currentFrame < scene.endFrame;
                    const isSelected = selectedSceneId === scene.id;

                    return (
                      <div
                        key={scene.id}
                        onClick={e => {
                          e.stopPropagation();
                          onSeek(scene.startFrame);
                          onSelectScene?.(scene.id);
                        }}
                        title={`${scene.name} · f${scene.startFrame}–f${scene.endFrame} (${scene.snippet})`}
                        style={{
                          position: 'absolute',
                          left: `${scene.startPct}%`,
                          width: `${scene.widthPct}%`,
                          top: 4,
                          bottom: 4,
                          background: isSelected || isActive ? color.active : color.bg,
                          border: `1px solid ${isSelected ? color.text : color.border}`,
                          boxShadow: isSelected ? `0 0 8px ${color.text}` : undefined,
                          borderRadius: 4,
                          display: 'flex',
                          alignItems: 'center',
                          padding: '0 6px',
                          overflow: 'hidden',
                          fontSize: 11,
                          fontWeight: 600,
                          color: color.text,
                          whiteSpace: 'nowrap',
                          boxSizing: 'border-box',
                          cursor: 'pointer',
                        }}
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{scene.name}</span>
                        <span style={{ fontSize: 10, opacity: 0.7, marginLeft: 4 }}>{scene.snippet}</span>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {/* Track Lane 2: Text & Captions */}
              {trackFilter === 'all' || trackFilter === 'text' ? (
                <div
                  style={{
                    height: 34,
                    position: 'relative',
                    borderBottom: '1px solid var(--border)',
                    boxSizing: 'border-box',
                  }}
                >
                  {multiTrackData.textItems.length === 0 ? (
                    <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>
                      No text layers
                    </div>
                  ) : (
                    multiTrackData.textItems.map(item => {
                      const isActive = currentFrame >= item.startFrame && currentFrame < item.endFrame;
                      const isSelected = selectedLayerPath === item.path;

                      return (
                        <div
                          key={item.id}
                          onClick={e => {
                            e.stopPropagation();
                            onSeek(item.startFrame);
                            onSelectScene?.(item.sceneId);
                            onSelectLayerPath?.(item.path);
                          }}
                          title={`✎ ${item.name} (${item.type}) · f${item.startFrame}–f${item.endFrame} (${dur(item.durationFrames / fps)})\n"${item.snippet || ''}"`}
                          style={{
                            position: 'absolute',
                            left: `${item.startPct}%`,
                            width: `${Math.max(1.5, item.widthPct)}%`,
                            top: 4,
                            bottom: 4,
                            background: isSelected
                              ? 'rgba(56, 189, 248, 0.32)'
                              : isActive
                              ? 'rgba(56, 189, 248, 0.22)'
                              : 'rgba(56, 189, 248, 0.12)',
                            border: `1px solid ${isSelected ? '#38bdf8' : isActive ? 'rgba(56, 189, 248, 0.6)' : 'rgba(56, 189, 248, 0.3)'}`,
                            boxShadow: isSelected ? '0 0 10px rgba(56, 189, 248, 0.65)' : undefined,
                            borderRadius: 4,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '0 6px',
                            overflow: 'hidden',
                            fontSize: 10.5,
                            fontWeight: 600,
                            color: '#7dd3fc',
                            whiteSpace: 'nowrap',
                            boxSizing: 'border-box',
                            cursor: 'pointer',
                          }}
                        >
                          <TypeIcon size={10} style={{ flexShrink: 0 }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {item.snippet || item.name}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              ) : null}

              {/* Track Lane 3: Media & Assets */}
              {trackFilter === 'all' || trackFilter === 'media' ? (
                <div
                  style={{
                    height: 34,
                    position: 'relative',
                    borderBottom: '1px solid var(--border)',
                    boxSizing: 'border-box',
                  }}
                >
                  {multiTrackData.mediaItems.length === 0 ? (
                    <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>
                      No media or asset layers
                    </div>
                  ) : (
                    multiTrackData.mediaItems.map(item => {
                      const isActive = currentFrame >= item.startFrame && currentFrame < item.endFrame;
                      const isSelected = selectedLayerPath === item.path;

                      return (
                        <div
                          key={item.id}
                          onClick={e => {
                            e.stopPropagation();
                            onSeek(item.startFrame);
                            onSelectScene?.(item.sceneId);
                            onSelectLayerPath?.(item.path);
                          }}
                          title={`🖼️ ${item.name} (${item.type}) · f${item.startFrame}–f${item.endFrame} (${dur(item.durationFrames / fps)})`}
                          style={{
                            position: 'absolute',
                            left: `${item.startPct}%`,
                            width: `${Math.max(1.5, item.widthPct)}%`,
                            top: 4,
                            bottom: 4,
                            background: isSelected
                              ? 'rgba(52, 211, 153, 0.32)'
                              : isActive
                              ? 'rgba(52, 211, 153, 0.22)'
                              : 'rgba(52, 211, 153, 0.12)',
                            border: `1px solid ${isSelected ? '#34d399' : isActive ? 'rgba(52, 211, 153, 0.6)' : 'rgba(52, 211, 153, 0.3)'}`,
                            boxShadow: isSelected ? '0 0 10px rgba(52, 211, 153, 0.65)' : undefined,
                            borderRadius: 4,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '0 6px',
                            overflow: 'hidden',
                            fontSize: 10.5,
                            fontWeight: 600,
                            color: '#6ee7b7',
                            whiteSpace: 'nowrap',
                            boxSizing: 'border-box',
                            cursor: 'pointer',
                          }}
                        >
                          <ImagesIcon size={10} style={{ flexShrink: 0 }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {item.name}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              ) : null}

              {/* Track Lane 4: Audio & Voice */}
              {trackFilter === 'all' || trackFilter === 'audio' ? (
                <div
                  style={{
                    height: 34,
                    position: 'relative',
                    borderBottom: '1px solid var(--border)',
                    boxSizing: 'border-box',
                  }}
                >
                  {multiTrackData.audioItems.length === 0 ? (
                    <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>
                      No audio stems
                    </div>
                  ) : (
                    multiTrackData.audioItems.map(item => {
                      const isActive = currentFrame >= item.startFrame && currentFrame < item.endFrame;

                      return (
                        <div
                          key={item.id}
                          onClick={e => {
                            e.stopPropagation();
                            onSeek(item.startFrame);
                            if (item.sceneId) onSelectScene?.(item.sceneId);
                          }}
                          title={`🎵 ${item.name} · f${item.startFrame}–f${item.endFrame} (${dur(item.durationFrames / fps)})`}
                          style={{
                            position: 'absolute',
                            left: `${item.startPct}%`,
                            width: `${Math.max(1.5, item.widthPct)}%`,
                            top: 4,
                            bottom: 4,
                            background: isActive
                              ? 'rgba(251, 191, 36, 0.25)'
                              : 'rgba(251, 191, 36, 0.12)',
                            border: `1px solid ${isActive ? 'rgba(251, 191, 36, 0.7)' : 'rgba(251, 191, 36, 0.35)'}`,
                            borderRadius: 4,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '0 6px',
                            overflow: 'hidden',
                            fontSize: 10.5,
                            fontWeight: 600,
                            color: '#fcd34d',
                            whiteSpace: 'nowrap',
                            boxSizing: 'border-box',
                            cursor: 'pointer',
                          }}
                        >
                          <MusicIcon size={10} style={{ flexShrink: 0 }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {item.snippet || item.name}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              ) : null}

              {/* Hover Ghost Cursor across all lanes */}
              {hoverFrame !== null && !isDragging ? (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: `${(hoverFrame / total) * 100}%`,
                    width: 1,
                    background: 'color-mix(in srgb, var(--text) 45%, transparent)',
                    pointerEvents: 'none',
                    zIndex: 12,
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: 2,
                      left: 4,
                      fontSize: 10,
                      background: 'rgba(0,0,0,0.85)',
                      padding: '1px 5px',
                      borderRadius: 3,
                      color: '#fff',
                      fontFamily: 'var(--mono)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    f{hoverFrame} · {dur(hoverFrame / fps)}
                  </div>
                </div>
              ) : null}

              {/* Master Playhead Line across all multi-track lanes */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: `${progressPercent}%`,
                  width: 2,
                  background: 'var(--accent)',
                  boxShadow: '0 0 10px color-mix(in srgb, var(--accent) 80%, transparent), 0 0 4px var(--accent)',
                  pointerEvents: 'none',
                  transform: 'translateX(-50%)',
                  zIndex: 14,
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: 8,
                    height: 8,
                    background: 'var(--accent)',
                    borderRadius: '50%',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.6)',
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
