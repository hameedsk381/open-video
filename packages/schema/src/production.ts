import { z } from 'zod';
import { colorPattern } from './variables';
import { assetSchema, assetLinkProblems } from './assets';
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

/**
 * What a reference is FOR. A video model is given several pictures and has to be told which is the person, which is the place, which is the
 * wardrobe and which is the first frame; a list of ids cannot say. "reference" is a picture with no particular job.
 */
export const referenceRoles = ['reference', 'character', 'wardrobe', 'environment', 'product', 'style', 'storyboard', 'motion', 'first_frame', 'last_frame', 'voice', 'music', 'sfx'] as const;
export type ReferenceRole = typeof referenceRoles[number];

/** An asset id on its own (the role is "reference"), or the id with the role it plays. Both forms are valid everywhere a reference is. */
export const referenceSchema = z.union([
  z.string().min(1),
  z.object({ asset: z.string().min(1), role: z.enum(referenceRoles).default('reference') }),
]);
export type Reference = z.infer<typeof referenceSchema>;
export const referenceAssetId = (reference: Reference): string => (typeof reference === 'string' ? reference : reference.asset);
/** The role a reference plays; a bare id plays `fallback` (a caller that knows the owner, such as a character, passes the natural role). */
export const referenceRole = (reference: Reference, fallback: ReferenceRole = 'reference'): ReferenceRole => (typeof reference === 'string' ? fallback : reference.role);
const references = (description: string) => z.array(referenceSchema).default([]).describe(description);

// What kind of file a role can be: a first frame is a picture or a clip, never a sound; a voice is never a picture.
const visualAssets = ['image', 'video', 'svg'];
const roleNeeds: Partial<Record<ReferenceRole, readonly string[]>> = {
  character: visualAssets, wardrobe: visualAssets, environment: visualAssets, product: visualAssets, style: visualAssets, storyboard: visualAssets,
  first_frame: visualAssets, last_frame: visualAssets, motion: ['video'], voice: ['audio'], music: ['audio'], sfx: ['audio'],
};

/** A recurring person, with the references that keep them recognisable across shots. */
export const productionCharacterSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.string().optional().describe('Protagonist, narrator, supporting'),
  description: z.string().min(1).describe('Who they are, in a sentence or two'),
  appearance: z.string().optional().describe('Face, build, age, distinguishing features'),
  wardrobe: z.array(z.string().min(1)).default([]).describe('Outfits, in order of use'),
  personality: z.string().optional(),
  referenceAssets: references('The approved character references (portraits, angles, expressions): an asset id, or { asset, role }'),
  voice: z.object({ engine: z.string().optional(), id: z.string().optional().describe('Provider voice id'), description: z.string().optional().describe('How they sound') }).optional(),
});

/** A place the production returns to. */
export const productionEnvironmentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  referenceAssets: references('The approved location references: an asset id, or { asset, role }'),
});

/** An object that has to look the same every time it appears. */
export const productionPropSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  referenceAssets: references('The approved prop references: an asset id, or { asset, role }'),
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
  referenceAssets: references('The references sent with the request: an asset id, or { asset, role }'),
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

export const acquisitionStrategies = ['retrieve', 'source', 'generate', 'procedural'] as const;
export const requirementRoles = [...referenceRoles.filter(role => role !== 'reference'), 'footage', 'image', 'audio', 'graphic'] as const;
export const requirementStatuses = ['missing', 'candidate', 'approved'] as const;

/**
 * What a shot, a character, a place or a beat NEEDS, written down before a file exists. It is how a production knows what is missing:
 * the plan says "the engineer's side profile, retrieved from the client's photos" and stays red until an approved asset fills it.
 * retrieve: the original from its owner (an exact logo, the real product); source: licensed or archival material; generate: a model makes it;
 * procedural: drawn by code (a chart, a diagram, typography).
 */
export const assetRequirementSchema = z.object({
  id: z.string().min(1),
  purpose: z.object({
    shotId: z.string().min(1).optional(),
    entityId: z.string().min(1).optional().describe('A character, environment or prop: the need then applies to every shot that uses it'),
    beatId: z.string().min(1).optional(),
  }).refine(purpose => purpose.shotId !== undefined || purpose.entityId !== undefined || purpose.beatId !== undefined, 'A requirement is for a shot, an entity or a beat'),
  role: z.enum(requirementRoles),
  strategy: z.enum(acquisitionStrategies),
  instruction: z.string().optional().describe('In words: "the client\'s own product photography", "a wide shot of the office at dusk"'),
  assetId: z.string().min(1).optional().describe('The asset that fills it'),
  status: z.enum(requirementStatuses).default('missing'),
});
export type AssetRequirement = z.infer<typeof assetRequirementSchema>;

