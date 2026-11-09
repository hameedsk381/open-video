# MotionRender for AI Agents: Claude, Codex, Cursor & MCP

MotionRender (`motionrender`, `mr`) is designed from the ground up for AI agents and coding assistants. **The agent is the model: nothing needs an AI key.** You read the schema, write the JSON (a `composition.json`, or an `explainer.json` for a video that teaches one idea), and the engine validates, draws, checks and renders it. Videos are defined as structured, frame-deterministic JSON compositions (`composition.json`), allowing any language model to author, modify, inspect, and render broadcast-grade motion graphics without writing complex rendering scripts.

---

## 1. Quick Integration via MCP (Model Context Protocol)

MotionRender provides a built-in MCP server supporting Claude Desktop, Claude Code, Cursor, Windsurf, Zed, and any MCP-compatible agent harness.

### Stdio Command
```bash
npx -y motionrender mcp
# or locally in this repo:
npx tsx packages/cli/src/index.ts mcp
```

### Configuration Snippets

#### Claude Desktop
Add to your `claude_desktop_config.json` (`%APPDATA%\Claude\claude_desktop_config.json` on Windows or `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):
```json
{
  "mcpServers": {
    "motionrender": {
      "command": "npx",
      "args": ["-y", "motionrender", "mcp"]
    }
  }
}
```

#### Claude Code CLI
Add directly with (the `--` keeps `-y` for npx):
```bash
claude mcp add motionrender -- npx -y motionrender mcp
```
Or for the whole project: `claude mcp add --scope project motionrender -- npx -y motionrender mcp` (writes `.mcp.json`).

#### OpenAI Codex
```bash
codex mcp add motionrender -- npx -y motionrender mcp
```
Or add to `~/.codex/config.toml` (or `.codex/config.toml` in a trusted project):
```toml
[mcp_servers.motionrender]
command = "npx"
args = ["-y", "motionrender", "mcp"]
```

#### Print any of these, or set a folder up in one step
```bash
npx -y motionrender mcp --config all      # claude-code | claude-desktop | codex | cursor | all
npx -y motionrender setup .               # AGENTS.md, CLAUDE.md, .mcp.json, .cursor/mcp.json, .codex/config.toml and the skills
```
`setup` keeps whatever is already in those files: it adds a marked MotionRender block and your other MCP servers stay.

#### Cursor IDE
Add to `.cursor/mcp.json`:
```json
{
  "mcpServers": {
    "motionrender": {
      "command": "npx",
      "args": ["-y", "motionrender", "mcp"]
    }
  }
}
```

---

## 2. MCP Tools Reference

| Tool Name | Parameters | Description |
|---|---|---|
| `motionrender_create_video` | `prompt`, `outputDir?`, `kind?`, `duration?`, `full?`, `review?`, `strict?`, `sources?`, `research?`, `script?` | Generates a complete video composition from a natural language brief. It writes the content script first and stores it in `composition.json`; `sources` is material the script may quote, `script` is a written content block to use instead, and research is on unless `research: false`. `review: true` runs the renderer design check and reports unresolved errors (`isError`); without it the composition is unchecked. `strict: true` refuses an answer that only worked because invented animation properties or unusable keyframes were repaired; by default those repairs are made and listed under Notes. |
| `motionrender_render_video` | `file`, `output?`, `format?`, `scale?` | Renders a `composition.json` to MP4, WebM, or PNG sequence. |
| `motionrender_render_still` | `file`, `frame?`, `output?` | Renders a single frame still as a PNG image for visual inspection. |
| `motionrender_review_video` | `file`, `output?`, `showSafeZones?` | Automated design, type scale, safe-zone, and contrast checks with contact sheet. |
| `motionrender_validate` | `file` | Validates `composition.json` against schema and returns errors. |
| `motionrender_inspect` | `file` | Returns structured summary of duration, scenes, layers, and assets. |
| `motionrender_list_blocks` | *(none)* | Lists the scene blocks and colour themes. |
| `motionrender_refine_video` | `file`, `instruction`, `review?` | Applies natural language edits to an existing `composition.json`. |
| `motionrender_script` | `file`, `script?`, `output?`, `format?` | Reads the video's content script (spoken lines, on-screen copy, figures and their sources) or, when `script` is given, validates and imports a replacement. Claims must cite quotes that appear in the cited source. |
| `motionrender_production_validate` | `file` | Validates a `production.json` manifest: brief, script, cast, locations, shot list, and every asset reference, reporting all broken references at once. |
| `motionrender_production_compile` | `file`, `output?` | Compiles a `production.json` shot list into a renderable `composition.json`: shots become scenes, approved takes become footage, planned shots become text cards from their on-screen copy, and the notes say what it fell back on. |
| `motionrender_adapt_aspect` | `file`, `aspect`, `output?` | Adapts a composition to another aspect ratio (`9:16`, `16:9`, `1:1`, `4:5`, `3:4` or `WIDTHxHEIGHT`). Overwrites the input unless `output` is given. |
| `motionrender_batch_render` | `file`, `data`, `outputPattern`, `limit?`, `scale?` | Renders one personalised video per row of a JSON array (or a `rows.json` path) from a template composition; `outputPattern` can use `{{variables}}`, e.g. `out/{{name}}.mp4`. |
| `motionrender_transcribe_audio` | `audio`, `output?`, `language?` | Transcribes an audio file into word-level timestamps and subtitle cues for kinetic captions. |
| `motionrender_schema` | `kind?` | The JSON Schema of a `composition` or an `explainer` script. Read it before writing either by hand. |
| `motionrender_explainer_kinds` | *(none)* | Every explainer scene kind with what it shows, when to use it and a valid example. |
| `motionrender_explainer_validate` | `file` or `script` | Checks an explainer script and lists every problem with its path. |
| `motionrender_make_video` | `file` or `script`+`outputDir`, `render?` (`draft`/`final`), `voice?`, `output?`, `allowCode?` | **The quick path.** Validates, builds, runs the design review and returns every problem at once plus one contact-sheet image of the whole video; optionally renders a quick half-size draft or the final MP4. Nothing is rendered over review errors. Use this instead of separate validate, compile, still, review and render calls. |
| `motionrender_explainer_compile` | `file` or `script`, `outputDir?`, `voice?`, `voiceName?` | Builds an explainer script into `composition.json`; each scene lasts as long as its spoken line. Silent unless `voice: true`. |
| `motionrender_facts` | `lookups` | Real, sourced facts for a script from Wikipedia, the World Bank and exchange rates, with no key. |
| `motionrender_environment` | *(none)* | Checks Node, FFmpeg and the browser, and says what is missing. Run it first if a render fails. |
| `motionrender_init` | `dir`, `force?` | Starts a project folder with a starter composition and the agent instructions and skills. |
| `motionrender_import_figma` | `input`, `token?`, `outputTheme?`, `outputComp?` | Imports design tokens (colours, type, radii) and scene layers from a Figma file or exported tokens JSON. |

---

## 3. Claude Skills (`.claude/skills`)

For Claude Code or Anthropic agent environments, MotionRender includes 16 skills (`motionrender` and `ove` are the same entry point under two names). One project agent also lives in `.claude/agents/`: `solution-architect`, which maps the monorepo and writes architecture notes.
- `motionrender` / `ove`: Main entry point and composition grammar.
- `ove-explainer`: Vertical explainer videos from scenes and spoken lines (how-it-works, system design, money basics): the fastest route to a finished video, no AI key needed.
- `ove-agent`: Autonomous video director: brief to a finished React or JSON video, with a visual self-check loop.
- `ove-ai-compose`: Generate or change a video from a brief with `ove ai`, keeping every AI change reversible.
- `ove-make-reel`: Quick vertical or square social videos from ready-made blocks and themes.
- `ove-react-video`: High-end React videos with spring physics, bento cards and glowing orbs.
- `ove-code-video`: Videos written as TypeScript, JavaScript or React when JSON cannot express the logic.
- `ove-motion-graphics`: Kinetic typography, bento grids, code walk-throughs and audio waveforms.
- `ove-effects`: Motion effects over footage: glass cards, kinetic titles, tracked labels, grain and grading.
- `ove-voiceover-captions`: Voiceover and word-timed captions, with scenes cut to the speech.
- `ove-batch-videos`: Many personalised or localised videos from one composition with variables and a list of rows.
- `ove-broll-loop`: Seamless looping B-roll timed to a voiceover.
- `ove-paper-collage`: Editorial halftone paper-collage B-roll and stop-motion cutouts.
- `ove-papercut`: Layered papercraft explainers and paper-diorama videos.
- `ove-remotion`: Run and adapt Remotion compositions with MotionRender.

---

## 4. OpenAI Codex & ChatGPT Custom GPTs (OpenAPI)

To integrate with OpenAI Custom GPTs or Codex Action agents:
1. Copy the OpenAPI specification from `packages/api/openapi.json`.
2. In ChatGPT GPT Editor $\rightarrow$ **Configure** $\rightarrow$ **Actions** $\rightarrow$ **Create New Action**:
   - Paste the OpenAPI schema.
   - Point the server URL to your running MotionRender instance (`http://localhost:3100` or deployed URL).
3. Agents can invoke `composeVideo`, `renderVideo`, `refineVideo`, and `getLibrary`.

---

## 5. The Agent Production Loop

Whenever an agent builds or edits a video without MCP:
```
Agree Narrative / Brief
       ↓
Generate / Edit composition.json
       ↓
`mr validate composition.json`
       ↓
`mr still composition.json --frame 0 --output still-0.png` (Inspect visuals)
       ↓
`mr review composition.json --output review.png` (Automated design & safe-zone check)
       ↓
`mr render composition.json --output out.mp4`
```


### The explainer loop (no AI key needed)

For a video that teaches one idea, write the script instead of the layers:
```
`mr explainer kinds`  (or the motionrender_explainer_kinds tool)   what each scene shows, with examples
       ↓
`mr explainer looks`   pick the look for THIS subject (13 whole designs; do not default to navy)
       ↓
Real numbers: `mr facts country India internet_users` (or `wikipedia`, `exchange`), or the motionrender_facts tool
       ↓
Write explainer.json   (`mr schema --explainer` lists every field)
       ↓
`mr make explainer.json --no-voice`   (ONE call: validates, builds, reviews and draws one contact sheet of the whole video; every problem at once)
       ↓
Open review.png, fix what it lists, run make again
       ↓
`mr make explainer.json --draft` (quick half-size MP4 to check the motion) → `mr make explainer.json --final` (out.mp4)
```

## 6. In a sandbox, with nothing installed

Node 22+, FFmpeg and a browser are the usual hurdle. The `agent` image has them, the CLI, and a `/work` folder that already holds `AGENTS.md`, the skills and the MCP config:
```bash
docker build --target agent -t motionrender-agent .
docker run -d --name motionrender --shm-size=1g -v motionrender-work:/work motionrender-agent
docker exec motionrender mr doctor
```
It works the same in a sandbox runtime such as OpenSandbox or in CI. `node scripts/agent-smoke.mjs --docker motionrender-agent` tests it end to end. See `docs/agent-sandbox.md` for sizing, the network hosts to allow and what is and is not verified. On a machine that has `mr` installed, `mr setup . --local` writes MCP configs that run it directly instead of through `npx`.
