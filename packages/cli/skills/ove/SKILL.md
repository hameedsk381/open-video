---
name: ove
description: Create and edit videos with Open Video Engine (OVE) by writing a JSON composition, then validating, previewing stills and rendering MP4. Use whenever the user asks to make, change, animate or render a video in a project that has an OVE composition.json.
---

# Making videos with Open Video Engine

An OVE video is one JSON file, `composition.json`. You never write rendering code: you edit data, check it, look at frames, and render. `composition.schema.json` next to it is the authoritative JSON Schema; read it when unsure about a field.

## Loop

1. Edit `composition.json`.
2. `ove validate composition.json` and fix every error it reports.
3. `ove still composition.json --frame <n> --output still.png` and look at the image. Check the first frame, the end of each animation, and the last frame.
4. `ove render composition.json --output out.mp4` once the stills look right.

`ove inspect composition.json` prints duration, scene count, variables and assets. A person working alongside you can run `ove dev composition.json` for a live preview that reloads on every save. Its Studio can also edit `composition.json` (layer timing and properties), so re-read the file before changing it rather than relying on an earlier copy. `ove doctor` checks FFmpeg, its encoders and the browser when a render fails for setup reasons. `ove schema` prints the JSON Schema. Inside the OVE repository itself, run the CLI as `npm run ove -- <command>`; paths are then relative to the repository root.

## Time

- Everything is in integer frames. Seconds × `fps` = frames (2 s at 30 fps = 60).
- `durationFrames` is the video length. Each scene needs `startFrame + durationFrames <= durationFrames` of the composition.
- Layer `startFrame` / `endFrame` (exclusive) are relative to the scene's start. Children of a `group` are relative to the group's start.
- Keyframe `frame` values are relative to the layer's own `startFrame`, not to the video. A layer starting at 45 with a keyframe at 0 animates from video frame 45.
- Every frame is computed independently from its number; there is no state carried between frames.

## Layout

- Origin is the top-left of the canvas; `x` grows right, `y` grows down, units are pixels of `width` × `height`.
- `rect`, `image` and `video`: `x`, `y` is the top-left corner; set `width` and `height`. `rect.radius` rounds corners.
- `circle`: `x`, `y` is the centre and `width` is the diameter.
- `text`: `y` is the top of the first line. `x` is the left edge, centre or right edge depending on `textAlign`. Use `\n` for line breaks; `lineHeight` is a multiple of `fontSize` (default 1.2). Text only wraps when you set `maxWidth`.
- Fitting text in a space: `maxWidth` wraps at spaces (a word wider than the box is split between letters). `maxLines` caps the line count; past it the text is cut and ends in "…". Add `minFontSize` and the text shrinks 1px at a time, down to that size, until it fits `maxWidth` and `maxLines` without splitting words. That is the right setting for template text like names: `"maxWidth": 900, "maxLines": 2, "minFontSize": 40`. Shrunk text keeps its top edge at `y`.
- Text style: `fontWeight` (100–900, `normal` or `bold`), `fontStyle` (`normal` or `italic`), `letterSpacing` in pixels, `color`.
- `rotation` (degrees) and `scale` pivot around `x + originX`, `y + originY` (both default 0, the top-left). Set `"originX": "center", "originY": "center"` to spin or grow a rect, image or video around its middle (a circle's centre is already its `x`, `y`). For text, `center` is the middle of `maxWidth` and of one line; use pixel values for an exact pivot.
- `group`: children's coordinates are relative to the group's `x`, `y`; the group's opacity, scale and rotation apply to all children.
- Higher `zIndex` draws on top within a scene; equal values keep the order they appear in the file. Scenes draw in the order they are listed, so a later scene covers an earlier one it overlaps.
- Colours: `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb(...)`, `rgba(...)` or `transparent`.

## Drawing

- `path` draws any shape from SVG path data, in pixels relative to its `x`, `y`: `{ "id": "tri", "type": "path", "x": 100, "y": 80, "d": "M0 0 L200 0 L100 150 Z", "fill": "#f59e0b" }`. Lines, arrows, curves (`C`, `Q`, `A`) and polygons are all paths. Leave out `fill` for a line. Give it `width`/`height` if you want `originX: "center"` to work.
- Outlines on `rect`, `circle`, `path` and `text`: `stroke` (colour or gradient), `strokeWidth` (default 1), `strokeDash` such as `[12, 6]`, `lineCap` (`butt`, `round`, `square`), `lineJoin` (`miter`, `round`, `bevel`; text defaults to `round`). An outline is drawn only when `stroke` is set. For an outline-only rect or circle, set `"fill": "transparent"`. Text outlines sit behind the fill, which suits captions: `"color": "#facc15", "stroke": "#111827", "strokeWidth": 10`.
- Line drawing: animate a path's `trimEnd` from 0 to 1 to draw its outline on; `trimStart` hides the start. Trims replace any `strokeDash`.
- Gradients work anywhere a `fill`, text `color` or `stroke` goes: `{ "type": "linear", "from": [0, 0], "to": [400, 0], "stops": [{ "offset": 0, "color": "#22d3ee" }, { "offset": 1, "color": "#e879f9" }] }` or `{ "type": "radial", "center": [100, 100], "radius": 100, "stops": [...] }`. Points are in the layer's own pixels.
- Effects on any visual layer:
  - `shadow: { "color": "rgba(0,0,0,0.5)", "blur": 16, "offsetX": 0, "offsetY": 8 }`. Shadow offsets ignore the layer's scale and rotation.
  - `blur` in pixels (animatable).
  - `filter` with CSS filter functions, e.g. `"grayscale(1) contrast(1.2)"`.
  - `blendMode`: `multiply`, `screen`, `overlay`, `darken`, `lighten`, `color-dodge`, `color-burn`, `hard-light`, `soft-light`, `difference`, `exclusion`, `hue`, `saturation`, `color` or `luminosity`.
  - On a group, these apply to each child separately, not to the group as one flattened picture.
- Rounded pictures: `radius` on `image` and `video` clips their corners. A shadow on a rounded image is clipped too, so for a card put a rounded `rect` with the shadow behind it.
- Masks: a group's `clipPath` (SVG path data in the group's pixels) shows its children only inside that shape, e.g. a circle: `"M100 0 A100 100 0 1 1 99.9 0 Z"`.