// What kind of file fills each requirement that is not a reference role.
const requirementNeeds: Record<string, readonly string[]> = { footage: ['video'], image: ['image', 'svg'], audio: ['audio'], graphic: ['svg', 'image', 'lottie'] };

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
  requirements: z.array(assetRequirementSchema).default([]).describe('What the production needs, before it exists: the plan\'s list of assets to retrieve, source, generate or draw'),
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
  for (const problem of assetLinkProblems(production.assets)) ctx.addIssue({ code: 'custom', path: ['assets', production.assets.findIndex(asset => asset.id === problem.assetId)], message: problem.message });

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
  // Every reference must name a declared asset, appear once per role, and be the kind of file its role needs.
  const assetById = new Map(production.assets.map(asset => [asset.id, asset]));
  const checkReferences = (subject: string, verb: string, refs: Reference[], path: (string | number)[]) => {
    const seen = new Set<string>();
    refs.forEach((reference, position) => {
      const id = referenceAssetId(reference), role = referenceRole(reference), at = [...path, position], asset = assetById.get(id);
      if (!asset) { ctx.addIssue({ code: 'custom', path: at, message: `${subject} ${verb} asset "${id}", which is not in assets` }); return; }
      const key = `${id}\u0000${role}`;
      if (seen.has(key)) ctx.addIssue({ code: 'custom', path: at, message: `${subject} lists asset "${id}" twice as ${role}` });
      seen.add(key);
      const needs = roleNeeds[role];
      if (needs && !needs.includes(asset.type)) ctx.addIssue({ code: 'custom', path: at, message: `${subject} uses asset "${id}" (${asset.type}) as ${role}, which needs ${needs.join(' or ')}` });
    });
  };
  production.characters.forEach((character, index) => checkReferences(`Character "${character.id}"`, 'references', character.referenceAssets, ['characters', index, 'referenceAssets']));
  production.environments.forEach((environment, index) => checkReferences(`Environment "${environment.id}"`, 'references', environment.referenceAssets, ['environments', index, 'referenceAssets']));
  production.props.forEach((prop, index) => checkReferences(`Prop "${prop.id}"`, 'references', prop.referenceAssets, ['props', index, 'referenceAssets']));

  // Requirements: unique, aimed at things that exist, filled only by an asset of the right kind, and honest about their status.
  unique('Requirement', production.requirements, ['requirements']);
  const entityIds = new Set([...characterIds, ...environmentIds, ...propIds]), shotIds = new Set(production.shots.map(shot => shot.id));
  production.requirements.forEach((requirement, index) => {
    const at = (...more: (string | number)[]) => ['requirements', index, ...more], label = `Requirement "${requirement.id}"`;
    const { shotId, entityId, beatId } = requirement.purpose;
    if (shotId !== undefined && !shotIds.has(shotId)) ctx.addIssue({ code: 'custom', path: at('purpose', 'shotId'), message: `${label} is for shot "${shotId}", which is not in shots` });
    if (entityId !== undefined && !entityIds.has(entityId)) ctx.addIssue({ code: 'custom', path: at('purpose', 'entityId'), message: `${label} is for "${entityId}", which is not a character, environment or prop` });
    if (beatId !== undefined && !beatIds.has(beatId)) ctx.addIssue({ code: 'custom', path: at('purpose', 'beatId'), message: `${label} is for beat "${beatId}", which is not in script.beats` });
    const filled = requirement.assetId === undefined ? undefined : assetById.get(requirement.assetId);
    if (requirement.assetId !== undefined && !filled) ctx.addIssue({ code: 'custom', path: at('assetId'), message: `${label} is filled by asset "${requirement.assetId}", which is not in assets` });
    if (requirement.status === 'missing' && requirement.assetId !== undefined) ctx.addIssue({ code: 'custom', path: at('status'), message: `${label} names an asset but is marked missing` });
    if (requirement.status !== 'missing' && requirement.assetId === undefined) ctx.addIssue({ code: 'custom', path: at('assetId'), message: `${label} is ${requirement.status} but names no asset` });
    if (!filled) return;
    const needs = roleNeeds[requirement.role as ReferenceRole] ?? requirementNeeds[requirement.role];
    if (needs && !needs.includes(filled.type)) ctx.addIssue({ code: 'custom', path: at('assetId'), message: `${label} needs ${needs.join(' or ')} for ${requirement.role}, but asset "${filled.id}" is ${filled.type}` });
    if (requirement.status === 'approved' && (filled.status === 'rejected' || filled.status === 'superseded')) ctx.addIssue({ code: 'custom', path: at('assetId'), message: `${label} is approved with asset "${filled.id}", which is ${filled.status}` });
    // An exact logo or product is the owner's, not a model's idea of it.
    if ((requirement.strategy === 'retrieve' || requirement.strategy === 'source') && filled.provenance?.origin === 'generated') ctx.addIssue({ code: 'custom', path: at('assetId'), message: `${label} asks to ${requirement.strategy} the real thing, but asset "${filled.id}" was generated` });
  });

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
      checkReferences(`Shot "${shot.id}"`, 'was generated from', generation.referenceAssets, ['shots', index, 'generation', 'referenceAssets']);
      // A clip has one first frame and one last frame.
      for (const frame of ['first_frame', 'last_frame'] as const) if (generation.referenceAssets.filter(reference => referenceRole(reference) === frame).length > 1) ctx.addIssue({ code: 'custom', path: ['shots', index, 'generation', 'referenceAssets'], message: `Shot "${shot.id}" has more than one ${frame}` });
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
