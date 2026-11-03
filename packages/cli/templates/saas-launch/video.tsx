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
  useCurrentFrame,
  useVideoConfig,
  springValue,
} from '@ove/react';

export const config = {
  id: 'saas-launch',
  name: 'Modern SaaS Launch (React)',
  width: 1920,
  height: 1080,
  fps: 30,
  durationInFrames: 180,
  background: '#080c14',
  props: {
    badge: 'AI ENGINE 2.0',
    title: 'Design Videos in React',
    subtitle: 'Frame-accurate motion graphics, spring physics, and headless render speed.',
    metric: 10,
    metricLabel: 'Faster Video Rendering',
    url: 'openvideo.dev/engine',
  },
};

export default function SaasLaunchVideo({
  badge,
  title,
  subtitle,
  metric,
  metricLabel,
  url,
}: typeof config.props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill
      style={{
        color: '#f8fafc',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        overflow: 'hidden',
      }}
    >
      {/* Dynamic ambient gradient lighting */}
      <AmbientGlow
        orbs={[
          { x: '20%', y: '18%', size: 700, color: '#6366f1', opacity: 0.28, speed: 0.02 },
          { x: '80%', y: '82%', size: 850, color: '#06b6d4', opacity: 0.22, speed: 0.025 },
          { x: '50%', y: '50%', size: 600, color: '#8b5cf6', opacity: 0.18, speed: 0.015 },
        ]}
      />

      {/* Subtle background tech grid */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'radial-gradient(rgba(255, 255, 255, 0.07) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          opacity: 0.5,
          pointerEvents: 'none',
        }}
      />

      {/* SCENE 1: Kinetic Opening (Frames 0 to 75) */}
      <Sequence from={0} durationInFrames={75}>
        <Audio src="sfx:whoosh" volume={0.6} />
        <AbsoluteFill
          style={{
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: 28,
            padding: 80,
          }}
        >
          <Badge dotColor="#38bdf8" delay={4}>
            {badge}
          </Badge>

          <h1
            style={{
              fontSize: 88,
              fontWeight: 800,
              letterSpacing: '-0.04em',
              margin: 0,
              textAlign: 'center',
              maxWidth: 1200,
              lineHeight: 1.1,
            }}
          >
            <KineticText text={title} delay={8} preset="bouncy" />
          </h1>

          <p
            style={{
              fontSize: 26,
              color: '#94a3b8',
              maxWidth: 800,
              textAlign: 'center',
              margin: 0,
              lineHeight: 1.5,
              opacity: springValue({ frame, fps, delay: 24, from: 0, to: 1, preset: 'smooth' }),
              transform: `translateY(${(1 - springValue({ frame, fps, delay: 24, from: 0, to: 1, preset: 'smooth' })) * 20}px)`,
            }}
          >
            {subtitle}
          </p>
        </AbsoluteFill>
      </Sequence>

      {/* SCENE 2: Glassmorphic Bento & Metric (Frames 75 to 135) */}
      <Sequence from={75} durationInFrames={60}>
        <Audio src="sfx:pop" volume={0.5} />
        <AbsoluteFill
          style={{
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: 40,
            padding: '0 120px',
          }}
        >
          {/* Metric Card */}
          <GlassCard delay={4} style={{ width: 440, padding: 40, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <span style={{ fontSize: 16, color: '#94a3b8', fontWeight: 600, letterSpacing: '0.04em' }}>
              PERFORMANCE
            </span>
            <div style={{ fontSize: 96, fontWeight: 900, color: '#38bdf8', letterSpacing: '-0.03em' }}>
              <NumberTicker value={metric} decimals={0} suffix="x" delay={8} preset="bouncy" />
            </div>
            <span style={{ fontSize: 20, color: '#e2e8f0', fontWeight: 600 }}>
              {metricLabel}
            </span>
            <ProgressBar value={0.88} color="#38bdf8" delay={12} />
          </GlassCard>

          {/* Feature Showcase Card */}
          <GlassCard delay={10} style={{ width: 560, padding: 40, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, #6366f1, #06b6d4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: 20,
                }}
              >
                ⚛
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>Pure React Components</div>
                <div style={{ fontSize: 14, color: '#94a3b8' }}>Flexbox, Springs & CSS Grid</div>
              </div>
            </div>
            <p style={{ margin: 0, color: '#cbd5e1', fontSize: 18, lineHeight: 1.6 }}>
              Build production videos with the tools you already know: React hooks, inline styles, CSS animations, and instant headless rendering.
            </p>
          </GlassCard>
        </AbsoluteFill>
      </Sequence>

      {/* SCENE 3: Product Frame & Final Call To Action (Frames 135 to 180) */}
      <Sequence from={135} durationInFrames={45}>
        <Audio src="sfx:ding" volume={0.5} />
        <AbsoluteFill
          style={{
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: 32,
          }}
        >
          <DeviceFrame url={url} delay={4} style={{ width: 720, height: 380 }}>
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 16,
                background: 'linear-gradient(180deg, #0f172a 0%, #020617 100%)',
              }}
            >
              <Badge dotColor="#10b981">LIVE NOW</Badge>
              <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: '-0.02em' }}>
                Open Video Engine
              </div>
              <div style={{ fontSize: 16, color: '#64748b' }}>
                Build, preview, and render in milliseconds
              </div>
            </div>
          </DeviceFrame>
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
}
