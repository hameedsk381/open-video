// Repairs by patch: when a generated composition has problems, the model replies with only the parts to change instead of the
// whole composition again. Output tokens are the slow and costly ones, and a repair usually touches one layer or animation.
export type Fix = { path?: string; value?: unknown; remove?: boolean; layer?: string; set?: Record<string, unknown> };

/** A reply that holds fixes and not a composition of its own. */
export const isFixReply = (reply: any): reply is { fixes: Fix[] } => !!reply && typeof reply === 'object' && Array.isArray(reply.fixes) && !('scenes' in reply);

const steps = (path: string): (string | number)[] => (path.match(/[^.[\]]+/g) ?? []).map(step => /^\d+$/.test(step) ? Number(step) : step);

function findLayer(layers: any[] | undefined, id: string): any {
  for (const layer of layers ?? []) {
    if (layer?.id === id) return layer;
    const inner = findLayer(layer?.children, id);
    if (inner) return inner;
  }
  return undefined;
}

/** Applies the fixes to a copy of the composition. A fix that cannot be placed is an error the model gets to read. */
export function applyFixes(previous: any, fixes: Fix[]): any {
  if (!previous || typeof previous !== 'object') throw new Error('There is no earlier composition to apply fixes to; return the complete composition JSON');
  const validFixes = Array.isArray(fixes) ? fixes.filter(fix => fix && typeof fix === 'object') : [];
  if (!validFixes.length) throw new Error('"fixes" has no valid changes; list what to change or return the complete composition JSON');
  const result = structuredClone(previous);
  validFixes.forEach((fix, index) => {
    const label = `fix ${index + 1}`;
    if (typeof fix.layer === 'string') {
      const layer = result.scenes?.map((scene: any) => findLayer(scene.layers, fix.layer!)).find(Boolean);
      if (!layer) throw new Error(`${label}: there is no layer "${fix.layer}"`);
      if (!fix.set || typeof fix.set !== 'object' || Array.isArray(fix.set)) throw new Error(`${label}: "set" must be an object of the layer's fields`);
      for (const [key, value] of Object.entries(fix.set)) { if (value === null) delete layer[key]; else layer[key] = value; }
      return;
    }
    if (typeof fix.path !== 'string' || !fix.path.trim()) throw new Error(`${label} needs a "path" (such as scenes[1].layers[0]) or a "layer" id`);
    const way = steps(fix.path);
    if (!way.length) throw new Error(`${label}: the path "${fix.path}" is empty`);
    let parent = result;
    for (const step of way.slice(0, -1)) {
      parent = parent?.[step];
      if (parent === undefined || parent === null || typeof parent !== 'object') throw new Error(`${label}: nothing at "${fix.path}" (it stops before ${step})`);
    }
    const last = way[way.length - 1]!;
    if (fix.remove) {
      if (Array.isArray(parent)) { if (typeof last !== 'number' || last >= parent.length) throw new Error(`${label}: no item at "${fix.path}"`); parent.splice(last, 1); }
      else delete parent[last];
      return;
    }
    if (!('value' in fix)) throw new Error(`${label} needs a "value" (or "remove": true)`);
    if (Array.isArray(parent) && (typeof last !== 'number' || last > parent.length)) throw new Error(`${label}: "${fix.path}" is past the end of its list`);
    parent[last] = fix.value;
  });
  return result;
}

/** What the model is told after a failed attempt, once there is a composition it can patch. */
export const patchFeedback = (intro: string) =>
  `${intro}\n\nReply with only the changes, not the whole composition: {"fixes": [{"path": "scenes[1].layers[0].animations[0]", "value": {…}}, {"layer": "title", "set": {"fontSize": 40}}, {"path": "scenes[0].layers[3]", "remove": true}]}. ` +
  'Replace the smallest whole object that contains each problem (one animation entry, one layer). Paths count from 0. Do not repeat what is already right.';
