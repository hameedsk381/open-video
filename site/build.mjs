// Wraps page.html (the fragment form the artifact viewer publishes) into index.html, a standalone page for any static host.
// Usage: node site/build.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const fragment = readFileSync(join(dir, 'page.html'), 'utf8');
const split = fragment.indexOf('<div class="wrap">');
if (split < 0) throw new Error('page.html has no <div class="wrap">: the head part cannot be told from the body');
const head = fragment.slice(0, split).trim(), body = fragment.slice(split);
const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>:root { color-scheme: light; } html { -webkit-text-size-adjust: 100%; } body { margin: 0; } img, video { max-width: 100%; } [hidden] { display: none !important; }</style>
${head}
</head>
<body>
${body}</body>
</html>
`;
writeFileSync(join(dir, 'index.html'), page);
console.log(`site/index.html written (${page.length} characters)`);
