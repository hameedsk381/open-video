import {
  AbsoluteFill,
  AmbientGlow,
  Audio,
  Badge,
  DeviceFrame,
  GlassCard,
  KineticText,
  NumberTicker,
  ProgressBar,
  Sequence,
  springValue,
  useCurrentFrame,
  useVideoConfig,
} from '@ove/react';

export const config = {
  id: 'kinetic-reel',
  name: 'Viral Motion Graphics Reel (9:16)',
  width: 1080,
  height: 1920,
  fps: 30,
  durationInFrames: 180, // 6.0 seconds
  background: '#070a12',
  props: {
    kicker: 'CLAUDE MOTION GRAPHICS',
    headline: 'Stop Making Boring Videos',
    subtitle: 'Code-driven motion graphics with real spring physics, glassmorphism, and instant rendering.',
    metric: 10,
    metricUnit: 'x',
    metricLabel: 'Higher Audience Retention',
    codeSnippet: 'const reel = await ove.render();',
    ctaText: 'Start Building in React',
    handle: '@openvideo.dev',
  },
};

export default function KineticReel({
  kicker,
  headline,
  subtitle,
  metric,
  metricUnit,
  metricLabel,
  codeSnippet,
  ctaText,
  handle,
}: typeof config.props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Subtle continuous camera drift so the video is never static
  const driftZoom = 1.0 + (frame / 180) * 0.05;

  return (
    <AbsoluteFill
      style={{
        color: '#f8fafc',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        overflow: 'hidden',
        transform: `scale(${driftZoom.toFixed(4)})`,
        transformOrigin: 'center center',
      }}
    >
      {/* 1. Atmospheric Ambient Lighting: Neon Violet & Cyan Glow */}
      <AmbientGlow
        blur={120}
        orbs={[
          { x: '25%', y: '15%', size: 650, color: '#6366f1', opacity: 0.32, speed: 0.02 },
          { x: '80%', y: '50%', size: 700, color: '#ec4899', opacity: 0.22, speed: 0.025 },
          { x: '40%', y: '85%', size: 750, color: '#06b6d4', opacity: 0.28, speed: 0.018 },
        ]}
      />

      {/* 2. Sleek Modern Dot-Grid Texture */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          opacity: 0.6,
          pointerEvents: 'none',
        }}
      />

      {/* SCENE 1: High-Impact Hook (Frames 0 to 65) */}
      <Sequence from={0} durationInFrames={65}>
        <Audio src="sfx:whoosh" volume={0.65} />
        <AbsoluteFill
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '0 72px',
            gap: 36,
            textAlign: 'center',
          }}
        >
          <Badge dotColor="#38bdf8" delay={4}>
            {kicker}
          </Badge>

          <h1
            style={{
              fontSize: 104,
              fontWeight: 900,
              letterSpacing: '-0.04em',
              lineHeight: 1.05,
              margin: 0,
            }}
          >
            <KineticText text={headline} delay={8} staggerDelay={3} preset="bouncy" />
          </h1>

          <p
            style={{
              fontSize: 32,
              color: '#94a3b8',
              lineHeight: 1.5,
              margin: 0,
              maxWidth: 820,
              opacity: springValue({ frame, fps, delay: 24, from: 0, to: 1, preset: 'smooth' }),
              transform: `translateY(${(1 - springValue({ frame, fps, delay: 24, from: 0, to: 1, preset: 'smooth' })) * 30}px)`,
            }}
          >
            {subtitle}
          </p>
        </AbsoluteFill>
      </Sequence>

      {/* SCENE 2: Bento Metrics & Code (Frames 65 to 125) */}
      <Sequence from={65} durationInFrames={60}>
        <Audio src="sfx:pop" volume={0.6} />
        <AbsoluteFill
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '0 64px',
            gap: 32,
          }}
        >
          <Badge dotColor="#10b981" delay={4}>
            PERFORMANCE & ARCHITECTURE
          </Badge>

          {/* Metric Bento Card */}
          <GlassCard
            delay={6}
            preset="bouncy"
            style={{
              width: '100%',
              padding: 48,
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <span style={{ fontSize: 20, color: '#94a3b8', fontWeight: 600, letterSpacing: '0.04em' }}>
              ENGAGEMENT SPIKE
            </span>
            <div style={{ fontSize: 130, fontWeight: 900, color: '#38bdf8', letterSpacing: '-0.04em', lineHeight: 1 }}>
              <NumberTicker value={metric} decimals={0} suffix={metricUnit} delay={10} preset="bouncy" />
            </div>
            <span style={{ fontSize: 28, color: '#e2e8f0', fontWeight: 700 }}>
              {metricLabel}
            </span>
            <ProgressBar value={0.92} color="#38bdf8" delay={14} height={10} />
          </GlassCard>

          {/* Code Bento Card */}
          <GlassCard
            delay={14}
            preset="snappy"
            style={{
              width: '100%',
              padding: 36,
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              background: 'rgba(15, 23, 42, 0.65)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#ef4444' }} />
              <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#f59e0b' }} />
              <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#10b981' }} />
              <span style={{ fontSize: 16, color: '#64748b', marginLeft: 8, fontFamily: 'monospace' }}>
                video.tsx
              </span>
            </div>
            <div
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                fontSize: 26,
                color: '#38bdf8',
                background: 'rgba(0, 0, 0, 0.4)',
                padding: '20px 24px',
                borderRadius: 12,
                border: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <code>{codeSnippet}</code>
            </div>
          </GlassCard>
        </AbsoluteFill>
      </Sequence>

      {/* SCENE 3: Device Frame & Final Punchy CTA (Frames 125 to 180) */}
      <Sequence from={125} durationInFrames={55}>
        <Audio src="sfx:ding" volume={0.65} />
        <AbsoluteFill
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '0 64px',
            gap: 40,
            textAlign: 'center',
          }}
        >
          <DeviceFrame url="openvideo.dev/reels" delay={4} style={{ width: '100%', height: 480 }}>
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 20,
                background: 'linear-gradient(180deg, #090e1a 0%, #030712 100%)',
                padding: 32,
              }}
            >
              <Badge dotColor="#a855f7">FRAME-ACCURATE</Badge>
              <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-0.03em' }}>
                Build Viral Reels With Code
              </div>
              <div style={{ fontSize: 22, color: '#94a3b8' }}>
                No After Effects. Pure React.
              </div>
            </div>
          </DeviceFrame>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 16,
              opacity: springValue({ frame, fps, delay: 18, from: 0, to: 1, preset: 'bouncy' }),
              transform: `scale(${springValue({ frame, fps, delay: 18, from: 0.85, to: 1, preset: 'bouncy' }).toFixed(3)})`,
            }}
          >
            <div
              style={{
                background: 'linear-gradient(135deg, #38bdf8 0%, #818cf8 100%)',
                color: '#04111d',
                padding: '24px 64px',
                borderRadius: 9999,
                fontSize: 32,
                fontWeight: 800,
                boxShadow: '0 20px 40px rgba(56, 189, 248, 0.4)',
                letterSpacing: '-0.02em',
              }}
            >
              {ctaText}
            </div>
            <span style={{ fontSize: 24, color: '#94a3b8', fontWeight: 600 }}>
              {handle}
            </span>
          </div>
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
}

