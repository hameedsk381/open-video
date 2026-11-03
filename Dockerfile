# Container images for OVE, built from this repository. The images install the same tarball that `pnpm build:package` publishes, so they run the
# packaged product rather than the workspace. One file, several targets:
#
#   api     the hosted studio's HTTP API (`ove serve`): no browser, no AI key.
#   worker  runs queued jobs (`ove job-worker`, JOB_LANE=render or ai): Chromium and ffmpeg.
#   studio  the all-in-one studio for one trusted person (`ove ai studio`). The default target.
#
#   docker build --target api    -t ove-api .
#   docker build --target worker -t ove-worker .
#   docker build                 -t ove-studio .        (studio: docker run --rm -p 127.0.0.1:3100:3100 -e GROQ_API_KEY=... -v ove-data:/data ove-studio)
#
# The all-in-one studio has no login: publish its port only to the machine you trust. The hosted stack is infrastructure/docker/compose.yml.

FROM node:22-bookworm-slim AS build
ENV CI=true
# The package build renders the built-in sound effects with ffmpeg.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/* && corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm build:package \
 && mkdir -p /out && cd packages/ove && npm pack --pack-destination /out

# The package and ffmpeg (which encodes, and measures uploaded media), without a browser.
FROM node:22-bookworm-slim AS base
ENV NODE_ENV=production PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /out/*.tgz /tmp/app.tgz
RUN npm install -g --omit=dev /tmp/app.tgz && rm /tmp/app.tgz \
 && mkdir -p /data && chown node:node /data
WORKDIR /data
VOLUME /data
ENTRYPOINT ["ove"]

FROM base AS api
USER node
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3100/healthz').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["serve"]

# Adds the Chromium that Playwright installs (with its system libraries); it draws the frames.
FROM base AS chromium
RUN node "$(npm root -g)/motionrender/node_modules/playwright/cli.js" install --with-deps chromium \
 && rm -rf /var/lib/apt/lists/* && chmod -R a+rX /ms-playwright
# Chromium's own sandbox needs privileges a container does not (and should not) have. The container is the sandbox: non-root user, no
# capabilities, read-only filesystem (see compose.yml), and for render workers no network. So the flag is set here, for these images only.
ENV OVE_CHROMIUM_ARGS=--no-sandbox

FROM chromium AS worker
USER node
CMD ["job-worker"]

FROM chromium AS studio
USER node
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3100/api/status').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["ai", "studio", "--host", "0.0.0.0", "--port", "3100", "--out", "/data"]
