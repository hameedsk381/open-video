---
name: ove-broll-loop
description: B-roll loop engineering, SRT speech-to-visual choreography, seamless ambient loops, and Shotcraft camera motion in MotionRender (motionrender). Use when engineering infinite looping background b-roll, synchronizing video clips to spoken subtitle tracks, or implementing erduo-broll-loop workflows.
---

# B-Roll Loop Engineering & Speech Choreography

Inspired by [`erduo1998-cell/erduo-broll-loop-engineering`](https://github.com/erduo1998-cell/erduo-broll-loop-engineering), this guide outlines how to build seamless, mathematically looping B-roll video scenes timed to spoken SRT subtitles and voiceover pacing.

---

## 1. Loop Engineering Principles

A video element loops seamlessly when its state at frame $0$ strictly matches its state at frame $N$ (the loop cycle duration):

$$f(0) \equiv f(N)$$

### Seamless Motion Patterns in MotionRender:
1. **Breathing Pulse (Scale/Opacity)**:
   ```json
   "keyframes": [
     { "frame": 0, "value": 1.0, "easing": "easeInOut" },
     { "frame": 75, "value": 1.12, "easeInOut" },
     { "frame": 150, "value": 1.0 }
   ]
   ```
2. **Harmonic Float / Bob (Position)**:
   ```json
   "keyframes": [
     { "frame": 0, "value": 900, "easing": "easeInOut" },
     { "frame": 75, "value": 880, "easing": "easeInOut" },
     { "frame": 150, "value": 900 }
   ]
   ```
3. **Continuous Orbital Drift (Rotation)**:
   ```json
   "keyframes": [
     { "frame": 0, "value": 0, "easing": "linear" },
     { "frame": 150, "value": 360 }
   ]
   ```

---

## 2. Speech & SRT Timing Integration

B-roll scenes are choreographed to spoken cadence:
- **Pacing**: Speech phrasing naturally clusters into 2.5 to 5.0 second thought beats (75 to 150 frames at 30 fps).
- **Scene Cutting**: Leave out a scene's `startFrame` or align scenes to subtitle cue bounds:
  ```bash
  # Transcribe audio and generate word-level timings
  mr ai transcribe voice.wav --composition video.json --start 0
  ```
- **Word Highlight Safety**: Ensure floating hero plates keep away from the lower third captions band (the bottom 18% of a 9:16 frame).

---

## 3. Shotcraft Camera Choreography

Add continuous depth to 2D graphic layers using the scene `camera`:
```json
"camera": {
  "zoom": 1.0,
  "keyframes": [
    { "frame": 0, "zoom": 1.0, "easing": "easeInOut" },
    { "frame": 75, "zoom": 1.04, "easing": "easeInOut" },
    { "frame": 150, "zoom": 1.0 }
  ]
}
```
Layers with `"fixed": true` (such as brand watermarks and captions) remain steady while the background and hero plates drift smoothly.

---

## 4. Quick Commands

### Initialize a Standalone Loop Project:
```bash
mr init my-loop
cd my-loop
mr dev composition.json
```

### Insert a Loop Scene into an Existing Timeline:
```bash
mr add fx-broll-loop video.json \
  --at 150 \
  --frames 150 \
  --set label="TOPIC INSIGHT" \
  --set headline="Seamless visual momentum"
```

### Remotion / React Dual-Engine Syntax:
Using `@ove/react`, loops can also be expressed as React components:
```tsx
import { Loop, interpolate, useCurrentFrame } from 'remotion';

export const BrollLoop = () => {
  return (
    <Loop durationInFrames={150}>
      <Card />
    </Loop>
  );
};
```

