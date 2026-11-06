import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { assetProblems, composeVideo, maxRetryDelayMs, refineVideo, request, timeoutSignal, type AiProvider } from '@ove/ai';
import { loadComposition } from '@ove/schema';

// An AI-written (or pasted) composition may only refer to files it was given, requests must keep their timeout and a bounded
// retry wait, and the documented model names must be the ones the code uses.
const base = (layers: any[], extra: any = {}) => ({ version: '1.0', id: 'x', name: 'X', width: 640, height: 360, fps: 30, durationFrames: 30,
  scenes: [{ id: 's', name: 'S', startFrame: 0, durationFrames: 30, layers }], ...extra });
const words = { id: 't', type: 'text', content: 'Hello there', x: 20, y: 20, fontSize: 48 };
const picture = (src: string) => ({ id: 'pic', type: 'image', src, width: 100, height: 100 });
const provider = (response: unknown): AiProvider => ({ id: 'fake', model: 'fake-1', baseUrl: 'fake://', chat: async () => JSON.stringify(response) });
const brief = { width: 640, height: 360, fps: 30, durationSeconds: 1, brief: 'a test', maxAttempts: 1 };

describe('compose only uses supplied files', () => {
  it.each([
    ['a layer', base([picture('C:/Users/x/private.png'), words])],
    ['a picture inside html markup', base([{ id: 'card', type: 'html', width: 200, height: 100, html: '<img src="C:/Users/x/private.png">' }, words])],
    ['a declared asset', base([picture('bg'), words], { assets: [{ id: 'bg', type: 'image', src: '/home/x/secret.png' }] })],
    ['the soundtrack', base([words], { export: { audio: '/home/x/music.wav' } })],
  ])('refuses %s pointing at a file nobody supplied', async (_name, composition) => {
    await expect(composeVideo(provider(composition), brief)).rejects.toThrow(/not one of the supplied assets/);
  });

  it('accepts supplied assets and built-in sounds, restoring how the supplied path is written', async () => {
    const response = base([picture('logo'), words, { id: 'pop', type: 'audio', src: 'sfx:pop' }], { assets: [{ id: 'logo', type: 'image', src: './assets/logo.png' }] });
    const result = await composeVideo(provider(response), { ...brief, assets: [{ id: 'logo', type: 'image', src: 'assets/logo.png' }] });
    expect(result.composition.assets).toMatchObject([{ id: 'logo', src: 'assets/logo.png' }]);
  });
});

describe('refine only uses what the composition has or was newly supplied', () => {
  const current = base([picture('logo'), words], { assets: [{ id: 'logo', type: 'image', src: 'assets/logo.png' }] });
  const options = { instruction: 'change it', maxAttempts: 1 };

  it('keeps using what is already there', async () => {
    const response = structuredClone(current); response.scenes[0]!.layers[1] = { ...words, content: 'Changed' };
    const result = await refineVideo(provider(response), current, options);
    expect((result.composition.scenes[0]!.layers[1] as any).content).toBe('Changed');
  });

  it('refuses a new file nobody supplied, on a layer or as an asset', async () => {
    const layer = structuredClone(current); layer.scenes[0]!.layers.push({ ...picture('C:/Users/x/private.png'), id: 'leak' });
    await expect(refineVideo(provider(layer), current, options)).rejects.toThrow(/Layer "leak" uses src "C:\/Users\/x\/private.png"/);
    const asset = structuredClone(current); asset.assets.push({ id: 'extra', type: 'image', src: '/etc/hosts' });
    await expect(refineVideo(provider(asset), current, options)).rejects.toThrow(/Asset "extra"/);
  });

  it('accepts a newly supplied asset', async () => {
    const response = structuredClone(current); response.assets.push({ id: 'photo', type: 'image', src: 'assets/photo.jpg' }); response.scenes[0]!.layers.push({ ...picture('photo'), id: 'photo-layer' });
    const result = await refineVideo(provider(response), current, { ...options, assets: [{ id: 'photo', src: 'assets/photo.jpg' }] });
    expect(result.composition.assets).toHaveLength(2);
  });

  it('understands templates in the composition it is changing', async () => {
    const templated = base([picture('pic'), words], { variables: { photo: { type: 'string', default: 'assets/a.png' } }, assets: [{ id: 'pic', type: 'image', src: '{{photo}}' }] });
    const result = await refineVideo(provider(templated), templated, options);
    expect(result.composition.assets[0]!.src).toBe('assets/a.png');
  });
});

describe('pasted compositions stay inside their project', () => {
  const problems = (src: string) => assetProblems(loadComposition(base([picture(src), words])), { assets: new Map(), relativeInside: true });
  it.each(['C:/x/a.png', 'C:\\x\\a.png', '/etc/a.png', '\\\\server\\share\\a.png', '../a.png', 'assets/../../a.png', 'https://x.test/a.png', 'data:image/png;base64,AAAA', 'file:///x.png'])('refuses %s', src => {
    expect(problems(src)).toHaveLength(1);
  });
  it.each(['assets/a.png', 'a.png', './assets/a.png'])('accepts %s', src => { expect(problems(src)).toEqual([]); });
});

describe('requests', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('still time out when the caller passes a signal, and still stop when the caller aborts', async () => {
    const signal = timeoutSignal(new AbortController().signal, 30);
    expect(signal.aborted).toBe(false); await delay(120); expect(signal.aborted).toBe(true);
    const caller = new AbortController(), combined = timeoutSignal(caller.signal, 60_000); caller.abort(); expect(combined.aborted).toBe(true);
    expect(timeoutSignal(undefined, 30).aborted).toBe(false);
  });

  it('cap the wait before a retry, whatever Retry-After asks for', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('slow down', { status: 429, headers: { 'retry-after': '3600' } })).mockResolvedValueOnce(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock); vi.useFakeTimers();
    const pending = request('http://x.test', {}, 'Test');
    await vi.advanceTimersByTimeAsync(maxRetryDelayMs);
    expect((await pending).status).toBe(200); expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('stop waiting for a retry when aborted', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('slow down', { status: 429, headers: { 'retry-after': '3600' } }));
    vi.stubGlobal('fetch', fetchMock); vi.useFakeTimers();
    const controller = new AbortController(), rejected = expect(request('http://x.test', { signal: controller.signal }, 'Test')).rejects.toThrow(/Test failed: stop now/);
    await vi.advanceTimersByTimeAsync(1000); controller.abort(new Error('stop now')); await rejected;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('documentation', () => {
  it('documents the provider env vars the code reads', () => {
    const source = readFileSync('packages/ai/src/providers.ts', 'utf8'), docs = readFileSync('docs/ai.md', 'utf8');
    for (const variable of ['OVE_AI_MODEL', 'OVE_AI_TRANSCRIPTION_MODEL', 'OVE_AI_IMAGE_MODEL']) {
      expect(source, `${variable} read in providers.ts`).toContain(variable);
      expect(docs, `${variable} in docs/ai.md`).toContain(variable);
    }
  });
});
