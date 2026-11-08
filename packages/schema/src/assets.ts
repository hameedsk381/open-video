import { z } from 'zod';

// Shared by composition layers, font assets and production manifests: a weight may be a number or a CSS-ish name.
const fontWeightMap: Record<string, number> = {
  thin: 100, hairline: 100, extralight: 200, ultralight: 200, 'extra-light': 200, 'ultra-light': 200,
  light: 300, regular: 400, medium: 500, semibold: 600, demibold: 600, 'semi-bold': 600, 'demi-bold': 600,
  extrabold: 800, ultrabold: 800, 'extra-bold': 800, 'ultra-bold': 800, black: 900, heavy: 900
};

export const fontWeight = z.preprocess((val: unknown) => {
  if (typeof val === 'string') {
    const s = val.trim().toLowerCase();
    if (/^\d+$/.test(s)) return parseInt(s, 10);
    if (s in fontWeightMap) return fontWeightMap[s];
  }
  return val;
}, z.union([z.number().int().min(1).max(1000), z.enum(['normal', 'bold'])]));

export const fontStyle = z.enum(['normal', 'italic']);

export const assetOrigins = ['upload', 'generated', 'licensed', 'retrieved', 'procedural', 'recorded'] as const;
export const assetStatuses = ['candidate', 'approved', 'rejected', 'superseded'] as const;

/** Where an asset came from and how it was made. A generated asset says which provider made it, so it can be traced and is never mistaken for a source. */
export const assetProvenanceSchema = z.object({
  origin: z.enum(assetOrigins).describe('upload: the person supplied it; generated: a model made it; licensed: stock or a library; retrieved: the original from its owner (a logo, a product photo); procedural: drawn by code; recorded: captured footage or sound'),
  sourceUrl: z.string().optional().describe('Where it was found or bought'),
  creator: z.string().optional(),
  acquiredAt: z.string().optional().describe('ISO date it was obtained or made'),
  provider: z.string().optional().describe('Generated assets: the service that made it'),
  model: z.string().optional(),
  prompt: z.string().optional().describe('Generated assets: what was asked, kept for reproducibility'),
  inputAssetIds: z.array(z.string().min(1)).optional().describe('Assets this one was made from or conditioned on'),
  licenseId: z.string().optional(),
  attribution: z.string().optional().describe('Credit to show where the licence requires one'),
}).superRefine((provenance, ctx) => {
  if (provenance.origin === 'generated' && !provenance.provider?.trim()) ctx.addIssue({ code: 'custom', path: ['provider'], message: 'A generated asset must name the provider that made it' });
});

/** What may be done with an asset. "unknown" is the honest default and is never read as permission. */
export const assetRightsSchema = z.object({
  commercialUse: z.enum(['allowed', 'restricted', 'unknown']).default('unknown'),
  consent: z.enum(['granted', 'not_required', 'unknown']).optional().describe('Identifiable people and voices: has the person agreed to this use?'),
  restrictions: z.array(z.string().min(1)).optional().describe('In words: "editorial use only", "not for ads", "credit the photographer"'),
  expiresAt: z.string().optional().describe('ISO date the licence ends'),
}).superRefine((rights, ctx) => {
  if (rights.expiresAt !== undefined && Number.isNaN(Date.parse(rights.expiresAt))) ctx.addIssue({ code: 'custom', path: ['expiresAt'], message: 'expiresAt must be a date such as 2027-06-30' });
});

/** A media or font file a composition (and a production manifest) can refer to by id. Font assets register a file under `family` (default: the asset id) for that weight and style; text layers then use it by name. The provenance, rights, hash and status fields are optional: the renderer needs only id, type and src. */
export const assetSchema = z.object({ id: z.string().min(1), type: z.enum(['image','video','audio','font','svg','captions','lottie']), src: z.string().min(1), family: z.string().min(1).optional().describe('Font assets: the family name text layers use'), weight: fontWeight.optional().describe('Font assets: the weight this file provides (default 400)'), style: fontStyle.optional().describe('Font assets: normal or italic (default normal)'), metadata: z.record(z.string(), z.unknown()).default({}),
  sha256: z.string().regex(/^[0-9a-f]{64}$/, 'sha256 is 64 lowercase hex digits').optional().describe("Hash of the file's bytes: tells a replaced file from the one that was approved"),
  status: z.enum(assetStatuses).optional().describe('candidate: proposed; approved: cleared for use; rejected; superseded: replaced by a newer version'),
  parentAssetId: z.string().min(1).optional().describe('The asset this is a version or derivative of'),
  provenance: assetProvenanceSchema.optional(),
  rights: assetRightsSchema.optional() });
export type Asset = z.infer<typeof assetSchema>;
export type AssetProvenance = z.infer<typeof assetProvenanceSchema>;
export type AssetRights = z.infer<typeof assetRightsSchema>;

export type AssetNote = { assetId: string; severity: 'info' | 'warning'; code: 'rights-unrecorded' | 'rights-restricted' | 'rights-expired' | 'consent-unknown' | 'hash-mismatch' | 'file-missing'; message: string };

/**
 * What a person should know about the assets before publishing, as notes: nothing here blocks a render. Assets with no recorded
 * rights are an info note (a draft is allowed to have them); restricted or expired rights and unknown consent are warnings.
 */
export function assetNotes(assets: readonly Pick<Asset, 'id' | 'type' | 'rights' | 'provenance'>[], now: Date = new Date()): AssetNote[] {
  const notes: AssetNote[] = [];
  for (const asset of assets) {
    if (asset.type === 'captions' || asset.provenance?.origin === 'procedural') continue;
    const rights = asset.rights;
    if (!rights || rights.commercialUse === 'unknown') notes.push({ assetId: asset.id, severity: 'info', code: 'rights-unrecorded', message: `Asset "${asset.id}" has no recorded rights, so commercial use is unknown` });
    if (rights?.commercialUse === 'restricted') notes.push({ assetId: asset.id, severity: 'warning', code: 'rights-restricted', message: `Asset "${asset.id}" is restricted for commercial use${rights.restrictions?.length ? `: ${rights.restrictions.join('; ')}` : ''}` });
    if (rights?.expiresAt !== undefined && Date.parse(rights.expiresAt) < now.getTime()) notes.push({ assetId: asset.id, severity: 'warning', code: 'rights-expired', message: `The rights to asset "${asset.id}" ended on ${rights.expiresAt}` });
    if (rights?.consent === 'unknown') notes.push({ assetId: asset.id, severity: 'warning', code: 'consent-unknown', message: `Asset "${asset.id}" shows or voices a real person and consent is not recorded` });
  }
  return notes;
}

/** Problems in how assets point at each other: a version of something that is not declared, or of itself. */
export function assetLinkProblems(assets: readonly Pick<Asset, 'id' | 'parentAssetId' | 'provenance'>[]): { assetId: string; message: string }[] {
  const ids = new Set(assets.map(asset => asset.id)), problems: { assetId: string; message: string }[] = [];
  for (const asset of assets) {
    if (asset.parentAssetId !== undefined) {
      if (asset.parentAssetId === asset.id) problems.push({ assetId: asset.id, message: `Asset "${asset.id}" is its own parent` });
      else if (!ids.has(asset.parentAssetId)) problems.push({ assetId: asset.id, message: `Asset "${asset.id}" is a version of "${asset.parentAssetId}", which is not in assets` });
    }
    for (const input of asset.provenance?.inputAssetIds ?? []) if (!ids.has(input)) problems.push({ assetId: asset.id, message: `Asset "${asset.id}" was made from "${input}", which is not in assets` });
  }
  return problems;
}
