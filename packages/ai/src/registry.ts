// The capability registry: one catalogue of everything the AI may use to make a video, so the planner can choose from
// real capabilities instead of inventing unsupported ones. It is built from the actual catalogues (templates, themes,
// blocks) plus the schema's built-in effects and sounds and the React component kit. Nothing here calls a model; the
// planner in plan.ts reads the text form and its answer is checked back against this registry.
import { sfxNames } from '@ove/schema';

export type GenerationPath = 'template' | 'json' | 'react';
export type CapabilityKind = 'template' | 'theme' | 'block' | 'component' | 'effect' | 'sound';

export type Param = { name: string; type: string; description?: string };

export type Capability = {
  id: string;
  kind: CapabilityKind;
  name: string;
  description: string;
  /** Which generation paths can use this capability. */
  paths: GenerationPath[];
  version: string;
  /** What the user (or the model filling a template) must supply. */
  params: Param[];
  /** Compatibility text, such as an aspect ratio, the wanted length, or "takes a theme". */
  fit?: string;
  example?: string;
  // Shape facts only templates carry, so the planner can match a brief to a canvas without parsing `fit`.
  width?: number;
  height?: number;
  durationSeconds?: number;
  takesTheme?: boolean;
};

export type Registry = {
  version: string;
  capabilities: Capability[];
  select(kind: CapabilityKind): Capability[];
  find(kind: CapabilityKind, id: string): Capability | undefined;
  counts(): Record<CapabilityKind, number>;
};

/** Entries the calling package knows: its own template, theme and block catalogues. Metadata only; no source JSON. */
export type TemplateEntry = { id: string; name: string; description: string; width: number; height: number; durationSeconds: number; themed?: boolean; variables: { name: string; type: string; description?: string }[] };
export type ThemeEntry = { id: string; name: string; description: string };
export type BlockEntry = { id: string; name: string; description: string; category: string; kind: 'scene' | 'overlay'; durationFrames: number };
export type RegistryInput = {
  templates?: TemplateEntry[];
  themes?: ThemeEntry[];
  blocks?: BlockEntry[];
};

export const registryVersion = '1';

const components: Capability[] = [
  { id: 'react-primitives', kind: 'component', name: 'React primitives', paths: ['react'], version: registryVersion, params: [],
    description: 'Sequence (cut a scene in time), spring (physics motion with bouncy/snappy/wobbly presets), interpolate (map frames to values), Series, Loop, Freeze, random(seed) for stable randomness.',
    example: '<Sequence from={30} durationInFrames={60}><GlassCard>…</GlassCard></Sequence>' },
  { id: 'AmbientGlow', kind: 'component', name: 'Ambient glow', paths: ['react'], version: registryVersion, params: [{ name: 'orbs', type: 'list' }, { name: 'blur', type: 'number' }],
    description: 'Atmospheric blurred light orbs that drift on sine waves; the standard background for a premium look.' },
  { id: 'GlassCard', kind: 'component', name: 'Glass card', paths: ['react'], version: registryVersion, params: [{ name: 'delay', type: 'number' }, { name: 'preset', type: 'spring preset' }],
    description: 'Frosted-glass surface (backdrop blur, hairline border highlight) that enters on a spring; the standard content surface.' },
  { id: 'KineticText', kind: 'component', name: 'Kinetic text', paths: ['react'], version: registryVersion, params: [{ name: 'text', type: 'string' }, { name: 'staggerDelay', type: 'number' }, { name: 'preset', type: 'spring preset' }],
    description: 'Headline that springs in word by word; the standard hook typography.' },
  { id: 'NumberTicker', kind: 'component', name: 'Number ticker', paths: ['react'], version: registryVersion, params: [{ name: 'value', type: 'number' }, { name: 'decimals', type: 'number' }, { name: 'prefix', type: 'string' }, { name: 'suffix', type: 'string' }],
    description: 'A metric that counts up to its final value; make every statistic move.' },
  { id: 'Badge', kind: 'component', name: 'Status badge', paths: ['react'], version: registryVersion, params: [{ name: 'dotColor', type: 'color' }],
    description: 'Small pill badge with a pulsing status dot, for product names and tags above the headline.' },
  { id: 'DeviceFrame', kind: 'component', name: 'Device frame', paths: ['react'], version: registryVersion, params: [{ name: 'url', type: 'string' }],
    description: 'A macOS-style browser window frame; put screenshots or CSS mock sites inside it.' },
  { id: 'ProgressBar', kind: 'component', name: 'Progress bar', paths: ['react'], version: registryVersion, params: [{ name: 'value', type: 'number' }],
    description: 'A glowing bar that animates to a fraction; pair with NumberTicker for claims.' },
  { id: 'BentoGrid', kind: 'component', name: 'Bento grid', paths: ['react'], version: registryVersion, params: [],
    description: 'A modern mosaic grid; children are BentoCard tiles with their own spring entrances.' },
  { id: 'BentoCard', kind: 'component', name: 'Bento card', paths: ['react'], version: registryVersion, params: [],
    description: 'One tile of a BentoGrid, with its own title, body and entrance.' },
  { id: 'Typewriter', kind: 'component', name: 'Typewriter', paths: ['react'], version: registryVersion, params: [],
    description: 'Text that types itself out character by character, for terminal and chat looks.' },
  { id: 'Waveform', kind: 'component', name: 'Waveform', paths: ['react'], version: registryVersion, params: [],
    description: 'Animated audio bars, for podcast and voiceover contexts.' },
  { id: 'CodeEditor', kind: 'component', name: 'Code editor', paths: ['react'], version: registryVersion, params: [],
    description: 'A macOS-style code window that highlights and reveals lines over time, for developer products.' },
];