## Animation

```json
{ "property": "opacity", "keyframes": [{ "frame": 0, "value": 0 }, { "frame": 30, "value": 1, "easing": "easeOut" }] }
```

- Animatable properties: `x`, `y`, `opacity`, `rotation`, `scale`, `fontSize`, `width`, `height`, `radius`, `letterSpacing`, `strokeWidth`, `trimStart`, `trimEnd`, `blur`, and the colours `fill` (rect, circle, path), `color` (text) and `stroke`, whose keyframe values are plain colours (an animated colour replaces a gradient): `{ "property": "fill", "keyframes": [{ "frame": 0, "value": "#ef4444" }, { "frame": 30, "value": "#22c55e" }] }`. An animated value replaces the static field.
- Before the first keyframe the value holds the first keyframe's value; after the last it holds the last.
- `easing` on a keyframe controls the segment that arrives at that keyframe: `linear` (default), `easeIn`, `easeOut`, `easeInOut`, `easeInCubic`, `easeOutCubic`, `easeInOutCubic`, `easeInBack` (pulls back first), `easeOutBack` (overshoots, then settles), `spring` (overshoots about 10% and settles), `hold` (stays at the previous value, then jumps), or CSS-style Bézier control points like `[0.4, 0, 0.2, 1]`.
- `repeat: n` plays the keyframes n more times after the first; add `reverse: true` to play every other cycle backwards (ping-pong).

## Transitions

```json
{ "id": "two", "startFrame": 75, "durationFrames": 90,
  "transitionIn": { "type": "slide", "direction": "right", "durationFrames": 15, "easing": "easeOutCubic" } }
```

- Scenes take `transitionIn` (over their first `durationFrames`) and `transitionOut` (over their last). Types: `fade`; `slide` (the whole scene moves in from, or out towards, `direction`: `left`, `right`, `top`, `bottom`); `wipe` (revealed or hidden by an edge moving from `direction`); `zoom` (grows from 85% while fading in, shrinks while fading out). `easing` defaults to `easeInOut`.
- To go from one scene to the next, overlap them: start the next scene `durationFrames` frames before the previous one ends. A later scene draws on top, so `slide`/`wipe`/`zoom` in on the new scene covers the old one; for a crossfade give the old scene `transitionOut` fade and the new one `transitionIn` fade with the same length.
- Without an overlap, a transition shows the canvas background behind the scene.
- Scene length counts the overlap: both scenes must still fit in the composition's `durationFrames`.

