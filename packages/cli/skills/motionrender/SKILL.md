---
name: motionrender
description: Create and edit videos with MotionRender (mr/motionrender) by writing a JSON composition, then validating, previewing stills and rendering MP4. Use whenever the user asks to make, change, animate or render a video in a project with MotionRender composition.json.
---

# Making videos with MotionRender

This is the entry-point skill for OVE: start here, choose the route below, and load the short task guide that matches the request — `ove-react-video` (high-end React videos with spring physics, glassmorphism and kinetic typography), `ove-code-video` (video written as code, code layers), `ove-make-reel` (social video from blocks), `ove-voiceover-captions`, `ove-batch-videos` and `ove-ai-compose` (AI drafts, refine, history). Come back here for field details.

An OVE video is one JSON file, `composition.json`. You never write rendering code: you edit data, check it, look at frames, and render. `composition.schema.json` next to it is the authoritative JSON Schema; read it when unsure about a field.

## Choose the route first

Before composing anything, decide *how* this video gets made, in one step: run `ove ai capabilities` (machine-readable with `--json`) and pick the route that fits the brief. A template is used only when its scenes and look already match the video; otherwise write a full composition, or React code when the brief needs motion graphics no layout carries.

- **Template route** — a registered template (promo, slideshow, product card, flash sale…) already matches the brief's structure and look. Fastest, cheapest and most consistent: `ove ai compose` fills its text variables from the brief, or `ove init --template <name>` starts an editable project. A `--duration` different from the template's own stretches or trims the resolved composition to fit (scene timing scales proportionally; the result is saved as a plain composition, since the timing is then bespoke), so a length difference is not a reason to leave this route.
- **JSON route** — when no template matches the brief's structure and look: `ove ai compose --brief "…"` writes a full composition, or you write `composition.json` by hand from the fields below. Length, layout and motion are all yours; the registry lists every block, effect and sound you can name. This route carries structured, typographic and data-led videos well.
- **React route** — when the brief needs spring physics, interlocking layouts, 3D, canvas or generated visuals that no block layout carries: `ove ai compose` on your machine can have the planner write the component and build it, or you load `ove-react-video` (or `ove-code-video` for scene logic as code) and use a `type: "react"` layer inside an otherwise ordinary composition. Hosted workers never write React code from a prompt.
- **Batch or narration** — many rows of fields → `ove-batch-videos`; voiceover or captions → `ove-voiceover-captions`.
- **Raw footage** — a recorded clip to clean up (talking head, demo, vlog) → `ove ai edit` (below): transcribe, cut silences and fillers, caption, and write an edited project. A long recording to split up (podcast, stream, webinar) → `ove ai shorts` (below): one transcription, the strongest runs scored and written as separate vertical reel projects. No brief needed; the clip is the input.

If the brief also carries template fields (`--fields metric,value`), it goes to the JSON route: templates take neither batch fields nor data-driven lists. The chosen route is a real routing contract, not a suggestion — the AI planner makes the same decision (`template`, `json` or, where the host can run the code, `react`) before generating, chooses a template only when its scenes and look already match the brief, writes the video when none does, and falls back to templates when planning fails. `--no-plan` opts out; `--no-react` keeps it off the React route.

The registry the planner reads is the same list you just saw: `ove ai capabilities --json` is the machine-readable menu of every template, theme, block, component, effect and sound, one entry per capability with its kind and name. Third-party agents and skills should compose *on* OVE — read that registry, write a `composition.json`, and use the validate → still → review loop here — rather than re-implementing rendering. Whatever generates the JSON (planner, model, or you), it stays outside the render path: the renderer only ever reads a validated schema-compliant composition.

## Loop

1. For a new video of more than a few seconds, agree beats, look and storyboard first (see Planning a video). Then edit `composition.json`.
2. `ove validate composition.json` and fix every error it reports.
3. `ove still composition.json --frame <n> --output still.png` and look at the image. Check the first frame, the end of each animation, and the last frame.
4. `ove review composition.json --output review.png`: fix every error and warning it lists, then look at the contact sheet it writes (20 frames across the video, labelled with frame numbers) as a whole. Does each scene have one clear focus? Does the video keep moving? Do scenes look like one system?
5. `ove render composition.json --output out.mp4` once the review is clean and the sheet looks right.

`ove review` samples a frame every half second and reports, with frame numbers and layer ids: text cut short with "…", running off the frame, under 2% of the frame's short side, overlapping other text or sitting under the captions (when that lasts a second or more); text sitting where a platform's own UI covers the picture (on a 9:16 canvas the bottom 18% and right 11% — Instagram Reels, TikTok and YouTube Shorts all draw their caption, audio and action controls there; a wider tall canvas such as 4:5 or square is letterboxed in the player, so the bands shrink to where the chrome actually lands — flagging any text whose area is more than a quarter inside a band); more than 40 words on screen; text on screen too briefly to read its words (about a quarter of a second a word, plus half a second); more than two headline-size texts competing (a headline set one word per line counts once); caption lines on screen under 0.7 s or faster than about 20 characters a second; sounds cut off mid-phrase by the end of their scene or `endFrame`; nearly equal font sizes or more than 8 steps of size; more than 5 text colours; 4 seconds or more where nothing moves; scenes all the same length; three or more transition styles; text teleporting to a new place across a hard cut; and sound quieter than -20 LUFS, louder than -11 LUFS or peaking above -1 dBTP. It exits with an error when it finds errors, `--json` prints the findings as JSON, `--every n` samples every n frames, `--sheet-frames n` sets how many frames the sheet shows. It is a check, not a verdict on taste: a clean review still needs your eye on the sheet.

