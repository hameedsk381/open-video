# Production manifest example

`production.json` is the plan for a ten-second spot: brief, style, script beats, cast, locations, three shots and the
assets behind them. `composition.json` is what the renderer reads, compiled from the manifest.

```bash
# check references, beats and asset ids
mr production validate production.json

# shots -> scenes, approved takes -> footage, planned shots -> text cards
mr production compile production.json

# inspect the compiled timeline and render it
mr validate composition.json
mr still composition.json --frame 45 --output poster.png
mr render composition.json --output lumen-one.mp4 --crf 24
```

The stills and ambient bed under `assets/` were synthesized locally (ffmpeg `geq` and `aevalsrc`), so the example
renders with no network access and no generated media. Replace `media` on a shot with a generated take, set
`generation.status` to `approved` and recompile; the card or still for that shot is replaced by the footage.
