# Security policy

## Reporting a vulnerability

Please do not open a public issue for a security problem. Use GitHub's private reporting instead:
**Security → Report a vulnerability** on this repository. Include what you found, how to reproduce it and what it could allow.

You can expect an acknowledgement within a few days. Fixes ship in the next release, and the advisory credits the reporter unless they prefer otherwise.

## What is in scope

- The hosted service (`mr serve` and `mr job-worker`): sign-in, one account reaching another's projects, the job queue, per-user AI settings.
- The file paths a render may read, uploads, and any server-side fetch of a user-supplied address.
- The published `motionrender` package.

## How secrets are handled

- The hosted service holds no AI key of its own. Each person's provider key is stored encrypted (AES-256-GCM) under `SETTINGS_SECRET`
  and is never sent back to the browser.
- Keep `SETTINGS_SECRET`, database and Redis passwords in your deployment's secret store, never in the repository. `.env.*` files are git-ignored.
- Rotate `SETTINGS_SECRET` only together with asking people to save their AI connection again; the old value cannot decrypt new data.