`ove inspect composition.json` prints duration, scene count, variables and assets. A person working alongside you can run `ove dev composition.json` for a live preview that reloads on every save. Its Studio can also edit `composition.json` (layer timing and properties), so re-read the file before changing it rather than relying on an earlier copy. `ove doctor` checks FFmpeg, its encoders and the browser when a render fails for setup reasons. `ove schema` prints the JSON Schema. Every command checks its options: a misspelt or misplaced option stops it with a suggestion, and `--name=value` works as well as `--name value`. Inside the OVE repository itself, run the CLI as `npm run ove -- <command>`; paths are then relative to the repository root.

What you leave behind in the project folder, every time: the final `composition.json`, `out.mp4`, the contact sheet (`review.png`), and one still per scene or beat (`still-<frame>.png`). Another agent, a person, or a CI run must be able to audit the video from those files alone — validation output is ephemeral, the artifacts are not. `ove review`'s contact sheet doubles as the storyboard for a first rough build (see Planning a video).

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
- Rich text: give a text layer `spans` instead of `content` to mix styles in one block: `"spans": [{ "text": "Assistant vs. " }, { "text": "agent", "color": "#22d3ee", "fontWeight": 800 }]`. Each span can set `color` (or a gradient), `fontSize`, `fontWeight`, `fontStyle`, `fontFamily`, `background` (a highlight box) and `underline`; anything unset comes from the layer. Spans wrap together, keep a shared baseline across sizes, and shrink together for `maxLines`/`minFontSize`. Put spaces inside the span texts; `\n` breaks a line.
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
- Shape morphing: animate a path's `d` to turn one shape into another: `{ "property": "d", "keyframes": [{ "frame": 0, "value": "M0 -100 A100 100 0 1 1 -0.1 -100 Z" }, { "frame": 20, "value": "M-100 -100 L100 -100 L100 100 L-100 100 Z", "easing": "move" }] }`. Works best between single closed outlines of similar size (circle, square, star, blob, icon silhouette), centred on the same point; shapes with holes or several pieces morph with stray lines. Use it to carry an object across a beat: the circle that was the logo becomes the card the next scene is about.
- Masks: a group's `clipPath` (SVG path data in the group's pixels) shows its children only inside that shape, e.g. a circle: `"M100 0 A100 100 0 1 1 99.9 0 Z"`.

## Animation

```json
{ "property": "opacity", "keyframes": [{ "frame": 0, "value": 0 }, { "frame": 20, "value": 1, "easing": "land" }] }
```

- Animatable properties: `x`, `y`, `opacity`, `rotation`, `scale`, `fontSize`, `width`, `height`, `radius`, `letterSpacing`, `strokeWidth`, `trimStart`, `trimEnd`, `blur`, and the colours `fill` (rect, circle, path), `color` (text) and `stroke`, whose keyframe values are plain colours (an animated colour replaces a gradient): `{ "property": "fill", "keyframes": [{ "frame": 0, "value": "#ef4444" }, { "frame": 30, "value": "#22c55e" }] }`. An animated value replaces the static field.
- Before the first keyframe the value holds the first keyframe's value; after the last it holds the last.
- `easing` on a keyframe controls the segment that arrives at that keyframe. Choose by the job the motion does:
  - `land`: entrances. Most of the travel happens early, then a long soft settle, so the element arrives with weight. The default choice for text, cards and panels coming in (14–24 frames).
  - `snap`: almost all of the move in the first few frames, then a tail. For the one hero element or a call to action (10–20 frames).
  - `glide`: a gentler ease-out for supporting elements and fades.
  - `pop`: lands with a small overshoot. Badges and icons only, sparingly.
  - `move`: accelerates and decelerates, for something repositioning within the frame.
  - `exit`: accelerates away. Exits are faster than entrances (8–14 frames).
  - `drift`: close to linear, soft at both ends, for slow continuous motion over seconds (background glows, a gentle zoom on a held title).
  - Standard curves: `linear` (the default; fine for opacity), `easeIn`, `easeOut`, `easeInOut`, `easeInCubic`, `easeOutCubic`, `easeInOutCubic`, `easeInQuart`, `easeOutQuart`, `easeInOutQuart`, `easeInExpo`, `easeOutExpo`, `easeInOutExpo`, `easeOut`, `easeInOut`, `easeInCubic`, `easeOutCubic`, `easeInOutCubic`, `easeInBack` (pulls back first), `easeOutBack` (overshoots, then settles), `spring` (overshoots about 10% and settles), `hold` (stays at the previous value, then jumps), or CSS-style Bézier control points like `[0.4, 0, 0.2, 1]`.
