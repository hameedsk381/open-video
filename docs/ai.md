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

Pick a provider and set its key. Nothing is stored on disk by OVE, and no key ships in the package. Every network
provider is the same integration — the Vercel AI SDK (`generateText`, `generateImage`, `transcribe`) with a per-vendor
driver — so retries, timeouts and message shaping behave identically everywhere; only defaults differ. With no key and
no `--provider`, the commands run on the offline mock and make no network request at all, rather than sending your
brief somewhere unauthenticated.

```sh
# The default provider is Groq. Its key is yours to supply.
export GROQ_API_KEY=gsk_...              # the default; also --provider groq

# Or the FreeLLMAPI gateway: OpenAI-compatible, with task-aware model routing. It is used when only its key is set.
export FREELLMAPI_API_KEY=...            # or OPENAI_API_KEY / OVE_AI_API_KEY; --provider freellmapi forces it
export FREELLMAPI_BASE_URL=...           # optional; a different gateway for the same protocol
export OVE_AI_MODEL=auto                 # on the gateway, auto routes each task to its preferred model

# Or another first-party vendor key
export ANTHROPIC_API_KEY=sk-ant-...      # --provider anthropic (or claude)
export NVIDIA_API_KEY=nvapi-...          # --provider nvidia (or nim)
export OPENAI_API_KEY=sk-...             # --provider openai
export GEMINI_API_KEY=...                # --provider google (or gemini)

# Shared knobs
export OVE_AI_BASE_URL=...               # any OpenAI-compatible endpoint (also --provider custom)
export OVE_AI_TRANSCRIPTION_MODEL=whisper-1   # transcription; per-provider default
export OVE_AI_IMAGE_MODEL=gpt-image-1         # image generation; `auto` on gateways
export OVE_AI_TTS_PROVIDER=native             # speech from the provider, not Edge (default: edge)
export OVE_AI_TTS_PROVIDER=indic              # or speech on this machine, in 11 Indic languages, with no key
export OVE_TTS_DIR=~/.cache/motionrender/tts  # where the on-device voices are kept (the default)
export OVE_AI_VOICE=hannah                    # narration voice; names are per engine, see Speech engines

# No key, no network: a deterministic stand-in for trying the pipeline
ove ai compose demo --provider mock --brief "a test"
```

| Provider | chat | images | speech | word timings |
|---|---|---|---|---|
| `groq` (default) | yes (`openai/gpt-oss-120b`) | — | yes (Edge; native TTS available) | yes (`whisper-large-v3-turbo`) |
| `freellmapi` | yes (`auto` routes per task) | yes | yes (Edge; see engines) | yes |
| `openai` | yes | yes | yes (Edge; native TTS available) | yes (`whisper-1`) |
| `anthropic` / `claude` | yes | — | yes (Edge TTS only) | — |
| `nvidia` / `nim` | yes | — | yes (Edge TTS only) | — |
| `google` / `gemini` | yes | — | yes (Edge TTS only) | — |
| `openrouter`, `litellm`, `custom` | yes | yes | yes (Edge; native if the endpoint has `/audio/speech`) | gateway-dependent |
| `mock` | yes | yes | — | — |

### Speech engines

Narration is the one part of the pipeline that is not the chat provider, and it is pluggable:

- **`edge`** (the default) synthesises through Microsoft's Edge endpoint. It needs no key and costs nothing, and it
  returns word boundaries with the audio, so captions come from the same call. It is unofficial: Microsoft can change
  the protocol, and this is the engine to fall back from when they do.
- **`native`** calls the speech endpoint of the provider you already configured — `POST {base}/audio/speech`, the
  OpenAI shape: `gpt-4o-mini-tts` on OpenAI, `canopylabs/orpheus-v1-english` on Groq, and `auto` on the gateway, which
  routes speech the way it routes chat. Narration then follows your provider instead of a third party. It bills with
  that provider, and word timings come from transcribing the result, so captions need the provider's transcription
  model.