const transitions: Capability[] = ['fade', 'slide', 'wipe', 'zoom', 'iris', 'push', 'dip', 'blur'].map(type => ({
  id: `transition-${type}`, kind: 'effect' as const, name: `${type[0]!.toUpperCase()}${type.slice(1)} transition`, paths: ['json', 'react'], version: registryVersion, params: [{ name: 'durationFrames', type: 'number' }, { name: 'direction', type: 'string', description: 'slide/wipe/push: left, right, top or bottom' }],
  description: `Scene ${type} transition`, example: `"transitionIn": { "type": "${type}", "durationFrames": 15 }` }));

const effects: Capability[] = [
  { id: 'layer-blur', kind: 'effect', name: 'Layer blur', paths: ['json', 'react'], version: registryVersion, params: [{ name: 'blur', type: 'number' }], description: 'Gaussian blur on one layer in pixels; use to soften backgrounds and glows.' },
  { id: 'drop-shadow', kind: 'effect', name: 'Drop shadow', paths: ['json', 'react'], version: registryVersion, params: [{ name: 'blur', type: 'number' }, { name: 'offsetX', type: 'number' }, { name: 'offsetY', type: 'number' }], description: 'A layer shadow; offsets are canvas pixels and ignore the layer scale.' },
  { id: 'css-filter', kind: 'effect', name: 'CSS filter', paths: ['json', 'react'], version: registryVersion, params: [{ name: 'filter', type: 'string' }], description: 'A layer filter string such as brightness(1.1) contrast(1.05) saturate(1.2).' },
  { id: 'grain', kind: 'effect', name: 'Film grain', paths: ['json', 'react'], version: registryVersion, params: [{ name: 'grain', type: 'number', description: '0 to 1, about 0.06' }], description: 'Deterministic film grain over the whole frame; hides banding in dark gradients.' },
  { id: 'camera', kind: 'effect', name: 'Scene camera', paths: ['json', 'react'], version: registryVersion, params: [{ name: 'zoom', type: 'number' }, { name: 'x', type: 'number' }, { name: 'y', type: 'number' }], description: 'Move, zoom and turn the view of a scene with keyframes; fixed layers stay put.' },
  { id: 'sfx-library', kind: 'effect', name: 'Sound effect library', paths: ['json', 'react'], version: registryVersion, params: [],
    description: `Built-in sound effects usable in audio layers: ${sfxNames.map(name => `sfx:${name}`).join(', ')}.` },
];

