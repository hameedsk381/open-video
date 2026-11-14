import { useEffect, useRef, useState } from 'react';
import { go } from '../router';
import {
  Badge,
  Button,
  CopyIcon,
  PlayIcon,
  PauseIcon,
  ShieldIcon,
  SlidersIcon,
  SparklesIcon,
  WandIcon,
  useUi,
} from '../ui';

export type PlaygroundTemplate = {
  id: string;
  name: string;
  category: 'SaaS Launch' | 'Mobile App' | 'Tech Explainer' | 'Kinetic Reels';
  aspect: '16:9' | '9:16' | '1:1';
  summary: string;
  theme: {
    bg: string;
    accent: string;
    accent2: string;
    text: string;
  };
  defaultVariables: Record<string, any>;
  scenes: {
    title: string;
    subtitle: string;
    duration: number;
    visualKind: 'bento' | 'device' | 'metrics' | 'kinetic';
  }[];
};

export const PLAYGROUND_TEMPLATES: PlaygroundTemplate[] = [
  {
    id: 'bento-saas',
    name: 'Bento Grid SaaS Product Film',
    category: 'SaaS Launch',
    aspect: '16:9',
    summary: 'Dynamic 3D-inspired bento cards with floating metrics, glowing badges, and spring transitions.',
    theme: {
      bg: '#090d16',
      accent: '#6366f1',
      accent2: '#06b6d4',
      text: '#f8fafc',
    },
    defaultVariables: {
      productName: 'HyperScale AI',
      headline: 'Next-Gen Video Generation Engine',
      metricNumber: '4.8M+',
      metricLabel: 'Renders Computed',
      ctaText: 'Start Building Free',
    },
    scenes: [
      { title: 'The Modern Motion Engine', subtitle: 'Deterministic, programmatic, blazing fast', duration: 4, visualKind: 'bento' },
      { title: 'Scale Without Limits', subtitle: '4.8M+ renders computed with zero GPU spikes', duration: 4, visualKind: 'metrics' },
      { title: 'Deploy Everywhere', subtitle: 'React, Node.js CLI & MCP Agent integration', duration: 4, visualKind: 'kinetic' },
    ],
  },
  {
    id: 'mobile-app-promo',
    name: '3D Phone App Store Showcase',
    category: 'Mobile App',
    aspect: '9:16',
    summary: 'Vertical 9:16 phone mockup layout with floating kinetic feature pills and social safe-zone alignment.',
    theme: {
      bg: '#0b0f19',
      accent: '#ec4899',
      accent2: '#8b5cf6',
      text: '#ffffff',
    },
    defaultVariables: {
      appName: 'Aura Health',
      headline: 'Your Mindfulness Companion',
      ratingText: '4.9 ★★★★★ (85k)',
      badgeText: '#1 Health App',
      ctaText: 'Download on App Store',
    },
    scenes: [
      { title: 'Track Your Focus', subtitle: 'Real-time biometric rhythm sync', duration: 5, visualKind: 'device' },
      { title: 'Personalized Daily Rituals', subtitle: 'Guided sessions tuned to your circadian rhythm', duration: 5, visualKind: 'bento' },
      { title: 'Join 500,000+ Users', subtitle: 'Available on iOS and Android today', duration: 5, visualKind: 'kinetic' },
    ],
  },
  {
    id: 'tech-explainer',
    name: 'High-Density Architectural Explainer',
    category: 'Tech Explainer',
    aspect: '16:9',
    summary: 'Clean typographic diagrams with procedural code snippets, vector wires, and system architectures.',
    theme: {
      bg: '#05070d',
      accent: '#10b981',
      accent2: '#3b82f6',
      text: '#f1f5f9',
    },
    defaultVariables: {
      sysName: 'Distributed Consensus',
      protocol: 'Raft + Vector Log',
      latency: '0.4ms P99',
      throughput: '120k req/s',
      ctaText: 'Read the Whitepaper',
    },
    scenes: [
      { title: 'Leader Election Protocol', subtitle: 'Sub-millisecond quorum convergence', duration: 4, visualKind: 'metrics' },
      { title: 'Replicated State Machine', subtitle: 'Deterministic snapshot replication across edge nodes', duration: 4, visualKind: 'bento' },
      { title: 'Production Ready at Scale', subtitle: 'Battle-tested across 10,000+ node clusters', duration: 4, visualKind: 'kinetic' },
    ],
  },
  {
    id: 'viral-reel-captions',
    name: 'Viral Word-Level Kinetic Reel',
    category: 'Kinetic Reels',
    aspect: '9:16',
    summary: 'Attention-grabbing vertical hook with animated highlighter swipes and TikTok/Reels safe-zone bounds.',
    theme: {
      bg: '#000000',
      accent: '#f59e0b',
      accent2: '#ef4444',
      text: '#ffffff',
    },
    defaultVariables: {
      hookHeadline: 'How Developers Build Videos In 2026',
      keyPoint1: 'No After Effects Required',
      keyPoint2: 'Pure JSON + TypeScript Code',
      ctaText: 'Tap Link in Bio',
    },
    scenes: [
      { title: 'Stop Manually Keyframing', subtitle: 'The old way takes hours of tedious rendering', duration: 4, visualKind: 'kinetic' },
      { title: 'Code Your Motion Graphics', subtitle: 'Every layer is deterministic code and math', duration: 4, visualKind: 'metrics' },
      { title: 'Ship Faster Than Ever', subtitle: 'Automate whole video production pipelines', duration: 4, visualKind: 'bento' },
    ],
  },
];