- **`indic`** speaks Hindi, Bengali, Marathi, Gujarati, Punjabi, Tamil, Telugu, Kannada, Malayalam, Assamese and Odia
  on your own machine: three small ONNX graphs per language (about 88 MB), run by `onnxruntime-node` in this process.
  No key, no network and no Python once the model is on disk, and the sounds are at 24 kHz. The word timings are the
  durations that shaped the audio, so captions need no transcription at all. The first line in a language downloads
  its model from Hugging Face (verified against the file's sha256) into `~/.cache/motionrender/tts` (`OVE_TTS_DIR`
  moves it, `OVE_TTS_MIRROR` points the download at a mirror). `ove ai voices` lists the languages and what is
  already downloaded. Numbers are spelled out in Hindi; other languages read digits by digit, and forms the text
  pipeline does not read (dates, clock times, `$` prices) are dropped rather than spoken wrong. The models are
  [indic-tiny-tts](https://huggingface.co/collections/sulabhkatiyar/indic-tiny-tts-models) by Sulabh Katiyar, licensed
  CC-BY-4.0: any video made with them must credit the model author.

Choose it per call with `--speech-engine native` (or `indic`), or for the whole process with
`OVE_AI_TTS_PROVIDER=native` (`groq`/`openai` are accepted aliases for `native`, `local`/`offline` for `indic`, and
unset means `edge`); name the native model with `OVE_AI_SPEECH_MODEL`. Anthropic and Google have no speech endpoint,
so `native` refuses there rather than pretending. Voice names are per-engine: `--voice` / `OVE_AI_VOICE` values are
passed to the native endpoint as given, but an Edge `…Neural` id means nothing to it, so that falls back to the
endpoint's own default (or `OVE_AI_SPEECH_VOICE`). The local engine picks its language from `--language` first, then
from a voice id's locale (`hi-IN-…` means Hindi), else Hindi.

With Groq and no model chosen, a rate-limited call moves on to the next Groq chat model (each has its own daily allowance): `openai/gpt-oss-120b`, `qwen/qwen3.8-27b`, `llama-3.3-70b-versatile`, `openai/gpt-oss-20b`. `OVE_AI_GROQ_MODELS` (comma separated) replaces that list and `OVE_AI_GROQ_MODELS=off` turns it off.

`OVE_AI_FALLBACK_PROVIDER` (with optional `OVE_AI_FALLBACK_MODEL`) names a second provider that answers a chat request when the first is rate limited, for example when a daily token cap runs out. It is used only when the caller has not brought their own key or gateway.

Other environment variables: `OVE_AI_PROVIDER`, `OVE_AI_API_KEY`, `OVE_AI_BASE_URL`, `OVE_AI_MODEL`,
`OVE_AI_TRANSCRIPTION_MODEL`, `OVE_AI_IMAGE_MODEL`, `OVE_AI_SPEECH_MODEL`, `OVE_AI_SPEECH_VOICE`, `OVE_AI_TTS_PROVIDER`,
`OVE_AI_VOICE`, `OVE_TTS_DIR`, `OVE_TTS_MIRROR`, plus the per-vendor keys above and
`FREELLMAPI_BASE_URL`, `FREELLMAPI_MODEL`, `GROQ_BASE_URL`, `NVIDIA_BASE_URL`, `LITELLM_BASE_URL`, `OPENROUTER_API_KEY`.
`ove ai doctor` prints what is configured, which speech engine is wired up, and what it can do.

### A stronger model for the stages that decide the look

`OVE_AI_MODEL_<TASK>` sends one kind of call to its own model on any provider, so the few calls that decide how a video looks can run on your best model while bulk work stays on a cheap one. Tasks: `DIRECT` (the planner and the creative direction), `COMPOSE` (writing the composition or the React code), `VISION` (any call that carries images, including the art director below), `FAST`, `TEMPLATE`, `HEAL`, `BRAND`, `BATCH`.

```sh
export OVE_AI_MODEL=openai/gpt-oss-120b        # the everyday model
export OVE_AI_MODEL_DIRECT=<your strongest model>
export OVE_AI_MODEL_VISION=<a model that reads images>
```

### Output limit

A reply that stops because the model ran out of output room is never usable JSON. Models that reason before they answer spend part of the limit thinking, so a cap that suits a plain model cuts them off mid-answer, and every stage that expects JSON then fails. Each call is asked for up to 8,192 tokens (16,384 on Anthropic); when the model reports it was cut off, the call is repeated with twice the room, twice at most, up to 32,768. `OVE_AI_MAX_TOKENS` changes the starting point.

On the FreeLLMAPI gateway the model is read from `FREELLMAPI_MODEL` first and `OVE_AI_MODEL` second, so a `FREELLMAPI_MODEL` in `.env` silently beats `OVE_AI_MODEL`. `ove ai doctor` prints the model that will be used.

### Looks that differ from one video to the next

The planner and the creative direction are shown ten style families, each with real tokens (fonts, palette, texture, motion, transition, layout) and cues: `editorial-print`, `swiss-grid`, `brutalist-poster`, `cinematic-night`, `warm-craft`, `playful-pastel`, `tech-console`, `data-clarity`, `avant-gallery` and `gradient-product`. They are starting points to pick from by subject or depart from, listed in an order that depends on the brief so none is always first. The dark gradient with glass cards is one of the ten and is marked as fitting software products only. Twelve fonts ship with the renderer (Inter, Space Grotesk, Fraunces, Archivo, Source Sans 3, Playfair Display, DM Sans, Manrope, Syne, JetBrains Mono, Bebas Neue, Instrument Serif); `@ove/schema`'s `fontFamilies` is the one list the prompts and the renderer share.

Nothing forces a kinetic headline or a camera move any more. In scene-by-scene composing the style contract chooses `motion` (`none` sets type still) and `camera` (`none` holds the frame, `push` adds a slow zoom); in plan mode the only craft checks are 3 scenes of unequal length and that something moves.

When the planner may choose React (the local studio and CLI), it is told React is the default for a video that should look designed rather than assembled. `json` is for plainly structured pieces and `template` for a strong match.

### A brand in the brief

A compose job accepts `brand`: `{ name, style, colors: { primary, secondary, accent, background, text }, fonts: { heading, body } }`, which is what `/api/brand/scrape` returns. Colours must be hex and text is cut short; a logo path or URL is never kept. The planner is told the brand is fixed, and the brand's colours and fonts replace the planner's field by field on the template, JSON and React routes (the planner still decides texture, motion, transition, layout and density). A brand font the renderer does not ship is dropped, because renders are offline and it would draw as a fallback.

### Which route makes a video

The planner chooses between a template, a JSON composition and React code. A weak planner answers "json" for nearly everything, and the scene-by-scene JSON route can only place text, rectangles, circles and pictures, so each video came out as a few text cards. Where the host can run React (the local studio and CLI, never a hosted worker), a video the planner did not give to a template is now written as React, and a failed build still falls back to a composition. `OVE_AI_ROUTE=planner` honours the planner's "json"; `OVE_AI_ROUTE=json` never writes React; a template, `--full` or a brief with clips and sounds keep their own routes.

### Every video is React

Whichever route made it, `ove ai compose` saves a React video: one `react` layer, plus audio layers for any sound. A template, a scene-by-scene composition or a catalogue block is drawn by `CompositionView` (`@ove/react`), a shared component that reads the composition as data; the generated `video.tsx` holds that data and nothing a model wrote. It reuses the JSON renderer's own text layout, easing, animation and camera code, so the two agree to within anti-aliasing. A composition that uses something the view cannot draw yet (video, Lottie, shader or code layers, captions, gradient text, split rich text, colour grading, mattes and masks, path trimming) stays as JSON layers, and the compose note says which feature. Pass `--json-layers` to keep JSON layers regardless; the hosted worker renders JSON layers only.

### What the video says

The renderer's review finds broken layout; it cannot know what the brief asked for. Before a composition is accepted, its text layers are checked against the brief:

- A line the brief names ("end on the line: Ride more.", or text quoted after "tagline", "headline" and similar words) has to be said, within one scene. If it is missing, the biggest text layer of the last scene becomes that line.
- A text layer that only names a part of the video ("Hook", "Problem Proof", "Call to Action", "Scene 2", or one of the plan's own beat names) is replaced with its beat's line when the plan lines up with the scenes one for one, and dropped when another text layer can speak.

Every repair is listed in the result's warnings, and `--strict` refuses a repaired answer. Template results get the same checks as warnings only. A video drawn as React cannot be read this way and is not checked.

### The art director (React videos)

After a React video builds and passes the design review, the engine renders a still from each scene (or four spread through a one-scene video) and a vision model judges them against the brief and the direction: is it distinctive or the generic default, is there a focal point, is the frame used, is the type deliberate. Up to two rewrites follow while it finds problems that matter. A rewrite that does not build, or fails the review, is dropped for the version that did, so the pass can only improve a result; unresolved notes are reported as warnings.

The pass needs a model that reads images. A provider that cannot is skipped with a note, and an answer that does not describe what is on screen is refused, so a model that ignored the images cannot drive a rewrite. `OVE_AI_CRITIQUE=0` turns it off. Each round costs one vision call, one code rewrite and a few stills.

## Content first: the script and the data behind it

Every `ove ai compose` now writes the **content** before it designs anything. One editor call returns the block stored as `content` in `composition.json`: who it is for (`audience`), what they get (`promise`), what they should do (`cta`), and the beats that carry the video — each with an `id`, a spoken `narration` line, the `onScreen` copy the viewer reads, the `claim` it makes, the `data` figures it shows, and the `sourceIds` that back them. Then the planner, template fill, scene writer, narration and captions all derive from that script instead of inventing copy on the way.

Grounding is checked, not assumed:

- the brief itself is always a source (`brief`);
- `--source notes.md` (repeatable, files or datasets) adds `src1`, `src2`, … with the file's text;
- research is on by default and asks the model for a few public pages, fetched only after the SSRF guard at every redirect hop, recorded as `web1`, … (`--no-research` turns it off);
- every claim and figure must name a source id, and every source must carry a `quote` copied word for word from it. The engine verifies the quote is a literal substring of the source text. A script that fails comes back with the exact problem ("the quote for src1 is not in that source") and is retried; if no trustworthy script survives the attempts, the video continues **without** a script rather than with an invented one.

```sh
ove ai compose reel --brief "Q4 revenue report" --source data/q4.csv --no-research
ove ai compose reel --brief "..." --content my-script.json      # use a written script
ove script reel/composition.json --output script.md             # read it (or script.json for JSON)
ove script reel/composition.json --set revised.json             # put a revised script back (validated)
```

With `--narration`, a scripted video speaks its own beats: one line per scene when each scene names its beat (`"beat": "hook"`, which template fills set when scenes and beats line up), otherwise one script over the whole video. MCP exposes the same: `motionrender_create_video` takes `sources`, `research` and `script`, and `motionrender_script` exports or imports the block.

## Templates when they fit, a written video when they don't

When a ready-made template matches the video (the same aspect ratio, the same narrative shape), `ove ai compose` asks the model only for the values of its variables: a few hundred tokens instead of a whole composition. The layout, motion and timing come from the template, so that route is faster, cheaper and more consistent. It writes the video instead when no template has the right shape or narrative, the model says none suits the brief, template mode fails, or you supplied `--asset` or `--fields`, and it writes React code when the brief needs motion graphics no template or block can express (see the planner section below). A `--duration` that differs from the template's own no longer leaves the template route: the resolved composition is retimed to the requested length (every scene's duration, layer timing, animation keyframes, split entrances, camera moves, transitions and audio fades scale by the same factor, and scene starts are recomputed the way the loader lays them out). Because the timing is then bespoke, the project is saved as a plain composition rather than an editable template. In Studio, tick *Write every layer from scratch* for the old behaviour.

With `--narration`, a template video is cut to its content script: the beats' narration is spoken one line per scene where the template has a scene per beat (otherwise the model writes one line per scene from what it shows), each line is spoken, and every scene is as long as its line, so what is said and what is on screen change together. Word-timed captions come from transcribing the result, and the export gets a -16 LUFS loudness target. Other videos get one script over the whole video. Pictures you pass with `--asset` (images only) are offered to templates with picture slots: the phone screen, the hero image, the story panel.

Every shipped template (`starter`, `hook-reel`, `kinetic-type`, `product-spotlight`, `logo-sting`, `stats-showcase`, `quote-card`, `event-promo`, `tutorial-steps`, `sale-flash`) takes a **theme** too: the model chooses one of `midnight`, `paper`, `neon`, `espresso` to suit the brief, and the colours follow. See the Blocks and themes section of the README.

When a full composition has problems, the model is asked for a patch instead of the whole composition again: `{"fixes": [{"path": "scenes[1].layers[0]", "value": {…}}, {"layer": "title", "set": {…}}, {"path": "scenes[0].layers[3]", "remove": true}]}`. A complete composition is still accepted as the reply.

## The planner decides the route first

Before either path runs, `compose` asks the model for a **plan**: which of the three production routes suits the brief — fill a template, write a JSON composition, or write React code — with the video's beats and art direction. The route follows what the brief needs, not a default: a template is chosen only when its scenes and look already match the video (a length difference does not disqualify it, since `--duration` retimes the fill), JSON for structured, typographic, data- or product-led videos the blocks can express, and React when the brief asks for 3D, WebGL or canvas work, particles, custom illustration or SVG, real camera moves or other craft no block layout carries. The planner is told never to force a near-miss template. Its answer is checked against the **capability registry**, so the model can only point at templates, themes, components, effects, sounds and **motion moves** that actually exist and fit the canvas; anything invented comes back with the exact problem and is corrected. The moves are the named vocabulary of motion (`ken-burns`, `word-cascade`, `rise-in`, `pop-in`, `blur-in`, `slide-in`, `pulse`, `wipe-reveal`, `parallax`, `camera-shake`, …): the planner names them in a beat's `motion` field, and the composition prompt carries a one-line recipe for each, so a named move always meets the knowledge of how to build it. With a valid plan:

- route **template** → that template id and theme are filled (the old template mode, now aimed by the planner);
- route **json** → a full composition is written with the plan's beats as its required motion plan, so planning is never wasted;
- route **react** → the agent loop (below) writes `video.tsx`, builds it and returns the composition it produced. Only a host that runs generated code itself offers this route: `ove ai compose` on your machine and the local studio do; the hosted workers do not, because the brief would then choose the JavaScript the operator's machine runs. A written script fixes the component's beats, and a failed build falls back to a JSON composition rather than losing the job.

If the planner cannot be trusted — no valid reply within two attempts, or a non-plan-shaped answer — compose falls back to the routing that always worked (template first, then a full composition). Pass `--no-plan` to skip planning entirely.

### Scene-by-scene composing (`OVE_COMPOSE_STRATEGY=scenes`)

On gateways where one big generation call stalls for tens of seconds or drops global constraints ("exactly 2 scenes" comes back as one), the JSON route can be composed as a series of **small calls** instead: one short call agrees the visual system with the plan's beats (palette, fonts, a motion move per beat — the *style contract*), then one small call designs **each scene** against that contract and a summary of where the previous scene ends, and the timing is decided entirely by code — the beats' shares of the requested duration, an exact total, transitions, ids and a house camera push are stitched in deterministically. Each call lands in the provider's fast path, fails on its own (a bad scene costs its retry, not the video), and when the renderer's review finds errors only the scenes that own the failing frames are re-designed with the exact findings. Any failure in the small-call chain falls back to the proven single-call path, so `--provider mock` and offline runs are untouched. Opt in per call with `OVE_COMPOSE_STRATEGY=scenes` (or `strategy: 'scenes'` in the SDK).

```sh
ove ai capabilities            # list every registered capability the AI may use
ove ai capabilities --json     # machine-readable, with ids, descriptions, params and paths
```

The registry (registry v2, about 140 capabilities in a starter install) is built from the templates, themes and blocks on disk plus the built-in effects, transitions, sound effects, the React component kit and the named motion moves. `@ove/ai` exposes `buildRegistry` / `planBuild` for SDK callers, and the cloud jobs `composeSmart` inherits the same routing.

That routing — `composeSmart` in `packages/ai/src/smart.ts` — is where the brief is turned into a decision: plan first or not, fill a template, write the whole composition or author React code, retime a template to the requested length, and move a template's own pictures and sounds next to the project. It takes the catalogues, the file copy and (optionally) the React builder from the host (`TemplateSource`), so every host routes a brief the same way without depending on the command line's template folder; a host that supplies no builder never has React offered to its planner. A copy or build that fails is reported in `warnings`, never swallowed.

## `ove agent`: the planner routes into React code

`ove agent "<brief>"` runs the same planner restricted to the two routes it can act on. A brief that suits a plain composition is produced the way `ove ai compose` does (schema-checked JSON, deterministic render); only a brief that needs bespoke motion graphics goes to the React agent loop (`@ove/react`, esbuild bundle, `type: "react"` layer). `--no-plan` keeps the previous behaviour of always running the React loop.

```sh
ove agent "A viral launch reel for an open-source vector database"
ove agent "Modern SaaS demo" --landscape --duration 9
```

### Creative direction

Before any code is written, `ove agent` asks the model to direct the video: a concept, an art direction, a colour palette, a display and body face from the families bundled with the renderer, a motion language, a sound note and the beat structure with seconds. The direction is saved as `direction.json` beside `video.tsx` and becomes the section of the coding prompt the component must realize. When the planner ran, the stage starts from its idea and beats instead of inventing a second art direction.

There is deliberately no house style. The prompt no longer mandates glass cards, bento grids, glow or a three-scene hook/value/CTA shape, and it treats the React component kit as optional resources a custom build can ignore. `KineticText`, `NumberTicker`, `Audio` sound effects and the rest stay available, but nothing in the toolkit is required: the model may write its own components, SVG illustrations or canvas effects.

A direction the model cannot produce is not fatal — the agent says why, writes the video from the brief alone, and still builds and renders. `--no-direction` skips the stage to save one model call. Through the SDK, `direction: false` does the same, and `direction: { … }` supplies a direction you wrote yourself.

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

A job bar shows live progress over server-sent events. Every job calls the same `@ove/ai` and `@ove/core` functions as the CLI, so nothing about the output or its determinism changes. The preview does not run code layers (`allowCode` is off in the Studio). A compose that finished with repairs, or that the design review still faults, does not redirect into the player: the page stops and lists what was changed and what is still wrong, with a button to open the video anyway.

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
  accepted. Slower, and needs Chromium and FFmpeg. If errors are still standing when the rounds run out, the file is
  written and rendered anyway, the errors are listed, and the command exits 1 — `--json` puts them in `errors`.
- `--strict` refuses an answer that only became usable because the engine repaired it. Models invent animation
  properties (`glow`, `fade`, `scaleX`) and put text where numbers belong; normally those are fixed silently — the
  keyframe disappears, the video loses its motion, and nothing says so. Every repair is now listed as a `note:` (and in
  `--json` `warnings`); with `--strict` the model is given the exact list and asked again, and if it does not stop
  needing repairs the command fails instead of shipping the repaired version.
- `--max-attempts 3` (default) bounds the validation loop.
- `--schema` appends the exact JSON Schema to the prompt. More tokens, fewer format mistakes on small models.
- `--dry-run` prints the composition without writing; `--render` renders to `<dir>/out.mp4` (with code permission when
  the video was written as React); `--json` prints a machine-readable summary; `--no-plan` skips the planner
  (template-first routing, then a straight composition); `--no-react` keeps the planner off the React route.

What the loop does:

1. The model gets a compact specification of the format plus your brief and design rules.
2. Its JSON is parsed (fences and prose are tolerated) and validated with the real `loadComposition`.
3. Validation errors, and checks the schema cannot express (empty text, unknown asset ids, off-frame scenes,
   unused template variables), go back verbatim as the next user turn. Anything repaired on the way in (see
   `--strict` above) is listed as a note on the finished video.
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
- The model's output is data. It is validated by the schema, and react layers, the only layers that run code, are refused in it.
  There is no `eval`, no arbitrary code execution, and no request to a web URL from a composition.
- Rendering makes no model calls and is byte-identical for the same JSON on the same machine.
- Distributed rendering does not send the brief anywhere: AI runs before rendering, on the coordinator.
- The 86 KB JSON Schema is available with `ove schema`; the AI layer uses the same schema the renderer uses.

## Limits

- `groq` covers chat, speech and word timings but has no image generation (Groq lists no image model); `mock` supports offline chat and images only. `ove ai doctor` says what is available before a run.
- Captions need word or segment timings. A provider without transcription produces audio and no captions.
- The generated composition uses ordinary layers, not Lottie or shaders, unless the brief explicitly asks for
  them. `ove review` cannot read text inside a React layer, so ordinary text layers are preferred.
- AI is an authoring step, not a runtime feature: the Player and `renderMedia` never call a model.
- Long-form footage editing remains outside what OVE does, AI-written or not.
