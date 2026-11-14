# Hosting the studio for many people

`mr ai studio` is for one trusted person on their own machine. For several people, run the hosted stack: an API behind a login, a job queue, and workers that draw frames. This page says what runs, how to start it, and what it does and does not protect you from.

## What runs

| Piece | Command | Job |
|---|---|---|
| API | `mr serve` | Accounts and sessions, project and file routes, the web app. Holds no AI key and starts no browser. |
| Render worker | `mr job-worker` with `JOB_LANE=render` | Draws frames: render, thumbnail, review, batch. Runs people's compositions in Chromium. |
| AI worker | `mr job-worker` with `JOB_LANE=ai` | Compose, refine, narrate, transcribe, image, import. Calls the AI provider. |
| Postgres | | Accounts, sessions, one-time tokens, daily usage counts. |
| Redis | | The job queue (BullMQ): durable, two lanes. |
| Shared volume | | Every person's projects and files, under `_tenants/<account id>/`. Mounted by the API and both workers. |

Each account is its own tenant. Every route, file read and job runs as that account; a job is visible only to the account that started it, in lists, lookups and live events.

## Start it

### Dokploy (recommended)

1. Install [Dokploy](https://dokploy.com) on your VPS.
2. Create a **Compose** project and connect this GitHub repository. The `docker-compose.yml` at the repo root is the Dokploy compose file; `infrastructure/dokploy/compose.yml` is the same stack (a test keeps them identical), so either path works.
3. In the **Environment** tab, add the variables from `infrastructure/dokploy/.env.example` — at minimum `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `PUBLIC_ORIGIN` and `SETTINGS_SECRET`.
4. In the **Domains** tab, add a domain for the `api` service on port `3100`. Dokploy provisions the TLS certificate.
   The `api` service also carries Traefik labels that send `${APP_HOST:-motionrender.io}` to port `3100` (set `APP_HOST` to your host). That is enough on its own: if you add the same host in the Domains tab as well, delete one of the two so two routers do not claim the host. The landing page (`site`, port `8080`) needs a different host than the one the `api` serves.
5. Set `PUBLIC_ORIGIN` to the `https://` address Dokploy assigned (e.g. `https://studio.yourdomain.com`).
6. Deploy.

The compose file joins the API and AI worker to Dokploy's Traefik network for internet access, and keeps Postgres, Redis and the render worker on an internal network with no route out.

### Plain Docker / Podman

```sh
cp infrastructure/docker/.env.example infrastructure/docker/.env      # fill in the passwords, PUBLIC_ORIGIN and SETTINGS_SECRET
docker compose -f infrastructure/docker/compose.yml --env-file infrastructure/docker/.env up -d --build
```

Without a compose tool, `infrastructure/docker/stack.sh up` starts the same containers with plain `podman` or `docker` (set the variables in the environment, and `ENGINE=docker` for Docker).

Put a TLS proxy (Caddy or nginx) in front of `127.0.0.1:3100`, and set `PUBLIC_ORIGIN` to its `https://` address. The API checks the `Host` and `Origin` of every request against it. Set `TRUST_PROXY=1` (the default in the compose file) only when a proxy you control sets `X-Forwarded-For`.

## A landing page on the main domain, the app on a subdomain

The landing page (`site/`) and the app are separate services, so each gets its own domain: `yourdomain.com` for the page and `app.yourdomain.com` for the app. They share nothing. The page makes no calls to the API, so there is no cross-origin setup, and the app's sign-in cookie stays on the app's own address. (The app itself cannot sit under a path such as `/app` on the page's domain: it is built for the root of its own address and calls `/api/…` and `/files/…` from there.)

1. **DNS.** Point both names at the server: an `A` record for `yourdomain.com` and one for `app` (or a `CNAME` for `app`), each to the server's IP.
2. **Environment tab.** Set `PUBLIC_ORIGIN=https://app.yourdomain.com`.
3. **Domains tab.** Add `app.yourdomain.com` for the `api` service on port `3100`, and `yourdomain.com` for the `site` service on port `8080`. Turn HTTPS on for both.
4. **Deploy.** The `site` service is built from `site/` on every deploy, with an "Open the app" link to `PUBLIC_ORIGIN`.

To change the page, edit `site/page.html` and run `node site/build.mjs` to preview `site/index.html` (set `APP_URL=https://app.yourdomain.com` to include the app link), then redeploy. The image alone: `docker build --target site --build-arg APP_URL=https://app.yourdomain.com -t motionrender-site .`.

Not covered: redirecting `www` to the main domain, and the domain's email records.

## Settings

All through environment variables.

| Variable | Used by | Meaning |
|---|---|---|
| `DATABASE_URL` | API | Postgres address |
| `REDIS_URL` | API, workers | Redis address, with password |
| `PUBLIC_ORIGIN` | API | The https address people use |
| `DATA_DIR` | API, workers | The shared folder (`/data`) |
| `SIGNUPS`, `REQUIRE_VERIFIED` | API | Close sign-ups; require the emailed link before sign-in |
| `LIMIT_PROJECTS`, `LIMIT_UPLOAD_MB`, `LIMIT_STORAGE_MB`, `LIMIT_AI_PER_DAY`, `LIMIT_RENDERS_PER_DAY` | API | Per-account limits (defaults: 25 projects, 50 MB per file, 1 GB, 30 AI requests and 15 renders a day) |
| `JOB_LANE`, `JOB_TIMEOUT_SECONDS` | workers | `render` or `ai`; how long one job may run (900 and 300 by default) |
| `SETTINGS_SECRET` | API and AI worker | A long random string that encrypts the AI keys people save in Settings. The service has no AI key of its own: each person connects their own provider, model and key. Keep it stable; changing it makes saved keys unreadable. |

## What the stack protects, and how

- **Accounts.** Passwords are hashed with scrypt (N=32768, per-password salt). Sessions are random tokens kept only as hashes, in an HttpOnly, SameSite=Lax cookie (Secure over https). Wrong passwords are counted per account (five, then a 15-minute lock) and per address and email. A missing account takes as long to answer as a wrong password, and sign-in errors do not say which was wrong. Password reset and email links are single-use, expire, and end every session on reset.
- **Changing things.** Every request that changes something must carry JSON (or an upload) and come from the studio's own origin.
- **Rendering other people's compositions.** The render worker has no network (Docker `internal` network), no Linux capabilities, a read-only root, memory, CPU and process limits, and a per-job time limit. When a job runs past it, the worker process exits and the container restarts. Chromium's own sandbox is off inside the container because the container is the sandbox.
- **Files a video may use.** A video can use only files of its own project, uploaded pictures, clips and sounds, inline data and the built-in sounds. A source that is an absolute path, a drive or UNC path, a `..` step or a network address is refused when the project is saved (including a path carried in by a template variable or a production plan) and again before any render, review or thumbnail, so a render never reads another account's files from the shared volume.
- **Code layers.** Code and React layers are not used by the studio's own scene blocks, but the render worker does run code layers for React videos (`allowCode`). People cannot author them here: pasted JSON and AI-written compositions that contain them are refused, and a render page has no network and no file access of its own. Model-written React videos are not offered on hosted jobs yet: building one executes its code in Node, which needs its own sandbox first.
- **Server paths** are removed from every error and result a person sees.
- **Limits** keep one account from using the machine up. Thumbnails are not counted.

## What it does not do yet

- **Email.** No mail server is built in: reset and confirmation links are written to the API log. Set up SMTP (or read the log yourself) before inviting people. `REQUIRE_VERIFIED=1` without email delivery would lock people out.
- **Object storage.** Files live on one shared volume, so the API and every worker must run on the same machine (or a network file system). S3-style storage is a later adapter behind the same store interface.
- **Billing, plans, teams, an admin screen.** Limits are flat per account. An account can be disabled in the database (`users.disabled`).
- **Rate limiting across API processes.** Sign-in rate limits are kept in each API process's memory; run one API process, or put a limiter in the proxy.
- **Media from uploads is read in the API.** The API measures uploaded video and audio with ffprobe, in its own locked-down container. A malicious file could target ffprobe there.
- **Model-written React videos.** Building one executes its code in Node, so it is offered on local runs only. Hosting it needs the build to run in the render worker, in a subprocess restricted to the project folder (Node's permission model), plus a job that moves the code and the built bundle between the AI and render lanes.
- **Backups, metrics and alerts.** Back up the Postgres and data volumes yourself.

## What has and has not been tested

- **Tested in the repository's suites:** accounts, sessions, lockout, reset links and limits; that one account cannot reach another's projects, files, history, thumbnails, uploads, jobs or live events on any route (over HTTP, with the in-process queue); the user store against real Postgres 16; the Redis queue and worker (lanes, progress, results, failures without server paths, owner-only visibility, the time-limit watchdog) against real Redis 7.
- **Built, not run:** the `api` image builds. The `worker` image and `compose.yml` / `stack.sh` have not been built or started end to end, so the container limits and the render worker's lack of network are designed but not yet checked. Do that on the target machine first: bring the stack up, sign up, create and render a project, then check that the render worker cannot reach the internet (`docker exec <render worker> node -e "fetch('https://example.com').then(console.log, e => console.log('blocked'))"`).
- **Not tested at all:** the web app's sign-in screens in a browser, and the full path API to Redis to worker to shared volume with a real render.