## Media

- Declare files in `assets` with an `id`, then reference that id from an image or video layer's `src`. A `src` may also be a path relative to `composition.json` or an `https://` URL.
- Images: PNG, JPEG, WebP, GIF and SVG. `objectFit` is `cover` (fill and crop, the default), `contain` (letterbox) or `fill` (stretch). SVG files need `width` and `height` attributes.
- Video: a `video` layer takes `src`, `width`, `height` and `objectFit` like an image. `trimStart` skips that many frames of the source (counted at the composition fps), `playbackRate` speeds it up (2) or slows it down (0.5), and past the end of the source it holds the last frame unless `loop` is true. The layer's own `startFrame` is when the clip starts playing. Any format FFmpeg can read works (MP4, MOV, WebM, …); the first render of a clip decodes it into a cache, later renders and stills reuse it. A video's own sound plays while the layer is on screen; set `volume` (1 = unchanged) or `muted: true`.
- Sound effects, voice-over and music go in `audio` layers: `{ "id": "vo", "type": "audio", "src": "voice", "startFrame": 30 }`. They have no position and are never drawn. Timing works like any layer: the sound plays from the layer's `startFrame` until its `endFrame`, its scene or group ends, or the source runs out (then silence, or `loop: true` to repeat). Options: `volume` (0–4, 1 = unchanged), `trimStart` (source frames to skip), `playbackRate` (changes speed, keeps pitch), `fadeInFrames`, `fadeOutFrames`. Overlapping sounds are added together, so lower `volume` on music under voice-over.
- `export.audio` (an audio asset id or relative path) is a soundtrack that loops under the whole video. Use an `audio` layer instead when it should start later, stop, or fade.
- Output: `ove render` picks the format from the `--output` extension: `.mp4` (H.264, or H.265 with `--codec h265`), `.webm` (VP9 + Opus), `.mov` (ProRes, for editing software), `.gif` (silent, loops) or a path without extension for a folder of PNG frames. `--format` overrides it, and so does `export.format` in the composition when the output has no recognised extension. `--frames 30-89` renders part of the video (audio is cut to match).
- Transparency: `"export": { "transparent": true }` or `--transparent` leaves the background see-through, for overlays and lower thirds; only webm, mov and png keep it. Otherwise the canvas is filled with the composition's `background` colour (default `#101827`).
- Fonts: `fontFamily` can name an installed font, a list like `"Inter, Arial, sans-serif"`, or a font file declared as an asset: `{ "id": "brand-bold", "type": "font", "src": "./fonts/Brand-Bold.woff2", "family": "Brand", "weight": 700 }`. Declare one asset per file (weight and style), all with the same `family`, and text picks the closest one by `fontWeight`/`fontStyle`; without an italic file, italics are slanted artificially. WOFF2, WOFF, TTF and OTF work. Check a still: a misspelt family silently falls back to the default font.

## Variables (templates)

Declare inputs in a top-level `variables` object and use them as `{{name}}` in any string:

```json
"variables": {
  "customer": { "type": "string", "default": "there", "description": "First name" },
  "accent": { "type": "color", "default": "#4f46e5" },
  "left": { "type": "number", "default": 160 }
},
...
{ "id": "hello", "type": "text", "content": "Welcome, {{customer}}!", "x": "{{left}}" },
{ "id": "glow", "type": "circle", "fill": "{{accent}}", "width": 600 }
```

