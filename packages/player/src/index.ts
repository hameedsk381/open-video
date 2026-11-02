// The browser Player: plays a composition live on a canvas with sound, for embedding in web pages and for `ove dev`. It draws with the
// renderer's own canvas runtime, so pictures match renders; timing comes from the wall clock, and frames that cannot be drawn in
// time are skipped rather than slowing playback. Video layers use <video> elements kept in sync with the playhead (close, not
// frame-exact like a render), and audio is scheduled with Web Audio, where playbackRate also changes pitch (renders keep pitch).
import { loadComposition, parseCaptions, isBuiltinSound, builtinSoundName, type Composition, type MediaInfo } from '@ove/schema'; import { evaluateFrame, audioWindows, soundIntervals, volumeEnvelope } from '@ove/timeline'; import { toDrawOperations, prepareOperations, flattenOperations, collectImageSources, collectLottieSources, builtinFontFaces, type DrawOperation } from '@ove/graphics';
import { createCanvasRuntime, type CanvasRuntime } from 'ove:canvas-runtime';
export type PlayerEvent = 'frame' | 'play' | 'pause' | 'ended' | 'error';
export type PlayerOptions = {
  /** A composition as JSON (variables are resolved with `values`) or an already loaded one. */ composition: unknown; values?: Record<string, unknown>;
  /** Measured audio and video for compositions that time scenes from their media ({{media[...]}}), from measureMedia in open-video-engine. */ media?: Record<string, MediaInfo>;
  /** Where relative media paths in the composition are resolved from, usually the composition file's URL. Defaults to the page URL. */ assetBase?: string | URL;
  /** Where the built-in Inter font files are served from. Defaults to the `fonts` folder next to the Player script (the package ships it in `dist/fonts`). */ fontBase?: string | URL;
  /** Where the built-in sound effects (sfx:…) are served from. Defaults to the `sfx` folder next to the Player script. */ sfxBase?: string | URL;
  controls?: boolean; loop?: boolean; autoplay?: boolean; /** 0–1, multiplies every sound. */ volume?: number };
export type Player = { readonly element: HTMLElement; readonly composition: Composition; readonly frame: number; readonly playing: boolean;
  play(): Promise<void>; pause(): void; seek(frame: number): Promise<void>; setValues(values: Record<string, unknown>): Promise<void>; on(event: PlayerEvent, listener: (detail: any) => void): () => void; destroy(): void };
