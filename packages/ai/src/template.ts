// Template mode: instead of writing a whole composition, the model picks one of the ready-made templates and returns only
// the values for its variables (a few hundred tokens instead of thousands). The layout, motion and timing come from the
// template, which is already checked, so the result is faster, cheaper and more consistent than free-form JSON.
import { describeError, loadComposition, type Composition } from '@ove/core';
import { themeTokenNames, type DesignLook, type VideoContent } from '@ove/schema';
import type { AiProvider, ChatMessage } from './providers';
import { extractJson } from './json';
import { colorValue } from './project';

export type TemplateVariableInfo = { name: string; type: string; default?: unknown; description?: string; items?: Record<string, { type: string; default?: unknown; description?: string }> };
export type ThemeChoice = { id: string; name: string; description: string; variables: Record<string, string | number> };
/** `themed` templates read colour variables (bg, text, accent…) that a theme can set. */
export type TemplateChoice = { themed?: boolean; id: string; name: string; description: string; width: number; height: number; durationSeconds: number; variables: TemplateVariableInfo[]; composition: Record<string, unknown> };

export type TemplateOptions = {
  brief: string;
  width: number;
  height: number;
  /** Pictures the user supplied; picture variables (image, photo…) may name one of them. */
  assets?: { id: string; type: string; src: string }[];
  /** Themes the model may choose for a themed template. */
  themes?: ThemeChoice[];
  /** The planner's art direction; it refines the chosen theme (or fills look variables on any template that declares them). */
  look?: DesignLook;
  /** A script that is already written: the model fills the template's copy from it instead of inventing any. */
  content?: VideoContent;
  /** The host has already chosen the template: the model fills it and may not answer "none". */
  chosen?: boolean;
  maxAttempts?: number;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
};
export type TemplateResult = { source: Record<string, unknown>; composition: Composition; attempts: number; template: string; theme?: string; values: Record<string, unknown>; warnings: string[] };

const sameShape = (a: { width: number; height: number }, b: { width: number; height: number }) => Math.abs(a.width / a.height - b.width / b.height) < 0.02;
/** Variables that hold a picture (an asset id or nothing): image, image2, photo, heroImage… */
export const isPictureVariable = (name: string) => /^(image|photo|picture)\d*$/i.test(name) || /(Image|Photo|Picture)\d*$/.test(name);
/** Variables a theme sets; the model does not fill these in for templates that take a theme. */
const themeNames = themeTokenNames;
/** Layout-choice variables and the arrangements each one accepts. */
const variantValues: Record<string, string[]> = {
  heroVariant: ['left', 'center', 'band'],
  statVariant: ['center', 'left', 'split'],
  closeVariant: ['center', 'left', 'panel'],
};
const filled = (template: TemplateChoice, name: string) => !(template.themed && (themeNames as readonly string[]).includes(name));
const short = (value: unknown, max = 70) => { const text = (typeof value === 'string' ? value : JSON.stringify(value)).replace(/\s*\n\s*/g, ' / '); return text.length > max ? `${text.slice(0, max)}…` : text; };

/** The templates whose shape matches the wanted video, so a vertical reel is never filled into a landscape layout. */
export const templatesFor = (templates: TemplateChoice[], size: { width: number; height: number }) => templates.filter(template => sameShape(template, size));

function describe(template: TemplateChoice): string {
  const variables = template.variables.filter(variable => filled(template, variable.name)).map(variable => {
    const items = variable.items ? ` of {${Object.entries(variable.items).map(([name, item]) => `${name}: ${item.type}`).join(', ')}}` : '';
    return `    - ${variable.name} (${variable.type}${items})${variable.description ? `: ${variable.description}` : ''}; example ${short(variable.default)}`;
  }).join('\n');
  return `- ${template.id}: ${template.description} (${template.width}x${template.height}, ${Math.round(template.durationSeconds)} s${template.themed ? ', takes a theme' : ''})\n${variables}`;
}

