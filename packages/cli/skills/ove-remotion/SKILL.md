---
name: ove-remotion
description: Run and build Remotion compositions directly with MotionRender. Use when migrating from Remotion, adapting Claude video skills, or building video components with Remotion compatibility.
---

# Remotion Compatibility in MotionRender

MotionRender natively supports Remotion video syntax, allowing you to run, build, and render compositions created for Remotion or Claude Remotion skills without changing imports or rewriting code.

---

## 1. Zero-Config Portability

You can import directly from `'remotion'`, `'@remotion/core'`, or `'@ove/react'`:

```tsx
import { 
  AbsoluteFill, 
  Sequence, 
  Series, 
  interpolate, 
  spring, 
  useCurrentFrame, 
  useVideoConfig, 
  Easing, 
  Loop, 
  Freeze, 
  staticFile, 
  Audio, 
  Video, 
  Img,
  Composition
} from 'remotion';
```

MotionRender automatically aliases `remotion`, `@remotion/core`, and `@remotion/media` to `@ove/react` during `ove build` and `ove render`.

---

## 2. Supported Patterns

### Pattern A: Modern MotionRender Export
```tsx
export const config = {
  id: 'my-video',
  width: 1920,
  height: 1080,
  fps: 30,
  durationInFrames: 150,
};

export default function MyVideo() {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{ background: '#000', color: '#fff' }}>Hello</AbsoluteFill>;
}
```

### Pattern B: Remotion Root & Composition
```tsx
import { Composition } from 'remotion';

export const RemotionRoot = () => {
  return (
    <Composition
      id="MyVideo"
      component={MyVideo}
      durationInFrames={150}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};

export const MyVideo = () => {
  return <AbsoluteFill style={{ background: '#0a0a0a', color: '#fff' }}>Remotion on OVE</AbsoluteFill>;
};
```

Both styles work out of the box with `ove render`, `ove build`, and `ove review`.

---

## 3. Spring Physics & Animations

OVE supports both flat options and Remotion's nested `config` object:

```tsx
// Remotion-style spring with nested config:
const scale = spring({
  frame,
  fps,
  config: {
    damping: 12,
    stiffness: 120,
    mass: 0.8,
  },
  from: 0,
  to: 1,
});

// Or using @ove/react presets:
import { springValue } from '@ove/react';

const opacity = springValue({ frame, fps, delay: 10, preset: 'snappy' });
```

---

## 4. Commands

- **Preview still frame**:
  `ove review video.tsx --output preview.png`

- **Build to bundled JSON composition**:
  `ove build video.tsx`

- **Render directly to MP4**:
  `ove render video.tsx --output out.mp4`

- **Launch autonomous video AI agent**:
  `ove agent --prompt "Create a 9:16 viral motion graphic reel for a developer tool"`
