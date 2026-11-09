// `ove ai studio`: the studio on your own machine. It wires the API (services/api) to a folder of projects, an in-process job queue, the AI
// provider from your environment, and the pieces that ship with this command (blocks, themes, templates, the Player, the built web app).
// Hosted use wires the same API to accounts, a durable queue and render workers instead (see ./serve.ts).
import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProvider, narrateSmart, providerCapabilities, type AiProvider } from '@ove/ai';
import { describeError, sfxFile } from '@ove/core';
import { builtinFontFaces } from '@ove/graphics';
import { builtinFontDir } from '@ove/graphics/fonts';
import { p5Source, threeSource } from '@ove/graphics/runtime';
import { sfxNames } from '@ove/schema';
import { createApp, loopbackAuth, type ApiLibrary, type PlayerFiles, type StockOptions } from '@ove/api';
import { InProcessQueue, canvasFor, createFsPaths, createJobRunner, folderName, localInputFile, type JobEnv } from '@ove/jobs';
import { FsProjectStore, LOCAL_PRINCIPAL, StockSettingsStore, within, type Principal } from '@ove/storage';
import { aiStudioPage } from './ai-studio-page';
import { addBlock, applyTheme, emptyComposition, listBlocks, listThemes, readBlock, readBlockFile, readTheme, themeTokens } from './blocks';
import { playerScript } from './dev';
import { composeSmart, listTemplates } from './templates';
import { makeThumbnail } from './thumbnail';

export type AiStudioOptions = {
  /** Where the stock libraries live; tests point these at a stand-in. */
  stock?: Partial<StockOptions>;
  /** Interface to listen on. Defaults to 127.0.0.1; anything else exposes a server that has no login. */
  host?: string;
  /** The port people use to reach the studio when it differs from the one it listens on (a container's published port). */
  publicPort?: number;
  port?: number;
  outDir?: string;
  provider?: string;
  model?: string;
  baseUrl?: string;
  allowHosts?: string[];
};

export type AiStudioServer = { url: string; close(): Promise<void> };

// The request helpers live in @ove/jobs and the path rule in @ove/storage; they are re-exported because tests and callers import them from here.
export { canvasFor, folderName, within };

/** What ships with this command and the API shows: blocks, themes, templates. */
export const studioLibrary: ApiLibrary = {
  listBlocks, listThemes, readBlock, readTheme, addBlock, blockFile: readBlockFile, applyTheme, emptyComposition, themeTokens,
  listTemplates: async () => (await listTemplates()).map(t => ({ id: t.id, name: t.name, description: t.description, tags: t.tags, width: t.width, height: t.height, fps: t.fps, durationFrames: t.durationFrames, durationSeconds: t.durationSeconds, previewFrame: t.previewFrame })),
};
/** The Player and what it loads beside itself (the same files `ove dev` serves). */
export const studioPlayer: PlayerFiles = {
  script: playerScript,
  async p5() { return p5Source(); },
  async three() { return threeSource(); },
  async sound(name) { return (sfxNames as readonly string[]).includes(name) ? readFile(await sfxFile(name as (typeof sfxNames)[number])) : undefined; },
  async font(path) { const face = builtinFontFaces.find(f => `/fonts/${f.file}` === path); return face ? readFile(join(builtinFontDir(face.pkg), face.file)) : undefined; },
};
// The web app (apps/studio, built by `pnpm build:studio`) sits next to blocks/ and themes/, in the workspace and in the published package.
// Without a build the studio falls back to the plain page in ai-studio-page.ts.
export const studioApp = { dir: fileURLToPath(new URL('../studio', import.meta.url)), fallbackPage: aiStudioPage };

/** The environment every job runs in on this machine: the store's folders, the provider from the environment, and the local-only inputs. */
export function jobEnvFor(store: FsProjectStore, requireProvider: (who: Principal) => AiProvider, providerInfo: (who: Principal) => { provider?: string; model?: string }, local: boolean) {
  return (who: Principal): JobEnv => ({
    who, paths: createFsPaths(store, who, () => providerInfo(who), { confine: !local }), provider: () => requireProvider(who), providerInfo: () => providerInfo(who), assets: id => store.assets(who, id),
    capabilities: { composeSmart, narrateSmart, makeThumbnail },
    ...(local ? { local: { inputFile: localInputFile } } : {}),
  });
}

export async function startAiStudio(options: AiStudioOptions = {}): Promise<AiStudioServer> {
  const root = resolve(options.outDir ?? 'ai-videos');
  await mkdir(root, { recursive: true });
  let provider: AiProvider | undefined, providerError: string | undefined;
  try { provider = createProvider({ provider: options.provider, model: options.model, baseUrl: options.baseUrl }); }
  catch (error) { providerError = describeError(error); }
  const requireProvider = () => { if (!provider) throw new Error(providerError ?? 'No AI provider is configured'); return provider; };
  const providerInfo = () => ({ provider: provider?.id, model: provider?.model });

  // Projects are reached only through the store, as one principal: you.
  const store = new FsProjectStore(root);
  const runner = createJobRunner(jobEnvFor(store, requireProvider, providerInfo, true));
  const queue = new InProcessQueue(runner.run);
  const app = createApp({
    mode: 'local', store, queue, validate: runner.validate, auth: loopbackAuth, library: studioLibrary, player: studioPlayer, app: studioApp,
    makeThumbnail: (raw, values, baseDir, thumbnailOptions) => makeThumbnail(raw, values, baseDir, { ...thumbnailOptions, allowCode: true }),
    providerState: () => provider
      ? { provider: { id: provider.id, model: provider.model, baseUrl: provider.baseUrl, capabilities: providerCapabilities(provider) }, error: null }
      : { provider: null, error: providerError ?? 'No AI provider is configured' },
    allowHosts: options.allowHosts, publicPort: options.publicPort,
    // Stock keys are saved by the person in Settings, in a file only they can read.
    stockSettings: new StockSettingsStore(store), stock: options.stock,
  });
  void LOCAL_PRINCIPAL;
  const { server, port } = await app.listen({ host: options.host, port: options.port });
  return {
    url: `http://127.0.0.1:${port}/`,
    async close() { server.close(); server.closeAllConnections(); await new Promise<void>(ok => server.once('close', () => ok())); },
  };
}
