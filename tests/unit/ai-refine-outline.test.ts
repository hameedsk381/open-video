import { describe, expect, it } from 'vitest';
import { compositionOutline, refineOutlineChars, refineVideo, type AiProvider, type ChatMessage } from '@ove/ai';

// A big composition (a template video, say) is shown to the model as an outline and changed by fixes, so a refine costs a few
// thousand tokens instead of the whole file, and a failed attempt does not send the whole file back again.
const layers = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `t${i}`, type: 'text', content: `Line number ${i} of the big composition`, x: 10, y: 10 + i * 4, fontSize: 24, color: '#ff8800',
  animations: [{ property: 'opacity', keyframes: [{ frame: 0, value: 0 }, { frame: 10, value: 1 }] }, { property: 'y', keyframes: [{ frame: 0, value: 20 }, { frame: 10, value: 0 }] }] }));
const big = { version: '1.0', id: 'big', name: 'Big', width: 640, height: 360, fps: 30, durationFrames: 60, variables: { accent: { type: 'color', default: '#ff8800' } },
  scenes: [{ id: 's', name: 'S', startFrame: 0, durationFrames: 60, layers: layers(160) }] };
const small = { ...big, scenes: [{ ...big.scenes[0], layers: layers(2) }] };
const scripted = (...replies: unknown[]): AiProvider & { seen: ChatMessage[][] } => { const seen: ChatMessage[][] = []; let at = 0;
  return { id: 'fake', model: 'fake-1', baseUrl: 'fake://', seen, chat: async messages => { seen.push(structuredClone(messages)); const reply = replies[Math.min(at++, replies.length - 1)]; return JSON.stringify(reply); } }; };

describe('refine a large composition', () => {
  it('is large enough to need an outline, and the outline is much smaller', () => {
    expect(JSON.stringify(big).length).toBeGreaterThan(refineOutlineChars); expect(JSON.stringify(small).length).toBeLessThan(refineOutlineChars);
    const outline = compositionOutline(big);
    expect(outline).toContain('scenes[0].layers[3] text id=t3 content="Line number 3 of the big composition"');
    expect(outline).toContain('animates=opacity+y');
    expect(outline.length).toBeLessThan(JSON.stringify(big).length * 0.6);
  });

  it('sends the outline, applies the fixes it gets back, and leaves the rest alone', async () => {
    const provider = scripted({ fixes: [{ path: 'scenes[0].layers[3].content', value: 'Changed line' }, { path: 'scenes[0].layers[4].color', value: '#ffcc00' }] });
    const result = await refineVideo(provider, big, { instruction: 'change line 3', maxAttempts: 2 });
    const first = String(provider.seen[0]![1]!.content);
    expect(first).toContain('outline'); expect(first).toContain('scenes[0].layers[3]'); expect(first).not.toContain('"keyframes"'); expect(first.length).toBeLessThan(JSON.stringify(big, null, 2).length / 3);
    const edited = result.composition.scenes[0]!.layers as any[];
    expect(edited[3].content).toBe('Changed line'); expect(edited[4].color).toBe('#ffcc00'); expect(edited[5].content).toBe('Line number 5 of the big composition');
    expect(result.attempts).toBe(1);
  });

  it('answers a bad fix with a short message, not the whole composition', async () => {
    const provider = scripted({ fixes: [{ path: 'scenes[9].layers[0].content', value: 'x' }] }, { fixes: [{ path: 'scenes[0].layers[0].content', value: 'Fixed' }] });
    const result = await refineVideo(provider, big, { instruction: 'change the first line', maxAttempts: 3 });
    expect(result.attempts).toBe(2);
    const retry = provider.seen[1]!, feedback = String(retry.at(-1)!.content);
    expect(feedback).toMatch(/nothing at/); expect(feedback).toMatch(/paths from the outline/);
    expect(retry.slice(1).map(message => message.content).join('\n')).not.toContain('"keyframes"');
    expect((result.composition.scenes[0]!.layers as any[])[0].content).toBe('Fixed');
  });

  it('still shows a small composition in full and accepts a complete one back', async () => {
    const provider = scripted(small);
    await refineVideo(provider, small, { instruction: 'no change', maxAttempts: 1 });
    expect(String(provider.seen[0]![1]!.content)).toContain('Here is an existing valid OVE composition JSON');
  });
});
