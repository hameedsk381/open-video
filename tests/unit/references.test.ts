import { describe, expect, it } from 'vitest';
import { productionSchema, referenceAssetId, referenceRole } from '@ove/schema';

// Slice 2 of docs/content-and-assets.md: a reference says what it is for, so a generator can be told which picture is the person,
// which is the place and which is the first frame.
const assets = [
  { id: 'face', type: 'image', src: 'a/face.png' }, { id: 'room', type: 'image', src: 'a/room.png' }, { id: 'walk', type: 'video', src: 'a/walk.mp4' },
  { id: 'voice1', type: 'audio', src: 'a/voice.mp3' }, { id: 'logo', type: 'svg', src: 'a/logo.svg' },
];
const production = (extra: Record<string, unknown> = {}) => ({
  id: 'p', name: 'p', brief: { prompt: 'x' }, assets,
  characters: [{ id: 'may', name: 'May', description: 'an engineer' }],
  shots: [{ id: 's1', sceneId: 'sc', action: 'May walks in', durationSeconds: 3, characterIds: ['may'] }],
  ...extra,
});
const withCharacterRefs = (referenceAssets: unknown[]) => production({ characters: [{ id: 'may', name: 'May', description: 'an engineer', referenceAssets }] });
const withGeneration = (referenceAssets: unknown[]) => production({ shots: [{ id: 's1', sceneId: 'sc', action: 'a', durationSeconds: 3, generation: { status: 'queued', referenceAssets } }] });
const messages = (raw: unknown) => { const r = productionSchema.safeParse(raw); return r.success ? [] : r.error.issues.map(issue => issue.message); };

describe('role-tagged references', () => {
  it('accepts a bare id, as every existing manifest writes it, and an id with a role', () => {
    expect(productionSchema.safeParse(withCharacterRefs(['face'])).success).toBe(true);
    expect(productionSchema.safeParse(withCharacterRefs([{ asset: 'face', role: 'character' }, { asset: 'room', role: 'environment' }, 'logo'])).success).toBe(true);
  });

  it('defaults an object without a role to "reference"', () => {
    const parsed = productionSchema.parse(withCharacterRefs([{ asset: 'face' }]));
    expect(parsed.characters[0]!.referenceAssets[0]).toEqual({ asset: 'face', role: 'reference' });
  });

  it('reads the id and the role from either form, and gives a bare id the role the caller knows', () => {
    expect(referenceAssetId('face')).toBe('face');
    expect(referenceAssetId({ asset: 'room', role: 'environment' })).toBe('room');
    expect(referenceRole('face')).toBe('reference');
    expect(referenceRole('face', 'character')).toBe('character');
    expect(referenceRole({ asset: 'face', role: 'wardrobe' }, 'character')).toBe('wardrobe');
  });

  it('refuses an unknown role', () => {
    expect(productionSchema.safeParse(withCharacterRefs([{ asset: 'face', role: 'hero' }])).success).toBe(false);
  });

  it('still names an asset that is not declared, in the original words', () => {
    expect(messages(withCharacterRefs(['nope']))).toEqual(['Character "may" references asset "nope", which is not in assets']);
    expect(messages(withCharacterRefs([{ asset: 'nope', role: 'character' }]))).toEqual(['Character "may" references asset "nope", which is not in assets']);
    expect(messages(withGeneration(['nope']))).toEqual(['Shot "s1" was generated from asset "nope", which is not in assets']);
  });
});

describe('a role needs the right kind of file', () => {
  it('rejects a sound as a picture role and a picture as a sound role', () => {
    expect(messages(withGeneration([{ asset: 'voice1', role: 'first_frame' }]))).toEqual(['Shot "s1" uses asset "voice1" (audio) as first_frame, which needs image or video or svg']);
    expect(messages(withGeneration([{ asset: 'face', role: 'voice' }]))).toEqual(['Shot "s1" uses asset "face" (image) as voice, which needs audio']);
    expect(messages(withGeneration([{ asset: 'face', role: 'music' }]))).toHaveLength(1);
  });

  it('wants a clip for motion, and accepts a picture, a clip or a vector for the picture roles', () => {
    expect(messages(withGeneration([{ asset: 'face', role: 'motion' }]))).toEqual(['Shot "s1" uses asset "face" (image) as motion, which needs video']);
    expect(messages(withGeneration([{ asset: 'walk', role: 'motion' }, { asset: 'face', role: 'character' }, { asset: 'walk', role: 'first_frame' }, { asset: 'logo', role: 'product' }]))).toEqual([]);
  });

  it('puts no limit on the generic role or on a bare id', () => {
    expect(messages(withGeneration([{ asset: 'voice1', role: 'reference' }, 'face', 'walk']))).toEqual([]);
  });
});

describe('one asset, one role, once', () => {
  it('allows the same asset in two different roles but not twice in the same one', () => {
    expect(messages(withGeneration([{ asset: 'face', role: 'character' }, { asset: 'face', role: 'first_frame' }]))).toEqual([]);
    expect(messages(withGeneration([{ asset: 'face', role: 'character' }, { asset: 'face', role: 'character' }]))).toEqual(['Shot "s1" lists asset "face" twice as character']);
    expect(messages(withCharacterRefs(['face', 'face']))).toEqual(['Character "may" lists asset "face" twice as reference']);
  });

  it('allows one first frame and one last frame in a generation, not two of either', () => {
    expect(messages(withGeneration([{ asset: 'face', role: 'first_frame' }, { asset: 'room', role: 'last_frame' }]))).toEqual([]);
    expect(messages(withGeneration([{ asset: 'face', role: 'first_frame' }, { asset: 'room', role: 'first_frame' }]))).toEqual(['Shot "s1" has more than one first_frame']);
  });
});