export function buildRegistry(input: RegistryInput = {}): Registry {
  const capabilities: Capability[] = [];
  const push = (capability: Capability) => {
    if (!/^[a-zA-Z][a-zA-Z0-9:._-]*$/.test(capability.id)) throw new Error(`Capability ids use letters, digits, dashes, dots or colons, not "${capability.id}"`);
    if (capabilities.some(own => own.kind === capability.kind && own.id === capability.id)) throw new Error(`Two ${capability.kind} capabilities share the id "${capability.id}"`);
    capabilities.push(capability);
  };
  for (const template of input.templates ?? []) {
    push({
      id: template.id, kind: 'template', name: template.name, description: template.description,
      paths: ['template', 'json'], version: registryVersion,
      params: template.variables.map(variable => ({ name: variable.name, type: variable.type, description: variable.description })),
      fit: `${template.width}x${template.height}, about ${Math.round(template.durationSeconds)} s${template.themed ? ', takes a theme' : ''}`,
      width: template.width, height: template.height, durationSeconds: template.durationSeconds, takesTheme: !!template.themed,
    });
  }
  for (const theme of input.themes ?? []) {
    push({ id: theme.id, kind: 'theme', name: theme.name, description: theme.description, paths: ['template'], version: registryVersion, params: [] });
  }
  for (const block of input.blocks ?? []) {
    push({
      id: block.id, kind: 'block', name: block.name, description: block.description,
      paths: ['json'], version: registryVersion,
      params: [], fit: `${block.kind === 'overlay' ? 'overlay' : 'scene'}, about ${Math.round(block.durationFrames / 30)} s at 30 fps, category "${block.category}"`,
      durationSeconds: block.durationFrames / 30,
    });
  }
  for (const component of components) push(component);
  for (const entry of [...transitions, ...effects]) push(entry);
  for (const name of sfxNames) {
    push({ id: `sfx:${name}`, kind: 'sound', name: name, description: `Built-in sound effect playable in an audio layer as sfx:${name}.`, paths: ['json', 'react'], version: registryVersion, params: [] });
  }
  const select = (kind: CapabilityKind) => capabilities.filter(capability => capability.kind === kind);
  return {
    version: registryVersion,
    capabilities,
    select,
    find: (kind, id) => capabilities.find(capability => capability.kind === kind && capability.id === id),
    counts: () => ({ template: select('template').length, theme: select('theme').length, block: select('block').length, component: select('component').length, effect: select('effect').length, sound: select('sound').length }),
  };
}

/** The same aspect ratio, within 2%: a 1080x1080 template fits a 1078x1085 canvas. */
export function sameShape(a: { width?: number; height?: number }, b: { width: number; height: number }): boolean {
  if (!a.width || !a.height) return false;
  return Math.abs(a.width / a.height - b.width / b.height) < 0.02;
}

const kindTag: Record<CapabilityKind, string> = { template: 'Templates', theme: 'Themes', block: 'Blocks', component: 'React components', effect: 'Effects', sound: 'Sounds' };

/** The registry as compact text for the planner prompt, grouped by kind. */
export function describeCapabilities(registry: Registry, fit: { width: number; height: number; allowReact?: boolean }): string {
  const lines: string[] = [];
  for (const [kind, tag] of Object.entries(kindTag) as [CapabilityKind, string][]) {
    const items = registry.select(kind);
    if (!items.length) continue;
    lines.push(`${tag}:`);
    for (const capability of items) {
      const shape = kind === 'template'
        ? ` (${capability.fit})`
        : capability.fit ? ` (${capability.fit})` : '';
      const usable = sameShape(capability, fit) ? '' : kind === 'template' ? ' [other aspect]' : '';
      const params = capability.params.length ? `\n    values: ${capability.params.map(param => `${param.name} (${param.type})`).join(', ')}` : '';
      const paths = capability.paths.length && !capability.paths.every(path => path === 'json') ? ` [paths: ${capability.paths.join(', ')}]` : '';
      lines.push(`  - ${capability.id}: ${capability.description}${shape}${paths}${usable}${params}`);
    }
  }
  if (!fit.allowReact && lines.some(line => line.startsWith('React'))) {
    lines.push('(React components are listed for reference; another command produces React videos.)');
  }
  return lines.join('\n');
}
