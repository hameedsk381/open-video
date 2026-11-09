---
name: ove-explainer
description: Make a finished vertical explainer video (how-it-works, system design, "explain it simply", money basics, science) by writing an explainer.json: scenes and spoken lines in, a timed, voiced, reviewed video out. Use when someone wants a video that teaches one idea, and you do not want to hand-place layers. No AI key needed: you write the script.
---

# Explainer videos

An explainer is a short video that teaches **one idea**, one scene at a time, drawn as small animated diagrams on a board, with a spoken line over each scene. You write the **script** (scenes and words). The engine draws the pictures, times each scene to its spoken line, adds the header and sound effects, and checks the result. There are no coordinates, colours or frame numbers in the script.

## The workflow
1. **Plan in one sentence**: what is the one idea, and who is it for? Five to eight scenes is the sweet spot (the limit is 24).
2. **Learn the vocabulary**: `mr explainer kinds` prints every scene kind with what it shows, when to use it and a valid example (`--json` for tools; MCP: `motionrender_explainer_kinds`). `mr schema --explainer` prints every field and limit (MCP: `motionrender_schema` with kind `explainer`). `mr explainer example --output explainer.json` writes a complete working script to start from.
3. **Get real facts** for any number, date or claim, from sources that need no key: `mr facts country India,Brazil internet_users` (the latest World Bank figure; `mr facts indicators` lists what is offered), `mr facts wikipedia "Load balancing"` (what a thing is), `mr facts exchange USD INR`. Add `--json` for data; MCP: `motionrender_facts`. Or write with an AI provider using `mr explainer write "<topic>" --research`. Never type a figure from memory. Every fact has a source and a date: put the source in the scene's `note` (stat) or `caption` (chart), and copy the facts into the script's `sources`. If a lookup fails (the World Bank is sometimes slow or down), say so and leave the number out.
4. **Write `explainer.json`.** Then `mr explainer validate explainer.json` (add `--json` for data). It lists every problem at once with its path (such as `scenes.2.events`): fix them all.
5. **Build**: `mr explainer compile explainer.json --no-voice` for a quick silent build, or without `--no-voice` to record the voice. It writes `composition.json` next to the script.
6. **Look**: `mr still composition.json --frame 90 --output still.png`, then more frames from different scenes, and open them. Then `mr review composition.json --output review.png`: fix errors, read warnings.
7. **Render**: `mr render composition.json --output out.mp4`.

## Writing the script
- Start with a `title` scene and end with a `closing`. In between, pick the kind that shows the idea best, and use each kind at most twice. `stat`, `chart` and `timeline` are for true numbers and events only.
- **Write `say` as speech**: short sentences, one idea, no headings, no lists. A scene lasts as long as its line (plus a pause), so a 20-word line is about 7 seconds. A scene without `say` is silent and as short as its picture needs.
- **Say what is on screen, and add what is not.** The caption repeats the point in a few words; the spoken line carries the explanation.
- Labels are short and upper case reads best (`"STEP 1 · TRAFFIC → SERVER"`). Limits are in the schema: for example a title has at most three lines, a `compare` card at most four points, a `chart` two to eight items.
- One idea per scene. If a scene needs two sentences of "and also", split it.
- `topic` is the header on every scene (`"URL SHORTENER"`); `series` is the small label before it (`"SYSTEM DESIGN"`); `handle` is the creator.

## Look and shape
- **Choose the look for the subject: it is a whole design, not a palette.** `mr explainer looks` lists them: `navy` (finance and tech, the safe default), `ink`, `paper`, `forest`, `sunset`, `ocean`, `terminal` (developers, monospace), `blueprint` (how things are built), `candy` (friendly, rounded), `sage` (serif, slow topics), `newsprint` (news and history, serif headlines), `neon` (games, the future), `slate` (neutral software). Each carries its own type pairing, motion, transition, texture, corners and weight. **Do not use the same look for every video, and do not leave it at the default unless the subject is finance or technology.**
- `design` changes parts of the look: `{ "fontDisplay": "Playfair Display", "fontBody": "Source Sans 3", "motion": "rise|drop|blur|fade", "transition": "fade|zoom|wipe|push", "texture": "none|grid|dots|scanlines|paper", "corners": "sharp|soft|round", "weight": "medium|bold|black", "layout": "card|editorial" }`. `editorial` draws the title, stat, steps and closing scenes flush left with no boxes, hairline rules and large numerals (newsprint, sage, terminal and slate use it); `card` is centred in boxed cards. A serious subject wants sharp corners and calm motion, a playful one round corners; `colors` replaces any of `bg`, `surface`, `text`, `muted`, `accent`, `accent2` with a 6-digit hex (keep the contrast high).
- `aspect`: `9:16` (default; reels, shorts), `4:5`, `1:1`, `16:9`. Other shapes show the 9:16 column scaled to fit, centred on the board: good for a feed post, plain for landscape.
- `sketch: true` draws every shape by hand, redrawn every few frames like a cartoon.
- The header sits below the top strip that Reels and Shorts cover, and nothing is drawn in the bottom band. Keep it that way: do not add text there.

## Pictures
- A `media` scene shows a picture or clip in a rounded frame with a title and caption. `src` is a file in the project (`assets/city.jpg`), copied there first. Or give a `prompt` (a plain description of one clear picture: subject, setting, style, no words or logos) and it is drawn once with an image model when you compile (`--provider` choices are those of `mr ai`; Groq has no image model) and kept in `assets/`. Use at most one or two.
- Credit the source in `credit` for stock photos and clips. Drawn pictures are credited "AI-generated picture" unless you set `credit`.

## Voice
- The free Edge voices: no key, but internet is needed. Set `"voice": "en-IN-NeerjaNeural"` in the script, or `--voice`. Others that work: `en-US-AriaNeural`, `hi-IN-SwaraNeural`, `te-IN-ShrutiNeural`. `--no-voice` builds silently.
- `"voiceRate": 12` (percent, -40 to +60) speeds the voice up; +10 to +15 suits a promo, and a slower reading suits a calm explainer. Lines are recorded once and reused until the words, the voice or the rate change.
- Speak the line as you want it heard: spell out what the voice would stumble on ("F O S S A P dot in", "A I"). Write Telugu or Hindi lines in their own script with a matching voice.
- Edge is an unofficial Microsoft service: it can drop a connection (the build retries twice) or change without notice. Its terms for commercial use are not checked here.

## Mistakes to avoid
- Inventing numbers. Look them up, name the source.
- Ten scenes of text. Mix kinds: a stat, a chart, a flow, a compare.
- Judging only by the JSON. Always look at stills of several scenes.
- Long spoken lines. If a line runs over 40 words, cut it.
- Editing `composition.json` by hand and then recompiling: the compile overwrites it. Change `explainer.json` instead (or take over `composition.json` for good and stop compiling).

## Beyond the script
The compiled `composition.json` is an ordinary composition: you can add layers, a music track or captions to it with the main `ove` skill, and render it like any other video.
