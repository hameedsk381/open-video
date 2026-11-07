import { z } from 'zod';
import { colorPattern } from './variables';
import { assetSchema } from './assets';
import { contentSchema } from './content';
import { textureTypes, transitionStyles } from './design';

// The production manifest: what the film is meant to be, before anything is rendered. A composition is the resolved
// timeline; this is the brief, script, cast, locations and shot list that a composition is compiled from. The two are
// deliberately separate — a shot can be regenerated, reordered or dropped without rewriting the rendering timeline,
// and the same manifest can be compiled again once new footage is approved.

export const productionTypes = ['motion-graphics', 'cinematic', 'story', 'commercial', 'explainer', 'music-video', 'hybrid'] as const;
export const generationStatuses = ['planned', 'queued', 'generating', 'completed', 'failed', 'approved', 'rejected'] as const;
export const approvalStages = ['script', 'characters', 'storyboard', 'preview', 'final'] as const;

const color = z.string().regex(colorPattern);
const list = (description: string) => z.array(z.string().min(1)).default([]).describe(description);

/** A recurring person, with the references that keep them recognisable across shots. */
export const productionCharacterSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.string().optional().describe('Protagonist, narrator, supporting'),
  description: z.string().min(1).describe('Who they are, in a sentence or two'),
  appearance: z.string().optional().describe('Face, build, age, distinguishing features'),
  wardrobe: z.array(z.string().min(1)).default([]).describe('Outfits, in order of use'),
  personality: z.string().optional(),
  referenceAssets: list('Asset ids of the approved character references (portraits, angles, expressions)'),
  voice: z.object({ engine: z.string().optional(), id: z.string().optional().describe('Provider voice id'), description: z.string().optional().describe('How they sound') }).optional(),
});

/** A place the production returns to. */
export const productionEnvironmentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  referenceAssets: list('Asset ids of the approved location references'),
});

/** An object that has to look the same every time it appears. */
export const productionPropSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  referenceAssets: list('Asset ids of the approved prop references'),
});

export const shotCameraSchema = z.object({
  shotSize: z.string().min(1).default('medium').describe('extreme wide, wide, medium, close-up, insert…'),
  angle: z.string().min(1).default('eye-level').describe('eye level, high, low, overhead, dutch'),
  movement: z.string().min(1).default('static').describe('static, pan, tilt, dolly, track, crane, handheld, zoom'),
}).default({ shotSize: 'medium', angle: 'eye-level', movement: 'static' });

/** The shot's own picture: a file on disk, an asset id, or a URL. */
export const shotMediaSchema = z.object({
  image: z.string().min(1).optional(),
  video: z.string().min(1).optional(),
  fit: z.enum(['cover', 'contain', 'fill']).default('cover').describe('How the picture fills the frame'),
  audio: z.boolean().default(true).describe('Play the clip\'s own sound; false when narration covers it'),
}).superRefine((media, ctx) => {
  if ((media.image === undefined) === (media.video === undefined)) ctx.addIssue({ code: 'custom', path: ['media'], message: 'A shot media block needs exactly one of "image" or "video"' });
}).describe('Footage or a still for this shot. Leave it out while the shot is still a plan; compile renders a text card from onScreen instead.');

export const shotGenerationSchema = z.object({
  provider: z.string().optional(),
  model: z.string().optional(),
  prompt: z.string().optional().describe('What was asked of the generator, kept for reproducibility'),
  negativePrompt: z.string().optional(),
  status: z.enum(generationStatuses).default('planned'),
  jobId: z.string().optional().describe('The provider\'s async job id'),
  assetId: z.string().optional().describe('The registered asset this shot\'s footage lives in'),
  referenceAssets: list('Asset ids of the references sent with the request'),
  cost: z.number().nonnegative().optional(),
  generatedAt: z.string().optional().describe('ISO date the clip was produced'),
  error: z.string().optional().describe('Why the last attempt failed'),
}).superRefine((generation, ctx) => {
  if (generation.status === 'approved' && !generation.assetId) ctx.addIssue({ code: 'custom', path: ['assetId'], message: 'An approved shot needs the assetId of the take that was approved' });
}).describe('Provenance for a generated clip. Compile renders the assetId only once its status is approved.');

