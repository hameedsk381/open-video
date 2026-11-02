import { describe, it, expect } from 'vitest';
import { createPagePool, isDrawingError } from '../../packages/renderer/src/pool';
// Fake pages: numbered, with a record of which were thrown away.
const pages = () => { let next = 0; const discarded: number[] = []; return { discarded, opened: () => next, open: async () => next++, discard: async (page: number) => { discarded.push(page); } }; };
describe('page pool', () => {
  it('runs work on a page and gives it back', async () => { const p = pages(), pool = await createPagePool(p.open, p.discard, 2); expect(await pool.run('Frame 1', async page => `drawn on ${page}`)).toMatch(/drawn on [01]/); expect(p.discarded).toEqual([]); });
  it('replaces a page that crashes and retries the frame on a fresh one', async () => { const p = pages(), pool = await createPagePool(p.open, p.discard, 1); const used: number[] = [];
    const result = await pool.run('Frame 7', async page => { used.push(page); if (page === 0) throw new Error('page.evaluate: Target crashed'); return 'ok'; });
    expect(result).toBe('ok'); expect(used).toEqual([0, 1]); expect(p.discarded).toEqual([0]); });
  it('replaces a page that does not answer in time', async () => { const p = pages(), pool = await createPagePool(p.open, p.discard, 1, 50); const used: number[] = [];
    const result = await pool.run('Frame 3', page => { used.push(page); return page === 0 ? new Promise<string>(() => {}) : Promise.resolve('ok'); });
    expect(result).toBe('ok'); expect(used).toEqual([0, 1]); expect(p.discarded).toEqual([0]); });
  it('gives up after one retry and says which frame', async () => { const p = pages(), pool = await createPagePool(p.open, p.discard, 1);
    await expect(pool.run('Frame 9', async () => { throw new Error('page.evaluate: Target page, context or browser has been closed'); })).rejects.toThrow(/^Frame 9: Target page, context or browser has been closed \(failed again on a fresh browser page\)$/);
    expect(p.discarded).toEqual([0, 1]); });
  it('does not retry errors from the drawing code, and keeps the page', async () => { const p = pages(), pool = await createPagePool(p.open, p.discard, 1); let calls = 0;
    await expect(pool.run('Frame 12', async () => { calls++; throw new Error('page.evaluate: Error: Layer "title" (text): bad colour\n    at drawOp'); })).rejects.toThrow(/^Frame 12: Layer "title" \(text\): bad colour$/);
    expect(calls).toBe(1); expect(p.discarded).toEqual([]); expect(isDrawingError(new Error('Layer "x" (rect): y'))).toBe(true); });
  it('shares pages between concurrent frames, and keeps working while a page is replaced', async () => { const p = pages(), pool = await createPagePool(p.open, p.discard, 2); let crashed = false;
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => pool.run(`Frame ${i}`, async page => { await new Promise(r => setTimeout(r, 5)); if (i === 3 && !crashed) { crashed = true; throw new Error('Target crashed'); } return `${i}@${page}`; })));
    expect(results.map(r => Number(r.split('@')[0]))).toEqual([0, 1, 2, 3, 4, 5, 6, 7]); expect(p.discarded).toHaveLength(1); expect(p.opened()).toBe(3); });
  it('fails waiting work clearly when no new page can be opened', async () => { let n = 0; const pool = await createPagePool(async () => { if (n++ > 0) throw new Error('browser gone'); return n; }, async () => {}, 1);
    await expect(pool.run('Frame 5', async () => { throw new Error('Target crashed'); })).rejects.toThrow(/^Frame 5: Could not open a new browser page: browser gone$/); });
  it('rejects waiting work when closed', async () => { const p = pages(), pool = await createPagePool(p.open, p.discard, 1); let release!: () => void;
    const busy = pool.run('Frame 1', () => new Promise<void>(r => { release = r; })); const waiting = pool.run('Frame 2', async () => 'never');
    await pool.close(); await expect(waiting).rejects.toThrow(/renderer was closed/); release(); await busy; });
});
