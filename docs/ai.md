# AI-assisted authoring (`ove ai`)

OVE itself contains no model and makes no network requests during a render. The AI commands are an authoring layer
around the engine: they turn a brief into the same `composition.json`, asset files and narration the rest of the
toolchain already understands, then hand them to `validate`, `review`, `still` and `render`. The render stays
frame-deterministic, so an AI-written video can be re-rendered, diffed and reproduced like any other.

```
brief ──► model ──► composition.json ──► schema validation ──► (repair errors) ──► review ──► render
                    narration.mp3     ──► transcription ──► captions.json
                    picture.png       ──► asset registration
```

## Setup

Pick a provider and set its key. Nothing is stored on disk by OVE. Every network provider is the same integration —
the Vercel AI SDK (`generateText`, `generateImage`, `transcribe`) with a per-vendor driver — so retries, timeouts and
message shaping behave identically everywhere; only defaults differ.

```sh
# The default: an OpenAI-compatible gateway with task-aware model routing
export FREELLMAPI_API_KEY=...            # or OPENAI_API_KEY / OVE_AI_API_KEY
export OVE_AI_MODEL=auto                 # auto routes each task to its preferred gateway model

# Or a first-party vendor key
export ANTHROPIC_API_KEY=sk-ant-...      # --provider anthropic (or claude)
export GROQ_API_KEY=gsk_...              # --provider groq
export NVIDIA_API_KEY=nvapi-...          # --provider nvidia (or nim)
export OPENAI_API_KEY=sk-...             # --provider openai
export GEMINI_API_KEY=...                # --provider google (or gemini)

# Shared knobs
export OVE_AI_BASE_URL=...               # any OpenAI-compatible endpoint (also --provider custom)
export OVE_AI_TRANSCRIPTION_MODEL=whisper-1   # transcription; per-provider default
export OVE_AI_IMAGE_MODEL=gpt-image-1         # image generation; `auto` on gateways
export OVE_AI_VOICE=hannah               # Edge TTS voice for narration

# No key, no network: a deterministic stand-in for trying the pipeline
ove ai compose demo --provider mock --brief "a test"
```

| Provider | chat | images | speech | word timings |
|---|---|---|---|---|
| `freellmapi` (default) | yes (`auto` routes per task) | yes | yes (Edge TTS) | yes |
| `openai` | yes | yes | yes (Edge TTS) | yes (`whisper-1`) |
| `groq` | yes (`openai/gpt-oss-120b`) | — | yes (Edge TTS) | yes (`whisper-large-v3-turbo`) |
| `anthropic` / `claude` | yes | — | yes (Edge TTS) | — |
| `nvidia` / `nim` | yes | — | yes (Edge TTS) | — |
| `google` / `gemini` | yes | — | yes (Edge TTS) | — |
| `openrouter`, `litellm`, `custom` | yes | yes | yes (Edge TTS) | gateway-dependent |
| `mock` | yes | yes | — | — |

Speech synthesis is Edge TTS for every provider (free, word-boundary timed; `OVE_AI_TTS_PROVIDER=groq` opts out).
Other environment variables: `OVE_AI_PROVIDER`, `OVE_AI_API_KEY`, `OVE_AI_BASE_URL`, `OVE_AI_MODEL`,
`OVE_AI_TRANSCRIPTION_MODEL`, `OVE_AI_IMAGE_MODEL`, `OVE_AI_VOICE`, plus the per-vendor keys above and
`FREELLMAPI_BASE_URL`, `FREELLMAPI_MODEL`, `GROQ_BASE_URL`, `NVIDIA_BASE_URL`, `LITELLM_BASE_URL`, `OPENROUTER_API_KEY`.
`ove ai doctor` prints what is configured and what it can do.

## Templates first, full composition when needed