export const productionShotSchema = z.object({
  id: z.string().min(1),
  sceneId: z.string().min(1).describe('The narrative scene this shot belongs to; consecutive shots sharing it form one scene group'),
  name: z.string().optional().describe('A working name, e.g. "Breakthrough — over the shoulder"'),
  action: z.string().min(1).describe('What happens on screen, and the physical action'),
  emotion: z.string().optional().describe('What the shot should make the viewer feel'),
  durationSeconds: z.number().positive().describe('Screen time for this shot, in seconds'),
  characterIds: list('Characters visible in this shot'),
  environmentId: z.string().optional(),
  propIds: list('Props visible in this shot'),
  onScreen: z.string().optional().describe('Copy shown on screen: a title, a caption, a figure'),
  beatId: z.string().optional().describe('The script beat this shot renders'),
  camera: shotCameraSchema,
  media: shotMediaSchema.optional(),
  generation: shotGenerationSchema.optional(),
  transition: z.enum(transitionStyles).optional().describe('How this shot enters; the default is a cut'),
  audio: z.object({ src: z.string().min(1).describe('An asset id or a path to a dialogue or effect clip'), volume: z.number().min(0).max(4).default(1) }).optional(),
});

export const productionStyleSchema = z.object({
  genre: z.string().optional(),
  visualLanguage: z.string().optional().describe('The look in words: references, references, texture, lens'),
  lighting: z.string().optional(),
  cameraLanguage: z.string().optional(),
  motion: z.string().optional(),
  transition: z.enum(transitionStyles).optional(),
  texture: z.enum(textureTypes).optional(),
  palette: z.object({ bg: color, surface: color, text: color, muted: color, accent: color, accent2: color }).partial().optional(),
  fonts: z.object({ display: z.string().optional(), body: z.string().optional() }).optional(),
});

export const productionAudioSchema = z.object({
  music: z.string().optional().describe('An asset id or a path to the soundtrack; looped under the whole film'),
  volume: z.number().min(0).max(4).default(1),
  duck: z.boolean().default(true).describe('Lower the music under narration and effects'),
});

export const productionApprovalSchema = z.object({
  stage: z.enum(approvalStages),
  approved: z.boolean(),
  at: z.string().optional().describe('ISO date of the decision'),
  note: z.string().optional(),
});

export const productionExportSchema = z.object({
  format: z.enum(['mp4', 'webm', 'mov']).optional(),
  loudness: z.number().min(-40).max(-5).optional().describe('Target loudness in LUFS, e.g. -16 for spoken explainers'),
  grain: z.number().min(0).max(1).optional().describe('Film grain over the whole frame, e.g. 0.06'),
});

