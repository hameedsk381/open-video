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

Set a Groq API key. Nothing is stored on disk by OVE.

```sh
# Groq: chat, speech synthesis and transcription with one key
export GROQ_API_KEY=gsk_...
export OVE_AI_MODEL=openai/gpt-oss-120b                  # optional; default
export OVE_AI_SPEECH_MODEL=canopylabs/orpheus-v1-english # optional; default (a Groq preview model)
export OVE_AI_TRANSCRIPTION_MODEL=whisper-large-v3-turbo # optional; default
export OVE_AI_VOICE=hannah                               # optional; hannah, austin, troy

# No key, no network: a deterministic stand-in for trying the pipeline
ove ai compose demo --provider mock --brief "a test"
```

| Provider | chat | images | speech | word timings |
|---|---|---|---|---|
| `groq` | yes (`openai/gpt-oss-120b`) | — | yes (`canopylabs/orpheus-v1-english`) | yes (`whisper-large-v3-turbo`) |
| `mock` | yes | yes | — | — |

Groq covers composition generation and repair, speech synthesis and word-timed transcription. It offers no image model, so
`ove ai image` works only with `--provider mock`; compositions use your own pictures or drawn layers. Groq and `mock` are the only providers.

Other environment variables: `OVE_AI_PROVIDER`, `GROQ_API_KEY`, `OVE_AI_API_KEY`, `GROQ_BASE_URL`, `OVE_AI_BASE_URL`, `OVE_AI_MODEL`,
`OVE_AI_SPEECH_MODEL`, `OVE_AI_TRANSCRIPTION_MODEL`, and `OVE_AI_VOICE`. `ove ai doctor` prints what is configured and what it can do.
`OVE_AI_SPEECH_MODEL`, `OVE_AI_TRANSCRIPTION_MODEL`, and `OVE_AI_VOICE`. `ove ai doctor` prints what is configured and what it can do.

## Motion graphics by default, templates when you want them

`ove ai compose` writes a motion-graphics composition the way a coding agent would: it plans beats and look first, then writes every layer (kinetic type, camera, grain, motion blur, scene craft). Pass `--from-template` (or tick *Fill a ready-made template* in Studio) to fill a matching template's variables instead — faster and more consistent, but the layout is fixed. Template mode also runs when you supply `--fields`. `--duration` always writes a full composition, because templates have a fixed length.

With `--narration`, a template video is cut to the voiceover: the model writes one spoken line per scene from what that scene shows, each line is spoken, and every scene is as long as its line, so what is said and what is on screen change together. Word-timed captions come from transcribing the result, and the export gets a -16 LUFS loudness target. Other videos get one script over the whole video. Pictures you pass with `--asset` (images only) are offered to templates with picture slots: the phone screen, the hero image, the story panel.

Templates built from blocks (`launch-wide`, `story-tall`, `explainer-square`, `keynote-wide`) take a **theme** too: the model chooses one of `midnight`, `paper`, `neon`, `espresso` to suit the brief, and the colours follow. See the Blocks and themes section of the README.

When a full composition has problems, the model is asked for a patch instead of the whole composition again: `{"fixes": [{"path": "scenes[1].layers[0]", "value": {…}}, {"layer": "title", "set": {…}}, {"path": "scenes[0].layers[3]", "remove": true}]}`. A complete composition is still accepted as the reply.

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
  machine-readable summary.

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

# Use a script you already wrote; Groq voices include hannah (default), austin and troy
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