const systemText = `You fill in ready-made video templates. Reply with JSON only: {"template": "<id>", "theme": "<theme id, only for templates that take a theme>", "values": {"<variable>": <value>, ...}}.
Choose the template that best matches the story structure and topic of the brief (stories and stats -> story-tall; features and cards -> showcase-tall; tips and steps -> social-reel).
For templates that take a theme, choose the theme whose palette, typography, texture and motion best match the mood, industry and visual tone of the brief:
- "midnight": modern tech, SaaS, B2B, cloud, finance (deep slate navy, sky blue; Space Grotesk, grid texture)
- "neon": gaming, nightlife, social apps, crypto, cutting-edge AI (dark violet, hot magenta, electric lime; scanlines, zoom)
- "espresso": artisan craft, food & beverage, coffee, lifestyle, podcasts, warmth (espresso and amber; Fraunces, paper texture, editorial layout)
- "paper": clean editorial, education, publishing, thought leadership, light minimalist (light paper, deep ink; Fraunces, dots)
- "signal": high-impact, fitness, sports, breaking news, urgency (bold monochrome with alert red; Archivo, push transitions)
Layout variables (heroVariant, statVariant, closeVariant) are design choices, not copy: pick the arrangement that fits the brief's energy and the subject's place in the frame.
Picture variables (image, image2…) take the id of one supplied picture, or "" for none; never invent ids. Examples only show the length and kind of text wanted: never reuse their wording (including labels like INTRODUCING); use the brief's own names, numbers and details, and prefer a concrete line over a generic one such as "Ready to start?". Rules: write the words viewers will read, never a description of the video; do not invent dates, prices or claims that are not in the brief; use only the listed variable names; write real copy for the brief, about as long as each example (never much longer); "color" values are hex like "#f4d58d"; list values are arrays of objects with the listed fields.
When the brief includes a content script, its beats, on-screen lines and figures ARE the copy: fill variables from them in order, keep every number exactly as written, and add no claim or figure that is not in the script.`;

function check(template: TemplateChoice, values: unknown, pictures: string[]): string[] {
  if (!values || typeof values !== 'object' || Array.isArray(values)) return ['"values" must be an object'];
  const problems: string[] = [];
  const known = new Map(template.variables.map(variable => [variable.name, variable]));
  // A reply with next to no copy would leave the template's sample text on screen.
  const copy = template.variables.filter(variable => filled(template, variable.name) && !isPictureVariable(variable.name) && (variable.type === 'string' || variable.type === 'list'));
  const given = copy.filter(variable => variable.name in (values as object));
  if (copy.length && given.length < Math.ceil(copy.length / 2)) problems.push(`"values" gives ${given.length} of ${copy.length} texts; write copy for the brief for: ${copy.filter(variable => !given.includes(variable)).map(variable => variable.name).join(', ')}`);
  for (const [name, value] of Object.entries(values as Record<string, unknown>)) {
    if (template.themed && (themeNames as readonly string[]).includes(name)) continue;
    const variable = known.get(name);
    if (!variable) { problems.push(`"${name}" is not a variable of ${template.id}; use only ${[...known.keys()].join(', ')}`); continue; }
    if (variable.type === 'string' && isPictureVariable(name)) {
      if (typeof value !== 'string' || (value !== '' && !pictures.includes(value))) problems.push(`"${name}" must be ${pictures.length ? `one of ${pictures.join(', ')} or ""` : '"" (no pictures were supplied)'}`);
    } else if (variable.type === 'string') {
      if (variantValues[name]) {
        if (typeof value !== 'string' || !variantValues[name]!.includes(value.trim().toLowerCase())) problems.push(`"${name}" must be one of ${variantValues[name]!.join(', ')}`);
        continue;
      }
      const base = typeof variable.default === 'string' ? variable.default.length : 40;
      if (typeof value !== 'string' || !value.trim()) problems.push(`"${name}" must be text`);
      else if (value.length > Math.max(60, base * 2.5)) problems.push(`"${name}" is too long (${value.length} characters; about ${base} fit)`);
    } else if (variable.type === 'color') {
      if (typeof value !== 'string' || !colorValue.test(value)) problems.push(`"${name}" must be a colour such as "#f4d58d"`);
    } else if (variable.type === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value)) problems.push(`"${name}" must be a number`);
    } else if (variable.type === 'boolean') {
      if (typeof value !== 'boolean') problems.push(`"${name}" must be true or false`);
    } else if (variable.type === 'list') {
      if (!Array.isArray(value) || !value.length || value.length > 12 || value.some(item => !item || typeof item !== 'object' || Array.isArray(item))) problems.push(`"${name}" must be a list of 1-12 objects`);
    }
  }
  return problems;
}

