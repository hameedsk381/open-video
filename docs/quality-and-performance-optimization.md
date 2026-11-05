# MotionRender: Quality & Performance Optimization Guide

## Executive Summary

MotionRender is designed around a deterministic, JSON-first composition architecture. Producing high-fidelity broadcast motion graphics with minimal latency requires resolving the core tension between **AI spatial/aesthetic unpredictability** and **CPU/GPU rendering pipeline contention**.

This guide details the primary bottlenecks impacting **Output Quality** and **Rendering Time**, followed by architectural recommendations, technical specifications, and an implementation roadmap.

---

## 1. Analysis of Current Bottlenecks

### 1.1 Time & Throughput Bottlenecks

| Pipeline Stage | Current Mechanism | Bottleneck / Cost |
| :--- | :--- | :--- |
| **Chromium $\rightarrow$ Node IPC** | Canvas $\rightarrow$ PNG $\rightarrow$ Base64 dataURL | Base64 adds ~33% string memory allocation bloat; serializing multi-MB strings over Chrome DevTools Protocol (CDP) induces significant latency. |
| **Node $\rightarrow$ FFmpeg Pipe** | Buffer $\rightarrow$ stdin $\rightarrow$ FFmpeg libpng decode | Double compression/decompression cycle: Chromium encodes PNG $\rightarrow$ FFmpeg decodes PNG $\rightarrow$ FFmpeg encodes x264. |
| **CPU Contention** | Software SwiftShader + x264 libx264 | SwiftShader (CPU WebGL) and Chromium Canvas 2D compete with FFmpeg encoding threads for CPU cores on multi-core systems. |
| **Motion Blur** | Unconditional 8-sample subframe accumulation | Multiplies drawing and evaluation work by $8\times$ across all layers, even static elements. |
| **Layer Invalidation** | Immediate-mode full redrawing per frame | Static backgrounds, logos, cards, and HTML layers are re-evaluated and re-rendered on every single frame. |

### 1.2 Output Quality & Pacing Bottlenecks

| Quality Dimension | Root Cause | Impact |
| :--- | :--- | :--- |
| **Text Overflow & Truncation** | LLMs cannot "see" pixel layout metrics when guessing `x, y` coordinates | Text overflows canvas borders or truncates with ellipses (`…`), violating visual polish. |
| **Social UI Collision** | Blind placement across aspect ratios | Headlines or action buttons land beneath Reels/TikTok/Shorts platform chrome (bottom 18%, right 11%). |
| **Temporal Disconnect** | Fixed or manual duration values | Visual transitions fail to synchronize with voice pauses or musical downbeats, feeling disjointed. |
| **Aesthetic Inconsistencies** | Heuristic review rules check bounds, not taste | Rules in `review.ts` identify off-screen text, but cannot assess color clashing, typography hierarchy, or visual clutter. |
| **LLM Repair Latency** | Monolithic unconstrained JSON generation | Schema syntax errors require multi-turn conversational repair loops, adding 5–15 seconds to authoring. |

---

## 2. Technical Solutions: Accelerating Render Time

```mermaid
flowchart LR
    subgraph Current Pipeline (Double Encoding)
        C1[Chromium Canvas] -->|Encode PNG| P1[PNG Buffer]
        P1 -->|Base64| CDP1[CDP IPC String]
        CDP1 -->|Decode Base64| N1[Node Buffer]
        N1 -->|stdin Pipe| F1[FFmpeg stdin]
        F1 -->|Decode PNG| RAW1[Raw Pixels]
        RAW1 -->|Encode x264| MP41[Output Video]
    end

    subgraph Recommended Pipeline (Zero-Copy / Binary)
        C2[Chromium Canvas] -->|Uint8Array / WebCodecs| WS[Binary Pipe / Shared Buffer]
        WS -->|Hardware Encoder| NV[NVENC / VideoToolbox / QSV]
        NV -->|Fast Mux| MP42[Optimized Video Output]
    end
```

### 2.1 Direct Binary IPC Streaming
* **Problem:** `packages/renderer/src/index.ts` extracts frames using:
  ```javascript
  return rt.canvas.toDataURL('image/png').slice('data:image/png;base64,'.length);
  ```
