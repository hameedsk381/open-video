---
name: ove-effects
description: Put motion-graphics effects (glass cards, kinetic titles, icon orbit, dashboards, checklists, timelines, grades, transitions, end cards) on top of footage with the fx-* blocks of Open Video Engine. Use when the user has a video, usually a talking head, and wants it dressed with designed effects.
---

# Effects over footage

Effects are blocks named `fx-*`. `ove blocks` lists them under "Effects". They are sized from the canvas, read the theme (`ove theme signal` uses a navy and #2457FF palette), and carry their own motion and sound.

## Steps

1. Put the footage in: `ove add footage video/composition.json --aspect 9:16 --theme signal --set src=clip.mp4 --frames 300`.
2. Overlay effects (they sit inside a scene, on top): `ove add fx-glass-cards video/composition.json --scene footage --at 60 --frames 90`. Change text with `--set name=value`; `ove blocks --json` shows every parameter.
3. Scene effects replace the picture for a while and bring their own copy of the footage: `ove add fx-stats-split video/composition.json --set footage=clip.mp4 --at 300 --frames 90`. Use `--at` for the start frame, and `--frames` to shorten or lengthen them.
4. Check: `ove validate`, then `ove review video/composition.json --output review.png`, and look at stills at the middle of each effect. Fix text that overlaps the speaker's face (effects keep to the top, the lower third or the edges, but check).
5. Render a draft with `--scale 0.5 --no-motion-blur`, then the final.

## Which block makes which effect

| Effect | Block | Notes |
|---|---|---|
| 01 Glass cards | `fx-glass-cards` | overlay; frosted look is translucent fill and border, not a real backdrop blur |
| 02 Duo title | `fx-duo-title` | overlay; in front of the subject, not behind |
| 03 Icon orbit | `fx-icon-orbit` | overlay; 2D ellipse with size for depth |
| 04 Stats split | `fx-stats-split` | scene; mark statistics DEMO DATA |
| 05 Spotlight | `fx-spotlight` | scene; title in front of the subject |
| 06 Checklist | `fx-checklist` | overlay |
| 07 Timeline | `fx-timeline` | overlay |
| 08 Command bridge | `fx-command-bridge` | overlay |
| 09 Word-synced captions | `fx-captions` | overlay; needs word timings from `ove ai transcribe` |
| 10 Highlighter | `fx-highlighter` | overlay |
| 11 Strike and rewrite | `fx-strike-rewrite` | overlay |
| 12 Glitch title | `fx-glitch-title` | overlay |
| 13 Extruded title | `fx-extruded-title` | overlay; in front, not behind |
| 14 Typewriter quote | `fx-typewriter-quote` | overlay; no blinking cursor |
| 16 Day to night | `fx-day-to-night` | scene |
| 18 Light leak | `fx-light-leak` | overlay at a scene boundary |
| 19 Duotone | `fx-duotone` | scene; no film grain |
| 20 Clone wall | `fx-clone-wall` | scene; copies the whole frame, not a cut-out |
| 21 Pull-out | `fx-pull-out` | scene |
| 22 Punch-in | `fx-punch-in` | scene; edit the camera keyframes to the word you want |
| 26 Notifications | `fx-notifications` | overlay |
| 27 Chat bubbles | `fx-chat` | overlay |
| 28 Before/after | `fx-before-after` | scene |
| 29 Counter hero | `fx-counter-hero` | overlay |
| 30 Map journey | `fx-map-journey` | scene; stylised map, you give the places and their positions |
| 31 Step tracker | `fx-step-tracker` | overlay |
| 32, 33 Blur dissolve, iris wipe | scene transitions `blur`, `iris` | set `transitionIn` on a scene |
| 34 Split reveal | `fx-split-reveal` | overlay |
| 35 Gallery | `fx-gallery` | scene |
| 36 CTA end card | `fx-cta-card` | scene; footage in a rounded window, not a cut-out |
| 37 Paper collage | `fx-paper-collage` | scene; editorial halftone cutout with cardstock backing and tape |
| 38 B-roll loop | `fx-broll-loop` | scene; seamless floating hero card and pulsing ambient aura |
| 39 Papercut explainer | `fx-papercut-explainer` | scene; 3D construction papercraft diorama with stacked depth shadows |
| 40 Logo reveal | `fx-logo-reveal` | scene; orbital halo, SVG stroke, and brand bumper reveal |
| 41 One-take flow | `fx-onetake-flow` | scene; continuous spatial push without slide cuts |

## Effects that need a matte

15 neon outline (`fx-neon-outline`), 17 colour pop (`fx-color-pop`), 23 background swap (`fx-background-swap`), 24 sticker freeze (`fx-sticker-freeze`) and 25 tracked label (`fx-tracked-label`) need a matte of the speaker: a video or picture, white where the speaker is. OVE does not make it; the user makes it with a matting tool such as rembg or Robust Video Matting, or an editor, and you give it with `--set matte=speaker-matte.mp4` (and `--set footage=clip.mp4`). Without a matte these effects show the footage plain. For the tracked label run `ove track speaker-matte.mp4 --output track.json` and then `ove add fx-tracked-label video/composition.json --scene footage --track track.json`. Do not claim a result without a matte.

Anything the handbook puts "behind the subject" (duo title, spotlight title, extruded title) is placed in front by default; with a matte, put the title in a layer under a `matte`d copy of the footage to put it behind.

## Colour and extras

`fx-grade-look` (--set look=cinematic|warm|cool|teal-orange|noir|vivid|faded), `fx-letterbox`, `fx-shake-hit`, `fx-progress-ring`, `fx-ticker`, `fx-lens-flare`, `fx-rgb-flash`. For your own grade use a layer or scene `grade` property. Fonts: Inter is built in; other fonts (Poppins, Anton) need font assets.

## A whole video

`npx tsx examples/effects-demo/build.mjs clip.mp4` builds the handbook's 30-second master timeline (900 frames, 1080x1920) from these blocks and validates it.
