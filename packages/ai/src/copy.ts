// What the viewer reads, checked against what the brief asked for. The renderer's review finds broken layout; it cannot know that a brief
// said "end on the line: Ride more." and the video never says it, or that a scene prints "Hook" because that is what the beat was called.
// These checks read the text layers of a finished composition. Videos drawn as React cannot be read this way and are skipped.
import type { Composition } from '@ove/core';

const normal = (text: string) => text.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

/** Words that introduce a quotation meant to be read on screen ("the tagline is "…""), as opposed to a name or a quoted aside. */
const cue = /(?:line|lines|say|says|saying|read|reads|reading|tagline|slogan|headline|title|text|words|caption|closing|cta|ending)\W*(?:is|are|being)?\W*$/i;
const closing = /\b(?:end(?:s|ing)?|clos(?:e|es|ing)|finish(?:es|ing)?)\s+(?:on|with)\s+(?:the\s+)?(?:line|words?|phrase|text|tagline|slogan|call to action|cta)\s*:?\s*["“]?([^\n.!?"”]{2,80})/gi;

/** The exact lines a brief says must appear: quoted text introduced as a line or tagline, and "end on the line: …". */
export function requiredLines(brief: string): string[] {
  const found: string[] = [];
  const add = (raw: string) => {
    const line = raw.trim().replace(/^["“'‘]+|["”'’]+$/g, '').trim();
    if (line.length >= 2 && line.split(/\s+/).length <= 12 && !found.some(known => normal(known) === normal(line))) found.push(line);
  };
  for (const match of brief.matchAll(/["“]([^"”\n]{2,80})["”]/g)) if (cue.test(brief.slice(Math.max(0, (match.index ?? 0) - 40), match.index ?? 0))) add(match[1]!);
  for (const match of brief.matchAll(closing)) add(match[1]!);
  return found;
}

export type ScreenText = { scene: number; layer: string; text: string };
const spansText = (spans: any[]): string => spans.map(span => (typeof span?.text === 'string' ? span.text : '')).join('');

/** Every text layer's words, scene by scene. Undefined when the video has text it cannot read (React layers). */
export function screenText(composition: Pick<Composition, 'scenes'>): ScreenText[] | undefined {
  const found: ScreenText[] = [];
  let opaque = false;
  const walk = (layers: any[], scene: number) => {
    for (const layer of layers ?? []) {
      if (!layer || typeof layer !== 'object') continue;
      if (layer.type === 'react' || layer.type === 'code') opaque = true;
      if (layer.type === 'text') {
        const text = typeof layer.content === 'string' && layer.content.trim() ? layer.content : Array.isArray(layer.spans) ? spansText(layer.spans) : typeof layer.text === 'string' ? layer.text : '';
        if (text.trim()) found.push({ scene, layer: String(layer.id ?? ''), text });
      }
      if (layer.type === 'group') walk(layer.children ?? [], scene);
    }
  };
  composition.scenes.forEach((scene, index) => { if (scene.id !== 'narration' && scene.id !== 'captions') walk(scene.layers as any[], index); });
  return opaque && !found.length ? undefined : found;
}

/** What a beat or a scene is called in a plan; never what a viewer should be asked to read. */
const labels = ['hook', 'problem', 'proof', 'offer', 'solution', 'payoff', 'call to action', 'cta', 'intro', 'outro', 'conclusion', 'beat', 'scene', 'headline', 'subhead', 'subtitle', 'body text', 'placeholder'];

/** Words that belong to a shot description ("Close-up of the phone, red numbers flashing"), never to copy a viewer reads. */
const shotLanguage = /\b(close-?up|wide shot|medium shot|zoom|pan|tilt|overlay|mockup|spreadsheet|footage|b-roll|camera|reveals?|shows?|showing|appears?|flashing|montage|collage)\b/i;
/** A line may take a label's place only when it reads like copy: short, and not a description of the picture. */
const readsAsCopy = (line: string) => line.trim().split(/\s+/).length <= 12 && !shotLanguage.test(line);

/** True when everything the text says is a label, such as "Hook", "Problem Proof" or "Scene 2". */export function isLabelOnly(text: string, extra: readonly string[] = [], brief = ''): boolean {
  const asked = normal(brief);
  const own = [...labels, ...extra.map(normal)].filter(label => label && !new RegExp(`(^| )${label}( |$)`).test(asked)).sort((a, b) => b.length - a.length);
  let rest = ` ${normal(text)} `;
  if (!rest.trim()) return false;
  // "Scene 2" and "Beat 3" are labels with their number; a bare number is not one ("14%" and "2.3 million" are the figures a video
  // exists to show), so the number goes only where a label word names it, and before that word is taken out.
  rest = rest.replace(/ (?:beat|scene|step) \d+ /g, '  ');
  for (const label of own) rest = rest.split(` ${label} `).join('  ');
  return !rest.trim();
}

export type CopyProblem = { kind: 'missing-line' | 'label'; message: string; scene?: number; layer?: string; line?: string };

/**
 * Problems with the words a video shows: a line the brief required that is not on screen, and text layers that read as the
 * name of a beat. `beatNames` are the names the plan or script gave its beats.
 */
export function copyProblems(brief: string, composition: Pick<Composition, 'scenes'>, beatNames: readonly string[] = []): CopyProblem[] {
  const texts = screenText(composition);
  if (!texts) return [];
  const problems: CopyProblem[] = [];
  // A line has to be said within one scene: "Ride" in the first and "more" in the last is not the line.
  const perScene = new Map<number, string>();
  for (const entry of texts) perScene.set(entry.scene, `${perScene.get(entry.scene) ?? ''} ${entry.text}`);
  const said = (line: string) => [...perScene.values()].some(sceneText => ` ${normal(sceneText)} `.includes(` ${normal(line)} `));
  for (const line of requiredLines(brief)) {
    if (!said(line)) problems.push({ kind: 'missing-line', line, message: `The brief asks for the exact line "${line}" on screen, and no text layer says it. Make it the headline of the last scene, word for word.` });
  }
  for (const entry of texts) {
    if (isLabelOnly(entry.text, beatNames, brief)) problems.push({ kind: 'label', scene: entry.scene, layer: entry.layer, message: `Text layer "${entry.layer}" reads "${entry.text.replace(/\s+/g, ' ').trim()}", which names a part of the video instead of saying anything. Write what the viewer should read there.` });
  }
  return problems;
}

/**
 * Fixes what can be fixed without asking the model again, in the raw composition a scene-by-scene run stitched: a label-only text
 * layer takes its beat's on-screen line (or is dropped when there is none), and a required line that is missing becomes the
 * headline of the last scene. Returns what it changed, in words, so the caller can report it.
 */
export function repairCopy(raw: any, brief: string, beats: readonly { name?: string; onScreen?: string; narration?: string }[] = []): string[] {
  const notes: string[] = [];
  const scenes: any[] = Array.isArray(raw?.scenes) ? raw.scenes : [];
  const names = beats.map(beat => beat.name ?? '').filter(Boolean);
  // A scene takes its beat's line only when the two line up one for one; otherwise the beat it came from is a guess.
  const aligned = beats.length === scenes.length;
  const setText = (layer: any, text: string) => { layer.content = text; if ('text' in layer) layer.text = text; delete layer.spans; };
  const walk = (layers: any[], visit: (layer: any, siblings: any[]) => void) => { for (const layer of [...(layers ?? [])]) { visit(layer, layers); if (layer?.type === 'group') walk(layer.children ?? [], visit); } };
  scenes.forEach((scene, index) => walk(scene.layers, (layer, siblings) => {
    if (layer?.type !== 'text') return;
    const text = typeof layer.content === 'string' ? layer.content : typeof layer.text === 'string' ? layer.text : '';
    if (!text.trim()) return;
    // The spoken line is heard, not printed: the scene prompt says so, and a model that puts it on screen under the
    // headline gives the viewer the same sentence twice. The label below may still be the only copy in a one-text scene.
    const spoken = aligned ? beats[index]?.narration : undefined;
    if (spoken && normal(text) === normal(spoken) && siblings.filter(other => other?.type === 'text').length > 1) {
      siblings.splice(siblings.indexOf(layer), 1);
      notes.push(`scene ${index + 1}: dropped "${text.replace(/\s+/g, ' ').trim()}", which is the spoken line; narration is heard, not printed.`);
      return;
    }
    if (!isLabelOnly(text, names, brief)) return;
    const line = aligned ? beats[index]?.onScreen : undefined;
    if (line && !isLabelOnly(line, names, brief) && readsAsCopy(line)) {
      // A scene that already says the beat's line in smaller supporting text ("Calm design" over "Premium security" for
      // "Calm design, premium security") would print it twice if the label took the line too; the label is then simply spare.
      const said = siblings.filter(other => other !== layer && other?.type === 'text')
        .map(other => String(other.content ?? other.text ?? '')).join(' ');
      if (normal(said) && normal(said).includes(normal(line))) { siblings.splice(siblings.indexOf(layer), 1); notes.push(`scene ${index + 1}: dropped the beat label "${text.replace(/\s+/g, ' ').trim()}", because the scene already says "${line}".`); return; }
      setText(layer, line);
      notes.push(`scene ${index + 1}: "${text.replace(/\s+/g, ' ').trim()}" is a beat label, not copy; it now says "${line}".`);
    }
    else if (siblings.filter(other => other?.type === 'text').length > 1) { siblings.splice(siblings.indexOf(layer), 1); notes.push(`scene ${index + 1}: dropped the beat label "${text.replace(/\s+/g, ' ').trim()}".`); }
  }));
  const last = scenes[scenes.length - 1];
  if (last) {
    const sceneTexts = scenes.map(scene => { const out: string[] = []; walk(scene.layers, layer => { if (layer?.type === 'text') out.push(String(layer.content ?? layer.text ?? '')); }); return ` ${normal(out.join(' '))} `; });
    const used = new Set<any>();
    for (const line of requiredLines(brief)) {
      if (sceneTexts.some(sceneText => sceneText.includes(` ${normal(line)} `))) continue;
      let biggest: any;
      walk(last.layers, layer => { if (layer?.type === 'text' && !used.has(layer) && (!biggest || (Number(layer.fontSize) || 0) > (Number(biggest.fontSize) || 0))) biggest = layer; });
      if (biggest) { setText(biggest, line); used.add(biggest); notes.push(`the required line "${line}" was missing, so a text layer in the last scene now says it.`); }
    }
  }
  return notes;
}
