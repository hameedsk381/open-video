import { adaptAspectRequest, addBlockRequest, idRequest, layerPatchRequest, newProjectRequest, parseRequest, renameRequest, assetDeleteRequest, assetUseRequest, blockPropsRequest, restoreRequest, snapRequest, textRequest, textsRequest, themeRequest, variablesRequest } from '@ove/contracts';
import { canvasFor, optionalNumber, optionalText, textOf } from '@ove/jobs';
import { basename } from 'node:path';
import { adaptCompositionAspect, measureMedia, loadComposition } from '@ove/core';
import { fontIds, resolveVariables, variablesSchema } from '@ove/schema';
import { assertSourcesConfined, distillBrandPack, scrapeWebsiteBrand } from '@ove/ai';
import type { ProjectFile, RevisionMeta } from '@ove/storage';
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

/** How many times the file as written refers to an uploaded file (`assets/<name>`, with or without ./ in front). */
const assetUses = (raw: unknown, name: string) => (JSON.stringify(raw ?? {}).match(new RegExp(`assets/${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9._-])`, 'g')) ?? []).length;

/** Puts new words in a text layer: its own content, or the first span of rich text. */
const setText = (layer: any, content: string) => {
  if (layer.type !== 'text') throw new Error('That layer is not text');
  if (typeof layer.content === 'string' && layer.content) layer.content = content;
  else if (Array.isArray(layer.spans) && layer.spans.length) layer.spans = [{ ...layer.spans[0], text: content }];
  else layer.content = content;
};

/**
 * The blocks placed in a video ({ use, with }) and the settings each can be given, read from the file as written. A setting that is
 * wired to a template variable ({{name}}) is left out: it is edited as that variable.
 */
const blockSlots = (raw: any) => {
  const found: any[] = [], defs = raw?.components ?? {};
  const walk = (layers: any, base: string, scene: string) => {
    if (!Array.isArray(layers)) return;
    layers.forEach((layer: any, index: number) => {
      const path = `${base}[${index}]`, def = layer && typeof layer.use === 'string' ? defs[layer.use] : undefined;
      if (def?.params) {
        const params = Object.entries(def.params as Record<string, any>)
          .filter(([, decl]) => ['string', 'number', 'boolean', 'color'].includes(decl?.type))
          .map(([name, decl]) => ({ name, type: decl.type, description: decl.description, default: decl.default, value: layer.with?.[name] ?? decl.default }))
          .filter(param => !(typeof param.value === 'string' && param.value.includes('{{')));
        if (params.length) found.push({ path, scene, id: String(layer.id ?? layer.use), component: layer.use, description: def.description, params });
      }
      if (layer && Array.isArray(layer.children)) walk(layer.children, `${path}.children`, scene);
    });
  };
  (raw?.scenes ?? []).forEach((scene: any, index: number) => walk(scene.layers, `scenes[${index}].layers`, String(scene.name ?? scene.id ?? '')));
  return found;
};