/** The template variables a look refines; the same words a theme sets. */
function lookVariables(look: DesignLook): Record<string, unknown> {
  const variables: Record<string, unknown> = {};
  if (look.fonts?.display) variables.fontDisplay = look.fonts.display;
  if (look.fonts?.body) variables.fontBody = look.fonts.body;
  for (const name of ['bg', 'surface', 'text', 'muted', 'accent', 'accent2'] as const) if (look.palette?.[name]) variables[name] = look.palette[name];
  if (look.texture?.type) variables.texture = look.texture.type;
  if (look.texture?.color) variables.textureColor = look.texture.color;
  if (look.texture?.opacity !== undefined) variables.textureOpacity = look.texture.opacity;
  if (look.motion) variables.motion = look.motion;
  if (look.transition) variables.transition = look.transition;
  if (look.layout) variables.layout = look.layout;
  if (look.density !== undefined) variables.density = look.density;
  return variables;
}

/** The template with the given values as the variables' defaults, checked and resolved like any composition. */
export function fillTemplate(template: TemplateChoice, values: Record<string, unknown>, theme?: ThemeChoice, assets: { id: string; type: string; src: string }[] = [], look?: DesignLook): Composition {
  return loadComposition(fillTemplateSource(template, values, theme, assets, look));
}
/** The template with the values and theme written in, still a template (variables, components): what is saved so it stays editable. */
export function fillTemplateSource(template: TemplateChoice, values: Record<string, unknown>, theme?: ThemeChoice, assets: { id: string; type: string; src: string }[] = [], look?: DesignLook): any {
  const raw: any = structuredClone(template.composition);
  // Pictures the values name are declared as assets so the layers can use them by id.
  const used = new Set(Object.entries(values).filter(([name, value]) => isPictureVariable(name) && typeof value === 'string' && value).map(([, value]) => value as string));
  if (used.size) raw.assets = [...(raw.assets ?? []), ...assets.filter(asset => used.has(asset.id) && !(raw.assets ?? []).some((own: any) => own.id === asset.id))];
  raw.variables = { ...(raw.variables ?? {}) };
  // A theme sets the colour and style variables the template already has; it adds none. The look refines the theme, and
  // only reaches variables this template declares (so a look never invents a token a template does not use).
  if (theme) for (const [name, value] of Object.entries(theme.variables)) if (raw.variables[name]) raw.variables[name] = { ...raw.variables[name], default: value };
  if (look) for (const [name, value] of Object.entries(lookVariables(look))) if (raw.variables[name]) raw.variables[name] = { ...raw.variables[name], default: value };
  for (const [name, value] of Object.entries(values)) raw.variables[name] = { ...raw.variables[name], default: variantValues[name] && typeof value === 'string' ? value.trim().toLowerCase() : value };
  return raw;
}

/**
 * Asks the model for a template and its values. Returns undefined when no template has the wanted shape or the model says
 * none suits the brief, so the caller can fall back to writing a whole composition.
 */
