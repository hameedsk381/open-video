---
name: ove-voiceover-captions
description: Add a voiceover and word-timed captions to an MotionRender video, or caption existing audio, with scenes cut to the speech. Use when the user wants narration, subtitles or captions, or a video timed to its audio.
---

# Voiceover and captions

Needs an AI provider for speech and transcription (`ove ai doctor` shows what is configured). The main `ove` skill has the caption layer fields and the "Timing from media" section.

## Narrate a video

- Generate and add the voiceover: `ove ai narrate --brief "what the video says" --composition video.json`.
- Use your own script: `ove ai narrate script.txt --composition video.json --voice <name>`.
- For a video made by `ove ai compose --narration` from a template, each scene gets one spoken line and is as long as its line, so words and pictures change together. Other videos get one script over the whole video.
- The video gets a loudness target of -16 LUFS unless `export.loudness` is already set.

## Caption existing audio

`ove ai transcribe voice.wav --composition video.json --start 1.2` makes word timings and adds a captions layer. `--start` is the second the audio begins.

## Check the result

1. `ove review video.json --output review.png`: look for captions on screen under 0.7 s, text under the captions, and loudness outside -20 to -11 LUFS.
2. `ove still video.json --frame <n>` at a spoken word to confirm captions and the scene agree.
3. `ove captions video.json --output captions.srt` exports a subtitle file.

## Rules

- Captions are drawn on top, in their own scene, so they are not zoomed by a scene camera; keep them `fixed` if you place them yourself in a scene that has a camera.
- Cut scenes to the speech, not the other way round. Time beats to the words (`media[...]`) instead of typing frame numbers.
- Read the script back: facts in a brief are not verified by OVE.
