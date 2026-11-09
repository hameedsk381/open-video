# MotionRender in a sandbox, for any agent

An agent that can run commands can make a video with MotionRender. What stops many people is the machine: Node 22+, FFmpeg and a browser have to be there first. The `agent` image has all three, the CLI, and a `/work` folder where the instructions, the skills and the MCP config are already in place. Run it in Docker, in a sandbox runtime such as [OpenSandbox](https://github.com/opensandbox-group/OpenSandbox), or in CI, and the agent starts with nothing to install.

The agent is the model: nothing here needs an AI key. It reads `/work/AGENTS.md`, writes an `explainer.json` or a `composition.json`, and uses `mr validate`, `mr still`, `mr review` and `mr render`.

## Build the image

```bash
docker build --target agent -t motionrender-agent .
# with the on-device Indic voices (adds onnxruntime-node):
docker build --target agent --build-arg WITH_INDIC=1 -t motionrender-agent .
```

The image installs the same tarball that `pnpm build:package` publishes, so it runs the packaged product. It runs as the unprivileged `node` user. Chromium's own sandbox is off (`OVE_CHROMIUM_ARGS=--no-sandbox`), because the container is the sandbox. It stays up (`sleep infinity`) so that commands can be run in it.

## Try it

```bash
docker run -d --name motionrender --shm-size=1g -v motionrender-work:/work motionrender-agent
docker exec motionrender mr doctor
docker exec motionrender mr explainer example --output explainer.json
docker exec motionrender mr explainer compile explainer.json --no-voice
docker exec motionrender mr render composition.json --scale 0.5 --output draft.mp4
docker cp motionrender:/work/draft.mp4 .
```

- `--shm-size=1g` gives Chromium enough shared memory; with Docker's 64 MB default a render can crash.
- Use a **named volume** (`-v motionrender-work:/work`): Docker fills it from the image on first use, so `AGENTS.md`, the skills and the MCP config are there. A bind mount (`-v "$PWD/videos:/work"`) starts empty; run `docker exec motionrender mr setup . --local` once to put them in.
- `--local` makes the MCP config start the installed `mr mcp` instead of downloading through `npx -y motionrender mcp`.

## Test the image, a tarball, or an install

`scripts/agent-smoke.mjs` does what an agent does, from nothing, and exits non-zero if any step fails: help, doctor, setup, write a script, validate, compile, a still, a 30-frame render, and a conversation with the MCP server.

```bash
node scripts/agent-smoke.mjs --docker motionrender-agent        # an image
node scripts/agent-smoke.mjs --tarball motionrender-0.5.1.tgz   # a packed tarball, before publishing
node scripts/agent-smoke.mjs --installed                        # the mr already on PATH, inside a sandbox
```

Add `--dry-run` to print the commands without running them, and `--keep` to leave the folder behind.

## Use it from an agent

**With Docker, from an agent that runs on your machine** (Claude Code, Codex, any other): start the container as above and tell the agent:

```text
MotionRender is running in the container "motionrender". Run every MotionRender command as `docker exec motionrender mr <command>`, in /work.
Read /work/AGENTS.md first (docker exec motionrender cat /work/AGENTS.md). Copy finished videos out with `docker cp motionrender:/work/<file> .`.
```

**Inside the sandbox**: the agent already has a shell, so `mr` is simply on PATH and the instructions are in `/work/AGENTS.md`. The same prompts work.

**With OpenSandbox**: its README shows a Python SDK (`Sandbox.create("<image>")`, `sandbox.commands.run(...)`, `sandbox.files.write_files(...)`, `sandbox.files.read_file(...)`, `sandbox.destroy()`), a CLI (`osb`) and an MCP server. The shape is: create a sandbox from `motionrender-agent`, run the `mr` commands, read the MP4 out, destroy it. These details come from its README and I have not run them: check its documentation for the exact calls, and note that

- the image has to be pushed to a registry its host can pull from;
- if `read_file` returns text rather than bytes, `base64` the MP4 inside the sandbox (`base64 -w0 out.mp4`) and decode it outside;
- the sandbox timeout has to cover the render (see below).

## Size it

A 60-second 1080×1920 video took about 2.5 minutes to render with four browser pages on the machine I tried (a few CPU cores; I did not measure its model). As a starting point, give a sandbox **2 vCPUs and 4 GB** and a timeout of at least 15 minutes for a minute of video; `--concurrency 2` lowers memory use, and `--scale 0.5` makes quick drafts. These are estimates, not measured limits.

## What it may reach on the network

Rendering needs nothing. With egress locked down, allow only what the features you use need:

| Host | For |
|---|---|
| `speech.platform.bing.com` | the free Edge voice (`explainer compile` without `--no-voice`) |
| `en.wikipedia.org`, `api.worldbank.org`, `api.frankfurter.dev` | `mr facts` and `--research` |
| `huggingface.co` | the first use of an on-device Indic voice (about 88 MB per language; needs the `WITH_INDIC=1` image) |
| your image provider's API | drawn pictures in `media` scenes (`--images`), only if you use them |

Videos with code layers (`code`, `react`, `p5`) run JavaScript while rendering and need `--allow-code`. A sandbox is the right place to allow that for code an agent wrote: the render page already refuses all `http`, `https`, `ws` and `ftp` requests, and the container adds the process-level boundary.

## What has and has not been checked

- Checked: the setup it relies on (`mr setup --local` writes the MCP config for the installed `mr`) and the smoke script, in `--dry-run` and against a packed tarball.
- Not checked, because Docker was not available where this was written: building the `agent` target, running the image, the smoke script in `--docker` mode, and any OpenSandbox integration. Build the image and run the smoke script against it before relying on it.
