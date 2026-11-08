// Shown only when the web app has not been built (a source checkout before `pnpm build:studio`). The studio itself is apps/studio;
// the published package always ships it, so this page is a pointer and nothing more. It once held a second, plain copy of the whole
// studio, which had to be kept in step with the real one by hand and was not.
export const aiStudioPage = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MotionRender Studio</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:34rem;margin:12vh auto;padding:0 20px;color:#1a1a1a}code{background:#eee;padding:2px 6px;border-radius:4px}@media(prefers-color-scheme:dark){body{background:#111;color:#eee}code{background:#222}}</style>
</head><body><h1>MotionRender Studio</h1>
<p>The studio app has not been built yet. From the project folder run:</p>
<p><code>pnpm build:studio</code></p>
<p>then reload this page. To work on the studio itself, run <code>pnpm dev:studio</code> and open the address it prints.</p>
</body></html>`;