* **Solution:**
  1. Replace `toDataURL` with `canvas.toBlob('image/png')` or transfer raw `ImageData.data` directly via a local loopback binary WebSocket or named pipe.
  2. Implement Chromium **WebCodecs API** (`VideoEncoder`) inside the page runtime. For draft and real-time previews, Chromium can directly emit encoded video chunks without intermediary PNG encoding.

### 2.2 Dual-Engine Strategy: Hardware Acceleration vs. SwiftShader
* **Current state:** SwiftShader (`--use-angle=swiftshader`) ensures deterministic pixel hashes, but sacrifices GPU hardware efficiency.
* **Solution:**
  * Add a `--hwaccel` flag enabling native GPU rasterization and hardware encoders:
    * **Windows/Linux:** NVIDIA NVENC (`h264_nvenc`) or Intel QuickSync (`h264_qsv`).
    * **macOS:** Apple Silicon VideoToolbox (`h264_videotoolbox`).
  * Preserve SwiftShader as the default for CI/CD deterministic regression testing.

### 2.3 Adaptive Motion-Vector Subsampling
* **Problem:** `motionBlur` evaluates 8 subframes across the entire frame canvas:
  ```typescript
  for (let i = 0; i < blur.samples; i++) {
    // 8x render evaluations per frame
  }
  ```
* **Solution:**
  * Calculate the velocity vector $\vec{v} = (\Delta x, \Delta y, \Delta \text{scale}, \Delta \text{rotation})$ for each layer between $t$ and $t + \Delta t$.
  * If $|\vec{v}| < \epsilon$ (static or slow movement), draw the layer **once** into a cached canvas.
  * Only accumulate multi-sample subframes for layers actively moving above the velocity threshold. This cuts blur computation overhead by 60–75%.

### 2.4 Offscreen Static Layer Caching (Dirty Rectangles)
* **Solution:**
  * Maintain an offscreen canvas cache for layers flagged as `static` or non-animated across scene windows (e.g., solid/gradient backgrounds, ambient backdrops, brand logos).
  * In the render loop, blit cached layers via `ctx.drawImage(cachedCanvas, 0, 0)` rather than re-computing gradients, SVG paths, or CSS layout operations.

---

## 3. Technical Solutions: Elevating Output Quality

### 3.1 Intrinsic Layout Containers (`group`) vs. Coordinate Guessing
* **Problem:** LLMs struggle to predict exact bounding boxes, resulting in collisions when rendering across 16:9, 9:16, or 1:1 viewports.
* **Solution:**
  * Promote MotionRender's native flexbox-like container model in [`packages/schema/src/index.ts`](file:///D:/openvideo/packages/schema/src/index.ts):
    ```json
    {
      "id": "content-stack",
      "type": "group",
      "layout": {
        "direction": "column",
        "gap": 24,
        "align": "center",
        "justify": "center"
      },
      "children": [
        { "id": "badge", "type": "rect", "width": 180, "height": 48 },
        { "id": "headline", "type": "text", "text": "Launch Day", "fontSize": 72 }
      ]
    }
    ```
  * By steering AI composition prompts to use layout containers rather than raw `(x, y)` coordinates, text elements automatically stack cleanly with zero overlap and guaranteed responsiveness.

### 3.2 Vision-Language Model (VLM) Review Loop
* **Problem:** Heuristic safe-zone rules cannot evaluate subjective aesthetics (e.g., awkward color pairings, poor visual weight, low contrast over background video).
* **Solution:**
  * Plug the contact sheet generated by `mr review` (`sheet.png`) into a fast vision model (e.g. Gemini 2.0 Flash or GPT-4o-mini).
  * Use a structured review schema:
    ```json
    {
      "aestheticScore": 8.5,
      "issues": [
        {
          "sceneId": "scene-2",
          "advice": "Subtitle text lacks contrast against the bright background. Add a 40% dark scrim behind the text.",
          "patch": { "path": "scenes[1].layers[0].opacity", "value": 0.6 }
        }
      ]
    }
    ```
  * Apply the recommended JSON patches deterministically before final export.

