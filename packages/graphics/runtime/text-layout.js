// Text layout, run inside the drawing page (where measure() uses the real font metrics) and by the unit tests, so both run the same code.
// Plain browser script: no imports or exports. Loaded as text by packages/graphics/src/runtime.ts.
// Text layout runs inside the browser page, where `measure(text, fontSize)` uses the real font metrics. It is kept as source so the
// page and the unit tests run exactly the same code.
//  - Lines break at \n, then at spaces to fit maxWidth; a word wider than maxWidth is split between characters.
//  - With minFontSize, the size steps down 1px at a time until the text fits (no more than maxLines lines, no word split), but not
//    below minFontSize.
//  - If it still has more than maxLines lines, it is cut to maxLines and the last line ends in an ellipsis that fits maxWidth.
// Rich text: wraps styled spans together. measure(text, span, size) returns the width in that span's font; every span shrinks by the
// same factor (scale) to fit, so their sizes keep their proportions.
function layoutText(text, options, measure) {
  const maxWidth = options.maxWidth > 0 ? options.maxWidth : Infinity;
  const wrap = (size) => { const lines = []; let split = false;
    for (const paragraph of String(text).split('\n')) { let line = '';
      for (const word of paragraph.split(/ +/)) { const candidate = line ? line + ' ' + word : word;
        if (measure(candidate, size) <= maxWidth) { line = candidate; continue; }
        if (line) { lines.push(line); line = ''; }
        if (measure(word, size) <= maxWidth) { line = word; continue; }
        split = true; for (const ch of Array.from(word)) { if (line && measure(line + ch, size) > maxWidth) { lines.push(line); line = ch; } else line += ch; } }
      lines.push(line); }
    return { lines, split }; };
  const fits = (layout) => !layout.split && (!options.maxLines || layout.lines.length <= options.maxLines);
  let fontSize = options.fontSize, layout = wrap(fontSize);
  const minFontSize = Math.min(options.minFontSize ?? fontSize, fontSize);
  while (!fits(layout) && fontSize > minFontSize) { fontSize = Math.max(minFontSize, fontSize - 1); layout = wrap(fontSize); }
  let lines = layout.lines, truncated = false;
  if (options.maxLines && lines.length > options.maxLines) { truncated = true; lines = lines.slice(0, options.maxLines); let last = Array.from(lines[lines.length - 1]);
    while (last.length && measure(last.join('').trimEnd() + '…', fontSize) > maxWidth) last.pop();
    lines[lines.length - 1] = last.join('').trimEnd() + '…'; }
  return { lines, fontSize, truncated };
}
function layoutRich(spans, options, measure) {
  const base = options.fontSize, maxWidth = options.maxWidth > 0 ? options.maxWidth : Infinity, tokens = [];
  spans.forEach((span, index) => String(span.text).split(/(\n| +)/).forEach(part => { if (part) tokens.push({ text: part, span: index, kind: part === '\n' ? 'break' : /^ +$/.test(part) ? 'space' : 'word' }); }));
  const wrap = (k) => { const lines = []; let line = { runs: [], width: 0 }, over = false;
    const close = () => { while (line.runs.length && line.runs[line.runs.length - 1].kind === 'space') line.width -= line.runs.pop().width; lines.push(line); line = { runs: [], width: 0 }; };
    for (const token of tokens) { if (token.kind === 'break') { close(); continue; } const size = (spans[token.span].fontSize || base) * k, width = measure(token.text, spans[token.span], size);
      if (token.kind === 'space') { if (line.runs.length) { line.runs.push({ text: token.text, span: token.span, kind: 'space', size, width }); line.width += width; } continue; }
      if (line.width + width > maxWidth && line.runs.length) close(); if (width > maxWidth) over = true;
      line.runs.push({ text: token.text, span: token.span, kind: 'word', size, width }); line.width += width; }
    close(); return { lines, over }; };
  const fits = (r) => !r.over && (!options.maxLines || r.lines.length <= options.maxLines);
  const minK = Math.min(1, (options.minFontSize || base) / base); let k = 1, r = wrap(1);
  while (!fits(r) && k > minK) { k = Math.max(minK, k - 1 / base); r = wrap(k); }
  let lines = r.lines, truncated = false;
  if (options.maxLines && lines.length > options.maxLines) { truncated = true; lines = lines.slice(0, options.maxLines); const last = lines[lines.length - 1], tail = last.runs[last.runs.length - 1];
    if (tail) { let chars = Array.from(tail.text); const room = () => last.width - tail.width + measure(chars.join('') + '\u2026', spans[tail.span], tail.size);
      while (chars.length && room() > maxWidth) chars.pop(); last.width -= tail.width; tail.text = chars.join('') + '\u2026'; tail.width = measure(tail.text, spans[tail.span], tail.size); last.width += tail.width; } }
  return { lines, scale: k, truncated };
}