export async function composeFromTemplate(provider: AiProvider, templates: TemplateChoice[], options: TemplateOptions): Promise<TemplateResult | undefined> {
  const candidates = templatesFor(templates, options);
  if (!candidates.length) return undefined;
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const messages: ChatMessage[] = [
    { role: 'system', content: systemText },
    { role: 'user', content: `Brief: ${options.brief}\n\nTemplates:\n${candidates.map(describe).join('\n')}${options.assets?.length ? `\n\nPictures you can use (ids): ${options.assets.filter(asset => asset.type === 'image').map(asset => asset.id).join(', ') || 'none'}` : '\n\nNo pictures are supplied: leave picture variables empty.'}${options.themes?.length && candidates.some(candidate => candidate.themed) ? `\n\nThemes (for templates that take one; pick the one that suits the brief):\n${options.themes.map(theme => `- ${theme.id}: ${theme.description}`).join('\n')}` : ''}${options.content ? `\n\nThe script is already written. Fill the template's copy from these beats, in order, keeping figures exactly as written:\n${JSON.stringify({ audience: options.content.audience, promise: options.content.promise, cta: options.content.cta, beats: options.content.beats.map(beat => ({ name: beat.name, onScreen: beat.onScreen, data: beat.data })) })}` : ''}` },
  ];
  let lastError = 'no attempt was made';
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    options.onProgress?.(`Asking ${provider.id} to fill a template (attempt ${attempt}/${maxAttempts})…`);
    const text = await provider.chat(messages, { json: true, task: 'template', temperature: 0.4, maxTokens: 1500, signal: options.signal });
    try {
      const answer: any = extractJson(text);
      if (!answer || typeof answer !== 'object') throw new Error('The reply must be one JSON object');
      if (answer.template === 'none') {
        // An explicitly chosen template is not a suggestion; the model has to fill it rather than decline.
        if (options.chosen && candidates.length === 1) throw new Error(`A template was already chosen for this video: fill ${candidates[0]!.id} with the brief's own words.`);
        return undefined;
      }
      const template = candidates.find(candidate => candidate.id === answer.template);
      if (!template) throw new Error(`"template" must be one of ${candidates.map(candidate => candidate.id).join(', ')} (or "none")`);
      // Some replies put the values beside "template" instead of inside "values"; take them from there.
      const rawValues = answer.values && typeof answer.values === 'object' ? answer.values : Object.fromEntries(Object.entries(answer).filter(([key]) => template.variables.some(variable => variable.name === key)));
      const problems = check(template, rawValues, (options.assets ?? []).filter(asset => asset.type === 'image').map(asset => asset.id));
      let theme = template.themed && answer.theme ? options.themes?.find(candidate => candidate.id === answer.theme) : undefined;
      if (template.themed && !theme && options.themes?.length) {
        if (options.themes.length === 1) {
          theme = options.themes[0];
        } else if (answer.theme) {
          problems.push(`"theme" must be one of ${options.themes.map(candidate => candidate.id).join(', ')}`);
        }
      }
      if (problems.length) throw new Error(problems.join('\n'));
      const values = Object.fromEntries(Object.entries(rawValues as Record<string, unknown>)
        .filter(([key]) => filled(template, key))
        .map(([key, value]) => [key, variantValues[key] && typeof value === 'string' ? value.trim().toLowerCase() : value]));
      const source = fillTemplateSource(template, values, theme, options.assets, options.look);
      const composition = loadComposition(source);
      if (options.content) {
        composition.content = options.content;
        // When the template has one scene per beat, point each scene at its beat so narration and captions follow the script.
        if (composition.scenes.length === options.content.beats.length) composition.scenes.forEach((scene, index) => { scene.beat = options.content!.beats[index]!.id; });
      }
      return { source, composition, attempts: attempt, template: template.id, theme: theme?.id, values, warnings: [] };
    } catch (error) {
      lastError = describeError(error);
      messages.push({ role: 'assistant', content: text }, { role: 'user', content: `That cannot be used:\n${lastError}\nReply with the corrected JSON.` });
    }
  }
  throw new Error(`Could not fill a template after ${maxAttempts} attempt${maxAttempts === 1 ? '' : 's'}.\nLast problem:\n${lastError}`);
}
