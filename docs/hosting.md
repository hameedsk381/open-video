# Hosting the studio for many people

`ove ai studio` is for one trusted person on their own machine. For several people, run the hosted stack: an API behind a login, a job queue, and workers that draw frames. This page says what runs, how to start it, and what it does and does not protect you from.

## What runs

| Piece | Command | Job |
|---|---|---|
| API | `ove serve` | Accounts and sessions, project and file routes, the web app. Holds no AI key and starts no browser. |
| Render worker | `ove job-worker` with `JOB_LANE=render` | Draws frames: render, thumbnail, review, batch. Runs people's compositions in Chromium. |
| AI worker | `ove job-worker` with `JOB_LANE=ai` | Compose, refine, narrate, transcribe, image, import. Calls the AI provider. |
| Postgres | | Accounts, sessions, one-time tokens, daily usage counts. |
| Redis | | The job queue (BullMQ): durable, two lanes. |
| Shared volume | | Every person's projects and files, under `_tenants/<account id>/`. Mounted by the API and both workers. |

Each account is its own tenant. Every route, file read and job runs as that account; a job is visible only to the account that started it, in lists, lookups and live events.

## Start it

```sh
cp infrastructure/docker/.env.example infrastructure/docker/.env      # fill in the passwords, PUBLIC_ORIGIN and GROQ_API_KEY
docker compose -f infrastructure/docker/compose.yml --env-file infrastructure/docker/.env up -d --build
```

Without a compose tool, `infrastructure/docker/stack.sh up` starts the same containers with plain `podman` or `docker` (set the variables in the environment, and `ENGINE=docker` for Docker).

Put a TLS proxy (Caddy or nginx) in front of `127.0.0.1:3100`, and set `PUBLIC_ORIGIN` to its `https://` address. The API checks the `Host` and `Origin` of every request against it. Set `TRUST_PROXY=1` (the default in the compose file) only when a proxy you control sets `X-Forwarded-For`.

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
| `GROQ_API_KEY` | AI worker | The AI provider key. The API never sees it. |

## What the stack protects, and how

- **Accounts.** Passwords are hashed with scrypt (N=32768, per-password salt). Sessions are random tokens kept only as hashes, in an HttpOnly, SameSite=Lax cookie (Secure over https). Wrong passwords are counted per account (five, then a 15-minute lock) and per address and email. A missing account takes as long to answer as a wrong password, and sign-in errors do not say which was wrong. Password reset and email links are single-use, expire, and end every session on reset.
- **Changing things.** Every request that changes something must carry JSON (or an upload) and come from the studio's own origin.
- **Rendering other people's compositions.** The render worker has no network (Docker `internal` network), no Linux capabilities, a read-only root, memory, CPU and process limits, and a per-job time limit. When a job runs past it, the worker process exits and the container restarts. Code layers do not run (`allowCode` is never set). Chromium's own sandbox is off inside the container because the container is the sandbox.
- **Server paths** are removed from every error and result a person sees.
- **Limits** keep one account from using the machine up. Thumbnails are not counted.

## What it does not do yet

- **Email.** No mail server is built in: reset and confirmation links are written to the API log. Set up SMTP (or read the log yourself) before inviting people. `REQUIRE_VERIFIED=1` without email delivery would lock people out.
- **Object storage.** Files live on one shared volume, so the API and every worker must run on the same machine (or a network file system). S3-style storage is a later adapter behind the same store interface.
- **Billing, plans, teams, an admin screen.** Limits are flat per account. An account can be disabled in the database (`users.disabled`).
- **Rate limiting across API processes.** Sign-in rate limits are kept in each API process's memory; run one API process, or put a limiter in the proxy.
- **Media from uploads is read in the API.** The API measures uploaded video and audio with ffprobe, in its own locked-down container. A malicious file could target ffprobe there.
- **Backups, metrics and alerts.** Back up the Postgres and data volumes yourself.

## What has and has not been tested

- **Tested in the repository's suites:** accounts, sessions, lockout, reset links and limits; that one account cannot reach another's projects, files, history, thumbnails, uploads, jobs or live events on any route (over HTTP, with the in-process queue); the user store against real Postgres 16; the Redis queue and worker (lanes, progress, results, failures without server paths, owner-only visibility, the time-limit watchdog) against real Redis 7.
- **Built, not run:** the `api` image builds. The `worker` image and `compose.yml` / `stack.sh` have not been built or started end to end, so the container limits and the render worker's lack of network are designed but not yet checked. Do that on the target machine first: bring the stack up, sign up, create and render a project, then check that the render worker cannot reach the internet (`docker exec <render worker> node -e "fetch('https://example.com').then(console.log, e => console.log('blocked'))"`).
- **Not tested at all:** the web app's sign-in screens in a browser, and the full path API to Redis to worker to shared volume with a real render.
