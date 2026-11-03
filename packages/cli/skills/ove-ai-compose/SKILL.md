---
name: ove-ai-compose
description: Generate or change an Open Video Engine video from a brief with the ove ai commands (compose, refine, history, restore, studio), and keep every AI change reversible. Use when the user wants AI to draft a video, rewrite it, or undo an AI change.
---

# AI compose, refine, history

AI runs before rendering; the video is still deterministic. Check the provider with `ove ai doctor`. The full guide is `docs/ai.md` in the OVE repository.

## Compose

`ove ai compose <dir> --brief "..." --kind reel|product|promo|project [--narration] [--asset id=path.png] [--render]`

- By default the model plans beats, then writes a whole motion-graphics composition (every layer). Pass `--from-template` to fill a ready-made template of the right shape instead. It also writes a whole composition when you pass `--duration`, `--fields`, or non-image `--asset` files.
- `--asset` pictures are offered to templates with picture slots; the model may use only ids you supply.
- `--review` adds the renderer's design checks as feedback; use it for finished work, not drafts.

## Refine

`ove ai refine <composition.json> --instruction "make the title bigger and the accent gold"`. Be specific. New files must be passed with `--asset`; refine keeps what the composition already uses.

## History: every AI change is kept

- `ove ai history <composition.json>` lists the revisions: what produced each, and what changed (scenes, length, values).
- `ove ai restore <composition.json> <n>` brings revision n back. The restore is itself a revision, so nothing is lost.
- Revisions are plain files in `history/composition/` beside the composition. The first AI change keeps the file as it was as revision 1.

## After any AI change

1. `ove validate`, then `ove review <file> --output review.png` and look at the sheet.
2. Read the copy: names, numbers and claims must match the brief. Fix wrong text by editing the composition or refining.
3. If the result is worse, `ove ai restore` rather than refining again.

## Studio

`ove ai studio` opens a local app (127.0.0.1:3100): projects with thumbnails, a create flow, and an editor with live preview, text editing, Ask AI, looks, history and export. Do not expose the port.