/** Project reading and editing: everything the editor does that is not a job. Every call goes through the store, as the person asking. */
export function projectRoutes(): Route[] {
  // A project edit writes the file's own JSON (variables, components and all), kept as a revision.
  // Hosted, a composition may only name files of its own project: a template variable or a plan can otherwise carry another account's path into a source the renderer reads.
  const writeRaw = async (c: Ctx, id: string, raw: unknown, meta: RevisionMeta) => { const composition = loadComposition(raw); if (c.deps.mode === 'hosted') assertSourcesConfined(composition); await c.deps.store.writeRaw(c.who, id, raw, meta); };
  const exists = async (c: Ctx, value: unknown) => { const id = textOf(value, 'project'); c.deps.store.projectDir(c.who, id); if (!await c.deps.store.exists(c.who, id)) throw new Error(`There is no project "${id}"`); return id; };
  const existsUpload = async (c: Ctx, value: unknown) => { const id = textOf(value, 'project'); c.deps.store.projectDir(c.who, id); if (!await c.deps.store.projectExists(c.who, id)) throw new Error(`There is no project "${id}"`); return id; };
  // Only the two root documents have histories; a request naming anything else is refused rather than guessed at.
  const projectFile = (file: string): ProjectFile => {
    const name = file.split('/').slice(1).join('/');
    if (name !== 'composition.json' && name !== 'production.json') throw new Error(`"${file}" is not a project file with a history`);
    return name;
  };

  const detail = async (c: Ctx, id: string) => {
    const { store, library } = c.deps, { dir } = await store.workdir(c.who, id), raw = await store.readRaw(c.who, id), composition = loadComposition(raw), mode = projectMode(raw);
    const declared = variablesSchema.parse(raw.variables ?? {}), values = resolveVariables(declared, {});
    return {
      id, name: composition.name, width: composition.width, height: composition.height, fps: composition.fps, durationFrames: composition.durationFrames, mode,
      scenes: composition.scenes.map(scene => ({ id: scene.id, name: scene.name, startFrame: scene.startFrame, durationFrames: scene.durationFrames, ...(scene.beat ? { beat: scene.beat } : {}) })),
      variables: mode === 'template' ? projectVariables(raw) : [], theme: Object.fromEntries(library.themeTokens.filter(token => token in declared).map(token => [token, values[token]])),
      texts: mode === 'finished' ? textLayers(composition) : [], assets: (await store.assets(c.who, id)).map(asset => ({ ...asset, uses: assetUses(raw, asset.name) })), revisions: (await store.revisions(c.who, id)).length, blocks: blockSlots(raw),
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
      c.json(200, { revisions: await c.deps.store.revisions(c.who, id, projectFile(file)) });
    } },
    { method: 'GET', path: '/api/revision', handle: async c => {
      const file = c.url.searchParams.get('file') ?? '', id = await exists(c, file.split('/')[0]);
      const n = Number(c.url.searchParams.get('n'));
      if (!Number.isFinite(n) || n < 1) return c.json(400, { error: 'Valid revision number n is required' });
      const rev = await c.deps.store.revisionRaw(c.who, id, n, projectFile(file));
      if (!rev) return c.json(404, { error: `Revision ${n} not found` });
      c.json(200, rev);
    } },
    { method: 'GET', path: '/api/library', handle: async c => {
      const { library } = c.deps;
      c.json(200, { blocks: (await library.listBlocks()).map(({ layers, ...block }) => block), themes: await library.listThemes(), fonts: fontIds });
    } },
    { method: 'POST', path: '/api/upload', handle: async c => {
      const id = await existsUpload(c, c.url.searchParams.get('project')), name = textOf(c.url.searchParams.get('name'), 'name');
      // Refuse an oversized upload before buffering it: the declared size is checked now, the actual bytes again below.
      const declared = Number(c.req.headers['content-length']);
      if (Number.isFinite(declared) && declared > 0) await c.deps.quotas?.beforeUpload(c.who, declared);
      const bytes = await readBytes(c.req, 150_000_000);
      await c.deps.quotas?.beforeUpload(c.who, bytes.length);
      c.json(200, { assets: await c.deps.store.putAsset(c.who, id, name, bytes) });
    } },
    { method: 'POST', path: '/api/asset/delete', handle: async c => {
      const request = parseRequest(assetDeleteRequest, await c.body()), id = await exists(c, request.id);
      const uses = assetUses(await c.deps.store.readRaw(c.who, id), request.name);
      if (uses && !request.force) return c.json(409, { error: `"${request.name}" is used ${uses} time${uses === 1 ? '' : 's'} in this video. Remove it from the video first, or delete it anyway.` });
      c.json(200, { assets: await c.deps.store.deleteAsset(c.who, id, request.name) });
    } },
    { method: 'POST', path: '/api/asset/use', handle: async c => {
      // Adds a layer for an uploaded file to one scene of the file as written, so templates and blocks stay as they were.
      const request = parseRequest(assetUseRequest, await c.body()), id = await exists(c, request.id);
      const asset = (await c.deps.store.assets(c.who, id)).find(item => item.name === request.name);
      if (!asset) throw new Error(`There is no media file "${request.name}" in this project`);
      if (request.as === 'sound' ? asset.kind !== 'audio' : asset.kind === 'audio') throw new Error(request.as === 'sound' ? 'Only sound files can be added as sound' : 'Sound files are added as sound, not as a picture');
      if (request.as === 'logo' && asset.kind !== 'image') throw new Error('Only pictures can be a logo');
      if (asset.kind === 'model' && request.as !== 'picture') throw new Error('A 3D model is placed in the scene, not used as a background or a logo');
      const composition = await c.deps.store.readRaw(c.who, id), scenes = Array.isArray(composition.scenes) ? composition.scenes : [];
      if (!scenes.length) throw new Error('This video has no scene to add it to');
      const index = Math.min(request.scene ?? 0, scenes.length - 1), scene = scenes[index];
      scene.layers = Array.isArray(scene.layers) ? scene.layers : [];
      const width = Number(composition.width) || 1080, height = Number(composition.height) || 1920;
      const taken = new Set<string>(); const collect = (layers: any) => { for (const layer of Array.isArray(layers) ? layers : []) { if (layer?.id) taken.add(String(layer.id)); collect(layer?.children); } }; collect(scene.layers);
      const base = asset.name.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_-]+/g, '-');
      const unique = (prefix: string) => { let n = 1, name = `${prefix}-${base}`; while (taken.has(name)) name = `${prefix}-${base}-${++n}`; return name; };
      const media = asset.kind === 'video' ? { type: 'video', src: asset.path, muted: true, loop: true } : asset.kind === 'model' ? { type: 'model', src: asset.path, spin: 30 } : { type: 'image', src: asset.path };
      let layer: any, at = scene.layers.length;
      // A scene block draws its own full-screen backdrop (a layer named bg), which would hide a background placed behind it. This scene's
      // blocks switch to a copy without it, named <block>_over_media; the original stays for every other scene that uses it.
      if (request.as === 'background') {
        const defs = composition.components && typeof composition.components === 'object' ? composition.components : {};
        for (const placed of scene.layers) {
          const def = typeof placed?.use === 'string' ? defs[placed.use] : undefined;
          const backdrop = Array.isArray(def?.layers) ? def.layers.find((item: any) => item?.id === 'bg' && item?.type === 'rect') : undefined;
          if (!backdrop) continue;
          const clear = `${placed.use}_over_media`;
          if (!defs[clear]) defs[clear] = { ...def, description: `${def.description ?? placed.use}, without its own backdrop`, layers: def.layers.filter((item: any) => item !== backdrop) };
          placed.use = clear;
          composition.components = defs;
        }
      }
      if (request.as === 'background') { layer = { id: unique('bg'), ...media, x: 0, y: 0, width, height, objectFit: 'cover' }; at = 0; }
      else if (request.as === 'picture') { const box = Math.round(Math.min(width, height) * 0.5); layer = { id: unique('pic'), ...media, x: Math.round((width - box) / 2), y: Math.round((height - box) / 2), width: box, height: box, ...(asset.kind === 'model' ? {} : { objectFit: 'contain' }) }; }
      else if (request.as === 'logo') { const box = Math.round(width * 0.18), margin = Math.round(width * 0.05); layer = { id: unique('logo'), ...media, x: width - box - margin, y: Math.round(height * (height >= width ? 0.1 : 0.05)), width: box, height: box, objectFit: 'contain', fixed: true }; }
      else layer = { id: unique('sound'), type: 'audio', src: asset.path, volume: 1, startFrame: 0, ...(Number(scene.durationFrames) > 0 ? { endFrame: Number(scene.durationFrames) } : {}) };
      scene.layers.splice(at, 0, layer);
      await writeRaw(c, id, composition, { kind: 'edit', label: `Added ${asset.name} to ${scene.name ?? 'a scene'}` });
      c.json(200, { ok: true, layer: layer.id, scene: index });
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
    { method: 'GET', path: '/api/trash', handle: async c => c.json(200, { projects: await c.deps.store.trashed(c.who) }) },
    { method: 'POST', path: '/api/trash/restore', handle: async c => {
      const request = parseRequest(idRequest, await c.body());
      await c.deps.quotas?.beforeProject(c.who, (await c.deps.store.ids(c.who)).length);
      c.json(200, { id: await c.deps.store.untrash(c.who, request.id) });
    } },
    { method: 'POST', path: '/api/variables', handle: async c => {
      const request = parseRequest(variablesRequest, await c.body()), id = await exists(c, request.id);
      await writeRaw(c, id, setVariableValues(await c.deps.store.readRaw(c.who, id), request.values), { kind: 'edit', label: 'Edited the text' }); c.json(200, { ok: true });
    } },
    { method: 'POST', path: '/api/theme', handle: async c => {
      const request = parseRequest(themeRequest, await c.body()), id = await exists(c, request.id), { store, library } = c.deps, theme = await library.readTheme(request.theme);
      await writeRaw(c, id, library.applyTheme(await store.readRaw(c.who, id), theme), { kind: 'edit', label: `Look: ${theme.name}` }); c.json(200, { ok: true });
    } },
    { method: 'POST', path: '/api/text', handle: async c => {
      // The file as written, not the loaded composition: a template keeps its variables and components, and only this layer changes.
      const request = parseRequest(textRequest, await c.body()), id = await exists(c, request.id), composition = await c.deps.store.readRaw(c.who, id), content = request.content;
      setAtPath(composition, request.path, layer => setText(layer, content));
      await writeRaw(c, id, composition, { kind: 'edit', label: 'Edited the text' }); c.json(200, { ok: true });
    } },
    { method: 'POST', path: '/api/texts', handle: async c => {
      // Every edit lands in one saved change, or none does.
      const request = parseRequest(textsRequest, await c.body()), id = await exists(c, request.id), composition = await c.deps.store.readRaw(c.who, id);
      for (const edit of request.edits) setAtPath(composition, edit.path, layer => setText(layer, edit.content));
      await writeRaw(c, id, composition, { kind: 'edit', label: request.edits.length > 1 ? `Edited ${request.edits.length} lines of text` : 'Edited the text' });
      c.json(200, { ok: true, edited: request.edits.length });
    } },
    { method: 'POST', path: '/api/blocks/props', handle: async c => {
      // Sets the settings of placed blocks in the file as written, all in one saved change. The save checks the values against each block's declaration.
      const request = parseRequest(blockPropsRequest, await c.body()), id = await exists(c, request.id), composition = await c.deps.store.readRaw(c.who, id);
      for (const edit of request.edits) setAtPath(composition, edit.path, layer => {
        const def = typeof layer.use === 'string' ? composition.components?.[layer.use] : undefined;
        if (!def?.params) throw new Error('That layer is not a block with settings');
        layer.with = { ...(layer.with ?? {}) };
        for (const [name, value] of Object.entries(edit.values)) {
          if (!def.params[name]) throw new Error(`"${layer.use}" has no setting "${name}"`);
          layer.with[name] = def.params[name].type === 'number' ? Number(value) : value;
        }
      });
      await writeRaw(c, id, composition, { kind: 'edit', label: request.edits.length > 1 ? `Edited ${request.edits.length} blocks` : 'Edited a block' });
      c.json(200, { ok: true, edited: request.edits.length });
    } },
    { method: 'POST', path: '/api/layer/snap', handle: async c => {
      // Moves layers by the given offsets, all in one saved change. It edits the file as written (not the loaded composition), so variables,
      // components and scene timing stay as they were; a layer's animated x and y move with it.
      const request = parseRequest(snapRequest, await c.body()), id = await exists(c, request.id), composition = await c.deps.store.readRaw(c.who, id);
      const moves = request.moves ?? [{ path: request.path ?? '', dx: request.dx ?? 0, dy: request.dy ?? 0 }];
      for (const { path, dx, dy, maxWidth } of moves as { path: string; dx: number; dy: number; maxWidth?: number }[]) {
        if (!path) throw new Error('path is required');
        setAtPath(composition, path, layer => {
          if (maxWidth !== undefined) { if (layer.type !== 'text') throw new Error('Only text can be wrapped to a width'); layer.maxWidth = maxWidth; }
          for (const [axis, by] of [['x', dx], ['y', dy]] as const) {
            if (!by) continue;
            if (layer[axis] !== undefined && typeof layer[axis] !== 'number') throw new Error(`That layer's ${axis} position is an expression, so it cannot be nudged automatically`);
            layer[axis] = (layer[axis] ?? 0) + by;
            for (const animation of Array.isArray(layer.animations) ? layer.animations : []) if (animation?.property === axis) for (const key of animation.keyframes ?? []) if (typeof key.value === 'number') key.value += by;
          }
        });
      }
      await writeRaw(c, id, composition, { kind: 'edit', label: moves.length > 1 ? `Moved ${moves.length} layers into the safe zone` : 'Snapped to safe zone' });
      c.json(200, { ok: true, moved: moves.length });
    } },
    { method: 'POST', path: '/api/layer/patch', handle: async c => {
      const request = parseRequest(layerPatchRequest, await c.body()), id = await exists(c, request.id), composition = await c.deps.store.readRaw(c.who, id);
      setAtPath(composition, request.path, layer => {
        for (const [key, val] of Object.entries(request.patch)) {
          if (['id', 'type', 'children'].includes(key)) continue;
          if (val === undefined) {
            delete layer[key];
          } else {
            layer[key] = val;
          }
        }
      });
      await writeRaw(c, id, composition, { kind: 'edit', label: 'Updated layer properties' });
      c.json(200, { ok: true });
    } },
    { method: 'POST', path: '/api/aspect', handle: async c => {
      const request = parseRequest(adaptAspectRequest, await c.body()), id = await exists(c, request.id), composition = await c.deps.store.readRaw(c.who, id);
      const adapted = adaptCompositionAspect(composition, request.aspect);
      await writeRaw(c, id, adapted, { kind: 'edit', label: `Adapted aspect ratio to ${request.aspect}` });
      c.json(200, { ok: true, aspect: request.aspect });
    } },
    { method: 'POST', path: '/api/add-block', handle: async c => {
      const request = parseRequest(addBlockRequest, await c.body()), id = await exists(c, request.id), { store, library } = c.deps, block = await library.readBlock(request.block);
      const added = library.addBlock(await store.readRaw(c.who, id), block, { at: optionalNumber(request.at, 'at', 0, 1e7), frames: optionalNumber(request.frames, 'frames', 1, 1e7), scene: optionalText(request.scene), set: request.set ?? {} });
      // The bundle goes in first, so the composition that refers to it is never saved without it.
      for (const file of added.files) await store.putSupportFile(c.who, id, basename(file), await library.blockFile(file));
      await writeRaw(c, id, added.composition, { kind: 'edit', label: `Added ${block.name}` }); c.json(200, { placed: added.placed, where: added.where });
    } },
    { method: 'POST', path: '/api/restore', handle: async c => {
      const request = parseRequest(restoreRequest, await c.body()), id = await exists(c, request.file.split('/')[0]);
      c.json(200, { revision: await c.deps.store.restore(c.who, id, request.n, projectFile(request.file)) });
    } },
    { method: 'POST', path: '/api/brand/scrape', handle: async c => {
      const body = await c.body(), url = textOf(body.url, 'url');
      await assertPublicHttpUrl(url);                                              // the server fetches this: it must be a public site
      await c.deps.quotas?.beforeJob(c.who, 'compose');                            // scraping and distilling are AI work; they count as a request
      // The guard is handed to the scraper too, so redirects and linked stylesheets/crawl targets are checked per hop
      // rather than only the first URL.
      const scraped = await scrapeWebsiteBrand(url, 8000, assertPublicHttpUrl);
      const distilled = await distillBrandPack(scraped);
      c.json(200, { scraped, brand: distilled.brand, suggestedBrief: distilled.suggestedBrief });
    } },
  ];
}
