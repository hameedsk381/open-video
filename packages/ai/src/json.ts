// Models wrap JSON in prose or markdown fences often enough that a tolerant extractor is part of the pipeline.
export function extractJson(text: string): unknown {
  let cleaned = text.trim().replace(/^\uFEFF/, '');

  // 1. Unescape common HTML entities if copied from formatted web chat or rich text
  if (cleaned.includes('&#') || cleaned.includes('&quot;') || cleaned.includes('&amp;')) {
    cleaned = cleaned
      .replace(/&#x20;/gi, ' ')
      .replace(/&#32;/g, ' ')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&amp;/gi, '&');
  }

  // 2. Remove backslash escapes at ends of lines (markdown line continuation)
  cleaned = cleaned.replace(/\\+(\r?\n)/g, '$1');

  // 3. Extract fenced block if present (support closed or unclosed fences)
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(cleaned)
    ?? /```(?:json)?\s*([\s\S]+)$/i.exec(cleaned);
  const candidate = (fenced?.[1] ?? cleaned).trim();

  // 4. Find the outer object boundaries
  // If the candidate contains "version": "1.0", anchor to the { right before it
  let first = candidate.indexOf('{');
  const versionIdx = candidate.indexOf('"version"');
  if (versionIdx >= 0) {
    const candidateFirst = candidate.lastIndexOf('{', versionIdx);
    if (candidateFirst >= 0) first = candidateFirst;
  }
  const last = candidate.lastIndexOf('}');
  if (first < 0 || last <= first) {
    throw new Error('The response did not contain a valid JSON object. Make sure to paste the full composition JSON starting with { "version": "1.0", ... }');
  }

  const slice = candidate.slice(first, last + 1);

  // 5. Try parsing as-is
  try {
    return JSON.parse(slice);
  } catch {
    // Tolerant cleanup: remove trailing commas before } or ] and fix unescaped newlines in strings
    const withoutTrailingCommas = slice.replace(/,(\s*[}\]])/g, '$1');
    const sanitizedControls = escapeControlCharsInJsonStrings(withoutTrailingCommas);
    try {
      return JSON.parse(sanitizedControls);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`The response was not valid JSON (${reason}). Check that you copied the complete composition JSON starting with { and ending with }. Start: ${slice.slice(0, 160)}`);
    }
  }
}

// Escapes literal newlines and tabs that occur inside JSON string literals
function escapeControlCharsInJsonStrings(str: string): string {
  let inString = false;
  let escaped = false;
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i]!;
    if (inString) {
      if (escaped) {
        escaped = false;
        out += ch;
      } else if (ch === '\\') {
        escaped = true;
        out += ch;
      } else if (ch === '"') {
        inString = false;
        out += ch;
      } else if (ch === '\n') {
        out += '\\n';
      } else if (ch === '\r') {
        // omit \r
      } else if (ch === '\t') {
        out += '\\t';
      } else {
        out += ch;
      }
    } else {
      if (ch === '"') {
        inString = true;
      }
      out += ch;
    }
  }
  return out;
}

// Sanitizes common LLM hallucinations in pasted/imported compositions
// (e.g. "fade" instead of "opacity", "from"/"to" instead of "keyframes", "rectangle" instead of "rect").
export function sanitizeCompositionJson(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  const clone = JSON.parse(JSON.stringify(input));

  const propMap: Record<string, string> = {
    fade: 'opacity', fadeIn: 'opacity', fadeOut: 'opacity',
    zoom: 'scale', zoomIn: 'scale', zoomOut: 'scale', scaleUp: 'scale', scaleDown: 'scale',
    moveX: 'x', slideX: 'x', translateX: 'x',
    moveY: 'y', slideY: 'y', translateY: 'y',
    rotate: 'rotation',
  };

  const allowedProperties = new Set([
    'x', 'y', 'opacity', 'rotation', 'scale', 'fontSize', 'width', 'height', 'radius',
    'letterSpacing', 'strokeWidth', 'trimStart', 'trimEnd', 'blur', 'volume', 'd',
    'fill', 'color', 'stroke'
  ]);

  if (Array.isArray(clone.scenes)) {
    for (const scene of clone.scenes) {
      if (!scene || typeof scene !== 'object') continue;
      if (typeof scene.startFrame !== 'number') scene.startFrame = 0;
      if (Array.isArray(scene.layers)) {
        for (const layer of scene.layers) {
          if (!layer || typeof layer !== 'object') continue;

          // Normalize common type aliases
          if (layer.type === 'rectangle' || layer.type === 'box') layer.type = 'rect';
          if (layer.type === 'heading' || layer.type === 'paragraph' || layer.type === 'title') layer.type = 'text';

          // Normalize animations
          if (Array.isArray(layer.animations)) {
            const validAnimations = [];
            for (const anim of layer.animations) {
              if (!anim || typeof anim !== 'object') continue;

              let prop = String(anim.property ?? anim.type ?? anim.name ?? '').trim();
              if (propMap[prop]) prop = propMap[prop];
              anim.property = prop;

              // Synthesize keyframes from from/to if keyframes is missing
              if (!Array.isArray(anim.keyframes)) {
                if (anim.from !== undefined || anim.to !== undefined) {
                  const start = Number(anim.startFrame ?? anim.start ?? 0) || 0;
                  const dur = Number(anim.durationFrames ?? anim.duration ?? 20) || 20;
                  const end = anim.endFrame !== undefined ? Number(anim.endFrame) : start + dur;
                  anim.keyframes = [
                    { frame: start, value: anim.from ?? 0 },
                    { frame: end, value: anim.to ?? 1, easing: anim.easing ?? 'land' },
                  ];
                } else if (Array.isArray(anim.values)) {
                  const step = Math.floor(20 / Math.max(1, anim.values.length - 1));
                  anim.keyframes = anim.values.map((v: unknown, i: number) => ({ frame: i * step, value: v }));
                }
              }

              // Only keep animations with an allowed property and non-empty keyframes
              if ((allowedProperties.has(anim.property) || anim.property.startsWith('--')) && Array.isArray(anim.keyframes) && anim.keyframes.length > 0) {
                anim.keyframes = anim.keyframes.map((k: any) => ({
                  frame: Math.max(0, Math.floor(Number(k.frame) || 0)),
                  value: k.value ?? 0,
                  ...(k.easing ? { easing: k.easing } : {}),
                }));
                validAnimations.push(anim);
              }
            }
            layer.animations = validAnimations;
          }
        }
      }
    }
  }

  return clone;
}
