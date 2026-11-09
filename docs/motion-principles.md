# Motion principles and what the engine does for each

Twenty practical rules for motion graphics, and where each stands in MotionRender: built in, doable with what exists, or not built.
"Prompt" means the AI's system prompt tells it to use the technique.

| # | Principle | Status | How |
|---|---|---|---|
| 1 | Ease everything | Built in | Keyframe `easing` takes named curves (`land`, `snap`, `glide`, `pop`, `move`, `exit`, `drift`, `spring`, back and expo families) or any CSS cubic Bézier `[x1, y1, x2, y2]`. Prompt: never linear. |
| 2 | The "boil" | Built in | `wiggle` with `hold: true` and `every: 5` jumps to a new offset six times a second at 30 fps. It offsets position and rotation, not the drawn outline itself. |
| 3 | Squash and stretch | Built in | Layers take `scaleX` and `scaleY` on top of `scale`, and both animate. Keep their product near 1 to preserve volume. Prompt. |
| 4 | Visual hierarchy | Guidance | The prompt tells the AI to move only the main subject. Nothing measures hierarchy yet; the design review checks type scale, contrast and safe zones. |
| 5 | Anticipation and follow-through | Built in | The `anticipate` easing winds back, then overshoots and settles; `spring` and `easeOutBack` overshoot. Prompt. |
| 6 | Secondary motion | Built in | `wiggle` adds a small independent drift to any numeric property, and text `split` staggers letters or words. Prompt: one idle wiggle on the hero. |
| 7 | Depth of field | Doable | Layer `blur` is a number and animates, so blurring a background layer or racking focus is a keyframe. There is no automatic depth model. |
| 8 | Rim light and highlights | Not built | No silhouette masks. Approximate with a second, offset, lighter copy of the shape or a `screen` blend layer. |
| 9 | Procedural loops | Built in | `repeat` and `reverse` (ping-pong) on any animation, plus `wiggle` for non-repeating idle motion. |
| 10 | Wave and noise deformers | Partly | `wiggle` is noise on a number. There are no warp or turbulence deformers for shapes or text. |
| 11 | Camera moves | Built in | Each scene has a camera with animatable `x`, `y`, `zoom`, `rotation` and `shake`. |
| 12 | Kinetic typography | Built in | Text `split` by letters, words or lines with presets and order; word-timed captions follow a voiceover. |
| 13 | Vector scalability | Built in | Shapes and `path` layers are vector, drawn at any size; `resolution` raises raster detail under a zoom. |
| 14 | Glows and light rays | Partly | `shadow` with blur, `blur`, and `screen` or `color-dodge` blend modes make glows. No directional light rays. |
| 15 | Reference footage | Process | Not something software does; film or mirror reference before blocking timing. |
| 16 | Simple rigs | Process | The engine has no skeletons. Groups with `originX`/`originY` pivots give simple hierarchies. |
| 17 | Strip the clutter | Guidance | The prompt asks for few elements. |
| 18 | Mixed-media texture | Built in | Composition `texture` (grid, dots, scanlines, paper), `grain`, and the paper-collage and papercut skills. |
| 19 | Smears and speed lines | Partly | `motionBlur` blends sub-frames for real blur on fast moves. There are no single-frame smear or speed-line generators. |
| 20 | Colour grade | Built in | `grade` looks and LUTs, vignette and grain, applied to the whole composition or to a layer. |

## The pieces added with this document

- Easings `anticipate` and `bounce`.
- Layer properties `scaleX` and `scaleY` (default 1), animatable.
- `wiggle` on any animation: `{ "amount": 6, "every": 12, "seed": 1, "hold": false }`. It adds a repeatable offset: the same value for a frame in every
  render and in the browser Player. Give each layer its own `seed` so layers do not move together. It applies to numbers only, not colours.

```json
{ "id": "ball", "type": "circle", "x": 540, "y": 900, "width": 200, "fill": "#ff4a1c",
  "animations": [
    { "property": "y", "keyframes": [{ "frame": 0, "value": 300 }, { "frame": 24, "value": 900, "easing": "bounce" }] },
    { "property": "scaleY", "keyframes": [{ "frame": 22, "value": 1 }, { "frame": 26, "value": 0.8, "easing": "easeOut" }, { "frame": 38, "value": 1, "easing": "spring" }] },
    { "property": "scaleX", "keyframes": [{ "frame": 22, "value": 1 }, { "frame": 26, "value": 1.25, "easing": "easeOut" }, { "frame": 38, "value": 1, "easing": "spring" }] },
    { "property": "rotation", "keyframes": [{ "frame": 0, "value": 0 }], "wiggle": { "amount": 2, "every": 20, "seed": 4 } }
  ] }
```