`ove ai compose` first asks the model to pick one of the ready-made templates whose shape matches the video (the same aspect ratio) and to return only the values for its variables: a few hundred tokens instead of a whole composition. The layout, motion and timing come from the template, so the result is faster, cheaper and more consistent. It falls back to writing a full composition when no template has the right shape, the model says none suits the brief, template mode fails, or you supplied `--asset` or `--fields`. A `--duration` that differs from the template's own no longer leaves the template route: the resolved composition is retimed to the requested length (every scene's duration, layer timing, animation keyframes, split entrances, camera moves, transitions and audio fades scale by the same factor, and scene starts are recomputed the way the loader lays them out). Because the timing is then bespoke, the project is saved as a plain composition rather than an editable template. In Studio, tick *Write every layer from scratch* for the old behaviour.

With `--narration`, a template video is cut to the voiceover: the model writes one spoken line per scene from what that scene shows, each line is spoken, and every scene is as long as its line, so what is said and what is on screen change together. Word-timed captions come from transcribing the result, and the export gets a -16 LUFS loudness target. Other videos get one script over the whole video. Pictures you pass with `--asset` (images only) are offered to templates with picture slots: the phone screen, the hero image, the story panel.

Templates built from blocks (`launch-wide`, `story-tall`, `explainer-square`, `keynote-wide`) take a **theme** too: the model chooses one of `midnight`, `paper`, `neon`, `espresso` to suit the brief, and the colours follow. See the Blocks and themes section of the README.

When a full composition has problems, the model is asked for a patch instead of the whole composition again: `{"fixes": [{"path": "scenes[1].layers[0]", "value": {…}}, {"layer": "title", "set": {…}}, {"path": "scenes[0].layers[3]", "remove": true}]}`. A complete composition is still accepted as the reply.

## The planner decides the route first

Before either path runs, `compose` asks the model for a **plan**: which of the three production routes suits the brief — fill a template, write a JSON composition, or React code — and what the video's beats are. Templates are the primary path: the planner is told to prefer one whenever its kind and aspect fit the brief, even when the length differs (`--duration` retimes the filled template), so the composed and React routes are secondary, for briefs no template fits. The plan's answer is checked against the **capability registry**, so the model can only point at templates, themes, components, effects, sounds and **motion moves** that actually exist and fit the canvas; anything invented comes back with the exact problem and is corrected. The moves are the named vocabulary of motion (`ken-burns`, `word-cascade`, `rise-in`, `pop-in`, `blur-in`, `slide-in`, `pulse`, `wipe-reveal`, `parallax`, `camera-shake`, …): the planner names them in a beat's `motion` field, and the composition prompt carries a one-line recipe for each, so a named move always meets the knowledge of how to build it. With a valid plan:

- route **template** → that template id and theme are filled (the primary path; the old template mode, now aimed by the planner);
- route **json** → a full composition is written with the plan's beats as its required motion plan, so planning is never wasted;
- route **react** is produced by `ove agent` (below); `compose` never picks it.

If the planner cannot be trusted — no valid reply within two attempts, or a non-plan-shaped answer — compose falls back to the routing that always worked (template first, then a full composition). Pass `--no-plan` to skip planning entirely.

### Scene-by-scene composing (`OVE_COMPOSE_STRATEGY=scenes`)

On gateways where one big generation call stalls for tens of seconds or drops global constraints ("exactly 2 scenes" comes back as one), the JSON route can be composed as a series of **small calls** instead: one short call agrees the visual system with the plan's beats (palette, fonts, a motion move per beat — the *style contract*), then one small call designs **each scene** against that contract and a summary of where the previous scene ends, and the timing is decided entirely by code — the beats' shares of the requested duration, an exact total, transitions, ids and a house camera push are stitched in deterministically. Each call lands in the provider's fast path, fails on its own (a bad scene costs its retry, not the video), and when the renderer's review finds errors only the scenes that own the failing frames are re-designed with the exact findings. Any failure in the small-call chain falls back to the proven single-call path, so `--provider mock` and offline runs are untouched. Opt in per call with `OVE_COMPOSE_STRATEGY=scenes` (or `strategy: 'scenes'` in the SDK).

