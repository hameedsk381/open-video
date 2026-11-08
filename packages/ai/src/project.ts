import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { compositionJsonSchema, loadComposition, type Composition } from '@ove/core';
import { variablesSchema } from '@ove/schema';

export const colorValue = /^(#[0-9a-fA-F]{3,8}|rgba?\(.+\)|transparent)$/;

export type FieldSpec = { name: string; type: string; description?: string; example?: unknown };

/** Variables inferred from a batch file, so a generated template can be used with `ove render --batch` unchanged. */
export function fieldsFromRows(rows: Record<string, unknown>[]): FieldSpec[] {
  if (!rows.length) return [];
  const names = [...new Set(rows.flatMap(row => Object.keys(row ?? {})))];
  return names.map(name => {
    const example = rows.map(row => row?.[name]).find(value => value !== undefined && value !== null);
    const type = typeof example === 'number' ? 'number' : typeof example === 'boolean' ? 'boolean' : typeof example === 'string' && colorValue.test(example) ? 'color' : 'string';
    return { name, type, example };
  });
}

/** Writes a ready-to-use project: composition.json, the schema for editors, and an assets folder. */
export async function writeCompositionProject(dir: string, composition: Composition, options: { force?: boolean; /** Written instead of the resolved composition: a template that is still a template (variables, components). */ source?: unknown } = {}): Promise<{ dir: string; composition: string; schema: string }> {
  const target = resolve(dir);
  let existing: string[] = [];
  try { existing = await readdir(target); } catch { /* a new folder */ }
  if (existing.length && !options.force && !(existing.length === 1 && existing[0] === 'assets')) throw new Error(`${target} is not empty; pass --force to write into it anyway`);
  await mkdir(resolve(target, 'assets'), { recursive: true });
  const source = (options.source as Record<string, unknown> | undefined) ?? (composition as unknown as Record<string, unknown>);
  const json: Record<string, unknown> = { $schema: './composition.schema.json', ...source };
  // A template is saved as a template, so its variables stay editable, but the script written for it is not a variable:
  // carry it across (and the beat each scene speaks), or the saved project loses what narration and captions read.
  const content = (composition as any).content;
  if (content) {
    if (!json.content) json.content = content;
    if (Array.isArray(json.scenes)) json.scenes = json.scenes.map((scene: any) => {
      const resolved = composition.scenes.find(candidate => candidate.id === scene?.id);
      return resolved?.beat && !scene?.beat ? { ...scene, beat: resolved.beat } : scene;
    });
  }
  const compositionPath = resolve(target, 'composition.json'), schemaPath = resolve(target, 'composition.schema.json');
  await writeFile(compositionPath, JSON.stringify(json, null, 2) + '\n');
  await writeFile(schemaPath, JSON.stringify(compositionJsonSchema, null, 2) + '\n');
  return { dir: target, composition: compositionPath, schema: schemaPath };
}

/** A composition-relative path in the form OVE accepts (`./assets/x.png`, or `../shared/x.png`). */
export function compositionRelative(baseDir: string, file: string): string {
  const rel = relative(resolve(baseDir), resolve(file)).replace(/\\/g, '/');
  // Another drive has no relative path: keep the absolute one as it is.
  if (isAbsolute(rel)) return rel;
  return rel.startsWith('.') ? rel : `./${rel}`;
}

export const assetIdFromPath = (file: string) =>
  file.split(/[\\/]/).pop()!.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'asset';

export const baseDirOf = (file: string) => dirname(resolve(file));

/** Values for a template's required variables, so a raw file can be checked without knowing real inputs. */
export function sampleValues(raw: any): Record<string, unknown> {
  const declarations = variablesSchema.parse(raw?.variables ?? {});
  return Object.fromEntries(Object.entries(declarations).map(([name, declaration]: [string, any]) => [name,
    declaration.default ?? (declaration.type === 'number' ? 1 : declaration.type === 'boolean' ? true : declaration.type === 'color' ? '#000000' : declaration.type === 'list' ? [] : 'sample')]));
}

/** Validates a composition that may still contain template variables, without resolving them in the file. */
export function validateTemplate(raw: any): void { loadComposition(raw, sampleValues(raw)); }
