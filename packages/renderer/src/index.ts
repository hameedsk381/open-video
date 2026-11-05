import { chromium, type Browser, type Page } from 'playwright'; import { existsSync } from 'node:fs'; import { readFile, writeFile } from 'node:fs/promises'; import { availableParallelism } from 'node:os';
import type { Composition } from '@ove/schema'; import { evaluateFrame, videoFrameIndex } from '@ove/timeline'; import { toDrawOperations, flattenOperations, collectImageSources, prepareOperations, collectLottieSources, collectCodeSources, hasCodeLayers, hasReactLayers, type DrawOperation, type FrameReport } from '@ove/graphics'; import { prepareVideos, videoFrameFile } from './video'; import { createPagePool, defaultFrameTimeoutMs } from './pool'; import { resolveAssetSource, toDataUrl } from '@ove/assets'; import { builtinFonts } from '@ove/graphics/fonts'; import { canvasRuntimeSource, lottieSource } from '@ove/graphics/runtime';
export type Renderer = { concurrency: number; renderFrame(frame: number): Promise<Buffer>; inspectFrame(frame: number): Promise<FrameReport>; contactSheet(frames: number[], options?: { columns?: number; width?: number; safeBands?: { x0: number; y0: number; x1: number; y1: number }[] }): Promise<Buffer>; captureFrame(frame: number, output: string): Promise<void>; close(): Promise<void> };
// scale renders smaller (drafts) or larger; the output size is rounded to even numbers, which H.264 and VP9 need.
// frameTimeoutMs: how long a page may take to draw one frame before it is replaced and the frame retried (default 120 s, or
// OVE_FRAME_TIMEOUT_MS).
/** `allowCode` lets code layers run: they execute JavaScript from the composition, so only set it for compositions you trust. */
export type RendererOptions = { baseDir?: string; concurrency?: number; scale?: number; motionBlur?: boolean; frameTimeoutMs?: number; allowCode?: boolean };
export const scaledSize = (composition: Composition, scale = 1) => ({ width: Math.max(2, Math.round(composition.width*scale/2)*2), height: Math.max(2, Math.round(composition.height*scale/2)*2) });
// Frames leave the page as PNG: raw RGBA (8 MB at 1080×1920) costs ~2 s per frame to move out of Chromium through either the
// Playwright protocol or a page upload, while PNG encoding takes ~35 ms. The canvas runtime keeps the canvas in CPU memory
// (willReadFrequently), which makes the read-back for encoding far cheaper than reading from a GPU canvas.
const runtime = `<!doctype html><canvas id="c"></canvas><script>${lottieSource}</script><svg width="0" height="0" style="position:absolute"><path id="measure"/></svg><script>
${canvasRuntimeSource}
const rt=createCanvasRuntime(document.querySelector('#c'),document.querySelector('#measure'));
window.MotionRender=window.OVE={load:rt.load,draw:async(p)=>{await rt.draw(p);return rt.canvas.toDataURL('image/png').slice('data:image/png;base64,'.length)},inspect:async(p)=>{await rt.draw({...p,report:true});return rt.report()}};</script>`;
// Contact sheets: frames scaled into a grid, each labelled with its frame number and time.
const sheetPage = `<!doctype html><canvas id="s"></canvas><script>window.sheet=async({images,labels,columns,cell,safeBands})=>{const c=document.querySelector('#s'),rows=Math.ceil(images.length/columns),gap=8,label=26,ctx=c.getContext('2d');c.width=columns*cell.w+(columns+1)*gap;c.height=rows*(cell.h+label)+(rows+1)*gap;ctx.fillStyle='#0b0d14';ctx.fillRect(0,0,c.width,c.height);ctx.font='600 15px system-ui,sans-serif';ctx.textBaseline='middle';
for(let i=0;i<images.length;i++){const img=new Image();img.src=images[i];await img.decode();const x=gap+(i%columns)*(cell.w+gap),y=gap+Math.floor(i/columns)*(cell.h+label+gap);ctx.drawImage(img,x,y,cell.w,cell.h);if(safeBands){for(const b of safeBands){const bx=x+b.x0*cell.w,by=y+b.y0*cell.h,bw=(b.x1-b.x0)*cell.w,bh=(b.y1-b.y0)*cell.h;ctx.fillStyle='rgba(239,68,68,0.18)';ctx.fillRect(bx,by,bw,bh);ctx.lineWidth=1.5;ctx.strokeStyle='rgba(239,68,68,0.55)';ctx.strokeRect(bx,by,bw,bh);}}ctx.fillStyle='#c9cfdd';ctx.fillText(labels[i],x+2,y+cell.h+label/2)}return c.toDataURL('image/png').slice(22)}</script>`;
const allLayers = (composition: Composition) => composition.scenes.flatMap(scene => scene.layers);
// Browser choice, in order: OVE_CHROMIUM_EXECUTABLE; Playwright's own Chromium (the same build everywhere, so the most consistent
// pixels across machines); then an installed Google Chrome or Microsoft Edge on any OS. Different browsers can anti-alias and lay out
// text slightly differently, so pin one (and use font assets) when output must match between machines.
// Shader layers draw with WebGL. SwiftShader (Chromium's software GPU) gives the same pixels on every machine, GPU or not, where a real
// GPU's output depends on its driver; canvas 2D drawing runs on the CPU either way.
const browserArgs = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', ...(process.env.OVE_CHROMIUM_ARGS ?? '').split(/\s+/).filter(Boolean)]; // OVE_CHROMIUM_ARGS: extra flags set by whoever runs the process (the container image sets --no-sandbox, because the container is the sandbox)
export const browserInstallHint = 'Install one with "ove browser install" (Playwright\'s Chromium, about 150 MB), install Google Chrome, or set OVE_CHROMIUM_EXECUTABLE to a Chromium-based browser.';
let ensureChromiumPromise: Promise<void> | null = null;
export async function ensureChromium(options?: { onProgress?: (msg: string) => void }): Promise<void> {
  if (existsSync(chromium.executablePath())) return;
  for (const channel of ['chrome', 'msedge']) {
    try {
      const b = await chromium.launch({ headless: true, channel, args: browserArgs });
      await b.close();
      return;
    } catch {}
  }
  if (ensureChromiumPromise) return ensureChromiumPromise;
  ensureChromiumPromise = (async () => {
    const log = options?.onProgress ?? ((msg: string) => console.log(msg));
    log('No Chrome, Edge, or Chromium browser detected.');
    log('Downloading Playwright Chromium (one-time setup)...');
    const { createRequire } = await import('node:module');
    const { dirname, join } = await import('node:path');
    const { spawn } = await import('node:child_process');
    const req = createRequire(import.meta.url);
    const cli = join(dirname(req.resolve('playwright/package.json')), 'cli.js');
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, [cli, 'install', 'chromium'], { stdio: 'inherit' });
      child.on('close', code => {
        if (code === 0) resolve();
        else reject(new Error(`Chromium installation failed (exit code ${code})`));
      });
      child.on('error', reject);
    });
    log('✓ Playwright Chromium installed successfully.');
  })();
  try {
    await ensureChromiumPromise;
  } catch (err) {
    ensureChromiumPromise = null;
    throw err;
  }
}
export async function launchBrowser(): Promise<Browser> { const explicit=process.env.OVE_CHROMIUM_EXECUTABLE;
  if (explicit) { if (!existsSync(explicit)) throw new Error(`OVE_CHROMIUM_EXECUTABLE points to ${explicit}, which does not exist.`); return chromium.launch({ headless: true, executablePath: explicit, args: browserArgs }); }
  if (existsSync(chromium.executablePath())) return chromium.launch({ headless: true, args: browserArgs });
  for (const channel of ['chrome', 'msedge']) { try { return await chromium.launch({ headless: true, channel, args: browserArgs }); } catch {} }
  try {
    await ensureChromium();
    return await chromium.launch({ headless: true, args: browserArgs });
  } catch (error) {
    throw new Error(`No Chromium-based browser was found and auto-install failed: ${(error as Error).message}. ${browserInstallHint}`);
  } }
