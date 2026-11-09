# Container images for OVE, built from this repository. The images install the same tarball that `pnpm build:package` publishes, so they run the
# packaged product rather than the workspace. One file, several targets:
#
#   api     the hosted studio's HTTP API (`ove serve`): no browser, no AI key.
#   worker  runs queued jobs (`ove job-worker`, JOB_LANE=render or ai): Chromium and ffmpeg.
#   agent   a sandbox for AI agents: the CLI, Chromium and ffmpeg, with a /work folder already set up (AGENTS.md, skills, MCP config). See docs/agent-sandbox.md.
#   studio  the all-in-one studio for one trusted person (`ove ai studio`). The default target.
#
#   docker build --target api    -t ove-api .
#   docker build --target worker -t ove-worker .
#   docker build --target agent  -t motionrender-agent .   (add --build-arg WITH_INDIC=1 for the on-device Indic voices)
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

# System runtime base with ffmpeg, shared across images.
FROM node:22-bookworm-slim AS runtime-base
ENV NODE_ENV=production PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*

# Pre-install Chromium and all OS libraries in an independent layer BEFORE copying application code.
# Because this stage has no dependency on the repo source or build tarball, Docker caches it
# permanently across deployments and never re-downloads Chromium or apt packages.
FROM runtime-base AS chromium-base
RUN npx -y playwright@1.64.1 install --with-deps chromium \
 && rm -rf /var/lib/apt/lists/* /root/.npm \
 && chmod -R a+rX /ms-playwright
ENV OVE_CHROMIUM_ARGS=--no-sandbox

# The package and ffmpeg, without a browser (used by API).
FROM runtime-base AS base
COPY --from=build /out/*.tgz /tmp/app.tgz
RUN npm install -g --omit=dev --ignore-scripts /tmp/app.tgz && rm /tmp/app.tgz \
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

# Adds the application onto the pre-cached Chromium base (for workers and studio).
FROM chromium-base AS chromium
COPY --from=build /out/*.tgz /tmp/app.tgz
RUN npm install -g --omit=dev --ignore-scripts /tmp/app.tgz && rm /tmp/app.tgz \
 && mkdir -p /data && chown node:node /data
WORKDIR /data
VOLUME /data
ENTRYPOINT ["ove"]

FROM chromium AS worker
USER node
CMD ["job-worker"]

# For AI agents running in a sandbox (OpenSandbox, a container runtime, CI): nothing to install, nothing to configure. The agent works in /work, where
# AGENTS.md, the skills and the MCP config are already in place. The container stays up so commands can be run in it; it runs as the unprivileged
# node user, and Chromium's own sandbox is off (OVE_CHROMIUM_ARGS=--no-sandbox) because the container is the sandbox.
FROM chromium AS agent
ARG WITH_INDIC=0
RUN if [ "$WITH_INDIC" = "1" ]; then npm install -g --omit=dev onnxruntime-node; fi
RUN mkdir -p /work && ove setup /work --local \
 && chown -R node:node /work /home/node
ENV HOME=/home/node OVE_TTS_DIR=/home/node/.cache/motionrender/tts
USER node
WORKDIR /work
VOLUME /work
ENTRYPOINT []
CMD ["sleep", "infinity"]

FROM chromium AS studio
USER node
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3100/api/status').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["ai", "studio", "--host", "0.0.0.0", "--port", "3100", "--out", "/data"]
