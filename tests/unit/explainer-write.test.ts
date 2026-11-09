import { describe, expect, it } from 'vitest';
import { explainerPrompt, writeExplainer, type AiProvider } from '@ove/ai';
import { explainerKinds } from '@ove/schema';

// The model only chooses scenes and words. Whatever it answers is checked against the explainer schema, and a reply that does not fit is
// sent back with the exact problems. A scripted stand-in plays the model, so this needs no key.
const valid = { version: '1.0', topic: 'HOW CACHES WORK', scenes: [
  { kind: 'title', lines: ['What is a', 'CACHE', 'really?'], say: 'What is a cache, really?' },
  { kind: 'closing', title: 'Remember hot data', points: ['Keep it close'], say: 'Keep hot data close.' },
] };
const model = (...replies: string[]) => { const seen: any[][] = []; const provider: AiProvider = { id: 'stand-in', model: 'x', baseUrl: '', async chat(messages) { seen.push(messages.map(m => ({ ...m }))); return replies[Math.min(seen.length, replies.length) - 1]!; } }; return { provider, seen }; };

describe('writing an explainer script', () => {
  it('tells the model every scene kind, the language and how many scenes', () => {
    const [system, user] = explainerPrompt('How a cache works', { scenes: 6, language: 'Hinglish (Hindi in Latin letters)' });
    for (const kind of explainerKinds.filter(kind => kind !== 'media')) expect(system!.content as string).toContain(`- ${kind}:`);
    expect(system!.content).toMatch(/About 6 scenes/); expect(system!.content).toMatch(/Hinglish/);
    expect(user!.content).toContain('How a cache works');
  });

  it('offers media scenes only when the video has pictures or footage to show, and only those files', () => {
    const none = explainerPrompt('How a cache works')[0]!.content as string;
    expect(none).not.toContain('- media:'); expect(none).toMatch(/Do not use a media scene/);
    const some = explainerPrompt('How a cache works', { media: ['assets/server-room.mp4', 'assets/chip.jpg'] })[0]!.content as string;
    expect(some).toContain('- media:'); expect(some).toContain('assets/server-room.mp4, assets/chip.jpg'); expect(some).not.toMatch(/Do not use a media scene/);
  });

  it('returns a script that fits, through the fences and prose models add', async () => {
    const { provider } = model('Here you go:\n```json\n' + JSON.stringify(valid) + '\n```');
    const { explainer, attempts } = await writeExplainer(provider, 'caches');
    expect(attempts).toBe(1); expect(explainer.scenes).toHaveLength(2); expect(explainer.handle).toBe('@yourhandle');
  });

  it('sends a script that does not fit back with the exact problems, then takes the fixed one', async () => {
    const broken = { ...valid, scenes: [{ kind: 'flow', sources: ['one'] }, ...valid.scenes] };
    const { provider, seen } = model(JSON.stringify(broken), JSON.stringify(valid));
    const { attempts } = await writeExplainer(provider, 'caches');
    expect(attempts).toBe(2);
    const retry = seen[1]!, last = retry[retry.length - 1].content as string;
    expect(retry.at(-2)).toMatchObject({ role: 'assistant' }); expect(last).toMatch(/scenes\.0\.sources/);
  });

  it('keeps asking for an answer that is not JSON, and gives up with the last problem', async () => {
    const { provider, seen } = model('I cannot do that.', 'Still no.', 'No.');
    await expect(writeExplainer(provider, 'caches', { maxAttempts: 3 })).rejects.toThrow(/after 3 attempts/);
    expect(seen).toHaveLength(3);
  });

  it('puts the chosen voice in the script, and refuses an empty brief', async () => {
    const { provider } = model(JSON.stringify(valid));
    expect((await writeExplainer(provider, 'caches', { voice: 'en-IN-NeerjaNeural' })).explainer.voice).toBe('en-IN-NeerjaNeural');
    await expect(writeExplainer(provider, '   ')).rejects.toThrow(/what the video should explain/);
  });
});
