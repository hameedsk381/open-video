# Studio (AI Studio web app)

The React + Vite app behind `ove ai studio`. It talks to the studio server's JSON API and previews with the browser Player (`/player.js`), and uses system fonts only, so it runs offline.

```sh
pnpm build:studio     # builds into packages/cli/studio, which `ove ai studio` serves
pnpm dev:studio       # Vite dev server on :5173, proxying the API to a running `ove ai studio` on :3100
```

Without a build, `ove ai studio` falls back to the plain page in `packages/cli/src/ai-studio-page.ts`. `pnpm build:package` builds the app and copies it into the published package.
