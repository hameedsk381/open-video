import { addBlockRequest, idRequest, newProjectRequest, parseRequest, renameRequest, restoreRequest, textRequest, themeRequest, variablesRequest } from '@ove/contracts';
import { canvasFor, optionalNumber, optionalText, textOf } from '@ove/jobs';
import { measureMedia, loadComposition } from '@ove/core';
import { resolveVariables, variablesSchema } from '@ove/schema';
import { distillBrandPack, scrapeWebsiteBrand } from '@ove/ai';
import type { RevisionMeta } from '@ove/storage';
import { listProjects, projectMode, projectVariables, setVariableValues, textLayers } from '../projects';
import { readBytes } from '../http';
import { assertPublicHttpUrl } from '../url-guard';
import type { Ctx, Route } from '../types';

const setAtPath = (rootValue: any, path: string, apply: (layer: any) => void) => {
  let node = rootValue;
  for (const [, name, index] of path.matchAll(/([A-Za-z_]+)|\[(\d+)\]/g)) node = node?.[index === undefined ? name! : Number(index)];
  if (!node || typeof node !== 'object') throw new Error('That text is no longer in the video');
  apply(node);
};

/** Project reading and editing: everything the editor does that is not a job. Every call goes through the store, as the person asking. */
export function projectRoutes(): Route[] {
  // A project edit writes the file's own JSON (variables, components and all), kept as a revision.
  const writeRaw = async (c: Ctx, id: string, raw: unknown, meta: RevisionMeta) => { loadComposition(raw); await c.deps.store.writeRaw(c.who, id, raw, meta); };
  const exists = async (c: Ctx, value: unknown) => { const id = textOf(value, 'project'); c.deps.store.projectDir(c.who, id); if (!await c.deps.store.exists(c.who, id)) throw new Error(`There is no project "${id}"`); return id; };

  const detail = async (c: Ctx, id: string) => {
    const { store, library } = c.deps, { dir } = await store.workdir(c.who, id), raw = await store.readRaw(c.who, id), composition = loadComposition(raw), mode = projectMode(raw);
    const declared = variablesSchema.parse(raw.variables ?? {}), values = resolveVariables(declared, {});
    return {
      id, name: composition.name, width: composition.width, height: composition.height, fps: composition.fps, durationFrames: composition.durationFrames, mode,
      scenes: composition.scenes.map(scene => ({ id: scene.id, name: scene.name, startFrame: scene.startFrame, durationFrames: scene.durationFrames })),
      variables: mode === 'template' ? projectVariables(raw) : [], theme: Object.fromEntries(library.themeTokens.filter(token => token in declared).map(token => [token, values[token]])),
      texts: mode === 'finished' ? textLayers(composition) : [], assets: await store.assets(c.who, id), revisions: (await store.revisions(c.who, id)).length,
      source: { raw, media: await measureMedia(raw, dir), base: `/files/${id}/` },
    };
  };

  const thumb = async (c: Ctx, id: string) => {
    const { store, queue, validate } = c.deps, saved = await store.thumb(c.who, id);
    if (saved) return c.send(200, 'image/png', saved);
    if (c.deps.mode === 'hosted') {
      // Drawing is a job for a render worker; the picture is there on a later visit.
      const request = { kind: 'thumbnail' as const, input: { file: `${id}/composition.json`, output: '.studio/thumb.png', width: 480 }, who: c.who };
      try { validate(request); await c.deps.quotas?.beforeJob(c.who, 'thumbnail'); await queue.enqueue(request); } catch { /* not now */ }
      return c.send(404, 'text/plain', 'The preview is being made');
    }
    const work = await store.workdir(c.who, id), made = await c.deps.makeThumbnail(await store.readRaw(c.who, id), {}, work.dir, { width: 480 });
    await store.putThumb(c.who, id, made.png);
    c.send(200, 'image/png', made.png);
  };

  return [
    { method: 'GET', path: '/api/projects', handle: async c => c.json(200, { projects: await listProjects(c.deps.store, c.who) }) },
    { method: 'GET', path: '/api/project', handle: async c => c.json(200, await detail(c, await exists(c, c.url.searchParams.get('id')))) },
    { method: 'GET', path: '/api/thumb', handle: async c => thumb(c, await exists(c, c.url.searchParams.get('id'))) },
    { method: 'GET', path: '/api/history', handle: async c => {
      const file = c.url.searchParams.get('file') ?? '', id = await exists(c, file.split('/')[0]);
      c.json(200, { revisions: await c.deps.store.revisions(c.who, id) });
    } },
    { method: 'GET', path: '/api/library', handle: async c => {
      const { library } = c.deps;
      c.json(200, { blocks: (await library.listBlocks()).map(({ layers, ...block }) => block), themes: await library.listThemes(), templates: await library.listTemplates() });
    } },
    { method: 'POST', path: '/api/upload', handle: async c => {
      const id = await exists(c, c.url.searchParams.get('project')), name = textOf(c.url.searchParams.get('name'), 'name');
      // Refuse an oversized upload before buffering it: the declared size is checked now, the actual bytes again below.
      const declared = Number(c.req.headers['content-length']);
      if (Number.isFinite(declared) && declared > 0) await c.deps.quotas?.beforeUpload(c.who, declared);
      const bytes = await readBytes(c.req, 150_000_000);
      await c.deps.quotas?.beforeUpload(c.who, bytes.length);
      c.json(200, { assets: await c.deps.store.putAsset(c.who, id, name, bytes) });
    } },
    { method: 'POST', path: '/api/project/new', handle: async c => {
      const body = await c.body(), { name } = parseRequest(newProjectRequest, body); canvasFor(body);
      await c.deps.quotas?.beforeProject(c.who, (await c.deps.store.ids(c.who)).length);
      c.json(200, { id: await c.deps.store.create(c.who, name) });
    } },
    { method: 'POST', path: '/api/project/blank', handle: async c => {
      const body = await c.body(), { name } = parseRequest(newProjectRequest, body), canvas = canvasFor(body), { store, library } = c.deps;
      await c.deps.quotas?.beforeProject(c.who, (await store.ids(c.who)).length);
      const id = await store.create(c.who, name);
      await store.writeRaw(c.who, id, library.emptyComposition(name, canvas.width, canvas.height, canvas.fps));
      c.json(200, { id });
    } },
    { method: 'POST', path: '/api/project/rename', handle: async c => {
      const request = parseRequest(renameRequest, await c.body()), id = await exists(c, request.id), raw = await c.deps.store.readRaw(c.who, id); raw.name = request.name;
      await writeRaw(c, id, raw, { kind: 'edit', label: 'Renamed' }); c.json(200, { ok: true });
    } },
    { method: 'POST', path: '/api/project/duplicate', handle: async c => {
      const request = parseRequest(idRequest, await c.body()), source = await exists(c, request.id);
      await c.deps.quotas?.beforeProject(c.who, (await c.deps.store.ids(c.who)).length);
      c.json(200, { id: await c.deps.store.duplicate(c.who, source, raw => ({ ...raw, name: `${raw.name ?? source} copy`.slice(0, 120) })) });
    } },
    { method: 'POST', path: '/api/project/delete', handle: async c => { const request = parseRequest(idRequest, await c.body()); await c.deps.store.trash(c.who, await exists(c, request.id)); c.json(200, { ok: true }); } },
    { method: 'POST', path: '/api/variables', handle: async c => {
      const request = parseRequest(variablesRequest, await c.body()), id = await exists(c, request.id);
      await writeRaw(c, id, setVariableValues(await c.deps.store.readRaw(c.who, id), request.values), { kind: 'edit', label: 'Edited the text' }); c.json(200, { ok: true });
    } },
    { method: 'POST', path: '/api/theme', handle: async c => {
      const request = parseRequest(themeRequest, await c.body()), id = await exists(c, request.id), { store, library } = c.deps, theme = await library.readTheme(request.theme);
      await writeRaw(c, id, library.applyTheme(await store.readRaw(c.who, id), theme), { kind: 'edit', label: `Look: ${theme.name}` }); c.json(200, { ok: true });
    } },
    { method: 'POST', path: '/api/text', handle: async c => {
      const request = parseRequest(textRequest, await c.body()), id = await exists(c, request.id), composition = loadComposition(await c.deps.store.readRaw(c.who, id)) as any, content = request.content;
      setAtPath(composition, request.path, layer => { if (layer.type !== 'text') throw new Error('That layer is not text'); if (typeof layer.content === 'string' && layer.content) layer.content = content; else if (Array.isArray(layer.spans) && layer.spans.length) layer.spans = [{ ...layer.spans[0], text: content }]; else layer.content = content; });
      await writeRaw(c, id, { $schema: './composition.schema.json', ...composition }, { kind: 'edit', label: 'Edited the text' }); c.json(200, { ok: true });
    } },
    { method: 'POST', path: '/api/add-block', handle: async c => {
      const request = parseRequest(addBlockRequest, await c.body()), id = await exists(c, request.id), { store, library } = c.deps, block = await library.readBlock(request.block);
      const added = library.addBlock(await store.readRaw(c.who, id), block, { at: optionalNumber(request.at, 'at', 0, 1e7), frames: optionalNumber(request.frames, 'frames', 1, 1e7), scene: optionalText(request.scene), set: request.set ?? {} });
      await writeRaw(c, id, added.composition, { kind: 'edit', label: `Added ${block.name}` }); c.json(200, { placed: added.placed, where: added.where });
    } },
    { method: 'POST', path: '/api/restore', handle: async c => {
      const request = parseRequest(restoreRequest, await c.body()), id = await exists(c, request.file.split('/')[0]);
      c.json(200, { revision: await c.deps.store.restore(c.who, id, request.n) });
    } },
    { method: 'POST', path: '/api/brand/scrape', handle: async c => {
      const body = await c.body(), url = textOf(body.url, 'url');
      await assertPublicHttpUrl(url);                                              // the server fetches this: it must be a public site
      await c.deps.quotas?.beforeJob(c.who, 'compose');                            // scraping and distilling are AI work; they count as a request
      const scraped = await scrapeWebsiteBrand(url);
      const distilled = await distillBrandPack(scraped);
      c.json(200, { scraped, brand: distilled.brand, suggestedBrief: distilled.suggestedBrief });
    } },
  ];
}
