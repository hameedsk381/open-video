# SaaS-ready structure: target layout and migration plan

Status: proposal, nothing moved yet. Goal: the same code runs as `ove ai studio` on a laptop and as an API plus worker fleet behind a login, without a rewrite, by separating **what the studio does** from **where it keeps things and who is asking**.

## What is wrong today

- `packages/cli/src/ai-studio.ts` (700 lines) is HTTP routing, request guards, the job queue, every job handler, file serving and static hosting in one closure. `ai-studio-projects.ts` is storage helpers beside it. None of it can run without a local folder, one process, and a loopback user.
- The browser app (`apps/studio`) re-declares the API types by hand (`api.ts`), so the two can drift.
- `services/api`, `services/scheduler`, `services/workers` are README placeholders; `infrastructure/docker` is a README until the Dockerfile lands.
- Engine, authoring and product code all sit in `packages/`, so nothing stops an engine package importing product code.

## Target layout

```
apps/
  studio/            React + Vite web app (exists). Talks only to the API, through @ove/contracts.
services/
  api/               HTTP API: routing, request guards, auth seam, static hosting. No rendering, no AI, no filesystem paths.
  worker/            Runs jobs (compose, refine, render, review, thumbnail, narrate, ...). The only place that starts Chromium or ffmpeg.
packages/
  # engine (unchanged; may import only other engine packages)
  schema  animation  timeline  graphics  renderer  ffmpeg  assets  core  player
  # authoring (unchanged; may import engine)
  ai  builder  react
  # platform (new; shared by api, worker, cli, studio)
  contracts/         @ove/contracts  request/response types and zod schemas: Project, Detail, Job, Library, errors
  storage/           @ove/storage    ProjectStore and AssetStore interfaces + FsProjectStore (today's behaviour) + path safety
  jobs/              @ove/jobs       JobQueue interface + InProcessQueue (today's queue) + the job handlers, written against the ports
  # product shell
  cli/               arg parsing and `ove ...` commands; `ove ai studio` wires api + InProcessQueue + FsProjectStore + loopback auth
  ove/               the published package (bundles the above)
infrastructure/
  docker/            Dockerfile per service, compose with api + worker + redis (+ object storage later)
```

Dependency rule (enforced by a test that reads imports): engine -> engine only; authoring -> engine; platform -> engine, authoring, contracts; services -> platform; apps -> contracts only; cli -> anything. Nothing imports `apps/` or `services/` except `cli` and the bundle script.

## The seams (what makes it SaaS-capable)

| Port | Local adapter (today) | Hosted adapter (later) |
|---|---|---|
| `ProjectStore` / `AssetStore` | `FsProjectStore` over `--out` | Postgres rows + S3-compatible objects |
| `JobQueue` | `InProcessQueue`, one job at a time | BullMQ on Redis, N workers, retries, priorities |
| `Auth` | `LoopbackAuth`: Host/Origin guard, one implicit user | token or session login, returns a `Principal { userId, tenantId }` |
| `Provider` (AI) | Groq/mock from env | per-tenant keys, rate limits, usage metering |
| `Sandbox` (render isolation) | in-process Chromium | container per job: no network, CPU/memory/time limits |

Every storage and queue call takes a `Principal`, even in local mode (a fixed one). That single parameter is what lets tenants be added without touching routes or handlers.

## Migration steps (each is one commit; typecheck, unit and integration tests stay green)

1. **Contracts.** Create `@ove/contracts` from the types in `apps/studio/src/api.ts` and the shapes `ai-studio.ts` returns. Studio and server both import it. *Done when:* no hand-written API types remain in the app; a test compares route responses to the zod schemas.
2. **Storage.** Create `@ove/storage`: `ProjectStore` (list, get detail, write composition with revision, rename, duplicate, trash, upload asset, thumbnail cache) and `FsProjectStore` from `ai-studio-projects.ts`, the history helpers and the `inside`/`within` path checks. *Done when:* the server has no `node:fs` calls for project data; `FsProjectStore` has its own unit tests, including traversal attempts.
3. **Jobs.** Create `@ove/jobs`: `JobQueue`, `InProcessQueue` (today's enqueue/pump/SSE feed) and the handlers (`compose`, `refine`, `render`, `thumbnail`, `review`, `narrate`, `transcribe`, `image`, `batch`, `import`) taking `{ store, provider, principal, progress }`. *Done when:* handlers run in tests with an in-memory store and the mock provider, no HTTP.
4. **API service.** Move the HTTP layer to `services/api`, split by file: `guard.ts`, `routes/projects.ts`, `routes/jobs.ts`, `routes/library.ts`, `routes/files.ts`, `static.ts`, `createApp({ store, queue, auth, provider })`. `ove ai studio` becomes a thin caller. *Done when:* `ai-studio.ts` is gone, all existing studio tests pass unchanged, the largest file is under about 200 lines.
5. **Auth seam.** Add `Auth` and `Principal`; `LoopbackAuth` keeps today's guard; storage paths become `<out>/<tenant>/<project>` with a single default tenant so existing folders keep working. Add a second test adapter to prove one tenant cannot read another's project, job or file. *Done when:* that cross-tenant test passes on every route.
6. **Worker.** `services/worker` consumes a `JobQueue` and runs handlers; local mode runs it in the same process. Add `RedisQueue` behind the interface only after steps 1-5 are merged.
7. **Containers.** Per-service Dockerfiles and a compose file (api, worker, redis). The worker image is the locked-down one (no capabilities, read-only root, no network); the api image has no Chromium. Reuse today's hardened single image as the all-in-one local option.
8. **Docs and ownership.** `docs/architecture.md` gets the layout and dependency rule; READMEs for each app, service and platform package; `CODEOWNERS`.

## Risks and how they are handled

- **Published package.** `open-video-engine` bundles the CLI with esbuild, so new workspace packages are bundled in automatically; the package-build script and the `packed tarball` smoke test (install, `ove ai studio`, compose, render) guard it. Run it after steps 3 and 4.
- **Behaviour drift.** Steps 1-5 are pure moves behind interfaces; the 8 studio integration tests plus the existing 310 unit and 83 integration tests are the safety net. No step changes a response shape except step 1, which only names it.
- **Windows paths.** `FsProjectStore` keeps today's `within()` logic and test cases (`..`, absolute paths, drive letters).
- **Scope creep.** No database, Redis, or login ships in steps 1-5. Those are adapters added after the seams exist.

## Not in this plan

Billing, plans, email, a hosted database schema, and the render sandbox's network and syscall policy. They sit on top of these seams and need their own design.
