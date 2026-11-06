# MotionRender for AI Agents: Claude, Codex, Cursor & MCP

MotionRender (`motionrender`, `mr`) is designed from the ground up for AI agents and coding assistants. Videos are defined as structured, frame-deterministic JSON compositions (`composition.json`), allowing any language model to author, modify, inspect, and render broadcast-grade motion graphics without writing complex rendering scripts.

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
Add directly with:
```bash
claude mcp add motionrender npx -y motionrender mcp
```

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
| `motionrender_create_video` | `prompt`, `outputDir?`, `kind?`, `duration?`, `theme?`, `template?`, `full?`, `review?`, `strict?` | Generates a complete video composition from a natural language brief. `review: true` runs the renderer design check and reports unresolved errors (`isError`); without it the composition is unchecked. `strict: true` refuses an answer that only worked because invented animation properties or unusable keyframes were repaired; by default those repairs are made and listed under Notes. |
| `motionrender_render_video` | `file`, `output?`, `format?`, `scale?` | Renders a `composition.json` to MP4, WebM, or PNG sequence. |
| `motionrender_render_still` | `file`, `frame?`, `output?` | Renders a single frame still as a PNG image for visual inspection. |
| `motionrender_review_video` | `file`, `output?`, `showSafeZones?` | Automated design, type scale, safe-zone, and contrast checks with contact sheet. |
| `motionrender_validate` | `file` | Validates `composition.json` against schema and returns errors. |
| `motionrender_inspect` | `file` | Returns structured summary of duration, scenes, layers, and assets. |
| `motionrender_list_templates` | *(none)* | Lists available templates, themes, and scene blocks. |
| `motionrender_refine_video` | `file`, `instruction`, `review?` | Applies natural language edits to an existing `composition.json`. |

---

## 3. Claude Skills (`.claude/skills`)

For Claude Code or Anthropic agent environments, MotionRender includes 15 domain-specific skills:
- `motionrender` / `ove`: Main entry point and composition grammar.
- `ove-react-video`: React-powered videos with spring physics, glass bento cards, and glowing orbs.
- `ove-make-reel`: Rapid vertical social reels for TikTok, Instagram Reels, and YouTube Shorts.
- `ove-broll-loop`: Seamless looping B-roll engineered for voiceover pacing.
- `ove-voiceover-captions`: AI voiceover synthesis, SRT transcription, and word-level kinetic subtitles.
- `ove-batch-videos`: Data-driven video personalization across JSON datasets.
- `ove-effects`: Motion effects, tracked labels, grain, and color grading.

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

