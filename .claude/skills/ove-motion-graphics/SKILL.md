---
name: ove-motion-graphics
description: Create viral modern motion graphics, bento grids, kinetic typography reels, code editor walk-throughs, and audio waveforms using spring physics and React.
---

# Modern Motion Graphics Guide (`@ove/react`)

Open Video Engine provides a motion design toolkit matching top-tier Claude-style motion graphic reels and product release videos.

---

## 1. Design Aesthetics & Visual Foundations

- **Canvas Background**: Deep dark tones (`#07080d`, `#0a0b12`, `#090d16`).
- **Glow & Atmosphere**: Use `<AmbientGlow>` with 2-3 colorful radial orbs (`#6366f1` Indigo, `#a855f7` Purple, `#ec4899` Pink, `#06b6d4` Cyan) with 100px+ blur.
- **Surface Elevation**: Frosted glassmorphism with `rgba(255, 255, 255, 0.05)`, `backdropFilter: blur(24px)`, and fine 1px border highlight `rgba(255, 255, 255, 0.12)`.
- **Spring Physics over Linear Easing**: Always animate entrances using `springValue` presets:
  - `'snappy'`: UI cards, bento containers, buttons (stiffness 180, damping 18)
  - `'bouncy'`: Badges, icons, reaction elements (stiffness 150, damping 10)
  - `'smooth'`: Camera moves, counter tickers (stiffness 90, damping 14)
  - `'gentle'`: Background transitions, subtle drifting (stiffness 50, damping 12)

---

## 2. Motion Component Kit

### Bento Grid & Cards
```tsx
import { BentoGrid, BentoCard, Badge } from '@ove/react';

<BentoGrid columns={3} gap={20}>
  <BentoCard 
    colSpan={2} 
    title="Real-Time Engine" 
    subtitle="Ultra low-latency distributed frame synthesis"
    badge={<Badge dotColor="#10b981">60 FPS</Badge>}
    delay={10}
  >
    <div style={{ height: 120 }}>{/* card content */}</div>
  </BentoCard>

  <BentoCard title="Metrics" delay={18}>
    <NumberTicker value={99.9} suffix="%" delay={22} decimals={1} />
  </BentoCard>
</BentoGrid>
```

### Kinetic Typography
```tsx
import { KineticText } from '@ove/react';

// Word-by-word staggered spring reveal:
<KineticText 
  text="BUILD THE FUTURE OF VIDEO" 
  delay={5} 
  staggerDelay={4} 
  preset="bouncy" 
  style={{ fontSize: 64, fontWeight: 900, color: '#fff' }} 
/>
```

### Typewriter Effect
```tsx
import { Typewriter } from '@ove/react';

<Typewriter 
  text="mr agent --prompt 'Build an AI video'" 
  delay={15} 
  speed={0.8} 
  style={{ fontSize: 24, color: '#38bdf8' }} 
/>
```

### Dynamic Audio Waveform
```tsx
import { Waveform } from '@ove/react';

<Waveform bars={32} height={60} color="#6366f1" activeColor="#ec4899" speed={0.15} />
```

### Code Editor Window
```tsx
import { CodeEditor } from '@ove/react';

<CodeEditor 
  filename="pipeline.ts" 
  code={`export const render = async () => {\n  const engine = new VideoEngine();\n  await engine.generate();\n};`} 
  highlightLines={[2]} 
  delay={10} 
/>
```

---

## 3. Viral Reel Structure (9:16 Vertical, 1080x1920)

1. **Hook (0-2s / frames 0-60)**:
   - High-energy kinetic headline with `<KineticText>`.
   - Vibrant ambient glow with `<AmbientGlow>`.
   - Status pill with `<Badge dot>NEW RELEASE</Badge>`.
2. **Value & Feature Showcase (2-5s / frames 60-150)**:
   - Bento box layout (`<BentoGrid>` + `<BentoCard>`) or mock UI window (`<DeviceFrame>` or `<CodeEditor>`).
   - Dynamic metric counters (`<NumberTicker>`) or interactive visualizer (`<Waveform>`).
3. **Call-to-Action (5-7s / frames 150-210)**:
   - Centered payoff with glowing brand badge, website URL, and glowing CTA button.

---

## 4. Commands

- `ove review video.tsx --output review.png`
- `ove render video.tsx --output reel.mp4`
- `ove agent --prompt "Build a kinetic typography reel for an AI launch"`
