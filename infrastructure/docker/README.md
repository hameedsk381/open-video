# Docker

The root `Dockerfile` builds the `open-video-engine` package from this repository (`pnpm build:package`), installs the resulting tarball in a slim Node 22 image with ffmpeg and Playwright's Chromium, and runs `ove ai studio` as the non-root `node` user. `docker-compose.yml` adds the hardening (no capabilities, read-only root, memory, CPU and process limits) and publishes the port to `127.0.0.1` only.

```sh
docker compose up --build        # http://127.0.0.1:3100/ ; projects live in the ove-data volume
docker compose run --rm studio render /data/my-video/composition.json --output /data/out.mp4   # any ove command
```

The studio has no login. Do not publish its port to a network you do not control.
