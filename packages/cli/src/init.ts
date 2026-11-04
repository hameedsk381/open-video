import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compositionJsonSchema, loadComposition } from '@ove/schema';
import { assertTemplateId, templatesDir } from './templates';
export const starterTemplate = fileURLToPath(new URL('../templates/starter', import.meta.url));
export const skillDir = fileURLToPath(new URL('../skills/ove', import.meta.url));
/** Every skill folder: the main `ove` guide and the task guides (reels, voiceover, batches, AI). */
export const skillsRoot = fileURLToPath(new URL('../skills', import.meta.url));
export type InitOptions = { force?: boolean; skill?: boolean; template?: string };
const isEmptyDir = async (dir: string) => { try { return (await readdir(dir)).length === 0; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true; throw error; } };
async function listFiles(dir: string): Promise<string[]> { return (await readdir(dir, { recursive: true, withFileTypes: true })).filter(e => e.isFile()).map(e => join(e.parentPath, e.name)); }
// Scaffolds a renderable project: composition.json, its JSON Schema, starter assets and (by default) the OVE agent skill.
// With `template`, the files come from one of the reusable templates under packages/cli/templates instead of the starter.
export async function initProject(dir: string, options: InitOptions = {}): Promise<string[]> {
  const target = resolve(dir);
  if (!options.force && !(await isEmptyDir(target))) throw new Error(`${target} is not empty; pass --force to write into it anyway`);
  const source = options.template ? join(templatesDir, assertTemplateId(options.template)) : starterTemplate;
  await mkdir(target, { recursive: true });
  await cp(source, target, { recursive: true, force: true });
  // template.json describes the catalogue entry, not the project the user now owns.
  await rm(join(target, 'template.json'), { force: true });
  const compositionPath = join(target, 'composition.json');
  const name = basename(target);
  const composition = JSON.parse((await readFile(compositionPath, 'utf8')).replace(/^\uFEFF/, ''));
  composition.id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'video';
  composition.name = name;
  loadComposition(composition);
  await writeFile(compositionPath, JSON.stringify(composition, null, 2) + '\n');
  await writeFile(join(target, 'composition.schema.json'), JSON.stringify(compositionJsonSchema, null, 2) + '\n');
  if (options.skill !== false) {
    await cp(skillsRoot, join(target, '.claude', 'skills'), { recursive: true, force: true });
    await cp(skillsRoot, join(target, '.agent', 'skills'), { recursive: true, force: true });
    const agentsMd = `# MotionRender (OVE) Agent Instructions

MotionRender is a frame-deterministic motion graphics video engine.

## Essential Commands
- \`mr dev\`: Start local hot-reloading preview server
- \`mr render\`: Headless video rendering
- \`mr still --frame <n>\`: Export a single frame as image
- \`mr review\`: Automated design, type scale, safe-zone, and audio check
- \`mr review --show-safe-zones\`: Generate contact sheet with social UI overlays

## Composition Grammar
Full skill documentation and guidelines are located in:
- \`.agent/skills/ove/SKILL.md\`
- \`.claude/skills/ove/SKILL.md\`
`;
    await writeFile(join(target, 'AGENTS.md'), agentsMd);
    const cursorRules = `# MotionRender Rules
- Motion graphics compositions are defined in \`composition.json\` adhering to \`composition.schema.json\`.
- Use \`mr review\` to verify visual hierarchy, text safety, and audio loudness.
- Detailed agent skills are located in \`.agent/skills/\`.
`;
    await writeFile(join(target, '.cursorrules'), cursorRules);
  }
  return (await listFiles(target)).map(file => relative(target, file)).sort();
}
