---
name: ove-papercut
description: Create layered 3D construction papercraft explainer reels, tactile paper cutouts, stop-motion card flips, and paper diorama videos in MotionRender (motionrender). Inspired by 0xS4N4TG/papercut-explainer.
---

# Layered Papercut Explainer Reels

Inspired by [`0xS4N4TG/papercut-explainer`](https://github.com/0xS4N4TG/papercut-explainer), this skill enables autonomous AI coding agents to create vertical 3D construction papercraft explainer reels (25–30s or short 5–10s visual hooks).

---

## 1. Physical Papercraft Aesthetics

1. **Elevation via Realistic Drop Shadows**:
   Physical depth is achieved by stacking `rect` or `path` layers with progressive shadow blur and offset:
   - **Backing Plate** (furthest away): `"shadow": { "color": "rgba(0,0,0,0.28)", "blur": 38, "offsetX": 10, "offsetY": 22 }`
   - **Front Card** (closer): `"shadow": { "color": "rgba(0,0,0,0.18)", "blur": 24, "offsetX": 6, "offsetY": 14 }`
   - **Hero Cutout / Pin** (top): `"shadow": { "color": "rgba(0,0,0,0.22)", "blur": 16, "offsetX": 4, "offsetY": 8 }`
2. **Cardstock Colors & Film Grain**:
   - Backgrounds use matte cardstock tones (`#e2ded4`, `#f5f0e1`, terracotta `#ea580c`, slate navy `#0f172a`).
   - Add organic film grain at the top level: `"grain": 0.14`.
3. **Paper Tape & Accents**:
   - Strips of masking tape (`rgba(245, 235, 215, 0.85)`) pinned at slight dynamic angles (`rotation: -16`).
4. **Paper Physics & Easing**:
   - Card drops and slides use spring overshoot: `"easing": "easeOutBack"` with stop-motion feel.
   - Synchronized tactile audio effects: `sfx:thump` when paper lands, `sfx:pop` on cutout reveal, `sfx:tick` on tag snap.

---

## 2. Multi-Scene Explainer Structure

A 25–30 second papercut explainer naturally divides into 3 to 5 paper beats:
- **Scene 1 (The Hook, 0–5s)**: A bold question or paradox set over a dramatic paper diorama.
- **Scene 2 (The Mechanism, 5–15s)**: Stacked cards slide in, peeling back layers of the problem.
- **Scene 3 (The Data / Metric, 15–22s)**: Giant cutout numbers (e.g. `3X`, `84%`) pinned to a cardstock backing.
- **Scene 4 (The Call to Action, 22–30s)**: High-contrast paper tape tag with the takeaway and brand card.

---

## 3. Quick Commands

### Initialize a Full Papercut Explainer Project:
```bash
mr init my-papercut --template starter
cd my-papercut
mr dev composition.json
```

### Insert a Papercut Scene into an Existing Timeline:
```bash
mr add fx-papercut-explainer video.json \
  --at 120 \
  --frames 150 \
  --set kicker="STEP 01" \
  --set headline="Layered tactile depth" \
  --set caption="Physical papercraft builds instant emotional rapport."
```

### Automated Review & Safe-Zone Assertions:
```bash
mr review composition.json --show-safe-zones --output review.png
```

