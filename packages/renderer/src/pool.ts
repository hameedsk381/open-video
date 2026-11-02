// The renderer's pages. A page that crashes, is closed, or does not answer within `timeoutMs` is thrown away and a fresh one opened, and
// the work is tried once more on another page; long renders survive one renderer process dying. Errors from the drawing code itself
// (they start with "Layer \"…\"", see canvas-runtime.js) are not retried, since they would fail the same way again. Every error is
// prefixed with the label of the work (e.g. "Frame 120"). Generic over the page type so it can be tested without a browser.
export type PagePool<P> = { run<T>(label: string, work: (page: P) => Promise<T>): Promise<T>; close(): Promise<void> };
export const defaultFrameTimeoutMs = 120_000;
const message = (error: unknown) => String((error as Error)?.message ?? error).replace(/^page\.evaluate: (Error: )?/, '').split('\n')[0]!;
export const isDrawingError = (error: unknown) => /^Layer "/.test(message(error));
export async function createPagePool<P>(open: () => Promise<P>, discard: (page: P) => Promise<void>, size: number, timeoutMs = defaultFrameTimeoutMs): Promise<PagePool<P>> {
  const idle: P[] = await Promise.all(Array.from({ length: size }, open)); const waiting: { resolve: (page: P) => void; reject: (error: Error) => void }[] = [];
  let alive = size, closed = false, lastOpenError: Error | undefined;
  const acquire = () => idle.pop() ?? new Promise<P>((resolve, reject) => { if (alive === 0) reject(new Error(`No browser page is available: ${lastOpenError?.message ?? 'all failed'}`)); else waiting.push({ resolve, reject }); });
  const release = (page: P) => { if (closed) { void discard(page).catch(() => {}); return; } const next = waiting.shift(); if (next) next.resolve(page); else idle.push(page); };
  // Replacing happens in the background; if a new page cannot be opened the pool shrinks, and once empty everything waiting fails.
  const replace = (page: P) => { void discard(page).catch(() => {}); if (closed) return; open().then(release, (error: Error) => { lastOpenError = error; alive--; if (alive === 0) for (const w of waiting.splice(0)) w.reject(new Error(`Could not open a new browser page: ${error.message}`)); }); };
  const withTimeout = <T>(work: Promise<T>) => { let timer: NodeJS.Timeout | undefined; return Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`the browser page did not answer within ${Math.round(timeoutMs/1000)} s`)), timeoutMs); })]).finally(() => clearTimeout(timer)); };
  return {
    async run(label, work) { for (let attempt = 0; ; attempt++) { const page = await Promise.resolve(acquire()).catch((error: Error) => { throw new Error(`${label}: ${error.message}`); });
      try { const result = await withTimeout(work(page)); release(page); return result; }
      catch (error) { if (isDrawingError(error)) { release(page); throw new Error(`${label}: ${message(error)}`); }
        replace(page); if (attempt >= 1 || closed) throw new Error(`${label}: ${message(error)}${attempt ? ' (failed again on a fresh browser page)' : ''}`); } } },
    async close() { closed = true; for (const w of waiting.splice(0)) w.reject(new Error('The renderer was closed')); await Promise.all(idle.splice(0).map(page => discard(page).catch(() => {}))); },
  }; }