- Types: `string`, `number`, `boolean`, `color`, `list`. A variable without a `default` must be given a value.
- A list holds objects. Declare their fields with `items` so values are checked and get defaults: `"products": { "type": "list", "items": { "name": { "type": "string" }, "price": { "type": "number" }, "discount": { "type": "number", "default": 0 } }, "default": [ ... ] }`. On the command line pass a list as JSON (`--var 'products=[{"name":"Mug","price":12}]'`), or put it in a `--vars` file.
- `{{ }}` holds an expression, not just a name: `{{160 + index * 320}}`, `{{item.name}}`, `{{items[0].price}}`, `{{products.length}}`, `{{discount > 0 ? "#dc2626" : "#111827"}}`, `{{round(price * (1 - discount / 100), 2)}}`. Operators: `+ - * / %`, `== != < <= > >=`, `&& || !`, `? :`. Functions: `round(x, digits)`, `floor`, `ceil`, `abs`, `min`, `max`, `upper`, `lower`, `string`, `number`. `+` joins text. There are no list literals: lists come from variables or plain JSON arrays.
- A string that is exactly one `{{ }}`, like `"{{left}}"` or `"{{index * 8}}"`, becomes the typed value, so it works in number and boolean fields. Anywhere else the value is inserted as text.

### Repeat, if and components

These work in `layers`, group `children`, `scenes` and repeat bodies:

```json
{ "repeat": "{{products}}", "as": "p", "each": [
  { "id": "card-{{index}}", "type": "rect", "x": "{{40 + index * 300}}", "startFrame": "{{index * 8}}", "width": 270, "height": 360 },
  { "if": "{{p.discount > 0}}", "id": "badge-{{index}}", "type": "text", "x": "{{60 + index * 300}}", "content": "-{{p.discount}}%" }
] }
```

- `repeat` takes a list (a `{{ }}` or a JSON array) and outputs the `each` entries once per item. Inside, `as` names the item (default `item`), `index` counts from 0, and `count` is the list length. Use them for positions (`{{x0 + index * gap}}`), staggered timing (`"startFrame": "{{index * 8}}"`), centring (`{{(width - count * cardWidth - (count - 1) * gap) / 2 + index * (cardWidth + gap)}}`) and unique ids (`"card-{{index}}"`; ids are not made unique for you). Nested repeats need different `as` names; the inner `index` hides the outer one.
- `"if"` on any layer, scene or repeat keeps it only when true. Empty text, empty lists, `0`, `false` and `null` are false.
- Components are reusable layer sets, declared once at the top level:

```json
"components": { "badge": { "params": { "label": { "type": "string" }, "tone": { "type": "color", "default": "#16a34a" } },
  "layers": [ { "id": "bg", "type": "rect", "width": 120, "height": 40, "radius": 20, "fill": "{{tone}}" },
              { "id": "text", "type": "text", "x": 16, "y": 8, "content": "{{label}}" } ] } }
```

  Place one with `{ "use": "badge", "id": "new-badge", "x": 50, "y": 60, "startFrame": 5, "with": { "label": "New" } }`. It becomes a group, so every group field (`x`, `y`, `startFrame`, `animations`, `opacity`, `scale`…) works on the placement. Don't give it a `type`.
- Inside a component's layers, only its `params` and the composition's own variables are visible. Pass loop values in through `with`, e.g. `"with": { "label": "{{p.name}}" }`. Components can use other components, but not themselves.
- Any string can use them: text, colours, image/video/audio `src`, the composition `name`.
- Give values with `--var customer=Priya` (repeatable; `\n` makes a line break) or `--vars values.json`. They work with `validate`, `inspect`, `still` and `render`.
- One video per row: `ove render composition.json --batch rows.json --output "out/{{customer}}.mp4"`, where `rows.json` is an array of `{ "customer": "Priya", ... }` objects. Every row is checked before anything renders, and two rows may not write the same file.
- Mistakes are reported all at once, each with its location: unknown names and fields, values of the wrong type, bad expressions, unknown components and missing params.
- Editors validating against `composition.schema.json` will flag `"{{left}}"` in a number field and `repeat`/`use` entries in layer lists; that is expected. `ove validate` is the real check.

## Common mistakes

- Keyframes written in video frames for a layer with a non-zero `startFrame`.
- Text running off the canvas or out of its box: set `maxWidth` (and for template text `maxLines` + `minFontSize`), then check a still with the longest value you expect.
- Rotating or scaling a shape expecting it to pivot on its centre without setting `originX`/`originY` to `"center"`.
- Butting scenes end to end and expecting a transition between them: they have to overlap by the transition length.
- Forgetting `width`/`height` on a `rect`, which then draws nothing.
