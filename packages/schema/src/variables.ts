import { z } from 'zod'; import { evaluateExpression } from './expression';
export const colorPattern = /^(#[0-9a-fA-F]{3,8}|rgba?\(.+\)|transparent)$/;
const name = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Names use letters, digits and _');
const scalarTypes = ['string','number','boolean','color'] as const;
export const listFieldSchema = z.object({ type: z.enum(scalarTypes), default: z.union([z.string(), z.number(), z.boolean()]).optional(), description: z.string().optional() });
export const variableSchema = z.object({ type: z.enum([...scalarTypes, 'list']), default: z.union([z.string(), z.number(), z.boolean(), z.array(z.record(z.string(), z.unknown()))]).optional(), description: z.string().optional(),
  items: z.record(name, listFieldSchema).optional().describe('list only: the fields each item has, checked and given defaults like variables') });
export const variablesSchema = z.record(name, variableSchema);
// A component is a reusable set of layers. Placing it with { "use": "name", "with": { ... } } makes a group of those layers, with
// `params` filled from `with` (plus the composition's own variables) and every other field of the placement applied to the group.
export const componentSchema = z.object({ description: z.string().optional(), params: variablesSchema.default({}), layers: z.array(z.unknown()) });
export const componentsSchema = z.record(name, componentSchema);
export type VariableDeclaration = z.infer<typeof variableSchema>; export type ListItem = Record<string, unknown>; export type VariableValue = string | number | boolean | ListItem[];
export class VariableError extends Error { constructor(readonly problems: string[]) { super(`Variables:\n  ${problems.join('\n  ')}`); } }
// Values from the command line arrive as strings; they are converted to the declared type, and anything that does not fit is an error.
// A list may be given as JSON text; its items are checked against `items` when that is declared.
export function coerceVariable(label: string, declaration: VariableDeclaration | z.infer<typeof listFieldSchema>, value: unknown): VariableValue { const fail=(expected: string) => { throw new Error(`${label}: expected ${expected}, got ${JSON.stringify(value)}`); };
  switch (declaration.type) {
    case 'number': { const n=typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN; return Number.isFinite(n) ? n : fail('a number'); }
    case 'boolean': return value === true || value === 'true' ? true : value === false || value === 'false' ? false : fail('true or false');
    case 'color': return typeof value === 'string' && colorPattern.test(value) ? value : fail('a colour such as #ff0000 or rgba(0,0,0,0.5)');
    case 'string': return typeof value === 'string' ? value : typeof value === 'number' || typeof value === 'boolean' ? String(value) : fail('text');
    case 'list': { let list=value; if (typeof list === 'string') { try { list=JSON.parse(list); } catch { fail('a JSON list such as [{"name":"A"}]'); } }
      if (!Array.isArray(list) || !list.every(item => item && typeof item === 'object' && !Array.isArray(item))) return fail('a list of objects');
      const fields=(declaration as VariableDeclaration).items; if (!fields) return list as ListItem[];
      return (list as ListItem[]).map((item, i) => { for (const key of Object.keys(item)) if (!(key in fields)) throw new Error(`${label}[${i}].${key}: not declared in "items" (declared: ${Object.keys(fields).join(', ')})`);
        return Object.fromEntries(Object.entries(fields).map(([field, decl]) => { const v=field in item ? item[field] : decl.default; if (v === undefined) throw new Error(`${label}[${i}].${field}: no value and no default`); return [field, coerceVariable(`${label}[${i}].${field}`, decl, v)]; })); }); } } }
// Merges supplied values over declared defaults. Unknown names and variables with neither a value nor a default are errors.
export function resolveVariables(declarations: Record<string, VariableDeclaration>, supplied: Record<string, unknown> = {}): Record<string, VariableValue> { const problems: string[]=[], values: Record<string, VariableValue>={};
  for (const key of Object.keys(supplied)) if (!(key in declarations)) problems.push(`${key}: not declared in "variables"${Object.keys(declarations).length ? ` (declared: ${Object.keys(declarations).join(', ')})` : ''}`);
  for (const [key, declaration] of Object.entries(declarations)) { const value=key in supplied ? supplied[key] : declaration.default; if (value === undefined) { problems.push(`${key}: no value given and no default`); continue; } try { values[key]=coerceVariable(key, declaration, value); } catch (error) { problems.push((error as Error).message); } }
  if (problems.length) throw new VariableError(problems); return values; }
const wholeReference=/^\{\{((?:(?!\}\})[\s\S])*)\}\}$/, reference=/\{\{((?:(?!\}\})[\s\S])*)\}\}/g;
// Lists of these keys may contain `if`, `repeat` and `use` entries; everywhere else only {{ }} is expanded.
const expandableLists=new Set(['layers','children','scenes','each','overlay']);
// Empty lists and text count as false in `if`, unlike JavaScript.
const truthy=(v: unknown) => Array.isArray(v) ? v.length > 0 : !!v;
const asText=(v: unknown) => v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v);
const plain=(v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const omit=(o: Record<string, unknown>, ...keys: string[]) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));
// Expands a raw composition (everything except its "variables", "components" and "$schema" blocks):
//  - "{{ expression }}" in any string. A string that is exactly one {{ }} takes the expression's value with its type (number, list…);
//    otherwise each {{ }} is inserted as text.
//  - In layers, children, scenes and repeat bodies: { "if": … } keeps an entry only when true; { "repeat": list, "as": "item", "each": [...] }
//    emits the `each` entries once per item, with `item`, `index` (from 0) and `count` available; { "use": "component", "with": {…} } becomes a group.
// `extra` adds read-only names to every scope, components included (for example `media`, the measured audio and video).
export function substituteVariables(raw: unknown, values: Record<string, VariableValue>, extra: Record<string, unknown> = {}): unknown { const problems: string[]=[];
  const components=plain(raw) && raw.components !== undefined ? componentsSchema.safeParse(raw.components) : undefined; if (components && !components.success) problems.push(`components: ${components.error.issues.map(i => `${i.path.join('.')} ${i.message}`).join('; ')}`);
  const defs=components?.success ? components.data : {};
  const evaluate=(source: string, scope: Record<string, unknown>, path: string) => { try { return evaluateExpression(source.trim(), scope); } catch (error) { problems.push(`${path}: {{${source.trim()}}}: ${(error as Error).message}`); return undefined; } };
  const text=(value: string, scope: Record<string, unknown>, path: string): unknown => { const whole=wholeReference.exec(value); if (whole) { const result=evaluate(whole[1]!, scope, path); return result === undefined ? value : result; } return value.replace(reference, (match, source: string) => { const result=evaluate(source, scope, path); return result === undefined ? match : asText(result); }); };
  const visit=(node: unknown, scope: Record<string, unknown>, path: string, stack: string[]): unknown => {
    if (typeof node === 'string') return text(node, scope, path);
    if (Array.isArray(node)) return expandableLists.has(path.split('.').pop()!.replace(/\[\d+\]$/, '')) ? expandList(node, scope, path, stack) : node.map((item, i) => visit(item, scope, `${path}[${i}]`, stack));
    if (plain(node)) return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, path === '' && (key === 'variables' || key === 'components' || key === '$schema') ? value : visit(value, scope, path ? `${path}.${key}` : key, stack)]));
    return node; };
  const expandList=(items: unknown[], scope: Record<string, unknown>, path: string, stack: string[]): unknown[] => items.flatMap((entry, i) => { const at=`${path}[${i}]`; if (!plain(entry)) return [visit(entry, scope, at, stack)];
    let item=entry; if ('if' in item) { const condition=typeof item.if === 'string' ? text(item.if, scope, `${at}.if`) : item.if; if (!truthy(condition)) return []; item=omit(item, 'if'); }
    if ('repeat' in item) { const list=typeof item.repeat === 'string' ? text(item.repeat, scope, `${at}.repeat`) : item.repeat; const as=item.as ?? 'item';
      if (typeof as !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(as)) { problems.push(`${at}.as: must be a name such as "product"`); return []; }
      if (!Array.isArray(list)) { if (typeof list !== 'string' || !reference.test(list)) problems.push(`${at}.repeat: expected a list, got ${JSON.stringify(list)}`); reference.lastIndex=0; return []; }
      if (!Array.isArray(item.each)) { problems.push(`${at}.each: put the entries to repeat in "each": [ … ]`); return []; }
      const body=item.each; return list.flatMap((value, index) => expandList(body, { ...scope, [as]: value, index, count: list.length }, `${at}.each`, stack)); }
    if ('use' in item) { const component=String(item.use), def=defs[component]; if (!def) { problems.push(`${at}.use: no component "${component}"${Object.keys(defs).length ? ` (defined: ${Object.keys(defs).join(', ')})` : ''}`); return []; }
      if (stack.includes(component)) { problems.push(`${at}.use: component "${component}" uses itself (${[...stack, component].join(' → ')})`); return []; }
      if ('type' in item) { problems.push(`${at}: a placed component is always a group; remove "type"`); return []; }
      const given=visit(item.with ?? {}, scope, `${at}.with`, stack); let params: Record<string, VariableValue>={}; try { params=resolveVariables(def.params, plain(given) ? given : {}); } catch (error) { for (const problem of (error as VariableError).problems ?? [(error as Error).message]) problems.push(`${at}.with.${problem}`); return []; }
      return [{ ...(visit(omit(item, 'use', 'with'), scope, at, stack) as object), type: 'group', children: expandList(def.layers, { ...extra, ...values, ...params }, `components.${component}.layers`, [...stack, component]) }]; }
    return [visit(item, scope, at, stack)]; });
  const result=visit(raw, { ...extra, ...values }, '', []); if (problems.length) throw new VariableError(problems); return result; }
export const interpolate = (template: string, values: Record<string, VariableValue>) => substituteVariables(template, values) as string;