// Which browser launchBrowser would use, for `ove doctor`.
export async function describeBrowser(): Promise<string> { const browser=await launchBrowser(); try { return `${browser.browserType().name()} ${browser.version()}${process.env.OVE_CHROMIUM_EXECUTABLE ? ` (OVE_CHROMIUM_EXECUTABLE=${process.env.OVE_CHROMIUM_EXECUTABLE})` : existsSync(chromium.executablePath()) ? ' (Playwright Chromium)' : ' (installed Chrome/Edge)'}`; } finally { await browser.close(); } }
// Past ~4 pages Chromium competes with FFmpeg's encoder for CPU and renders get slower, so the default stays small.
export const defaultConcurrency = () => Math.max(1, Math.min(4, Math.floor(availableParallelism() / 2)));
function operationsEqual(a: DrawOperation[], b: DrawOperation[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const opA = a[i]!, opB = b[i]!;
    if (opA.kind !== opB.kind || opA.mediaTime !== opB.mediaTime || opA.frameKey !== opB.frameKey) return false;
    const lA = opA.layer, lB = opB.layer;
    if (lA.id !== lB.id || lA.x !== lB.x || lA.y !== lB.y || lA.opacity !== lB.opacity ||
        lA.rotation !== lB.rotation || lA.scale !== lB.scale || lA.width !== lB.width ||
        lA.height !== lB.height || lA.fill !== lB.fill || lA.color !== lB.color ||
        lA.stroke !== lB.stroke || lA.strokeWidth !== lB.strokeWidth) {
      return false;
    }
    if (opA.children || opB.children) {
      if (!opA.children || !opB.children || !operationsEqual(opA.children, opB.children)) return false;
    }
  }
  return true;
}