export const productionSchema = z.object({
  version: z.literal('1.0').default('1.0'),
  id: z.string().min(1),
  name: z.string().min(1),
  productionType: z.enum(productionTypes).default('hybrid'),
  brief: z.object({
    prompt: z.string().min(1).describe('The request in the user\'s own words'),
    audience: z.string().optional(),
    goal: z.string().optional(),
    targetDurationSeconds: z.number().positive().optional(),
    notes: z.string().optional(),
  }),
  format: z.object({ width: z.number().int().positive().default(1920), height: z.number().int().positive().default(1080), fps: z.number().int().positive().max(240).default(30) }).default({ width: 1920, height: 1080, fps: 30 }),
  style: productionStyleSchema.optional(),
  script: contentSchema.optional().describe('The validated content block: beats, narration, figures and their sources'),
  characters: z.array(productionCharacterSchema).default([]),
  environments: z.array(productionEnvironmentSchema).default([]),
  props: z.array(productionPropSchema).default([]),
  shots: z.array(productionShotSchema).min(1),
  assets: z.array(assetSchema).default([]),
  audio: productionAudioSchema.optional(),
  export: productionExportSchema.optional(),
  approvals: z.array(productionApprovalSchema).default([]),
}).superRefine((production, ctx) => {
  const unique = (label: string, items: { id: string }[], at: (string | number)[]) => items.forEach((item, index) => {
    if (items.findIndex(other => other.id === item.id) !== index) ctx.addIssue({ code: 'custom', path: [...at, index, 'id'], message: `${label} id "${item.id}" is used twice` });
  });
  unique('Character', production.characters, ['characters']);
  unique('Environment', production.environments, ['environments']);
  unique('Prop', production.props, ['props']);
  unique('Shot', production.shots, ['shots']);
  unique('Asset', production.assets, ['assets']);

  const characterIds = new Set(production.characters.map(c => c.id));
  const environmentIds = new Set(production.environments.map(e => e.id));
  const propIds = new Set(production.props.map(p => p.id));
  const assetIds = new Set(production.assets.map(a => a.id));
  const beatIds = new Set((production.script?.beats ?? []).map(b => b.id));

  // A reference must be an id declared here; footage, audio and music may be a declared id or a path on disk.
  const source = (value: string) => {
    if (assetIds.has(value)) return true;
    return /[./\\:]/.test(value);
  };
  production.characters.forEach((character, index) => character.referenceAssets.forEach((id, position) => {
    if (!assetIds.has(id)) ctx.addIssue({ code: 'custom', path: ['characters', index, 'referenceAssets', position], message: `Character "${character.id}" references asset "${id}", which is not in assets` });
  }));
  production.environments.forEach((environment, index) => environment.referenceAssets.forEach((id, position) => {
    if (!assetIds.has(id)) ctx.addIssue({ code: 'custom', path: ['environments', index, 'referenceAssets', position], message: `Environment "${environment.id}" references asset "${id}", which is not in assets` });
  }));
  production.props.forEach((prop, index) => prop.referenceAssets.forEach((id, position) => {
    if (!assetIds.has(id)) ctx.addIssue({ code: 'custom', path: ['props', index, 'referenceAssets', position], message: `Prop "${prop.id}" references asset "${id}", which is not in assets` });
  }));

  production.shots.forEach((shot, index) => {
    for (const id of shot.characterIds) if (!characterIds.has(id)) ctx.addIssue({ code: 'custom', path: ['shots', index, 'characterIds'], message: `Shot "${shot.id}" uses character "${id}", which is not in characters` });
    if (shot.environmentId !== undefined && !environmentIds.has(shot.environmentId)) ctx.addIssue({ code: 'custom', path: ['shots', index, 'environmentId'], message: `Shot "${shot.id}" uses environment "${shot.environmentId}", which is not in environments` });
    for (const id of shot.propIds) if (!propIds.has(id)) ctx.addIssue({ code: 'custom', path: ['shots', index, 'propIds'], message: `Shot "${shot.id}" uses prop "${id}", which is not in props` });
    if (shot.beatId !== undefined && !beatIds.has(shot.beatId)) ctx.addIssue({ code: 'custom', path: ['shots', index, 'beatId'], message: production.script ? `Shot "${shot.id}" renders beat "${shot.beatId}", which is not in script.beats` : `Shot "${shot.id}" names beat "${shot.beatId}" but the production has no script` });
    const media = shot.media;
    if (media?.image !== undefined && !source(media.image)) ctx.addIssue({ code: 'custom', path: ['shots', index, 'media', 'image'], message: `"${media.image}" is neither an asset id nor a path (ids are declared in assets; paths contain a dot or a slash)` });
    if (media?.video !== undefined && !source(media.video)) ctx.addIssue({ code: 'custom', path: ['shots', index, 'media', 'video'], message: `"${media.video}" is neither an asset id nor a path (ids are declared in assets; paths contain a dot or a slash)` });
    if (shot.audio && !source(shot.audio.src)) ctx.addIssue({ code: 'custom', path: ['shots', index, 'audio', 'src'], message: `"${shot.audio.src}" is neither an asset id nor a path` });
    const generation = shot.generation;
    if (generation) {
      for (const id of generation.referenceAssets) if (!assetIds.has(id)) ctx.addIssue({ code: 'custom', path: ['shots', index, 'generation', 'referenceAssets'], message: `Shot "${shot.id}" was generated from asset "${id}", which is not in assets` });
      if (generation.assetId !== undefined && !assetIds.has(generation.assetId)) ctx.addIssue({ code: 'custom', path: ['shots', index, 'generation', 'assetId'], message: `Shot "${shot.id}" approved asset "${generation.assetId}", which is not in assets` });
    }
  });

  if (production.audio?.music !== undefined && !source(production.audio.music)) ctx.addIssue({ code: 'custom', path: ['audio', 'music'], message: `"${production.audio.music}" is neither an asset id nor a path` });

  const stages = new Set<string>();
  production.approvals.forEach((approval, index) => {
    if (stages.has(approval.stage)) ctx.addIssue({ code: 'custom', path: ['approvals', index, 'stage'], message: `The ${approval.stage} checkpoint is recorded twice` });
    stages.add(approval.stage);
  });
});

export type Production = z.infer<typeof productionSchema>;
export type ProductionShot = z.infer<typeof productionShotSchema>;
export type ProductionCharacter = z.infer<typeof productionCharacterSchema>;
export type ProductionEnvironment = z.infer<typeof productionEnvironmentSchema>;
export type ProductionStyle = z.infer<typeof productionStyleSchema>;
