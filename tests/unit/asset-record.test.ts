import { describe, expect, it } from 'vitest';
import { assetLinkProblems, assetNotes, assetSchema, compositionSchema, productionSchema } from '@ove/schema';
import { sha256Of } from '@ove/assets';

// Slice 1 of docs/content-and-assets.md: an asset can say where it came from, what may be done with it, and which bytes it is.
const asset = (extra: Record<string, unknown> = {}) => ({ id: 'a', type: 'image', src: 'assets/a.png', ...extra });

describe('the asset record', () => {
  it('keeps every existing asset valid, with none of the new fields filled in', () => {
    const parsed = assetSchema.parse(asset());
    expect(parsed.rights).toBeUndefined();
    expect(parsed.provenance).toBeUndefined();
    expect(parsed.sha256).toBeUndefined();
    expect(parsed.status).toBeUndefined();
  });

  it('carries provenance, rights, hash, status and parent', () => {
    const parsed = assetSchema.parse(asset({
      sha256: sha256Of(Buffer.from('abc')), status: 'approved', parentAssetId: 'root',
      provenance: { origin: 'generated', provider: 'freellmapi', model: 'image-1', prompt: 'a mug', acquiredAt: '2026-11-01T00:00:00Z', inputAssetIds: ['ref'] },
      rights: { commercialUse: 'restricted', consent: 'not_required', restrictions: ['not for ads'], expiresAt: '2027-06-30' },
    }));
    expect(parsed.provenance?.provider).toBe('freellmapi');
    expect(parsed.rights?.restrictions).toEqual(['not for ads']);
    expect(parsed.status).toBe('approved');
  });

  it('reads an unstated commercial use as unknown, never as allowed', () => {
    expect(assetSchema.parse(asset({ rights: {} })).rights?.commercialUse).toBe('unknown');
  });

  it('refuses what cannot be true', () => {
    expect(() => assetSchema.parse(asset({ sha256: 'not-a-hash' }))).toThrow(/64 lowercase hex/);
    expect(() => assetSchema.parse(asset({ sha256: 'A'.repeat(64) }))).toThrow();              // uppercase is a different spelling of the same hash: one form only
    expect(() => assetSchema.parse(asset({ provenance: { origin: 'generated' } }))).toThrow(/name the provider/);
    expect(() => assetSchema.parse(asset({ provenance: { origin: 'made-up' } }))).toThrow();
    expect(() => assetSchema.parse(asset({ rights: { expiresAt: 'next spring' } }))).toThrow(/expiresAt/);
    expect(() => assetSchema.parse(asset({ status: 'maybe' }))).toThrow();
  });

  it('knows the hash of known bytes', () => {
    expect(sha256Of(Buffer.from('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('assetNotes: what to know before publishing', () => {
  const now = new Date('2026-11-08T00:00:00Z');
  const ids = (notes: ReturnType<typeof assetNotes>, code: string) => notes.filter(n => n.code === code).map(n => n.assetId);

  it('says so when rights are not recorded or are unknown, as information', () => {
    const notes = assetNotes([asset() as any, asset({ id: 'b', rights: { commercialUse: 'unknown' } }) as any, asset({ id: 'c', rights: { commercialUse: 'allowed' } }) as any], now);
    expect(ids(notes, 'rights-unrecorded')).toEqual(['a', 'b']);
    expect(notes.every(n => n.severity === 'info')).toBe(true);
  });

  it('warns about restricted and expired rights and unknown consent, and quotes the restrictions', () => {
    const notes = assetNotes([
      asset({ id: 'r', rights: { commercialUse: 'restricted', restrictions: ['editorial use only'] } }) as any,
      asset({ id: 'e', rights: { commercialUse: 'allowed', expiresAt: '2026-01-01' } }) as any,
      asset({ id: 'p', rights: { commercialUse: 'allowed', consent: 'unknown' } }) as any,
      asset({ id: 'ok', rights: { commercialUse: 'allowed', expiresAt: '2027-01-01', consent: 'granted' } }) as any,
    ], now);
    expect(ids(notes, 'rights-restricted')).toEqual(['r']);
    expect(notes.find(n => n.code === 'rights-restricted')?.message).toContain('editorial use only');
    expect(ids(notes, 'rights-expired')).toEqual(['e']);
    expect(ids(notes, 'consent-unknown')).toEqual(['p']);
    expect(notes.filter(n => n.assetId === 'ok')).toEqual([]);
    expect(notes.filter(n => n.severity === 'warning').length).toBe(3);
  });

  it('leaves out captions and assets drawn by code, which have nobody to license from', () => {
    expect(assetNotes([asset({ id: 'c', type: 'captions' }) as any, asset({ id: 'g', provenance: { origin: 'procedural' } }) as any], now)).toEqual([]);
  });
});

describe('assets that point at each other', () => {
  it('reports a parent or an input that is not declared, and an asset that is its own parent', () => {
    const problems = assetLinkProblems([
      { id: 'a', parentAssetId: 'a' }, { id: 'b', parentAssetId: 'missing' }, { id: 'c', provenance: { origin: 'generated', provider: 'p', inputAssetIds: ['gone'] } }, { id: 'd', parentAssetId: 'a' },
    ] as any);
    expect(problems.map(p => p.assetId)).toEqual(['a', 'b', 'c']);
  });

  it('fails a composition and a production that name an asset which is not there', () => {
    const base = { version: '1.0', id: 'x', name: 'x', width: 320, height: 180, fps: 30, durationFrames: 30, scenes: [{ id: 's', name: 's', durationFrames: 30, layers: [] }] };
    expect(compositionSchema.safeParse({ ...base, assets: [asset({ parentAssetId: 'nope' })] }).success).toBe(false);
    expect(compositionSchema.safeParse({ ...base, assets: [asset({ id: 'root' }), asset({ parentAssetId: 'root' })] }).success).toBe(true);
    const production = { id: 'p', name: 'p', brief: { prompt: 'x' }, shots: [{ id: 's1', sceneId: 'sc', action: 'a', durationSeconds: 2 }] };
    expect(productionSchema.safeParse({ ...production, assets: [asset({ parentAssetId: 'nope' })] }).success).toBe(false);
    expect(productionSchema.safeParse({ ...production, assets: [asset({ id: 'root' }), asset({ parentAssetId: 'root' })] }).success).toBe(true);
  });
});
