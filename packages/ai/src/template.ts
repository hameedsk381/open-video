// Template mode: instead of writing a whole composition, the model picks one of the ready-made templates and returns only
// the values for its variables (a few hundred tokens instead of thousands). The layout, motion and timing come from the
// template, which is already checked, so the result is faster, cheaper and more consistent than free-form JSON.
import { describeError, loadComposition, type Composition } from '@ove/core';
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
  maxAttempts?: number;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
};
export type TemplateResult = { source: Record<string, unknown>; composition: Composition; attempts: number; template: string; theme?: string; values: Record<string, unknown>; warnings: string[] };

const sameShape = (a: { width: number; height: number }, b: { width: number; height: number }) => Math.abs(a.width / a.height - b.width / b.height) < 0.02;
/** Variables that hold a picture (an asset id or nothing): image, image2, photo, heroImage… */
export const isPictureVariable = (name: string) => /^(image|photo|picture)\d*$/i.test(name) || /(Image|Photo|Picture)\d*$/.test(name);
/** Variables a theme sets; the model does not fill these in for templates that take a theme. */
const themeNames = ['bg', 'surface', 'text', 'muted', 'accent', 'accent2', 'radius', 'headWeight'];
const filled = (template: TemplateChoice, name: string) => !(template.themed && themeNames.includes(name));
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
For templates that take a theme, ALWAYS choose the theme that best matches the mood, industry, and visual tone of the brief:
- "midnight": modern tech, SaaS, B2B, cloud, finance
- "neon": gaming, nightlife, social apps, crypto, cutting-edge AI
- "espresso": artisan craft, food & beverage, coffee, lifestyle, podcasts, warmth
- "paper": clean editorial, education, publishing, thought leadership, light minimalist
- "signal": high-impact, fitness, sports, breaking news, urgency
Picture variables (image, image2…) take the id of one supplied picture, or "" for none; never invent ids. Examples only show the length and kind of text wanted: never reuse their wording (including labels like INTRODUCING); use the brief's own names, numbers and details, and prefer a concrete line over a generic one such as "Ready to start?". Rules: write the words viewers will read, never a description of the video; do not invent dates, prices or claims that are not in the brief; use only the listed variable names; write real copy for the brief, about as long as each example (never much longer); "color" values are hex like "#f4d58d"; list values are arrays of objects with the listed fields.
If no template suits the brief, reply {"template": "none"}.`;

function check(template: TemplateChoice, values: unknown, pictures: string[]): string[] {
  if (!values || typeof values !== 'object' || Array.isArray(values)) return ['"values" must be an object'];
  const problems: string[] = [];
  const known = new Map(template.variables.map(variable => [variable.name, variable]));
  // A reply with next to no copy would leave the template's sample text on screen.
  const copy = template.variables.filter(variable => filled(template, variable.name) && !isPictureVariable(variable.name) && (variable.type === 'string' || variable.type === 'list'));
  const given = copy.filter(variable => variable.name in (values as object));
  if (copy.length && given.length < Math.ceil(copy.length / 2)) problems.push(`"values" gives ${given.length} of ${copy.length} texts; write copy for the brief for: ${copy.filter(variable => !given.includes(variable)).map(variable => variable.name).join(', ')}`);
  for (const [name, value] of Object.entries(values as Record<string, unknown>)) {
    if (template.themed && themeNames.includes(name)) continue;
    const variable = known.get(name);
    if (!variable) { problems.push(`"${name}" is not a variable of ${template.id}; use only ${[...known.keys()].join(', ')}`); continue; }
    if (variable.type === 'string' && isPictureVariable(name)) {
      if (typeof value !== 'string' || (value !== '' && !pictures.includes(value))) problems.push(`"${name}" must be ${pictures.length ? `one of ${pictures.join(', ')} or ""` : '"" (no pictures were supplied)'}`);
    } else if (variable.type === 'string') {
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

/** The template with the given values as the variables' defaults, checked and resolved like any composition. */
export function fillTemplate(template: TemplateChoice, values: Record<string, unknown>, theme?: ThemeChoice, assets: { id: string; type: string; src: string }[] = []): Composition {
  return loadComposition(fillTemplateSource(template, values, theme, assets));
}
/** The template with the values and theme written in, still a template (variables, components): what is saved so it stays editable. */
export function fillTemplateSource(template: TemplateChoice, values: Record<string, unknown>, theme?: ThemeChoice, assets: { id: string; type: string; src: string }[] = []): any {
  const raw: any = structuredClone(template.composition);
  // Pictures the values name are declared as assets so the layers can use them by id.
  const used = new Set(Object.entries(values).filter(([name, value]) => isPictureVariable(name) && typeof value === 'string' && value).map(([, value]) => value as string));
  if (used.size) raw.assets = [...(raw.assets ?? []), ...assets.filter(asset => used.has(asset.id) && !(raw.assets ?? []).some((own: any) => own.id === asset.id))];
  raw.variables = { ...(raw.variables ?? {}) };
  // A theme sets the colour and style variables the template already has; it adds none.
  if (theme) for (const [name, value] of Object.entries(theme.variables)) if (raw.variables[name]) raw.variables[name] = { ...raw.variables[name], default: value };
  for (const [name, value] of Object.entries(values)) raw.variables[name] = { ...raw.variables[name], default: value };
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
    { role: 'user', content: `Brief: ${options.brief}\n\nTemplates:\n${candidates.map(describe).join('\n')}${options.assets?.length ? `\n\nPictures you can use (ids): ${options.assets.filter(asset => asset.type === 'image').map(asset => asset.id).join(', ') || 'none'}` : '\n\nNo pictures are supplied: leave picture variables empty.'}${options.themes?.length && candidates.some(candidate => candidate.themed) ? `\n\nThemes (for templates that take one; pick the one that suits the brief):\n${options.themes.map(theme => `- ${theme.id}: ${theme.description}`).join('\n')}` : ''}` },
  ];
  let lastError = 'no attempt was made';
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    options.onProgress?.(`Asking ${provider.id} to fill a template (attempt ${attempt}/${maxAttempts})…`);
    const text = await provider.chat(messages, { json: true, task: 'template', temperature: 0.4, maxTokens: 1500, signal: options.signal });
    try {
      const answer: any = extractJson(text);
      if (!answer || typeof answer !== 'object') throw new Error('The reply must be one JSON object');
      if (answer.template === 'none') return undefined;
      const template = candidates.find(candidate => candidate.id === answer.template);
      if (!template) throw new Error(`"template" must be one of ${candidates.map(candidate => candidate.id).join(', ')} (or "none")`);
      // Some replies put the values beside "template" instead of inside "values"; take them from there.
      const rawValues = answer.values && typeof answer.values === 'object' ? answer.values : Object.fromEntries(Object.entries(answer).filter(([key]) => template.variables.some(variable => variable.name === key)));
      const problems = check(template, rawValues, (options.assets ?? []).filter(asset => asset.type === 'image').map(asset => asset.id));
      const theme = template.themed && answer.theme ? options.themes?.find(candidate => candidate.id === answer.theme) : undefined;
      if (template.themed && answer.theme && !theme) problems.push(`"theme" must be one of ${(options.themes ?? []).map(candidate => candidate.id).join(', ')}`);
      if (problems.length) throw new Error(problems.join('\n'));
      const values = Object.fromEntries(Object.entries(rawValues as Record<string, unknown>).filter(([key]) => filled(template, key)));
      const source = fillTemplateSource(template, values, theme, options.assets);
      return { source, composition: loadComposition(source), attempts: attempt, template: template.id, theme: theme?.id, values, warnings: [] };
    } catch (error) {
      lastError = describeError(error);
      messages.push({ role: 'assistant', content: text }, { role: 'user', content: `That cannot be used:\n${lastError}\nReply with the corrected JSON.` });
    }
  }
  throw new Error(`Could not fill a template after ${maxAttempts} attempt${maxAttempts === 1 ? '' : 's'}.\nLast problem:\n${lastError}`);
}