type Clip = { url: string; start: number; duration: number; trim: number; rate: number; loop: boolean; volume: number; fadeIn: number; fadeOut: number; envelope?: [number, number][] };
const isUrl = (src: string) => /^(https?|data|blob):/i.test(src);
export async function createPlayer(container: HTMLElement, options: PlayerOptions): Promise<Player> {
  const base = new URL(String(options.assetBase ?? location.href), location.href);
  const root = document.createElement('div'); root.className = 'ove-player'; root.style.cssText = 'position:relative;width:100%;font:13px system-ui,sans-serif;color:#e5e7eb;outline:none'; root.tabIndex = 0;
  const canvas = document.createElement('canvas'); canvas.style.cssText = 'display:block;width:100%;height:auto;background:#000';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.style.position = 'absolute'; const measure = document.createElementNS('http://www.w3.org/2000/svg', 'path'); svg.appendChild(measure);
  root.append(canvas, svg); container.appendChild(root);
  const listeners = new Map<PlayerEvent, Set<(detail: any) => void>>(); const emit = (event: PlayerEvent, detail?: unknown) => listeners.get(event)?.forEach(fn => fn(detail));
  let composition = options.composition as Composition, runtime: CanvasRuntime, videos = new Map<string, HTMLVideoElement>(), clips: Clip[] = [];
  let frame = 0, playing = false, playFrom = 0, playStart = 0, raf = 0, drawing = false, pendingDraw = false, destroyed = false;
  let audio: AudioContext | undefined, master: GainNode | undefined, sources: AudioBufferSourceNode[] = []; const buffers = new Map<string, Promise<AudioBuffer | undefined>>();
  const resolveSrc = (src: string) => { if (isBuiltinSound(src)) return new URL(`${builtinSoundName(src)}.wav`, new URL(options.sfxBase ?? './sfx/', import.meta.url)).href; const target = composition.assets.find(a => a.id === src)?.src ?? src; return isUrl(target) ? target : new URL(target, base).href; };
  // (Re)loads everything a composition needs: canvas runtime with images and fonts, one <video> per video layer, and the sound clips.
  async function load(values?: Record<string, unknown>) { composition = loadComposition(options.composition, values ?? options.values ?? {}, { media: options.media });
    // Captions layers without inline cues load their file from the asset URL (word timings are grouped into lines while drawing).
    const captionLayers = composition.scenes.flatMap(s => flattenAll(s.layers)).filter((l: any) => l.type === 'captions' && !l.cues);
    await Promise.all(captionLayers.map(async (layer: any) => { const url = resolveSrc(layer.src); const response = await fetch(url); if (!response.ok) throw new Error(`Could not load captions ${layer.src}`); layer.cues = parseCaptions(await response.text(), url, Infinity); }));
    canvas.width = composition.width; canvas.height = composition.height; canvas.style.aspectRatio = `${composition.width} / ${composition.height}`;
    runtime = createCanvasRuntime(canvas, measure);
    const images = Object.fromEntries(collectImageSources(composition.scenes.flatMap(s => s.layers)).map(src => [src, resolveSrc(src)]));
    // The built-in Inter faces load from fontBase (default: the fonts folder beside this script, as the package and `ove dev` serve it).
    const fontBase = new URL(options.fontBase ?? './fonts/', import.meta.url);
    const fonts = [...builtinFontFaces.map(face => ({ ...face, src: `builtin:${face.file}`, url: new URL(face.file, fontBase).href })), ...composition.assets.filter(a => a.type === 'font').map(a => ({ family: a.family ?? a.id, src: a.src, url: resolveSrc(a.src), weight: a.weight ?? 400, style: a.style ?? 'normal' }))];
    const lotties = Object.fromEntries(collectLottieSources(composition.scenes.flatMap(s => s.layers)).map(src => [src, resolveSrc(src)]));
    await runtime.load(images, fonts, lotties);
    for (const video of videos.values()) { video.pause(); video.removeAttribute('src'); video.load(); } videos = new Map();
    const videoLayers = composition.scenes.flatMap(s => flattenAll(s.layers)).filter((l: any) => l.type === 'video');
    await Promise.all(videoLayers.map((layer: any) => new Promise<void>(ok => { const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.crossOrigin = 'anonymous'; v.src = resolveSrc(layer.src); v.addEventListener('loadeddata', () => ok(), { once: true }); v.addEventListener('error', () => { emit('error', new Error(`Could not load video ${layer.src}`)); ok(); }, { once: true }); videos.set(layer.id, v); })));
    // Volume keyframes and ducking use the same envelopes as renders; ducking follows measured phrases when `media` was given.
    const fps = composition.fps, others = soundIntervals(composition, options.media ?? {});
    clips = audioWindows(composition).map(({ layer, startFrame, endFrame }: any) => { const start = startFrame/fps, duration = (endFrame-startFrame)/fps; return { url: resolveSrc(layer.src), start, duration, trim: layer.trimStart/fps, rate: layer.playbackRate, loop: layer.loop, volume: layer.volume, fadeIn: (layer.fadeInFrames ?? 0)/fps, fadeOut: (layer.fadeOutFrames ?? 0)/fps, envelope: volumeEnvelope({ layer, fps, start, duration, duck: layer.duck, others }) }; });
    if (composition.export.audio) { const duration = composition.durationFrames/fps, volume = composition.export.audioVolume ?? 1; clips.unshift({ url: resolveSrc(composition.export.audio), start: 0, duration, trim: 0, rate: 1, loop: true, volume, fadeIn: 0, fadeOut: 0, envelope: volumeEnvelope({ layer: { volume }, fps, start: 0, duration, duck: composition.export.duck, others }) }); }
    frame = Math.min(frame, composition.durationFrames - 1); updateControls(); await draw(); }
  const flattenAll = (layers: any[]): any[] => layers.flatMap(l => l.type === 'group' ? [l, ...flattenAll(l.children ?? [])] : [l]);
  // Positions each video layer's element at the source time for this frame. Paused: seek exactly and wait. Playing: let it run and only
  // correct drift, since seeking every frame stutters.
  async function syncVideos(operations: DrawOperation[], exact: boolean) { const drawables = new Map<string, CanvasImageSource>(); const fps = composition.fps;
    await Promise.all(flattenOperations(operations).filter(op => op.kind === 'video').map(async op => { const layer = op.layer as any, video = videos.get(layer.id); if (!video) return; op.frameKey = layer.id; drawables.set(layer.id, video);
      const own = layer.localFrame - layer.startFrame, duration = video.duration || Infinity; let time = (layer.trimStart + own*layer.playbackRate)/fps; time = layer.loop ? time % duration : Math.min(time, duration - 0.001);
      if (exact || !playing) { if (!video.paused) video.pause(); if (Math.abs(video.currentTime - time) > 0.001) await new Promise<void>(ok => { video.addEventListener('seeked', () => ok(), { once: true }); video.currentTime = time; }); }
      else { video.playbackRate = layer.playbackRate; if (Math.abs(video.currentTime - time) > 0.25) video.currentTime = time; if (video.paused) void video.play().catch(() => {}); } }));
    for (const [id, video] of videos) if (!drawables.has(id) && !video.paused) video.pause(); return drawables; }
  async function draw(exact = false) { if (drawing) { pendingDraw = true; return; } drawing = true;
    try { const operations = prepareOperations(toDrawOperations(evaluateFrame(composition, frame)), composition.fps); const drawables = await syncVideos(operations, exact);
      await runtime.draw({ width: composition.width, height: composition.height, background: composition.background, transparent: composition.export.transparent, grain: composition.grain, frame, operations }, drawables); emit('frame', frame); }
    catch (error) { emit('error', error); } finally { drawing = false; if (pendingDraw) { pendingDraw = false; void draw(exact); } } }
  const decode = (url: string) => { let job = buffers.get(url); if (!job) { job = fetch(url).then(r => r.arrayBuffer()).then(data => audio!.decodeAudioData(data)).catch(() => undefined); buffers.set(url, job); } return job; };
  // Schedules every clip that is still to come from `from` seconds, so sound starts mid-clip on a seek, with volume and fades as gain automation.
  async function startAudio(from: number) { if (!audio) { audio = new AudioContext(); master = audio.createGain(); master.connect(audio.destination); } master!.gain.value = options.volume ?? 1; await audio.resume();
    const decoded = await Promise.all(clips.map(clip => decode(clip.url))); if (!playing) return;
    // Decoding takes time while the picture is already moving, so sound starts from where the playhead will be once it is scheduled.
    const lead = 0.05, position = from + (performance.now() - playStart)/1000 + lead, t0 = audio.currentTime + lead;
    decoded.forEach((buffer, i) => { const clip = clips[i]!; if (!buffer) return; const end = clip.start + clip.duration; if (end <= position) return;
      const into = Math.max(0, position - clip.start), remaining = end - Math.max(position, clip.start), when = t0 + Math.max(0, clip.start - position);
      const node = audio!.createBufferSource(); node.buffer = buffer; node.playbackRate.value = clip.rate; node.loop = clip.loop; const gain = audio!.createGain(); node.connect(gain).connect(master!);
      // Gain over clip time: the envelope (or plain volume) times the fades, scheduled as ramps between every point where either changes.
      const envelopeAt = (t: number) => { const e = clip.envelope; if (!e?.length) return clip.volume; if (t <= e[0]![0]) return e[0]![1]; for (let i = 1; i < e.length; i++) if (t <= e[i]![0]) { const [t0, v0] = e[i-1]!, [t1, v1] = e[i]!; return t1 <= t0 ? v1 : v0 + (v1 - v0)*(t - t0)/(t1 - t0); } return e[e.length-1]![1]; };
      const level = (t: number) => Math.max(0, envelopeAt(t) * Math.min(1, clip.fadeIn > 0 ? t/clip.fadeIn : 1, clip.fadeOut > 0 ? (clip.duration - t)/clip.fadeOut : 1));
      const stops = [...new Set([...(clip.envelope ?? []).map(p => p[0]), clip.fadeIn, clip.duration - clip.fadeOut, into + remaining])].filter(t => t > into && t <= into + remaining).sort((a, b) => a - b);
      gain.gain.setValueAtTime(level(into), when); for (const t of stops) gain.gain.linearRampToValueAtTime(level(t), when + (t - into));
      let offset = clip.trim + into*clip.rate; if (clip.loop) offset %= buffer.duration; if (!clip.loop && offset >= buffer.duration) return;
      node.start(Math.max(audio!.currentTime, when), offset); node.stop(Math.max(audio!.currentTime, when) + remaining); sources.push(node); }); }
  const stopAudio = () => { for (const node of sources) { try { node.stop(); } catch {} } sources = []; };
  function tick(now: number) { if (!playing || destroyed) return; const next = Math.floor(playFrom + (now - playStart)/1000*composition.fps);
    if (next >= composition.durationFrames) { if (options.loop) { playFrom = 0; playStart = now; stopAudio(); void startAudio(0); frame = 0; void draw(); } else { frame = composition.durationFrames - 1; pause(); emit('ended'); void draw(true); return; } }
    else if (next !== frame) { frame = next; updateControls(); void draw(); } raf = requestAnimationFrame(tick); }
  async function play() { if (playing) return; if (frame >= composition.durationFrames - 1) frame = 0; playing = true; playFrom = frame; playStart = performance.now(); updateControls(); emit('play'); void startAudio(frame/composition.fps); raf = requestAnimationFrame(tick); }
  function pause() { if (!playing) return; playing = false; cancelAnimationFrame(raf); stopAudio(); for (const v of videos.values()) v.pause(); updateControls(); emit('pause'); void draw(true); }
  async function seek(to: number) { frame = Math.max(0, Math.min(composition.durationFrames - 1, Math.round(to))); updateControls();
    if (playing) { playFrom = frame; playStart = performance.now(); stopAudio(); void startAudio(frame/composition.fps); void draw(); } else await draw(true); }
  // Controls: play/pause, a scrubber and the time; space, ←/→ (shift for 10 frames), Home and End work when the player has focus.
  let updateControls = () => {};
  if (options.controls !== false) { const bar = document.createElement('div'); bar.style.cssText = 'display:flex;gap:10px;align-items:center;padding:8px 10px;background:#0b0f17';
    const button = document.createElement('button'); button.type = 'button'; button.style.cssText = 'background:#1f2937;color:inherit;border:0;border-radius:5px;padding:5px 12px;cursor:pointer;font:inherit;min-width:64px';
    const range = document.createElement('input'); range.type = 'range'; range.min = '0'; range.style.cssText = 'flex:1;accent-color:#818cf8'; range.setAttribute('aria-label', 'Position');
    const time = document.createElement('span'); time.style.cssText = 'font-variant-numeric:tabular-nums;color:#9ca3af;min-width:92px;text-align:right';
    bar.append(button, range, time); root.appendChild(bar);
    button.addEventListener('click', () => { if (playing) pause(); else void play(); }); range.addEventListener('input', () => { void seek(Number(range.value)); });
    const clock = (f: number) => { const s = f/composition.fps; return `${Math.floor(s/60)}:${(s%60).toFixed(1).padStart(4, '0')}`; };
    updateControls = () => { button.textContent = playing ? 'Pause' : 'Play'; range.max = String(composition.durationFrames - 1); range.value = String(frame); time.textContent = `${clock(frame)} / ${clock(composition.durationFrames)}`; }; }
  root.addEventListener('keydown', event => { if ((event.target as HTMLElement).tagName === 'INPUT' && event.key !== ' ') return;
    if (event.key === ' ') { event.preventDefault(); if (playing) pause(); else void play(); } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); if (playing) pause(); void seek(frame + (event.key === 'ArrowRight' ? 1 : -1)*(event.shiftKey ? 10 : 1)); }
    else if (event.key === 'Home') void seek(0); else if (event.key === 'End') void seek(composition.durationFrames - 1); });
  await load(); if (options.autoplay) void play();
  return { element: root, get composition() { return composition; }, get frame() { return frame; }, get playing() { return playing; }, play, pause, seek,
    async setValues(values) { const was = playing; if (was) pause(); await load(values); if (was) await play(); },
    on(event, listener) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event)!.add(listener); return () => listeners.get(event)!.delete(listener); },
    destroy() { destroyed = true; pause(); void audio?.close(); for (const v of videos.values()) { v.removeAttribute('src'); v.load(); } root.remove(); } }; }