```sh
ove ai capabilities            # list every registered capability the AI may use
ove ai capabilities --json     # machine-readable, with ids, descriptions, params and paths
```

The registry (registry v2, about 140 capabilities in a starter install) is built from the templates, themes and blocks on disk plus the built-in effects, transitions, sound effects, the React component kit and the named motion moves. `@ove/ai` exposes `buildRegistry` / `planBuild` for SDK callers, and the cloud jobs `composeSmart` inherits the same routing.

## `ove agent`: the planner routes into React code

`ove agent "<brief>"` runs the same planner restricted to the two routes it can act on. A brief that suits a plain composition is produced the way `ove ai compose` does (schema-checked JSON, deterministic render); only a brief that needs bespoke motion graphics goes to the React agent loop (`@ove/react`, esbuild bundle, `type: "react"` layer). `--no-plan` keeps the previous behaviour of always running the React loop.

```sh
ove agent "A viral launch reel for an open-source vector database"
ove agent "Modern SaaS demo" --landscape --duration 9
```

### Brand from a URL (`--url`)

`ove agent "<brief>" --url https://acme.io` reads the brand straight off the website before planning. The scraper goes deeper than the homepage markup: it mines the site's own stylesheets for custom properties, colours and `@font-face` rules (tokens the design system is literally written in, ranked by how often they are used), crawls the two highest-signal brand pages (pricing, product, about) to confirm the palette, and classifies the roles from the evidence itself — the dominant dark colour becomes the background, near-white the text, and the most-used saturated mid-tones the primary and accent. Colours seen as CSS variables outrank stray hex in markup, and every extra request is best-effort: a failed stylesheet or page shrinks the evidence, never the result. With a provider the distilled evidence is refined into a `BrandPack`; without one (or on any AI failure) the classified roles and fonts become the pack directly, so `--url` works offline with `--provider mock` too.

```sh
ove agent "Launch reel for this product" --url https://linear.app
ove agent "Introduce the company" --url acme.io --provider mock
```

## History: every AI change is kept

Each `compose`, `refine`, `narrate`, `transcribe` and `image` (when it changes a composition) keeps the result as a numbered revision in `history/composition/` beside the file (`0001.json`, `index.json`), with what produced it (brief or instruction, provider, model, template, attempts) and a short note of what changed. The first AI change keeps the file as it was as revision 1, so a hand-made video is never lost.

```sh
ove ai history video/composition.json        # list the revisions
ove ai restore video/composition.json 2      # bring revision 2 back (recorded as a new revision)
```

The Studio shows the same list in the editor's History tab with a Restore button. Revisions are plain JSON, so they diff and commit like any other file.

## Local studio (`ove ai studio`)

The same commands are available as a local web page, for when a form and a preview are easier than remembering flags:

```sh
ove ai studio                            # opens http://127.0.0.1:3100/ using GROQ_API_KEY
ove ai studio --provider mock --out demo  # offline, writes into ./demo
```

The studio is a React + Vite app (`apps/studio`; `pnpm build:studio` builds it, and without a build a plain fallback page is served). It is built around projects, each a folder under `--out`:

