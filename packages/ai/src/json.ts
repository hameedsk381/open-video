// Models wrap JSON in prose or markdown fences often enough that a tolerant extractor is part of the pipeline.
export function extractJson(text: string): unknown {
  let cleaned = text.trim().replace(/^\uFEFF/, '');

  // Strip <think>...</think> reasoning blocks from modern reasoning models (DeepSeek, Qwen, Nemotron)
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  cleaned = cleaned.replace(/^<think>[\s\S]*?(?=\{)/i, '').trim();

  // The entity unescaping and line-continuation repair used to run here, before anything was parsed — which rewrote
  // legitimate string content that happens to contain an entity. They now run only on the recovery path, below.
  const asWritten = objectSlice(cleaned);
  if (asWritten === undefined) {
    throw new Error('The response did not contain a valid JSON object. Make sure to paste the full composition JSON starting with { "version": "1.0", ... }');
  }

  // 5. Parse as written first. Only a reply that fails gets repaired, and the repairs are re-sliced, because a paste
  //    whose quotes were entity-encoded does not reveal its own object boundaries until they are unescaped.
  try {
    return JSON.parse(asWritten);
  } catch {
    const slice = objectSlice(repairPaste(cleaned)) ?? asWritten;
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

/** The usual ways a chat client mangles a paste: HTML entities in place of punctuation, backslashes continuing lines. */
const repairPaste = (text: string): string => stripLineContinuations(unescapeEntities(text));

const unescapeEntities = (text: string): string => (text.includes('&#') || text.includes('&quot;') || text.includes('&amp;')
  ? text
    .replace(/&#x20;/gi, ' ')
    .replace(/&#32;/g, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
  : text);

const stripLineContinuations = (text: string): string => text.replace(/\\+(\r?\n)/g, '$1');

/** The outermost object of a reply — the fenced block if there is one, anchored on "version" when present. */
function objectSlice(text: string): string | undefined {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
    ?? /```(?:json)?\s*([\s\S]+)$/i.exec(text);
  const candidate = (fenced?.[1] ?? text).trim();
  let first = candidate.indexOf('{');
  const versionIdx = candidate.indexOf('"version"');
  if (versionIdx >= 0) {
    const anchored = candidate.lastIndexOf('{', versionIdx);
    if (anchored >= 0) first = anchored;
  }
  const last = candidate.lastIndexOf('}');
  return first < 0 || last <= first ? undefined : candidate.slice(first, last + 1);
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
// Every rename, rewrite and dropped animation is pushed to `notes`: the caller decides whether to report it, but
// nothing here may change a composition without saying so.
export function sanitizeCompositionJson(input: unknown, notes: string[] = []): unknown {
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
          if (layer.type === 'rectangle' || layer.type === 'box') { notes.push(`layer "${layer.id ?? '?'}" was a "${layer.type}"; used "rect" instead.`); layer.type = 'rect'; }
          if (layer.type === 'heading' || layer.type === 'paragraph' || layer.type === 'title') { notes.push(`layer "${layer.id ?? '?'}" was a "${layer.type}"; used "text" instead.`); layer.type = 'text'; }

          // Normalize animations
          if (Array.isArray(layer.animations)) {
            const validAnimations = [];
            const label = `layer "${layer.id ?? '?'}"`;
            for (const anim of layer.animations) {
              if (!anim || typeof anim !== 'object') { notes.push(`${label}: dropped an animation that was not an object.`); continue; }

              let prop = String(anim.property ?? anim.type ?? anim.name ?? '').trim();
              const requested = prop;
              if (propMap[prop]) { prop = propMap[prop]; notes.push(`${label}: "${requested}" is not an animatable property; animated "${prop}" instead.`); }
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
              } else {
                const why = !allowedProperties.has(anim.property) && !String(anim.property).startsWith('--')
                  ? `"${anim.property || 'nothing'}" is not an animatable property`
                  : 'it had no keyframes';
                notes.push(`${label}: dropped the ${anim.property || 'unnamed'} animation — ${why}.`);
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