export function Playground() {
  const { toast } = useUi();
  const [selectedTemplate, setSelectedTemplate] = useState<PlaygroundTemplate>(PLAYGROUND_TEMPLATES[0]!);
  const [aspect, setAspect] = useState<'16:9' | '9:16' | '1:1'>(selectedTemplate.aspect);
  const [variables, setVariables] = useState<Record<string, any>>(selectedTemplate.defaultVariables);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentFrame, setCurrentFrame] = useState(0);
  const totalFrames = 360; // 12s @ 30fps
  const fps = 30;

  // Waveform canvas state
  const waveformRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);

  // Update variables and aspect when switching templates
  const selectTemplate = (tmpl: PlaygroundTemplate) => {
    setSelectedTemplate(tmpl);
    setAspect(tmpl.aspect);
    setVariables(tmpl.defaultVariables);
    setCurrentFrame(0);
  };

  // Playback timer loop
  useEffect(() => {
    if (!isPlaying) {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      return;
    }
    let lastTime = performance.now();
    const frameDuration = 1000 / fps;

    const tick = (now: number) => {
      const delta = now - lastTime;
      if (delta >= frameDuration) {
        lastTime = now - (delta % frameDuration);
        setCurrentFrame(f => (f + 1) % totalFrames);
      }
      animationRef.current = requestAnimationFrame(tick);
    };

    animationRef.current = requestAnimationFrame(tick);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isPlaying, fps, totalFrames]);

  // Procedural audio waveform drawing
  useEffect(() => {
    const canvas = waveformRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const bars = 80;
    const barWidth = width / bars;
    const progressPct = currentFrame / totalFrames;

    for (let i = 0; i < bars; i++) {
      const x = i * barWidth;
      const pct = i / bars;
      const isPast = pct <= progressPct;

      // Dynamic pseudo-audio height wave
      const wave = Math.sin(i * 0.25 + currentFrame * 0.1) * 0.5 + 0.5;
      const wave2 = Math.cos(i * 0.12 - currentFrame * 0.05) * 0.5 + 0.5;
      const barHeight = Math.max(4, (wave * 0.6 + wave2 * 0.4) * (height - 8));

      ctx.fillStyle = isPast ? selectedTemplate.theme.accent : 'rgba(255, 255, 255, 0.15)';
      ctx.fillRect(x + 1, (height - barHeight) / 2, barWidth - 2, barHeight);
    }
  }, [currentFrame, totalFrames, selectedTemplate]);

  const currentSceneIndex = Math.min(
    selectedTemplate.scenes.length - 1,
    Math.floor((currentFrame / totalFrames) * selectedTemplate.scenes.length)
  );
  const currentScene = selectedTemplate.scenes[currentSceneIndex]!;

  const handleUseTemplate = () => {
    const prompt = `Create a high-end ${selectedTemplate.category} launch video based on the "${selectedTemplate.name}" archetype. Product: "${variables.productName || variables.appName || variables.sysName || variables.hookHeadline}". Aspect: ${aspect}. Theme colors: ${selectedTemplate.theme.accent} and ${selectedTemplate.theme.accent2}.`;
    go(`#/new?prompt=${encodeURIComponent(prompt)}&kind=launch-reel&aspect=${aspect}`);
  };

  const copyPrompt = () => {
    const prompt = `Create a high-end ${selectedTemplate.category} launch video based on the "${selectedTemplate.name}" archetype. Product: "${variables.productName || variables.appName || variables.sysName || variables.hookHeadline}". Aspect: ${aspect}.`;
    navigator.clipboard.writeText(prompt);
    toast('Prompt copied to clipboard', 'success');
  };

  return (
    <div className="playground-view" style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 20px' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 24 }}>✨</span>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Interactive Template Playground</h1>
            <Badge tone="purple">Live Engine</Badge>
          </div>
          <p style={{ color: 'var(--muted)', fontSize: 13.5, margin: 0 }}>
            Test launch video archetypes, adjust variables, toggle aspect ratios, and inspect live responsive motion.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Button variant="secondary" icon={<CopyIcon size={14} />} onClick={copyPrompt}>
            Copy Brief
          </Button>
          <Button variant="primary" icon={<WandIcon size={14} />} onClick={handleUseTemplate}>
            Create From Template
          </Button>
        </div>
      </div>

      {/* Main Grid: Template Archetype Rail + Live Preview Canvas + Variables Panel */}
      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr 340px', gap: 20, alignItems: 'start' }}>
        {/* Left Column: Template Archetype Picker */}
        <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: 10 }}>
            Launch Archetypes
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {PLAYGROUND_TEMPLATES.map(tmpl => {
              const active = tmpl.id === selectedTemplate.id;
              return (
                <button
                  key={tmpl.id}
                  onClick={() => selectTemplate(tmpl)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    textAlign: 'left',
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: active ? 'color-mix(in srgb, var(--accent) 12%, var(--surface))' : 'var(--surface-2)',
                    border: `1.5px solid ${active ? 'var(--accent)' : 'transparent'}`,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: active ? 'var(--accent)' : 'var(--muted)' }}>
                      {tmpl.category}
                    </span>
                    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: 'var(--text)' }}>
                      {tmpl.aspect}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                    {tmpl.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', lineClamp: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {tmpl.summary}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Center Column: Live Responsive Player Canvas & Frame Controls */}
        <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {/* Top Bar: Aspect Ratio Toggle & Time Display */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-2)', padding: 3, borderRadius: 6, border: '1px solid var(--border)' }}>
              {(['16:9', '9:16', '1:1'] as const).map(asp => (
                <button
                  key={asp}
                  onClick={() => setAspect(asp)}
                  style={{
                    height: 24,
                    padding: '0 10px',
                    fontSize: 11,
                    fontWeight: aspect === asp ? 700 : 500,
                    borderRadius: 4,
                    border: 0,
                    background: aspect === asp ? 'var(--accent)' : 'transparent',
                    color: aspect === asp ? '#ffffff' : 'var(--muted)',
                    cursor: 'pointer',
                  }}
                >
                  {asp}
                </button>
              ))}
            </div>

            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>Scene {currentSceneIndex + 1}/{selectedTemplate.scenes.length}</span>
              <span>·</span>
              <span style={{ color: 'var(--text)', fontFamily: 'var(--mono)' }}>
                {(currentFrame / fps).toFixed(1)}s / {(totalFrames / fps).toFixed(0)}s
              </span>
            </div>
          </div>

          {/* Simulated Live Renderer Screen */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: aspect === '9:16' ? 320 : aspect === '1:1' ? 440 : 640,
              aspectRatio: aspect === '9:16' ? '9/16' : aspect === '1:1' ? '1/1' : '16/9',
              borderRadius: 12,
              overflow: 'hidden',
              boxShadow: '0 16px 48px rgba(0,0,0,0.7)',
              background: selectedTemplate.theme.bg,
              border: '1px solid rgba(255,255,255,0.1)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              padding: aspect === '9:16' ? 24 : 32,
              boxSizing: 'border-box',
              transition: 'aspect-ratio 0.25s ease, max-width 0.25s ease',
            }}
          >
            {/* Ambient Background Glow Orb */}
            <div
              style={{
                position: 'absolute',
                top: '20%',
                left: '30%',
                width: '60%',
                height: '60%',
                background: `radial-gradient(circle, ${selectedTemplate.theme.accent}33 0%, transparent 70%)`,
                filter: 'blur(36px)',
                pointerEvents: 'none',
              }}
            />

            {/* Header Tag / Eyebrow */}
            <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: selectedTemplate.theme.accent,
                  padding: '3px 8px',
                  borderRadius: 12,
                  background: 'rgba(255,255,255,0.06)',
                  border: `1px solid ${selectedTemplate.theme.accent}44`,
                }}
              >
                {selectedTemplate.category}
              </span>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--mono)' }}>
                MR-LIVE-V3
              </span>
            </div>

            {/* Center Visual Mockup Area */}
            <div style={{ position: 'relative', zIndex: 2, textAlign: 'center', margin: 'auto 0' }}>
              <h2
                style={{
                  fontSize: aspect === '9:16' ? 20 : 26,
                  fontWeight: 800,
                  lineHeight: 1.15,
                  margin: '0 0 10px 0',
                  color: selectedTemplate.theme.text,
                  letterSpacing: '-0.02em',
                }}
              >
                {currentScene.title}
              </h2>
              <p
                style={{
                  fontSize: aspect === '9:16' ? 12 : 14,
                  lineHeight: 1.4,
                  margin: 0,
                  color: 'rgba(255,255,255,0.7)',
                  maxWidth: '90%',
                  marginLeft: 'auto',
                  marginRight: 'auto',
                }}
              >
                {currentScene.subtitle}
              </p>

              {/* Dynamic Interactive Card Visual */}
              <div
                style={{
                  marginTop: 18,
                  padding: '12px 16px',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  backdropFilter: 'blur(8px)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: selectedTemplate.theme.accent2, boxShadow: `0 0 8px ${selectedTemplate.theme.accent2}` }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#ffffff' }}>
                  {variables.metricNumber || variables.latency || variables.ratingText || variables.keyPoint1 || 'Ultra-Fast Renders'}
                </span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
                  {variables.metricLabel || variables.throughput || variables.badgeText || variables.keyPoint2 || 'P99 Latency'}
                </span>
              </div>
            </div>

            {/* Bottom Footer / CTA Bar */}
            <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.5)' }}>
                {variables.productName || variables.appName || variables.sysName || variables.hookHeadline || 'MotionRender'}
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: selectedTemplate.theme.accent2,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                {variables.ctaText || 'Get Started'} →
              </span>
            </div>
          </div>

          {/* Web Audio Procedural Waveform Canvas */}
          <div style={{ width: '100%', marginTop: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <ShieldIcon size={12} /> Procedural Audio Waveform
              </span>
              <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>128kbps AAC / 48kHz</span>
            </div>
            <canvas
              ref={waveformRef}
              width={600}
              height={36}
              style={{
                width: '100%',
                height: 36,
                background: 'var(--surface-2)',
                borderRadius: 6,
                display: 'block',
              }}
            />
          </div>

          {/* Playback Controls & Scrubber */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', marginTop: 14 }}>
            <button
              onClick={() => setIsPlaying(p => !p)}
              className="btn sm"
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--accent)',
                color: '#ffffff',
                border: 0,
                cursor: 'pointer',
              }}
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
            </button>

            <input
              type="range"
              min={0}
              max={totalFrames - 1}
              value={currentFrame}
              onChange={e => {
                setIsPlaying(false);
                setCurrentFrame(Number(e.target.value));
              }}
              style={{ flex: 1, cursor: 'pointer' }}
            />
          </div>
        </div>

        {/* Right Column: Live Variables Customization Panel */}
        <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <SlidersIcon size={14} />
            <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text)' }}>
              Template Variables
            </span>
          </div>
          <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 0, marginBottom: 16 }}>
            Changes update composition state and live text in real time.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Object.entries(variables).map(([key, val]) => (
              <div key={key}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>
                  {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                </label>
                <input
                  className="input"
                  style={{ width: '100%', height: 32, fontSize: 12, padding: '0 8px', background: 'var(--surface-2)' }}
                  value={String(val)}
                  onChange={e => setVariables({ ...variables, [key]: e.target.value })}
                />
              </div>
            ))}

            <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <Button
                variant="primary"
                style={{ width: '100%', height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                icon={<SparklesIcon size={14} />}
                onClick={handleUseTemplate}
              >
                Open in Full Editor
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