### 3.3 Musical Beat & Transient Downbeat Snapping
* **Problem:** Cuts landing out of rhythm with background music reduce emotional engagement.
* **Solution:**
  * Process soundtrack audio files with an audio transient/beat detector (via FFmpeg audio filters or lightweight WebAudio peak analysis).
  * Automatically snap scene transitions, kinetic text reveals, and camera shakes to the nearest downbeat using MotionRender's built-in expression variables (`beat()`, `bar()`, `beats()`).

### 3.4 Grammar-Constrained JSON Decoding
* **Problem:** LLM syntax hallucinations trigger schema repair turns, adding 5–15 seconds to authoring time.
* **Solution:**
  * Pass `composition.schema.json` directly to structured inference engines (Groq JSON schema mode, OpenAI Structured Outputs, or vLLM grammar masks).
  * Tokens violating the schema are pruned at the sampling stage, guaranteeing 100% syntactically valid compositions on the first pass and cutting generation latency to 2–3 seconds.

---

## 4. End-to-End System Architecture

```mermaid
flowchart TD
    subgraph 1. AI Authoring & Layout
        UserPrompt[User Prompt / Brief] --> Planner[Planner & Capability Registry]
        Planner --> SchemaMask[Grammar-Constrained LLM]
        SchemaMask --> CompositionJSON[composition.json with Group Layouts]
    end

    subgraph 2. Audio-Visual Pacing
        AudioInput[Narration / Music] --> SilenceDetect[FFmpeg Silencedetect + Beat Transients]
        SilenceDetect --> DynamicTiming[media['vo'].soundEndFrames & beat()]
        DynamicTiming --> CompositionJSON
    end

    subgraph 3. Quality Verification
        CompositionJSON --> HeadlessPreview[Headless Frame Inspection]
        HeadlessPreview --> SafeZoneCheck[Rule-Based Safe Zones & Contrast]
        SafeZoneCheck --> ContactSheet[Contact Sheet Generation]
        ContactSheet --> VLMReview[VLM Aesthetic Critique Pass]
        VLMReview --> AutoPatch[Deterministic JSON Patch]
        AutoPatch --> FinalComposition[Verified composition.json]
    end

    subgraph 4. High-Performance Render Engine
        FinalComposition --> PagePool[Chromium Page Pool (Half Cores, Max 4)]
        PagePool --> VelocityFilter{Adaptive Motion Velocity}
        VelocityFilter -->|Static| LayerCache[Offscreen Cache Blit]
        VelocityFilter -->|Fast Motion| SubframeSample[8x Subframe Accumulation]
        LayerCache --> BinaryStream[Binary Frame Pipe]
        SubframeSample --> BinaryStream
        BinaryStream --> HardwareEncoder[FFmpeg NVENC / VideoToolbox / x264]
        HardwareEncoder --> OutputVideo[Broadcast MP4 / WebM]
    end
```

---

## 5. Engineering Implementation Roadmap

| Phase | Milestone | Objective | Target Impact |
| :---: | :--- | :--- | :--- |
| **Phase 1** | **Binary IPC Pipeline** | Replace base64 `toDataURL` in `renderer/src/index.ts` with direct binary ArrayBuffer streaming via local WebSocket/pipe. | **+30–40% render FPS**; lower Node.js memory footprint. |
| **Phase 2** | **Grammar-Constrained AI Prompting** | Configure Groq/OpenAI structured outputs against `composition.schema.json` and steer AI to use `group` layout containers. | **Authoring time drops from ~15s to ~3s**; zero text collisions. |
| **Phase 3** | **Adaptive Motion Blur & Layer Caching** | Introduce velocity threshold gating for subframe sampling and offscreen canvas caching for static layers. | **60% faster rendering** on complex animated scenes. |
| **Phase 4** | **Hardware Acceleration Mode** | Add `--hwaccel` support for Chromium GPU rasterization and FFmpeg NVENC / VideoToolbox encoders. | **2–3x faster exports** on GPU-equipped machines. |
| **Phase 5** | **VLM-in-the-Loop Review** | Connect `mr review` contact sheets to a lightweight vision model to auto-correct contrast, hierarchy, and color palettes. | **Broadcast-grade aesthetics** without human review passes. |
