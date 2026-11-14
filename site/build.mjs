// Wraps page.html (the fragment form the artifact viewer publishes) into index.html, a standalone page for any static host.
// Usage: node site/build.mjs            the page, with no link to an app
//        APP_URL=https://app.example.com node site/build.mjs     the same, with an "Open the app" link in the menu and under the headline
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** The address of the hosted app: https, or http on localhost for a local test. Anything else is refused, so it can never break out of the attribute it is written into. */
export function checkAppUrl(value) {
  const url = String(value ?? '').trim();
  if (url === '') return '';
  const https = /^https:\/\/[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?(\/[^\s"'<>`]*)?$/i, local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?(\/[^\s"'<>`]*)?$/i;
  if (!https.test(url) && !local.test(url)) throw new Error(`APP_URL must be an https:// address (or http://localhost for a test), got "${url}"`);
  return url;
}

/** page.html (the fragment) as a full document. `appUrl` fills the two app-link spots; with none they are left out. */
export function renderPage(fragment, appUrl = '') {
  const split = fragment.indexOf('<div class="wrap">');
  if (split < 0) throw new Error('page.html has no <div class="wrap">: the head part cannot be told from the body');
  const app = checkAppUrl(appUrl);
  const head = fragment.slice(0, split).trim();
  const body = fragment.slice(split)
    .replace('<!--app-nav-->', app ? `<a class="app" href="${app}" rel="noopener">Open the app</a>` : '')
    .replace('<!--app-cta-->', app ? `<a class="btn app" href="${app}" rel="noopener">Open the app</a>` : '');
  return `<!doctype html>
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
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = dirname(fileURLToPath(import.meta.url));
  const page = renderPage(readFileSync(join(dir, 'page.html'), 'utf8'), process.env.APP_URL);
  writeFileSync(join(dir, 'index.html'), page);
  console.log(`site/index.html written (${page.length} characters${process.env.APP_URL ? `, linking to ${process.env.APP_URL}` : ', no app link'})`);
}
