---
name: ove-batch-videos
description: Make many MotionRender videos from one template and a list of rows (one per product, customer, city or language). Use when the user wants personalised or localised versions of the same video.
---

# One template, many videos

The main `ove` skill has the full "Variables" section.

## Steps

1. Make the template: a composition whose text, colours and pictures use `{{name}}` variables, each declared under `variables` with a type and a default. Every variable must be used, or every row produces the same video.
2. Check one variant: `ove validate composition.json --var customer=Priya`, then `ove still composition.json --var customer=Priya --frame 60 --output still.png`.
3. Write `rows.json`, an array of objects with one key per variable, plus a key for the file name.
4. Render all: `ove render composition.json --batch rows.json --output "out/{{customer}}.mp4"`. Every row is checked before anything renders, and two rows may not write the same file.

## Localising

Put each language's text in the rows (`"headline": "..."`), not in the composition. Check every language for text that no longer fits: use `maxWidth`, `maxLines` and `minFontSize` on text layers so long translations shrink instead of overflowing, then run `ove review` on the longest row.

## With AI

`ove ai batch products.json --brief "a clean product card" --output "out/{{id}}.mp4"` has the model write the template from the brief and the row fields, then renders every row.