// Each page lives in its own browser context so Chromium gives it a separate renderer process; frames are independent, so any page can draw any frame.
export async function createRenderer(composition: Composition, options: RendererOptions = {}): Promise<Renderer> { const baseDir=options.baseDir ?? process.cwd();
  if (hasCodeLayers(composition.scenes.flatMap(s => s.layers)) && !options.allowCode) throw new Error('This composition has code layers, which run JavaScript while rendering. Render it only if you trust it, with --allow-code (or allowCode: true).'); const concurrency=Math.max(1, Math.floor(options.concurrency ?? 1)); const output=scaledSize(composition, options.scale ?? composition.export.scale); const videos=await prepareVideos(composition, baseDir); const sources=Object.fromEntries(await Promise.all(collectImageSources(allLayers(composition)).map(async src => [src, await toDataUrl(resolveAssetSource(composition, src, baseDir))] as const))); const fonts=[...await builtinFonts(), ...await Promise.all(composition.assets.filter(a => a.type === 'font').map(async a => ({ family: a.family ?? a.id, src: a.src, weight: a.weight ?? 400, style: a.style ?? 'normal', url: await toDataUrl(resolveAssetSource(composition, a.src, baseDir)) })))]; const reactImages=hasReactLayers(allLayers(composition)) ? Object.fromEntries(await Promise.all(composition.assets.filter(a => a.type === 'image').flatMap(a => [a.id, a.src]).map(async key => [key, await toDataUrl(resolveAssetSource(composition, key, baseDir))] as const))) : {}; const codes=Object.fromEntries(await Promise.all(collectCodeSources(allLayers(composition)).map(async src => { const file=resolveAssetSource(composition, src, baseDir); try { return [src, { text: await readFile(file, 'utf8') }] as const; } catch (error) { throw new Error(`Code ${src} could not be read from ${file}: ${(error as Error).message}`); } }))); const lotties=Object.fromEntries(await Promise.all(collectLottieSources(allLayers(composition)).map(async src => { const file=resolveAssetSource(composition, src, baseDir); try { return [src, JSON.parse(await readFile(file, 'utf8'))] as const; } catch (error) { throw new Error(`Lottie ${src} could not be read from ${file}: ${(error as Error).message}`); } })));
  const browser: Browser = await launchBrowser(); try {
  const openPage=async () => { const context=await browser.newContext({ viewport: output, deviceScaleFactor: 1 }); if (Object.keys(codes).length || hasCodeLayers(composition.scenes.flatMap(s => s.layers))) await context.route(/^(https?|wss?|ftp):/i, route => route.abort()); const page: Page=await context.newPage(); await page.setContent(runtime, { waitUntil: 'load' }); await page.evaluate(async ({ sources, fonts, lotties, codes }) => { await (window as any).OVE.load(sources, fonts, lotties, codes); }, { sources: { ...sources, ...reactImages }, fonts, lotties, codes }); return page; };
  const pool=await createPagePool(openPage, page => page.context().close(), concurrency, options.frameTimeoutMs ?? (Number(process.env.OVE_FRAME_TIMEOUT_MS) || defaultFrameTimeoutMs));
  // Each video operation gets the key of the decoded source frame it shows; frames travel with the payload as JPEG data URLs.
  const attachVideoFrames=async (operations: DrawOperation[]) => { const videoFrames: Record<string, string>={}; for (const op of flattenOperations(operations).filter(op => op.kind === 'video')) { const layer=op.layer as any, video=videos.get(layer.src)!; const index=videoFrameIndex(layer, layer.localFrame-layer.startFrame, video.count); op.frameKey=`${layer.src}#${index}`; videoFrames[op.frameKey] ??= `data:image/jpeg;base64,${(await readFile(videoFrameFile(video, index))).toString('base64')}`; } return videoFrames; };
  // With motion blur the frame carries one operation list per sub-frame, spread over the shutter from the frame forward (never back,
  // so a hard cut does not blend with the scene before it).
  const blur=options.motionBlur === false ? undefined : composition.motionBlur;
  const payload=async (frame: number, sharp=false) => { const operations=prepareOperations(toDrawOperations(evaluateFrame(composition,frame)), composition.fps); const videoFrames=await attachVideoFrames(operations);
    let subframes: { operations: DrawOperation[] }[] | undefined;
    if (blur && !sharp && blur.samples > 1) {
      const tEnd = Math.min(composition.durationFrames-1e-6, frame + (blur.samples - 1) / blur.samples * blur.shutter / 360);
      const endOps = tEnd > frame ? prepareOperations(toDrawOperations(evaluateFrame(composition, tEnd)), composition.fps) : operations;
      if (!operationsEqual(operations, endOps)) {
        subframes=[];
        for (let i=0; i<blur.samples; i++) {
          const t=Math.min(composition.durationFrames-1e-6, frame+i/blur.samples*blur.shutter/360);
          const ops=i === 0 ? operations : (t === tEnd ? endOps : prepareOperations(toDrawOperations(evaluateFrame(composition,t)), composition.fps));
          if (i > 0) Object.assign(videoFrames, await attachVideoFrames(ops));
          subframes.push({ operations: ops });
        }
      }
    }
    return {width:output.width,height:output.height,scaleX:output.width/composition.width,scaleY:output.height/composition.height,background:composition.background,transparent:composition.export.transparent,grain:composition.grain,frame,operations,videoFrames,subframes}; };
  const renderFrame=async (frame: number) => { const p=await payload(frame); const png=await pool.run(`Frame ${frame}`, page => page.evaluate(p => (window as any).OVE.draw(p), p) as Promise<string>); return Buffer.from(png,'base64'); };
  // Draws a frame without encoding it and returns where its text landed and a small thumbnail (for `ove review`).
  const inspectFrame=async (frame: number): Promise<FrameReport> => { const p=await payload(frame, true); return pool.run(`Frame ${frame}`, page => page.evaluate(p => (window as any).OVE.inspect(p), p) as Promise<FrameReport>); };
  const contactSheet=async (frames: number[], options: { columns?: number; width?: number; safeBands?: { x0: number; y0: number; x1: number; y1: number }[] } = {}) => { const columns=Math.max(1, Math.min(options.columns ?? 5, frames.length)), cellWidth=Math.round((options.width ?? 1800)/columns), cell={ w: cellWidth, h: Math.round(cellWidth*composition.height/composition.width) };
    const images=await Promise.all(frames.map(async f => `data:image/png;base64,${(await renderFrame(f)).toString('base64')}`)), labels=frames.map(f => `${f}  ·  ${(f/composition.fps).toFixed(1)} s`);
    const context=await browser.newContext(); try { const page=await context.newPage(); await page.setContent(sheetPage); return Buffer.from(await page.evaluate(a => (window as any).sheet(a), { images, labels, columns, cell, safeBands: options.safeBands }) as string, 'base64'); } finally { await context.close(); } };
  return { concurrency, renderFrame, inspectFrame, contactSheet, async captureFrame(frame, output) { await writeFile(output, await renderFrame(frame)); }, close: async () => { await pool.close(); await browser.close(); } }; } catch (error) { await browser.close(); throw error; } }
// Renders frames [from, to) and yields them strictly in frame order. Up to `lookahead` frames are requested ahead of the consumer
// (the page pool still draws only `concurrency` at once), so pages keep working while the consumer, e.g. the encoder, is busy.
export async function* renderFrames(renderer: Pick<Renderer,'renderFrame'|'concurrency'>, from: number, to: number, options: { lookahead?: number } = {}): AsyncGenerator<Buffer> { const lookahead=Math.max(1, options.lookahead ?? renderer.concurrency * 4); const pending: Promise<Buffer>[]=[]; let next=from; const fill=() => { while (next < to && pending.length < lookahead) { const job=renderer.renderFrame(next++); job.catch(() => {}); pending.push(job); } }; try { fill(); while (pending.length) { const png=await pending.shift()!; fill(); yield png; } } finally { await Promise.allSettled(pending); } }
