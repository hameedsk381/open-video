---
name: ove-make-reel
description: Make a short social video (reel, story, promo, product or explainer clip) with Open Video Engine from ready-made blocks and themes, then check, preview and render it. Use when the user wants a vertical or square social video quickly and a custom layout is not needed.
---

# Make a short social video from blocks

For fields and rules beyond this page, read the main `ove` skill. Everything here is plain JSON in `composition.json`.

## Steps

1. Pick the shape: `9:16` reel or story, `1:1` square post, `16:9` landscape, `4:5` feed. Read the user's wording for length; short videos run 15 to 30 seconds.
2. Start from a whole template when one fits, or from blocks:
   - `ove init <dir> --template story-tall` (also `launch-wide`, `explainer-square`, `keynote-wide`, `product-wide`, `showcase-tall`, `social-reel`, `sale-promo`, `quote-card`, `event-invite`, `product-card`, `case-study`, `slideshow`).
   - Or build it: `ove add title-hero <dir>/composition.json --aspect 9:16 --theme neon --set headline="..."`, then `ove add big-stat ...`, `ove add cta-end ...`. `ove blocks` lists every block and its parameters.
3. Write the real words. Replace sample text with the user's own names, numbers and details with `--set name=value` (or edit the `with` of the placement). Keep headlines to about five words. Do not invent prices, dates or claims the user did not give.
4. Choose a theme to match the mood: `ove theme midnight|paper|neon|espresso <composition.json>`.
5. Pictures: `phone-mockup`, `image-caption` and `split-screen` take `--set image=<asset id or relative path>`. Use only files the user has.
6. Overlays go inside a scene: `ove add lower-third <file> --scene <scene id> --at 20 --set name="..."`; also `badge`, `handle`, `progress-bar`.
7. Check: `ove validate`, then `ove review <file> --output review.png` and look at the sheet. Fix every error and warning, or say why one stays.
8. Look at frames: `ove still <file> --frame <n> --output still.png` at the end of each scene's entrance.
9. Cover image: `ove thumbnail <file> --title "..." --output thumbnail.png`.
10. Render a draft with `ove render <file> --output draft.mp4 --scale 0.5 --no-motion-blur`, then the final with `ove render <file> --output out.mp4`.

## Rules that matter

- One idea per scene. The blocks already move (camera push, drifting shapes, soft sound effects); do not stack extra motion on top.
- Use one theme and one transition style per video.
- Text over a picture needs contrast; `image-caption` already adds a shade.
- Silent videos feel unfinished: add narration (see `ove-voiceover-captions`) or a soundtrack with `export.audio`.
