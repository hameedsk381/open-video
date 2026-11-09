# Contributing

## Setup

Node 22 or newer (see `.nvmrc`), pnpm 10 (pinned by `packageManager`) and an FFmpeg build with libx264, libx265, libvpx-vp9, libopus and ProRes.

```sh
pnpm install
pnpm exec playwright install chromium
pnpm ove doctor        # checks Node, FFmpeg encoders and the browser
```

## Layout

| Folder | What lives there |
|---|---|
| `packages/schema`, `timeline`, `animation`, `graphics`, `assets`, `ffmpeg` | The composition format and the pieces that draw and time it |
| `packages/renderer`, `core`, `player` | Turning a composition into frames, video, audio, and the browser Player |
| `packages/ai` | Briefs to videos: planning, direction, critique, providers |
| `packages/contracts`, `storage`, `jobs` | Request shapes, projects on disk, queued jobs |
| `services/api`, `services/worker` | The hosted HTTP API and the job worker |
| `packages/cli` | The `mr` command and the local studio server |
| `apps/studio`, `apps/desktop` | The web studio and the Electron shell |
| `packages/ove` | The published `motionrender` package (built, not edited) |
| `scripts`, `tests`, `docs`, `infrastructure`, `examples` | Tooling, tests, documentation, deployment files, sample videos |

A lower-level package never imports a higher-level one. The format and drawing packages (the top rows) know nothing about AI, jobs, the API or the CLI;
`storage` must not import `ai`; `schema` imports nothing from the repo. Import other packages by name (`@ove/core`), never by a relative path into their `src`.

## Before you open a pull request

```sh
pnpm typecheck                         # packages, services, scripts and tests
pnpm --filter @ove/studio typecheck    # the web studio
pnpm lint
pnpm test
pnpm test:integration                  # needs FFmpeg and Chromium; run it when routes, storage, rendering or the Player change
```

`noUnusedLocals` is on, so an unused import or variable fails the typecheck.

## Conventions

- Small, focused changes. Keep behaviour changes and refactors in separate commits.
- New behaviour comes with a test next to the closest existing one in `tests/unit` or `tests/integration`.
- A setting that is read from the environment is added to `packages/cli/src/serve-config.ts`, documented in `docs/hosting.md` and listed in
  `infrastructure/*/.env.example`. Secrets never go in the repository.
- The hosted service holds no AI key. AI features read the signed-in person's own connection from Settings; the CLI and local studio
  may read provider keys from the environment of the machine they run on.
- Generated media, scratch work and local outputs stay out of git (`scratch/`, `artifacts/`, `ai-videos/`, `tmp/`).
