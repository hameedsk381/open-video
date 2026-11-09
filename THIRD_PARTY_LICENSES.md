# Third-party licenses

Runtime dependencies are MIT (Zod), Apache-2.0 (Playwright), and the separately installed FFmpeg executable (license depends on the selected build). Run `pnpm licenses list` before distribution and retain FFmpeg build notices.

The optional on-device Indic voices use `onnxruntime-node` (MIT) and the indic-tiny-tts model weights, which are not
bundled: the first narration in a language downloads them from
https://huggingface.co/collections/sulabhkatiyar/indic-tiny-tts-models. Those weights are CC-BY-4.0 by Sulabh Katiyar,
so any published video made with them must credit the model author (for example in the description or credits), and
a redistribution of the weights must keep the licence and attribution.
