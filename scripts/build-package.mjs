// Builds packages/ove, the publishable `motionrender` package, from the workspace sources:
//   dist/index.js   the Node API (@ove/core and what it uses), bundled into one ES module
//   dist/cli.js     the `ove` command
//   dist/index.d.ts type declarations, emitted by tsc and re-pointed from @ove/* workspace names to relative files
//   dist/player.js  the browser Player (motionrender/player), minified, with its own declarations
//   templates/, skills/  copied next to dist so `ove init` finds them the same way it does in the workspace
// playwright and zod stay external: they are the package's dependencies. Run with tsx (pnpm build:package) since it imports TypeScript.
import { bundlePlayer } from '../packages/player/src/bundle.ts';
import { build } from 'esbuild'; import { execFileSync } from 'node:child_process'; import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'; import { dirname, join, relative, resolve } from 'node:path'; import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)), '..'), out=join(root, 'packages', 'ove'), dist=join(out, 'dist');
await rm(dist, { recursive: true, force: true }); await rm(join(out, 'templates'), { recursive: true, force: true }); await rm(join(out, 'blocks'), { recursive: true, force: true }); await rm(join(out, 'studio'), { recursive: true, force: true }); await rm(join(out, 'themes'), { recursive: true, force: true }); await rm(join(out, 'skills'), { recursive: true, force: true });
// esbuild is external too: the CLI only reaches it to bundle the Player when running from source, never from this package, which ships player.js.
const common={ bundle: true, platform: 'node', format: 'esm', target: 'node22', external: ['playwright', 'zod', 'pg', 'bullmq', 'esbuild'], logLevel: 'warning', legalComments: 'none' };
await build({ ...common, entryPoints: [join(root, 'packages/core/src/index.ts')], outfile: join(dist, 'index.js') });
await build({ ...common, entryPoints: [join(root, 'packages/cli/src/index.ts')], outfile: join(dist, 'cli.js') });
await build({ ...common, platform: 'neutral', entryPoints: [join(root, 'packages/builder/src/index.ts')], outfile: join(dist, 'builder.js') });
await build({ ...common, platform: 'neutral', external: ['react'], entryPoints: [join(root, 'packages/react/src/index.ts')], outfile: join(dist, 'react.js') }); // components for React videos; React itself is the project's // the code-as-video API: plain JavaScript, no dependencies // keeps the source's #! line
// Declarations: emit for every workspace package, then rewrite '@ove/x' to the relative path of x's emitted index, and give
// extensionless relative imports a .js extension so NodeNext consumers resolve them.
const types=join(dist, 'types'); const tsc=join(root, 'node_modules', 'typescript', 'bin', 'tsc');
execFileSync(process.execPath, [tsc, '-p', join(root, 'tsconfig.json'), '--noEmit', 'false', '--declaration', '--emitDeclarationOnly', '--outDir', types, '--rootDir', root], { stdio: 'inherit' });
await rm(join(types, 'tests'), { recursive: true, force: true }); await rm(join(types, 'vitest.config.d.ts'), { force: true }); await rm(join(types, 'vitest.integration.config.d.ts'), { force: true });
async function* files(dir) { for (const entry of await readdir(dir, { withFileTypes: true })) { const path=join(dir, entry.name); if (entry.isDirectory()) yield* files(path); else if (path.endsWith('.d.ts')) yield path; } }
for await (const file of files(types)) { const from=dirname(file); let text=await readFile(file, 'utf8');
  text=text.replace(/(from\s+|import\()(['"])@ove\/([a-z-]+)\2/g, (_, lead, quote, pkg) => { let target=relative(from, join(types, 'packages', pkg, 'src', 'index.js')).split('\\').join('/'); if (!target.startsWith('.')) target=`./${target}`; return `${lead}${quote}${target}${quote}`; });
  text=text.replace(/(from\s+|import\()(['"])(\.\.?\/[^'"]+?)\2/g, (match, lead, quote, spec) => /\.(js|json)$/.test(spec) ? match : `${lead}${quote}${spec}.js${quote}`);
  await writeFile(file, text); }
// The API uses Node's Buffer, so the declarations pull in Node's types; @types/node is an optional peer dependency.
await writeFile(join(dist, 'index.d.ts'), "/// <reference types=\"node\" />\nexport * from './types/packages/core/src/index.js';\n");
// The Player: a minified browser bundle. tsc does not copy hand-written .d.ts files, so the canvas runtime's module declaration is
// copied beside the Player's emitted declarations and referenced from them.
await bundlePlayer({ outfile: join(dist, 'player.js'), minify: true });
await cp(join(root, 'packages/player/src/canvas-runtime.d.ts'), join(types, 'packages/player/src/canvas-runtime.d.ts'));
const playerTypes=join(types, 'packages/player/src/index.d.ts'); await writeFile(playerTypes, `/// <reference path="./canvas-runtime.d.ts" />\n${await readFile(playerTypes, 'utf8')}`);
await writeFile(join(dist, 'react.d.ts'), "export * from './types/packages/react/src/index.js';\n");
await writeFile(join(dist, 'builder.d.ts'), "export * from './types/packages/builder/src/index.js';\n");
await writeFile(join(dist, 'player.d.ts'), "export * from './types/packages/player/src/index.js';\n");
// The built-in Inter faces with their licence: the renderer reads them from dist/fonts, and the Player loads them from there by URL.
const { builtinFontDir } = await import('../packages/graphics/src/fonts.ts'); const { builtinFontFaces } = await import('../packages/graphics/src/index.ts'); await mkdir(join(dist, 'fonts'), { recursive: true });
for (const face of builtinFontFaces) await cp(join(builtinFontDir(), face.file), join(dist, 'fonts', face.file)); await cp(join(builtinFontDir(), '..', 'LICENSE'), join(dist, 'fonts', 'LICENSE-Inter.txt'));
// The drawing runtime and text layout, read as text by the bundled code from dist/runtime.
await cp(join(root, 'packages/graphics/runtime'), join(dist, 'runtime'), { recursive: true });
const { lottiePlayerPath } = await import('../packages/graphics/src/runtime.ts'); await cp(lottiePlayerPath(), join(dist, 'runtime', 'lottie_light_canvas.min.js'));
// The built-in sound effects, for the Player (renders make their own in the cache folder).
const { sfxFile } = await import('../packages/core/src/audio.ts'); const { sfxNames } = await import('../packages/schema/src/index.ts'); await mkdir(join(dist, 'sfx'), { recursive: true });
for (const name of sfxNames) await cp(await sfxFile(name), join(dist, 'sfx', `${name}.wav`));
await cp(join(root, 'packages/cli/studio'), join(out, 'studio'), { recursive: true }); // the AI Studio web app (pnpm build:studio)
await cp(join(root, 'packages/cli/templates'), join(out, 'templates'), { recursive: true }); await cp(join(root, 'packages/cli/blocks'), join(out, 'blocks'), { recursive: true }); await cp(join(root, 'packages/cli/themes'), join(out, 'themes'), { recursive: true }); await cp(join(root, 'packages/cli/skills'), join(out, 'skills'), { recursive: true });
await cp(join(root, 'LICENSE'), join(out, 'LICENSE')); // packages/ove/README.md is the package's own README, kept in the repository
console.log(`Built ${relative(root, out)}: dist/index.js, dist/cli.js, dist/player.js, declarations, templates/, skills/`);
