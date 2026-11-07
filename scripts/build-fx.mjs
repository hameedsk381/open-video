// Rebuilds the bundle the fx-* blocks draw from. `ove build` also writes a composition and its schema next to the source; only the
// bundle is kept, because a block brings the bundle into a project and the composition is the project's own.
import { execFileSync } from 'node:child_process';
import { rm } from 'node:fs/promises';

const dir = 'packages/cli/blocks/support';
execFileSync('npx', ['tsx', 'packages/cli/src/index.ts', 'build', `${dir}/fx.tsx`], { stdio: 'inherit', shell: true });
for (const extra of ['composition.json', 'composition.schema.json']) await rm(`${dir}/${extra}`, { force: true });