- Kinetic text: `split` on a text layer animates it piece by piece, each word, letter or line playing the same entrance a few frames after the previous:

  ```json
  { "id": "headline", "type": "text", "content": "Build the future", "fontSize": 160, "split": { "by": "words", "stagger": 4, "preset": "rise" } }
  ```

  - `by`: `words` (default), `letters` or `lines`. Rich text (`spans`) splits by words or lines.
  - `stagger`: frames between one piece and the next (default 3; fractions work, e.g. 1.5 for letters).
  - `preset` (default `rise`): `rise` (up into place), `fade`, `pop` (grows in with a small overshoot), `blur` (comes into focus), `slide` (in from the right), `drop` (down into place), `typewriter` (each piece appears at once; use with letters and `stagger` 1–2). `duration` (default 18) is how long each piece takes.
  - `order`: `forward` (default), `reverse`, `center` (from the middle out), `edges` (from both ends in), `random` (shuffled, the same every render).
  - `animations` replaces the preset with your own keyframes for every piece, in `x`, `y` (offsets from where the piece sits), `opacity`, `scale`, `rotation` (around the piece's centre), `blur` and `color`; frames count from the layer's start.
  - The layer's own animations still apply to the whole block, so a group fade or a slow `drift` zoom works on top. Gradients stay continuous across the pieces.
  - Use it for headlines and short statements: words for most headlines, letters for one or two short words, lines for paragraphs. Keep body text and captions whole.
- `repeat: n` plays the keyframes n more times after the first; add `reverse: true` to play every other cycle backwards (ping-pong).

## Rich layouts: react layers

There is no html layer. When a layout is easier to say as markup and CSS than with positioned layers (a card with an icon beside wrapping text, a table, a chart drawn as inline SVG, a UI mock-up, mixed typography, a live counter), write it as a React component and draw it with a `react` layer. The `ove-react-video` skill covers writing the component; `ove build video.tsx` bundles it. To put one inside a JSON composition, point a layer at a bundle:

```json
{ "id": "card", "type": "react", "src": "card.bundle.js", "x": 190, "y": 160, "width": 900, "height": 400, "durationInFrames": 120,
  "props": { "title": "Real React" } }
```

- The component is a pure function of the frame: `useCurrentFrame()` counts from the layer's `startFrame`, `props` is handed to it, and `props` may use `{{variables}}` and expressions like any other field.
- It runs JavaScript while rendering, so a render needs `--allow-code`. AI-written and pasted compositions cannot contain react layers.
- Every bundled font family works by name in CSS (`font-family: "Fraunces"`): Inter, Space Grotesk, Fraunces, Archivo, Source Sans 3, Playfair Display, DM Sans, Manrope, Syne, JetBrains Mono, Bebas Neue and Instrument Serif. Only the families the markup names are embedded. Any other font has to come with the bundle (an imported `@font-face` stylesheet).
- Pictures it uses are declared in `assets` and named by id or path in `<img src>`. Nothing loads from the web.
- The layer moves, fades, scales and rotates like any other, and works under the camera, in groups and with transitions. `resolution: 2` keeps it sharp when scaled up.
- Prefer ordinary text layers for headlines and captions: `ove review` reads their text, but cannot see text inside a react layer.
- The `fx-*` blocks are built this way: `ove add fx-counter-hero` copies a shared `fx.bundle.js` beside the composition, and each block's layer picks its effect with `props.effect`.

## Lottie, shaders and layout

**Lottie animations** (exported from After Effects with Bodymovin, or from LottieFiles) play frame-exactly:

```json
{ "id": "check", "type": "lottie", "src": "check-anim", "x": 860, "y": 400, "width": 200, "height": 200, "startFrame": 30 }
```

- `src` is a `"type": "lottie"` asset or a `.json` path. `fit` is `contain` (default), `cover` or `fill`; `trimStart`, `playbackRate` and `loop` work as on video layers, and without `loop` it holds its last frame.
- After Effects expressions are not supported (they are JavaScript), and pictures must be embedded in the JSON. Use Lottie for icons, illustrations and character moments rather than redrawing them as paths.

**Shaders** fill a box with a GLSL fragment shader, for animated gradients, noise, light and textures:

```json
{ "id": "sky", "type": "shader", "width": 1920, "height": 1080, "resolution": 0.5, "vars": { "--tint": "#8b5cf6" },
  "fragment": "void main(){ vec2 uv = gl_FragCoord.xy / resolution; gl_FragColor = vec4(tint.rgb * (0.5 + 0.5 * sin(uv.x * 8.0 + time)), 1.0); }" }
```

- Provided uniforms: `time` (seconds into the layer), `resolution` (pixels), `frame`, and Shadertoy's `iTime`, `iResolution`, `iFrame`; Shadertoy code written as `mainImage(out vec4 fragColor, in vec2 fragCoord)` works as is. Each var becomes a uniform without its dashes (`--tint` → `tint`): numbers as `float`, colours as `vec4`; animate them with keyframes on `"--tint"`.
- `resolution: 0.5` renders at half size and scales up, four times faster; fine for soft backgrounds. Renders use a software GPU so pixels match on every machine; a shader that is slow there (many loop iterations per pixel) makes renders slow.
- A shader that does not compile stops the render with the compiler's message and the layer's id.

**Layout**: give a group `layout` and its children are placed one after another, measured as they draw (text included), so cards, lists and rows reflow when text changes:

```json
{ "id": "row", "type": "group", "x": 120, "y": 120, "width": 1680, "layout": { "direction": "row", "gap": 24, "align": "center", "justify": "space-between" },
  "children": [ { "id": "title", "type": "text", "content": "{{title}}", "fontSize": 64 }, { "id": "badge", "type": "rect", "width": 220, "height": 64, "radius": 32, "fill": "#22d3ee" } ] }
```

- `direction` `row` or `column`; `gap` between children; `padding` inside the group; `align` across the direction (`start`, `center`, `end`); `justify` along it (`start`, `center`, `end`, `space-between`) within the group's `width` (row) or `height` (column).
- Children are measured by their width and height (circles by diameter, text by its lines, groups with a layout by their content); give paths and captions a width and height. A child's own `x` and `y` offset it from its place, so entrance animations still work.

## Camera and motion blur

A scene's `camera` moves the view of the whole scene, like a camera over a set, instead of every layer moving on its own:

```json
{ "id": "loop", "durationFrames": 300,
  "camera": { "animations": [
    { "property": "zoom", "keyframes": [{ "frame": 0, "value": 1 }, { "frame": 40, "value": 1.6, "easing": "land" }] },
    { "property": "x", "keyframes": [{ "frame": 0, "value": 960 }, { "frame": 40, "value": 1300, "easing": "land" }] } ] },
  "layers": [ … , { "use": "cc", "id": "cc", "fixed": true, "with": { "src": "cc-loop" } } ] }
```

- `x`, `y`: the point of the scene shown at the centre of the frame (default: the frame's centre, so a camera that does not move changes nothing). `zoom`: 2 shows half as much at twice the size. `rotation` in degrees. `shake`: a wobble of that many pixels, the same in every render; animate it up to 6–12 for an impact and back to 0 over half a second.
- All five animate like layer properties. To frame something, point the camera at its centre and zoom so it fills about two thirds of the frame.
- `"fixed": true` on a top-level scene layer keeps it in place while the camera moves: captions, logos, progress bars, anything that is part of the screen rather than the scene. Place captions with `fixed` whenever the scene has a camera.
- `overlay` (top level, a list of layers) holds what stays for the whole video: a chapter header, a footer, a progress bar. Its layers draw over every scene, their frames count from the start of the video, and no scene camera or transition touches them. Write it once; do not repeat a header in every scene. On loading it becomes one last scene named `overlay`.
- A text layer's `highlight` (0 to 1, default 1, animatable) sweeps the span `background` highlights in left to right, one span after the next: animate it 0 to 1 for a highlighter swipe. Rich text only, and not with `split`.
- Good uses: a push-in that lands on what the narration talks about (`land`, 20–40 frames), a slow `drift` zoom of 1 → 1.05 over a held scene so it never freezes, a pull-back that reveals the whole diagram, a small shake when something hits. Avoid constant wandering; the camera should move with a reason, then rest.
- Things outside the frame become visible when the camera zooms out or pans: build the scene larger than the frame where it needs to be.

`"motionBlur": { "samples": 8, "shutter": 180 }` at the top level blurs fast motion (camera moves, things flying in) the way a film camera does: each frame averages that many moments across the shutter (180° = half a frame). Things that do not move stay exactly as sharp. It makes renders slower (about 2.5× with 8–10 samples), so render drafts with `--no-motion-blur`; the live preview and `ove review` show frames without it. Worth it for videos with fast moves; pointless for slow, calm ones.

## Matte and colour grade

Two properties on any layer (and `grade` on a scene):

```json
{ "id": "speaker", "type": "video", "src": "clip.mp4", "matte": { "src": "speaker-matte.mp4", "mode": "luma" } }
{ "id": "look", "type": "video", "src": "clip.mp4", "grade": { "look": "cinematic", "contrast": 0.1, "temperature": -0.1 } }
```

- `matte` shows the layer only where the matte says so. The matte is a video or picture you make with any tool (rembg, Robust Video Matting, an editor): `luma` keeps the layer where the matte is white, `alpha` where it is opaque, `invert` keeps the opposite. A video layer's matte follows its own `trimStart` and `playbackRate`. It becomes a group named `<id>-masked` when the file loads, so give layers unique ids; put blur, scale or a blend mode on a group around the masked layer, not on the layer, to affect the cut-out. `ove track matte.mp4` writes where the speaker is in each frame (for labels that follow).
- `grade` is exposure (stops), contrast, saturation, temperature, tint, shadows, highlights and fade, each -1 to 1 (exposure -3 to 3), or a `look`: warm, cool, cinematic, teal-orange, noir, vivid, faded. Numbers add to the look. It is static; cross-fade two graded layers to change a grade over time. On a scene, it grades every layer in it except `fixed` ones.

## Transitions

```json
{ "id": "two", "startFrame": 75, "durationFrames": 90,
  "transitionIn": { "type": "slide", "direction": "right", "durationFrames": 15, "easing": "easeOutCubic" } }
```

- Scenes take `transitionIn` (over their first `durationFrames`) and `transitionOut` (over their last). Types: `fade`; `slide` (the whole scene moves in from, or out towards, `direction`: `left`, `right`, `top`, `bottom`); `wipe` (revealed or hidden by an edge moving from `direction`); `zoom` (grows from 85% while fading in, shrinks while fading out); `iris` (a circle opening from `x`, `y`, default the centre: put it on the hero so the next scene opens out of it); `push` (comes in from `direction` and pushes the scene underneath out the same way at the same speed, so motion carries across the cut; `transitionIn` only); `dip` (through a solid `color`, default black, which covers everything at the midpoint: use white for a flash, black for a pause between chapters); `blur` (comes into focus while fading in, or goes out of focus). `easing` defaults to `easeInOut`; `move` suits push, `land` suits iris and blur.
- Every cut should have a reason: `push` when the story moves on in the same direction, `iris` when the next scene is inside or about the hero, `dip` for a chapter break, a plain `fade` otherwise. Keep one or two styles through a video.
- To go from one scene to the next, overlap them: start the next scene `durationFrames` frames before the previous one ends. A later scene draws on top, so `slide`/`wipe`/`zoom` in on the new scene covers the old one; for a crossfade give the old scene `transitionOut` fade and the new one `transitionIn` fade with the same length.
- Without an overlap, a transition shows the canvas background behind the scene.
- Scene length counts the overlap: both scenes must still fit in the composition's `durationFrames`.
- Let OVE place scenes: leave out a scene's `startFrame` and it starts where the previous scene ends, minus its `transitionIn` length (so the transition plays over the previous scene). Set `"overlap": 0` to start right after instead, as when the previous scene fades out first. `"durationFrames": "auto"` on the composition ends the video with its last scene.

## Timing from media (narration-driven videos)

Every audio and video asset is measured when a composition mentions `media`, so scenes and cues can follow the voiceover instead of hand-typed frame numbers:

- `media['vo-intro'].frames` / `.duration`: the clip's length in frames (at the composition fps) / seconds.
- `media['vo-intro'].soundEndFrames` / `.soundEnd`: where the last sound ends, ignoring trailing silence.
- `media['vo-loop'].segments[i]`: the stretches of sound between pauses (`.startFrame`, `.endFrame`, `.start`, `.end`). In speech each segment is a phrase, so `segments[2].startFrame` is when the third phrase starts.

```json
{ "id": "loop", "durationFrames": "{{18 + media['vo-loop'].soundEndFrames + 38}}",
  "layers": [ { "id": "voice", "type": "audio", "src": "vo-loop", "startFrame": 18 },
              { "repeat": "{{steps}}", "each": [ { "id": "step-{{index}}", "type": "text", "startFrame": "{{18 + media['vo-loop'].segments[index + 1].startFrame}}", "content": "{{item.name}}" } ] } ] }
```

- Times inside a scene are scene frames, so add the voice layer's own `startFrame` (18 above) to clip positions.
- Run `ove inspect composition.json` to see the measured `media` (lengths and segments) and the scene timings it produces; use it to pick segment indices.

## Captions

```json
{ "id": "cc", "type": "captions", "src": "cc-intro", "startFrame": 18, "x": 960, "y": 960 }
```

- `src` is a `captions` asset (or a path): an `.srt` or `.vtt` file, or JSON with timed lines (`{ "cues": [{ "text", "start", "end" }] }`) or timed words (`{ "words": [{ "text", "start", "end" }] }`, seconds). Give the layer the same `startFrame` as its voice layer.
- With word timings the word being said is highlighted (`highlightColor`), words already said use `color`, and words still to come use `upcomingColor`; `mode: "lines"` shows plain lines. Words are grouped into lines at sentence ends, commas and pauses, up to `maxWords`.
- The line is centred on `x` (with `textAlign: "center"`) with its top at `y`, wrapped to `maxWidth`, on a `background` box with `padding` and `radius`. Style with `fontSize`, `fontFamily`, `fontWeight` and the outline options. `offset` shifts the timing in seconds.
- On a 9:16 canvas, keep the caption block above the bottom UI band (the bottom 18% is where Instagram/TikTok draw their controls) and inside the side bands: a top around y 77% of the height and a `maxWidth` of about 76% of the width clears both. A 4:5 or square canvas is letterboxed in the player, so the band lands lower and the check accounts for it. `ove review`'s `safe-zone` check flags text that sits in a band.
- Filler words (um, uh, erm, ah, hmm…) and words said twice in a row are left out of captions by default (`dropFillers: false` keeps them), in the video and in exported subtitles.
- `emphasis: ["agent", "goal"]` draws those words (any case, punctuation ignored) in `emphasisColor` (default `highlightColor`) once they are said: two or three key words per video, not one per line.
- `ove captions composition.json --output captions.srt` (or `.vtt`) writes every captions layer as a subtitle file for uploads.

## Editing raw footage

```bash
ove ai edit ./raw/take.mp4 --out reel --max-silence 0.5
```

- Turns a raw clip into an edited project: the clip's audio is transcribed with word timings, pauses longer than `--max-silence` seconds (default 0.5) and filler words (um, uh, erm…) plus immediate repeats become a cut list, and the project is written as `composition.json` + `composition.schema.json` + `assets/`. The result is one `video` layer per kept stretch (`trimStart` skips the removed source, the clip's own sound carried through, hard jump cuts between stretches) and a word-timed captions layer above the platform UI band.
- `--width`/`--height` set the canvas (default 1080×1920, the clip centre-cropped with `objectFit: cover` — the standard landscape-talking-head-to-reel move); `--keep-fillers` leaves the ums in; `--no-captions` skips the captions layer; `--force` writes into a directory that already has files.
- The output is an ordinary project: review it (`ove review reel/composition.json --output review.png`), tune it (the cut list is visible as the scene boundaries — delete a `clip-N` scene to restore a moment, or re-run with a different `--max-silence`), then render (`ove render reel/composition.json --output out.mp4`). Transcription needs a provider with `transcribe` (`--provider freellmapi`, or any adapter that implements it); everything else is local.

## Splitting a long recording into shorts

```bash
ove ai shorts ./raw/podcast.mp4 --out shorts --count 5 --min 15 --max 60
```

- Transcribes the recording **once**, splits it into sentence runs (punctuation or a pause over `--max-silence` seconds ends one), and scores every window of whole sentences with a transparent rubric: a clean ending (2), a hook in the first sentence — question, direct address, number, or words like *best/never/secret/mistake* (2), speech density near 2.5 words a second (0–1), and a length near the 25–45 s sweet spot (0–1). The best `--count` non-overlapping windows are written as `shorts/short-01/`, `short-02/`, … each a full project.
- Each short gets the same edited-reel shape as `ove ai edit` (silences and fillers tightened inside it, word-timed captions above the platform UI band, 1080×1920 centre-cropped). `--no-cut` keeps each short one continuous stretch; `--no-captions`, `--width/--height/--fps` work as there.
- The rubric is a lead, not a verdict: the summary prints each short's time range, score and opening line — swap a weak pick by editing its `composition.json`, or re-run with different `--min/--max`. Very long recordings may exceed the transcription provider's upload limit; trim or split the source first.

## Media

- Declare files in `assets` with an `id`, then reference that id from an image or video layer's `src`. A `src` may also be a path relative to `composition.json` or an `https://` URL.
- Images: PNG, JPEG, WebP, GIF and SVG. `objectFit` is `cover` (fill and crop, the default), `contain` (letterbox) or `fill` (stretch). SVG files need `width` and `height` attributes.
- Video: a `video` layer takes `src`, `width`, `height` and `objectFit` like an image. `trimStart` skips that many frames of the source (counted at the composition fps), `playbackRate` speeds it up (2) or slows it down (0.5), and past the end of the source it holds the last frame unless `loop` is true. The layer's own `startFrame` is when the clip starts playing. Any format FFmpeg can read works (MP4, MOV, WebM, …); the first render of a clip decodes it into a cache, later renders and stills reuse it. A video's own sound plays while the layer is on screen; set `volume` (1 = unchanged) or `muted: true`.
- Sound effects, voice-over and music go in `audio` layers: `{ "id": "vo", "type": "audio", "src": "voice", "startFrame": 30 }`. They have no position and are never drawn. Timing works like any layer: the sound plays from the layer's `startFrame` until its `endFrame`, its scene or group ends, or the source runs out (then silence, or `loop: true` to repeat). Options: `volume` (0–4, 1 = unchanged), `trimStart` (source frames to skip), `playbackRate` (changes speed, keeps pitch), `fadeInFrames`, `fadeOutFrames`. Overlapping sounds are added together, so lower `volume` on music under voice-over.
- Loudness: `"export": { "loudness": -14 }` (or `--loudness -14`) makes the finished sound measure that loudness in LUFS: -14 suits most streaming and social sites, -16 spoken explainers and podcasts. OVE mixes the sound once, measures it, and turns the whole mix up or down by one fixed amount, with a limiter keeping peaks under about -1.5 dBFS (so a very loud target can fall a little short rather than distort). Set it on every video with sound; `ove review` reports the loudness it will have.
- `export.audio` (an audio asset id or relative path) is a soundtrack that loops under the whole video, at `export.audioVolume` (default 1). Use an `audio` layer instead when it should start later, stop, or fade.
- Built-in sound effects: an audio layer with `"src": "sfx:whoosh"` (also `click`, `tick`, `pop`, `thump`, `ding`, `riser`) plays a synthesised sound, the same in every render, no asset needed. Put them on the frame something happens: `whoosh` on a fast move or push, `thump` when something big lands, `pop` or `tick` as cards and icons appear, `click` on a check mark or button, `ding` on a success, `riser` (1.6 s) ending just before a reveal. Keep them under the voice (`volume` 0.4–0.8) and use them where they mean something, not on every element.
- Changing volume: `volume` is animatable on audio and video layers (`{ "property": "volume", "keyframes": [...] }`).
- Ducking: `"duck": { "amount": 0.35, "attackFrames": 6, "releaseFrames": 18 }` on music (an audio layer, or `export.duck` for the soundtrack) lowers it to `amount` of its volume while any other sound plays, and brings it back in the pauses. `by: ["voice-id"]` limits it to certain layers. When the other sounds are assets OVE can measure, ducking follows their phrases rather than their whole time on screen. With ducking the music can sit louder overall (`audioVolume` 1.5 or so) without fighting the voice.
- Output: `ove render` picks the format from the `--output` extension: `.mp4` (H.264, or H.265 with `--codec h265`), `.webm` (VP9 + Opus), `.mov` (ProRes, for editing software), `.gif` (silent, loops) or a path without extension for a folder of PNG frames. `--format` overrides it, and so does `export.format` in the composition when the output has no recognised extension. `--frames 30-89` renders part of the video (audio is cut to match).
- Quality: `--crf 18` for higher quality (lower is better and bigger; defaults 20 H.264, 24 H.265, 32 VP9) or `--bitrate 8M` for a set data rate; `--audio-bitrate 256k`. `--scale 0.5` renders a quick half-size draft. The same settings exist as `export.crf`, `export.bitrate`, `export.audioBitrate` and `export.scale`.
- Transparency: `"export": { "transparent": true }` or `--transparent` leaves the background see-through, for overlays and lower thirds; only webm, mov and png keep it. Otherwise the canvas is filled with the composition's `background`: a colour (default `#101827`) or a gradient, in composition pixels.
- Fonts: the default `fontFamily` is Inter, which is built in: every weight from 100 to 900, italics, Latin, Greek, Cyrillic and Vietnamese, the same on every machine, with no asset needed. Large sizes automatically use its tighter display shapes. Other scripts (Arabic, CJK, Devanagari…) and emoji fall back to system fonts. `fontFamily` can also name an installed font, a list like `"Inter, Arial, sans-serif"`, or a font file declared as an asset: `{ "id": "brand-bold", "type": "font", "src": "./fonts/Brand-Bold.woff2", "family": "Brand", "weight": 700 }`. Declare one asset per file (weight and style), all with the same `family`, and text picks the closest one by `fontWeight`/`fontStyle`; without an italic file, italics are slanted artificially. WOFF2, WOFF, TTF and OTF work. Check a still: a misspelt family silently falls back to the default font.

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
- Beat grid: with a top-level `"tempo": { "bpm": 120, "offset": 0.2, "beatsPerBar": 4 }` (offset: seconds to the first beat), `beat(n)` is the frame of beat n (counting from 0), `bar(n)` of the first beat of bar n (`bar(n, b)` beat b in it), and `beats(n)` the length of n beats in frames. Use them so cuts and hits land on the music: `"startFrame": "{{bar(4)}}"`, `"durationFrames": "{{beats(8)}}"`, keyframes at `{{beat(3)}}`. Find the tempo and first beat by listening, or from the track's metadata.
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

## Blocks and themes

Ready-made pieces you copy into a video, like a component library. A **block** is a scene (title, big number, quote, bullet list, numbered steps, stat grid, section divider, call to action, phone mockup, image with caption, icon row, split screen) or an overlay (lower third, badge, progress bar, handle). Scenes come with a slow camera push, drifting background shapes, a push transition and soft built-in sound effects, and new compositions get light motion blur; the picture blocks take a screenshot or photo (`--set image=shot.png`, or an asset id). Blocks are sized from the canvas, so each one fits 16:9, 9:16, 1:1 and 4:5, and they read their colours from a **theme** (`midnight`, `paper`, `neon`, `espresso`).

```sh
ove blocks                                   # list blocks and themes
ove add title-hero reel/composition.json --aspect 9:16 --theme neon --set headline="Fresh roasted, daily"
ove add stat-grid reel/composition.json      # appends a scene
ove add lower-third reel/composition.json --scene title-hero --at 20 --set name="Sam Lee"
ove theme espresso reel/composition.json     # switch every block's colours at once
```

`ove add` writes plain JSON: a component (named after the block, with underscores) under `components` and a placement whose `with` holds the text, so a block is yours to edit afterwards. Scenes are appended and overlap by their fade; overlays go inside a scene (`--scene`, default the last) from `--at`. Expressions can read `canvas.width`, `canvas.height` and `canvas.fps`, which is how blocks resize themselves. Blocks live in `packages/cli/blocks/*.json` and themes in `packages/cli/themes/*.json`. Themes change colours, corner radius and heading weight; fonts stay Inter unless you add font assets.

`ove init --template launch-wide` (also `story-tall`, `explainer-square`, `keynote-wide`) starts from a whole video built from blocks. The AI picks among them and a theme too; see `docs/ai.md`.

Before building scenes by hand, check `ove blocks`: a block plus `--set` is faster and consistent. Validate and review as usual afterwards.

## Planning a video

For anything longer than a few seconds, agree the plan before building, in three cheap steps. Show each to the person and wait for their answer; changing a table costs nothing, changing a rendered video costs minutes.

1. **Beats.** A numbered table: for each beat, what the viewer should take away (one idea per beat), the words on screen, the narration if any, and roughly how long. Name the one idea of the whole video in a sentence above the table. Check facts you state.
2. **Look.** Two or three stills of key beats rendered with `ove still`: type, colours, layout, background. Agree the look on stills, not on a render.
3. **Storyboard.** `ove review`'s contact sheet of a first rough build (or one still per beat), with how each beat enters and leaves. Then build the motion and render.

When the person has already given exact content and a look, skip what is settled; for a quick change to an existing video, just do it and review.

## Story and pacing

- **Shapes that work for short videos:** a problem, then the thing that solves it, then proof, then what to do (product); a process shown step by step around one hero that stays put while the world changes (explainers); a question, then answers that build to the main one (teasers); a list of three to five items, each its own beat, then a payoff (features). Pick one before writing beats.
- **Open with the subject in the first second:** a short still or quiet moment is fine, a slow logo is not. The first frame someone sees in a feed should already say what this is.
- **One idea per beat, and beats of different lengths.** A beat that builds can hold three to six seconds; a turn (the moment the idea changes) should land in a few frames after a short pause. Equal-length beats read as a slideshow; `ove review` flags them.
- **Stillness before the payoff.** Let the frame and the sound settle for half a second to a second before the most important reveal, then hit it: the loudest sound and the boldest motion belong to the turn, not to the busiest moment.
- **Every cut needs a reason** you could say out loud: the process moves on (push in the same direction), we go inside the hero (iris on it, or a camera push), time passes (a dip), the same thing changes (the hero holds its place and the world around it changes, or a shape morphs into the next one). A cut with no reason is a plain fade.
- **Carry something across cuts.** An element that stays in the same place, a colour, a shape that morphs, or motion that continues in the same direction ties beats together; scenes that only replace each other read as slides.
- **Exits are quicker than entrances**, and scenes can leave while still moving rather than settling first.
- **Music and narration set the rhythm.** Time beats to narration phrases (`media[...]`) or the music's beat (`tempo`), not to round numbers of seconds.

## Endings

- End on the idea, not on a credit: the last statement, then the name or logo if there is one, then stop.
- A logo or wordmark: about a quarter to a third of the frame wide, centred (or very slightly off-centre), one short line under it at most, lots of empty space around it. Build it with a small, quick motion (snap in, or assemble from the shape that came before), hold it two to three seconds, end.
- Prefer ending on a cut or on a clean hold over a long fade of the whole frame; if it fades, fade the last words, then hold black for a moment before the logo, and do not fade the logo itself.
- A call to action is one short line, said and shown once.

## Design

Aim for what a motion designer would hand over, not a slide. Before rendering, look at stills of every scene and check them against this list.

- **One type scale, used everywhere.** At 1920×1080: display titles 160–220, scene headings 72–96, card titles 44–60, body 28–36, labels 20–24. Never use body text under 26 px, or labels under 20 px. Pick sizes from the scale instead of inventing new ones per layer.
- **Weights and tracking.** Headings 700–800 with negative `letterSpacing` of about −3% of the size (−2.5 at 84 px, −8 at 210 px); body 400 at 0; small uppercase labels 600 with +4 to +6 tracking. Set `lineHeight` 1.0–1.1 for big headings, 1.4–1.5 for body.
- **Two or three text colours.** A near-white for headings (`#f5f7fb`), a muted grey-blue for body and labels (`#97a0b6` on dark), and one accent (two at most). Declare them as `color` variables (`ink`, `muted`, `accent`) and reuse them. Avoid pure `#ffffff` body text on pure black.
- **A grid and margins.** Keep content inside 120 px margins at 1920 wide (100 at 1080 wide), align left edges to the same x, and use consistent gaps (multiples of 8). Left-aligned layouts read better for content scenes; save centred layouts for titles and endings. Keep the same layout pattern from scene to scene (for example a numbered label, heading and subheading in the same place).
- **Fill the frame.** Content should span the width. Small cards floating in the top third look unfinished; make cards larger, use fewer of them, or add a supporting visual on the empty side.
- **Leave a band for captions.** Keep content above about y 880 when captions sit at the bottom, and put captions in the same place in every scene.
- **On a vertical canvas, respect the platform's UI bands.** The bottom 18% and the right 11% of a 9:16 frame are where Instagram Reels, TikTok and YouTube Shorts draw their own caption, audio tag and action buttons — text there is hidden in the feed (a 4:5 or square canvas is letterboxed in the player, so the bands shrink; the `safe-zone` review check knows). Keep text out of them, and keep captions above the bottom band.
- **Depth without clutter.** Backgrounds: a dark gradient `background`, one or two large soft radial glows (a `circle` with a radial fill that fades to transparent), optionally a faint grid (`rgba(255,255,255,0.035)`) and a vignette (a full-frame `rect` with a radial fill from transparent to dark edges). Cards: `rgba(255,255,255,0.04)` fill, a 1–2 px `rgba(255,255,255,0.1)` stroke, radius 24–32, a large soft shadow. Highlight one thing with the accent, not everything.
- **Icons, not letters.** Draw simple line icons as `path` layers (stroke 4–5, round caps and joins) inside a rounded tile, rather than a letter in a circle.
- **Kinetic type.** Animate headlines word by word (`split`) rather than as one block, with the `rise` or `blur` preset and a 3–5 frame stagger; keep one split style through a video.
- **Motion.** Enter with a short rise (20–30 px on `y`) plus a fade, 14–26 frames, `land` (`snap` for the hero element); stagger related items by 4–8 frames. Use `easeOutBack` or `spring` sparingly, for small badges. Animate groups rather than many separate layers. Keep one transition style through a video (a 15-frame `fade` is a safe default); mixing slide, wipe and zoom looks random. Give the background slow drift (glows moving over the whole scene) so still moments don't feel frozen.
- **Banding and grain.** Dark gradients can band once encoded. The default encoder settings already spend extra bits on dark areas; for a filmic look add `"grain": 0.03` at the top level (moving film grain, the same in every render), and render it with `--crf 16` or a `--bitrate` of 15M or more, since grain makes files much larger and low quality settings smear it into blocks.

## Common mistakes

- Keyframes written in video frames for a layer with a non-zero `startFrame`.
- Text running off the canvas or out of its box: set `maxWidth` (and for template text `maxLines` + `minFontSize`), then check a still with the longest value you expect.
- Rotating or scaling a shape expecting it to pivot on its centre without setting `originX`/`originY` to `"center"`.
- Butting scenes end to end and expecting a transition between them: they have to overlap by the transition length.
- Forgetting `width`/`height` on a `rect`, which then draws nothing.
- Text smaller than 26 px, or more than three text colours on screen.
