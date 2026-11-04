---
name: ove-paper-collage
description: Create editorial halftone paper-collage B-roll videos, stop-motion cutouts, torn-paper backgrounds, masking tape strips, and visual metaphors in MotionRender (openvideo). Use when the user wants editorial collage explainers, video essay b-roll, or Vox / Johnny Harris style visual cutouts.
---

# Editorial Halftone Paper Collage B-roll

Create premium 5-second editorial stop-motion paper-collage B-roll clips (inspired by channels like Vox, Johnny Harris, MagnatesMedia, and the `gbro-collage-broll` workflow).

## Core Aesthetic Identity
1. **Paper Background**: Solid cardstock color (e.g. warm cream `#e8e0d5`, kraft brown, terracotta, olive green) with procedural film grain (`"grain": 0.12`).
2. **Halftone Subject Cutouts**: High-contrast black-and-white photograph cutouts with CSS filters:
   `"filter": "grayscale(1) contrast(1.75) brightness(1.05)"`
   and drop shadows (`"shadow": { "color": "rgba(0,0,0,0.22)", "blur": 18, "offsetX": 5, "offsetY": 9 }`).
3. **Paper Tape & Accents**: Translucent off-white or kraft tape strips (`rgba(240, 230, 210, 0.85)`) pinned at dynamic angles (`rotation: -15`).
4. **Cardstock Backing Plate**: Rotated backing card (`rotation: -2.5`) sliding in with spring bounce (`easing: "easeOutBack"`).
5. **Bold Label Kicker**: High-contrast highlight card (`#facc15` or theme accent) snapping in place over the subject.
6. **Procedural SFX**: Synchronized sound design (`sfx:thump` on paper landing, `sfx:whoosh` on slide, `sfx:pop` on tape snap).

---

## 3-Gate Creation Workflow

To maintain high visual quality and editorial relevance:

### Gate 1: Visual Metaphor Alignment
Identify the core message of the voiceover line and translate it into a physical paper object metaphor:
- Example: *"Interest rates soared overnight"* $\rightarrow$ A torn 1970s bank ledger with a soaring red paper arrow taped over it.
- Example: *"Silicon Valley poured billions into AI"* $\rightarrow$ A halftone vintage microchip cutout surrounded by stacked dollar band strips.

### Gate 2: Asset Prep
- Ensure subject images have transparent backgrounds (using `rembg` or cutout masks).
- Apply high-contrast black-and-white halftone filter via layer `filter`.

### Gate 3: MotionRender Assembly
Scaffold the project or add the effect block:

```bash
# 1. Initialize a standalone 5-second collage B-roll project
mr init my-broll --template collage-broll

# 2. Or insert into an existing video composition
mr add fx-paper-collage video/composition.json --at 120 --frames 150 --set label="BREAKTHROUGH" --set headline="The inflection point"
```

---

## Example Composition Snippet

```json
{
  "id": "subject-cutout",
  "type": "image",
  "src": "assets/statue-head.png",
  "x": 540,
  "y": 860,
  "width": 640,
  "height": 640,
  "rotation": 3,
  "filter": "grayscale(1) contrast(1.75) brightness(1.05)",
  "shadow": { "color": "rgba(0,0,0,0.25)", "blur": 20, "offsetX": 6, "offsetY": 10 },
  "animations": [
    {
      "property": "scale",
      "keyframes": [
        { "frame": 10, "value": 0.4, "easing": "easeOutBack" },
        { "frame": 24, "value": 1.0 }
      ]
    }
  ]
}
```

Validate and review the result with:
```bash
mr review video/composition.json --show-safe-zones --output review.png
```