- **Projects**: every video as a card with a thumbnail, size, length and last edit; open, duplicate, rename, delete (a deleted project moves to `.trash` inside `--out`).
- **New video**: pick a kind, describe it, drop in pictures or footage (saved to the project's `assets` folder and offered to the template and the model), optionally add a voiceover with captions.
- **Editor**: a live preview (the browser Player, so it matches renders closely) with play, scrub and scene jumps. *Edit* changes the text: a video made from a template keeps its variables and components, so each text and colour is a field; a finished video lists every text layer. *Ask AI* applies a natural-language change (an AI change turns a template video into a finished one). *Look* applies a theme or adds a block from the library. *History* restores any saved version. *Export* renders the MP4, runs the problem check, or makes a thumbnail.
- **Library** (blocks and themes) and **Settings** (output folder, provider status).

A job bar shows live progress over server-sent events. Every job calls the same `@ove/ai` and `@ove/core` functions as the CLI, so nothing about the output or its determinism changes. The preview does not run code layers (`allowCode` is off in the Studio).

- `--port 3100` is the first port tried; if it is busy the next free one is used and printed.
- `--out ai-videos` (default) is the only folder the page can read or write. Folder and output fields are relative to
  it, and paths that resolve outside it are refused. Generated projects work with `ove dev`, `ove review` and
  `ove render` unchanged. The two inputs that are files you already have, the audio for Captions and the rows file
  for Batch, can be anywhere on disk, but only audio or video files (`.wav .mp3 .ogg .m4a .aac .flac .webm .mp4 .mov
  .mkv`) and `.json` are accepted, and the audio is sent to the provider.
- Compositions can only refer to files they were given. Compose accepts the assets you supplied; Refine keeps what the
  composition already uses plus anything newly supplied; paste-import accepts only built-in sounds and relative paths
  that stay inside the project folder. Absolute paths, drive letters, URLs and `..` are refused and sent back to the
  model (or shown to you) with the layer that used them.
- Paste-import never replaces a project that is already there: with no folder given it uses the next free name
  (`coffee-2`), and a folder you named that already has a composition is an error.
- Provider options (`--provider`, `--model`, `--base-url`) and the provider's environment variables are read once at
  start. Keys never reach the page; `/api/status` reports only the provider id, model, endpoint and capabilities.
- Tabs that need a capability are disabled with an explanation: narration needs speech, images need
  an image adapter (only `mock`; Groq has none).
- One job runs at a time and the rest queue, so a compose and a render never compete for the same CPU or files.
- The server binds to `127.0.0.1`. Requests must name it as their `Host`, and every change must carry its `Origin` and
  an `application/json` body, so another web page cannot drive it. It is a local tool, not a shared service: there is
  no login and no HTTPS, so do not expose the port.

## Prompt to video

```sh
ove ai compose reels/spring --brief "Spring sale for a coffee brand: 20% off, warm and calm, ends on the logo" \
  --kind reel --duration 20

ove still reels/spring/composition.json --frame 45 --output still.png
ove review reels/spring/composition.json --output review.png
ove render reels/spring/composition.json --output reels/spring/out.mp4 --loudness -14
```

- `--kind` sets a canvas and a starting length: `reel` (1080×1920, 20 s), `product` (1080×1080, 18 s),
  `promo` (1920×1080, 30 s), `project` (1920×1080, 60 s). Override with `--aspect 9:16|1:1|16:9|4:5|WxH`,
  `--duration <seconds>` and `--fps`.
- `--asset id=path` makes a supplied picture or clip available to the model (repeatable); `path` is relative to the
  working directory and is rewritten relative to the composition. The model may only use assets it was given.
  Without assets it is told to draw with text, shapes and paths only.
- `--fields name[:type],...` declares extra template variables (`string`, `number`, `boolean`, `color`) for the
  model to declare and use.
- `--narration` writes a voiceover from the same brief, synthesises it, adds word-timed captions, and appends a
  full-length narration scene so both play over the whole video (see below).
- `--review` adds renderer-based design rounds: `ove review` errors are fed back to the model before the file is
  accepted. Slower, and needs Chromium and FFmpeg.
- `--max-attempts 3` (default) bounds the validation loop.
- `--schema` appends the exact JSON Schema to the prompt. More tokens, fewer format mistakes on small models.
- `--dry-run` prints the composition without writing; `--render` renders to `<dir>/out.mp4`; `--json` prints a
  machine-readable summary; `--no-plan` skips the planner (template-first routing, then a straight composition).

What the loop does:

1. The model gets a compact specification of the format plus your brief and design rules.
2. Its JSON is parsed (fences and prose are tolerated) and validated with the real `loadComposition`.
3. Validation errors, and checks the schema cannot express (empty text, unknown asset ids, off-frame scenes,
   unused template variables), go back verbatim as the next user turn.
4. With `--review`, the composition is rendered into a contact sheet and design checks; errors go back too.
5. The accepted composition is written as a normal project: `composition.json`, `composition.schema.json`,
   `assets/`.

The model never writes rendering code and cannot bypass the schema. Anything it produces is checked exactly like a
hand-written composition.

## Narration and captions

```sh
# Write, speak and caption a script, adding both to an existing video
ove ai narrate --brief "Explain why deterministic video rendering matters" --duration 25 \
  --composition video/composition.json

# Use a script you already wrote; voices include hannah (default), austin and troy
ove ai narrate script.txt --composition video/composition.json --voice hannah --language en
```

The command:

1. Generates a script from `--brief` (or reads your file) and strips headings, stage directions and quotation marks.
2. Synthesises one audio file into `assets/` as a WAV file.
3. Transcribes it to get word start/end times; writes `assets/narration.captions.json` (`{ "words": [...] }`, or
   `{ "cues": [...] }` if only segment timings are available).
4. Adds `narration` (audio) and `narration-captions` (captions) assets and appends a scene with `startFrame: 0`
   and the video's full duration, holding the audio and a centred captions layer in the lower twelfth.
5. Grows `durationFrames` if the voiceover is longer than the picture, plus `--tail 0.8` seconds.

The narration scene is last, so captions draw over every other scene. Existing audio still plays and is mixed with
the voice. Use `--no-captions` to add only the voice. Without `--composition`, the files are produced and printed
so you can add them yourself.

### Captions for audio you already have

```sh
# A recorded voiceover, or the sound of an existing clip
ove ai transcribe assets/voice.wav --composition video/composition.json
ove ai transcribe assets/voice.wav --composition video/composition.json --start 2.5 --language en
```

`ove ai transcribe` does not generate or change any audio: it transcribes the file, writes
`<name>.captions.json` next to it (or in `--out`) and, with `--composition`, appends a `captions` scene that draws
the words over the whole video. The scene holds only the captions layer, because the audio already belongs to the
video. `--start` is the second at which that audio begins in the video, so the caption layer's `startFrame` matches
it. Like narration, the scene is appended last so it draws over everything, and `durationFrames` grows if needed.

### Editing a raw clip into a finished reel

```sh
ove ai edit ./raw/take.mp4 --out reel
ove ai edit ./raw/take.mp4 --out reel --max-silence 0.3 --keep-fillers --no-captions
```

`ove ai edit` is the talking-head path: the clip's audio is extracted and transcribed with word timings, pauses
longer than `--max-silence` seconds (default 0.5), filler words (um, uh, erm…) and immediate repeats become a cut
list, and the edited reel is written as an ordinary project — one `video` layer per kept stretch (`trimStart`
skips the removed source, the clip's own sound plays, hard jump cuts between stretches) plus a word-timed captions
layer above the platform UI band. `--width`/`--height` set the canvas (default 1080×1920, the clip centre-cropped
with `objectFit: cover`). The output is plain composition JSON: review it, delete or retune a `clip-N` scene by
hand, then render. Transcription needs a provider with `transcribe` (`--provider groq` or an adapter); everything
else is local, and the planning itself is pure (`planCuts`/`editComposition` in `@ove/ai` are unit-tested without
a provider).

### Splitting a long recording into shorts

```sh
ove ai shorts ./raw/podcast.mp4 --out shorts --count 5 --min 15 --max 60
```

`ove ai shorts` transcribes the recording **once**, splits it into sentence runs (punctuation or a pause over
`--max-silence` seconds ends one), and scores every window of whole sentences with a transparent rubric — a clean
ending (2), a hook in the first sentence (2), speech density (0–1) and a length near the 25–45 s sweet spot
(0–1). The best `--count` non-overlapping windows are written as `shorts/short-01/`, `short-02/`, … each a full
project with the same edited-reel shape as `ove ai edit` (silences and fillers tightened, word-timed captions,
1080×1920 centre-cropped); `--no-cut` keeps each short one continuous stretch. The summary prints each short's
time range, score and opening line. The planner is pure (`planShorts`/`shortsCandidatePlan` in `@ove/ai`), so the
rubric is unit-testable without a provider.

## Images

```sh
ove ai image "a soft teal gradient with subtle grain, no text" --out assets/bg.png --size portrait
ove ai image "minimal line icon of a coffee cup" --out assets/icon.png \
  --composition video/composition.json --id icon
```

`--size` accepts `square`, `portrait`, `landscape`, `9:16`, `4:5`, `16:9` or an explicit `WxH`. With
`--composition`, the picture is registered as an `image` asset using a path relative to the composition, and the
file is re-validated. The model can then use `"src": "icon"`.

## Prompt to batch (product videos)

```sh
ove ai batch products.json --brief "A clean product card: name, price, one accent colour" \
  --output "out/{{id}}.mp4" --duration 12
```

`products.json`:

```json
[
  { "id": "mug", "title": "Everyday Mug", "price": 12, "accent": "#22d3ee" },
  { "id": "cap", "title": "Field Cap", "price": 24, "accent": "#f97316" }
]
```

The first row's keys become typed template variables (`string`, `number`, `boolean`, or `color` for hex values).
The model must declare each one with a default and use `{{name}}` in the content; that requirement is checked, so a
model cannot return a fixed video that ignores the rows. The template is written to `--out-dir` (default
`<rows folder>/ai-template`), then every row is resolved and checked before rendering:

- missing or wrongly typed values fail with the row number;
- two rows writing the same file fail before the first render;
- `--limit n` renders the first n rows (useful while iterating);
- `--template composition.json` skips generation and uses an existing template.

Render settings (`--crf`, `--bitrate`, `--scale`, `--loudness`, `--preset`, `--concurrency`, `--format`, …) are
passed to every video.

## Quality and cost

- Use a stronger model for composition and a cheaper one for scripts; `--model` overrides per run.
- Groq provides chat, speech and word-timed transcription under a single key (`GROQ_API_KEY`).
- Start with `--dry-run` and `--provider mock` to check plumbing, then spend tokens on a real model.
- Measure instead of guessing: `pnpm eval:ai` runs a fixed set of briefs through the real router and scores composed, duration, resolution, copy readable and picture moves, with the engine's review findings listed per brief. Run it offline against the mock provider or with `--provider groq`; see the header of `scripts/eval-briefs.ts`.
- `--schema` helps small or local models; large models usually need only the cheatsheet.
- Retry cost is concentrated in validation errors. Fixing the prompt is cheaper than raising `--max-attempts`.
- `--review` costs a render per round; use it for finished work, not drafts.
- Generated text, like any copy, should be read before publishing. Facts in a brief are not verified by OVE.

## Security and determinism

- AI-written and pasted compositions can never contain `code` layers (JavaScript that runs while rendering); the asset check sends them back to the model or rejects the paste.

- API keys are read from the environment; nothing is written to the composition or cache.
- The model's output is data. It is validated by the schema, and HTML layers still forbid scripts and web URLs.
  There is no `eval`, no arbitrary code execution, and no request to a web URL from a composition.
- Rendering makes no model calls and is byte-identical for the same JSON on the same machine.
- Distributed rendering does not send the brief anywhere: AI runs before rendering, on the coordinator.
- The 86 KB JSON Schema is available with `ove schema`; the AI layer uses the same schema the renderer uses.

## Limits

- `groq` covers chat, speech and word timings but has no image generation (Groq lists no image model); `mock` supports offline chat and images only. `ove ai doctor` says what is available before a run.
- Captions need word or segment timings. A provider without transcription produces audio and no captions.
- The generated composition uses ordinary layers, not HTML/Lottie/shaders, unless the brief explicitly asks for
  them. `ove review` cannot read text inside an HTML layer, so ordinary text layers are preferred.
- AI is an authoring step, not a runtime feature: the Player and `renderMedia` never call a model.
- Long-form footage editing remains outside what OVE does, AI-written or not.
