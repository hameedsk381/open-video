#!/usr/bin/env node
try { process.loadEnvFile?.(); } catch { /* .env is optional */ }
import { readFile, writeFile } from 'node:fs/promises'; import { resolve, dirname } from 'node:path'; import { prepareComposition, reviewComposition, measureMedia, captionTrack, formatCaptions, loadComposition, compositionJsonSchema, variablesSchema, resolveVariables, interpolate, describeError, outputFormats, renderMedia, renderStill, defaultConcurrency, x264Presets, defaultPreset, checkFfmpeg, describeBrowser, ffprobePath, renderDistributed, httpWorker, cacheUsage, cleanCache, type Composition, type OutputFormat, type X264Preset } from '@ove/core'; import { initProject } from './init'; import { checkArgs, wantsHelp } from './args'; import { startDevServer } from './dev'; import { startWorker } from './worker'; import { spawnSync } from 'node:child_process'; import { createRequire } from 'node:module';
const usage = `Usage:
  ove init <dir> [--template id] [--force] [--no-skill]
  ove schema [--output composition.schema.json]
  ove doctor                      check Node, FFmpeg encoders and the browser
  ove cache size|clean [--older-than 30d]   show or free the cache of decoded video, media measurements and sound effects
  ove browser install             download Playwright's Chromium for rendering
  ove thumbnail <composition.json> [--frame n] [--title "text"] [--width 1280] [--output thumbnail.png] [variables]   a cover image, with an optional title over it
  ove build <video.ts|video.js> [--output composition.json]   run a video written as code (open-video-engine/builder) and write its composition JSON
  ove track <matte> [--fps 30] [--output track.json]   follow the speaker through a matte video (for fx-tracked-label)
  ove blocks [--json]             list the ready-made scenes and overlays and the themes
  ove add <block> <composition.json> [--set name=value] [--at frame] [--scene id]   copy a block into a video (creates the file if it is new: --aspect 9:16 --theme neon)
  ove theme [id] [composition.json]   list themes, or switch a composition to one
  ove serve                       the studio for many people (sign-in, Postgres, Redis); settings come from the environment, see docs/hosting.md
  ove job-worker                  runs queued jobs for ove serve (JOB_LANE=render|ai)
  ove worker [--port 4400] [--host 127.0.0.1] [--token T] [--concurrency n]   render chunks for other machines
  ove dev <composition.json> [--port 3000] [--allow-host name] [variables]
  ove validate <composition.json> [variables]
    (code layers run JavaScript from the file: dev, still, review, render and thumbnail need --allow-code, for files you trust)
  ove inspect <composition.json> [variables]          scenes, timing and measured media
  ove captions <composition.json> [--output captions.srt|.vtt] [variables]   export the captions as a subtitle file
  ove still <composition.json> [--frame 0] [--output still.png] [--transparent] [variables]
  ove review <composition.json> [--output review.png] [--every 15] [--sheet-frames 20] [--json] [variables]   contact sheet and design checks
  ove render <composition.json> [--output output.mp4] [render options] [variables]
  ove render <composition.json> --batch rows.json --output "out/{{name}}.mp4" [render options]
  ove ai doctor | compose | narrate | transcribe | image | batch | studio   AI-assisted authoring; run "ove ai" for details

Render options:
  --format mp4|webm|mov|gif|png   default: from the --output extension, then export.format (png writes a folder of frames)
  --codec h264|h265               mp4 only
  --transparent                   keep the background transparent (webm, mov, png)
  --frames 30-89                  render only these frames (inclusive)
  --crf 18 | --bitrate 8M         video quality: constant quality (lower = better) or a data rate; --audio-bitrate 256k
  --scale 0.5                     render smaller for a quick draft
  --loudness -14                  make the sound this loud overall (LUFS), with peaks limited
  --no-motion-blur                skip the composition's motion blur, for a quicker draft
  --concurrency n --preset veryfast
  --workers URL,URL [--chunk-size 60] [--token T]   split the render across "ove worker" processes (mp4, webm, mov)
Variables: --var name=value (repeatable) and/or --vars values.json; --var wins.
Options also take the form --name=value. ove --help shows this list.`;
// Options are checked against each command's list first (args.ts), so typos fail instead of being ignored.
if (wantsHelp(process.argv.slice(2))) { console.log(usage); process.exit(0); }
let argv: string[]; try { argv=checkArgs(process.argv.slice(2)); } catch (error) { console.error(`${(error as Error).message}\nRun "ove --help" for the options.`); process.exit(1); }
const [command,file]=argv; const option=(name:string)=>{ const index=argv.indexOf(name); return index < 0 ? undefined : argv[index+1]; }; const flag=(name:string)=>argv.includes(name);
const readJson=async (path:string) => JSON.parse(await readFile(resolve(path),'utf8'));
async function suppliedValues(): Promise<Record<string, unknown>> { const fromFile=option('--vars') ? await readJson(option('--vars')!) : {}; if (typeof fromFile !== 'object' || fromFile === null || Array.isArray(fromFile)) throw new Error('--vars must be a JSON object of name: value'); const fromFlags=Object.fromEntries(argv.flatMap((arg, i) => { if (arg !== '--var') return []; const pair=argv[i+1] ?? '', at=pair.indexOf('='); if (at < 1) throw new Error(`--var expects name=value, got "${pair}"`); return [[pair.slice(0, at), pair.slice(at+1).replace(/\\n/g, '\n')]]; })); return { ...fromFile, ...fromFlags }; } // a typed \n in --var is a line break
function renderSettings() { const concurrency=Number(option('--concurrency') ?? defaultConcurrency()); if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('--concurrency must be a positive integer'); const preset=(option('--preset') ?? defaultPreset) as X264Preset; if (!x264Presets.includes(preset)) throw new Error(`--preset must be one of: ${x264Presets.join(', ')}`);
  const format=option('--format') as OutputFormat | undefined; if (format !== undefined && !outputFormats.includes(format)) throw new Error(`--format must be one of: ${outputFormats.join(', ')}`); const codec=option('--codec'); if (codec !== undefined && codec !== 'h264' && codec !== 'h265') throw new Error('--codec must be h264 or h265');
  const frames=option('--frames'), range=frames === undefined ? undefined : /^(\d+)-(\d+)$/.exec(frames); if (frames !== undefined && !range) throw new Error('--frames takes first-last, e.g. --frames 30-89');
  const number=(name: string) => { const v=option(name); if (v === undefined) return undefined; const n=Number(v); if (!Number.isFinite(n)) throw new Error(`${name} needs a number`); return n; };
  return { concurrency, preset, format, codec: codec as 'h264' | 'h265' | undefined, transparent: flag('--transparent') ? true : undefined, frameRange: range ? [Number(range[1]), Number(range[2])] as [number, number] : undefined,
    crf: number('--crf'), bitrate: option('--bitrate'), audioBitrate: option('--audio-bitrate'), scale: number('--scale'), loudness: number('--loudness'), motionBlur: flag('--no-motion-blur') ? false : undefined }; }
const workerToken=() => { const token=option('--token') ?? process.env.OVE_WORKER_TOKEN; if (!token) throw new Error("--workers needs the workers' token: --token T or OVE_WORKER_TOKEN"); return token; };
async function renderVideo(composition: Composition, baseDir: string, output: string, settings: ReturnType<typeof renderSettings>) { const started=Date.now(); let lastReport=0;
  const workers=option('--workers'); if (workers) { const chunkSize=option('--chunk-size') === undefined ? undefined : Number(option('--chunk-size')); if (chunkSize !== undefined && !(Number.isInteger(chunkSize) && chunkSize > 0)) throw new Error('--chunk-size must be a positive whole number of frames'); const token=workerToken();
    if (settings.format && !['mp4','webm','mov'].includes(settings.format)) throw new Error('--workers renders mp4, webm or mov');
    const result=await renderDistributed(composition, { baseDir, output, workers: workers.split(',').map(url => httpWorker(url.trim(), token)), chunkSize, frameRange: settings.frameRange, format: settings.format as 'mp4' | 'webm' | 'mov' | undefined, codec: settings.codec, transparent: settings.transparent, preset: settings.preset, crf: settings.crf, bitrate: settings.bitrate, audioBitrate: settings.audioBitrate, scale: settings.scale, loudness: settings.loudness, motionBlur: settings.motionBlur,
      onProgress: ({ rendered, total, chunk, worker }) => console.log(`Chunk ${chunk} done by ${worker} (${rendered}/${total} frames)`), onWorkerError: (worker, error) => console.log(`${worker} failed a chunk, retrying elsewhere: ${error.message.split(/\r?\n/)[0]}`) });
    console.log(`Created ${result.output} (${result.format}, ${result.frames} frames, ${result.durationSeconds.toFixed(2)} seconds; rendered in ${((Date.now()-started)/1000).toFixed(1)}s on ${workers.split(',').length} worker${workers.includes(',') ? 's' : ''})`); return; }
  const result=await renderMedia(composition, { ...settings, baseDir, output, allowCode: flag('--allow-code'), onProgress: ({ rendered, total }) => { if (rendered === total || Date.now()-lastReport > 1000) { lastReport=Date.now(); console.log(`Rendered ${rendered}/${total}`); } } });
  console.log(`Created ${result.output} (${result.format}, ${result.frames} frames, ${result.durationSeconds.toFixed(2)} seconds; rendered in ${((Date.now()-started)/1000).toFixed(1)}s with ${settings.concurrency} page${settings.concurrency === 1 ? '' : 's'})`); }
// One video per row of the batch file. Every row is resolved and every output path checked before anything renders, so a bad row
// or two rows writing the same file fail fast instead of halfway through.
async function renderBatch(raw: any, baseDir: string) { const rows=await readJson(option('--batch')!); if (!Array.isArray(rows) || rows.length === 0) throw new Error('--batch must be a JSON array with at least one object of variable values'); const pattern=option('--output'); if (!pattern || !/\{\{/.test(pattern)) throw new Error('--batch needs --output with {{variables}} in it, e.g. --output "out/{{name}}.mp4", so each row gets its own file'); const settings=renderSettings(); const declarations=variablesSchema.parse(raw?.variables ?? {});
  // Values become file names here, so line breaks and characters Windows or POSIX reject (including / and \, which would let a row
  // write outside the output folder) are replaced.
  const fileSafe=(values: Record<string, unknown>) => Object.fromEntries(Object.entries(values).map(([k, v]) => [k, String(v).replace(/[\r\n\t]+/g, ' ').replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').trim()]));
  const jobs: { composition: Composition; output: string }[]=[];
  for (const [i, row] of rows.entries()) { try { const values=resolveVariables(declarations, row); jobs.push({ composition: await prepareComposition(raw, row, baseDir), output: resolve(interpolate(pattern, fileSafe(values))) }); } catch (error) { throw new Error(`Row ${i+1}: ${describeError(error)}`); } }
  const seen=new Map<string, number>(); jobs.forEach((job, i) => { const first=seen.get(job.output); if (first !== undefined) throw new Error(`Rows ${first+1} and ${i+1} both write ${job.output}; make --output depend on a variable that differs`); seen.set(job.output, i); });
  for (const [i, job] of jobs.entries()) { console.log(`\n[${i+1}/${jobs.length}] ${job.output}`); await renderVideo(job.composition, baseDir, job.output, settings); } }
// Reports everything a render depends on, so setup problems show up before a render fails halfway.
async function doctor() { let ok=true; const line=(good: boolean, label: string, detail: string) => { if (!good) ok=false; console.log(`${good ? '✓' : '✗'} ${label.padEnd(9)} ${detail}`); };
  const major=Number(process.versions.node.split('.')[0]); line(major >= 22, 'Node', `${process.versions.node}${major >= 22 ? '' : ' (22 or later is required)'}`);
  try { const { version, missing }=await checkFfmpeg(); line(true, 'FFmpeg', version); for (const [use, names] of Object.entries(missing)) line(false, '', `missing ${names.join(', ')}: ${use} output will fail`); } catch (error) { line(false, 'FFmpeg', (error as Error).message); }
  const probe=spawnSync(ffprobePath(), ['-version'], { encoding: 'utf8' }); line(!probe.error && probe.status === 0, 'ffprobe', probe.error ? 'not found (install FFmpeg, or set OVE_FFPROBE_PATH)' : (probe.stdout.split(/\r?\n/)[0] ?? '').trim());
  try { line(true, 'Browser', await describeBrowser()); } catch (error) { line(false, 'Browser', (error as Error).message); }
  if (!ok) process.exitCode=1; }
try {
  if (command === 'doctor') await doctor();
  else if (command === 'cache') { const mb=(bytes: number) => `${(bytes/1048576).toFixed(1)} MB`;
    if (file === 'size') { const usage=await cacheUsage(); console.log(`${usage.root}\n${usage.kinds.map(k => `  ${k.kind.padEnd(6)} ${String(k.entries).padStart(5)} entries  ${mb(k.bytes)}`).join('\n')}\n  total  ${mb(usage.bytes)}`); }
    else if (file === 'clean') { const age=option('--older-than'), parsed=age === undefined ? undefined : /^(\d+)(d|h)$/.exec(age); if (age !== undefined && !parsed) throw new Error('--older-than takes days or hours, e.g. 30d or 12h');
      const freed=await cleanCache({ olderThanMs: parsed ? Number(parsed[1])*(parsed[2] === 'd' ? 86_400_000 : 3_600_000) : undefined }); console.log(`Removed ${freed.entries} cache entries, ${mb(freed.bytes)}${age ? ` not used in ${age}` : ''}`); }
    else throw new Error('Usage: ove cache size, or ove cache clean [--older-than 30d]'); }
  else if (command === 'serve') { const { runServe } = await import('./serve'); await runServe(); }
  else if (command === 'job-worker') { const { runJobWorker } = await import('./serve'); await runJobWorker(); }
  else if (command === 'worker') { const port=option('--port') === undefined ? undefined : Number(option('--port')); const concurrency=option('--concurrency') === undefined ? undefined : Number(option('--concurrency'));
    const worker=await startWorker({ port, host: option('--host'), token: option('--token') ?? process.env.OVE_WORKER_TOKEN, concurrency, log: line => console.log(`[${new Date().toISOString().slice(11, 19)}] ${line}`) });
    console.log(`Worker listening on ${worker.url}
Token: ${worker.token}
Render with: ove render video.json --output out.mp4 --workers ${worker.url} --token <token>
Press Ctrl+C to stop.`);
    const stop=() => { worker.close().finally(() => process.exit(0)); }; process.once('SIGINT', stop); process.once('SIGTERM', stop); }
  else if (command === 'browser') { if (file !== 'install') throw new Error('Usage: ove browser install'); const cli=createRequire(import.meta.url).resolve('playwright/cli'); console.log('Downloading Playwright Chromium…'); const result=spawnSync(process.execPath, [cli, 'install', 'chromium'], { stdio: 'inherit' }); if (result.status !== 0) throw new Error('Chromium download failed; see the output above.'); }
  else if (command === 'schema') { const json=JSON.stringify(compositionJsonSchema,null,2)+'\n'; const output=option('--output'); if (output) { await writeFile(resolve(output),json); console.log(`Wrote ${resolve(output)}`); } else process.stdout.write(json); }
  else if (command === 'init') { if (!file || file.startsWith('--')) throw new Error(usage); const template=option('--template'); const files=await initProject(file,{force:flag('--force'),skill:!flag('--no-skill'),template}); console.log(`Created ${resolve(file)}${template ? ` from template "${template}"` : ''}\n${files.map(f=>`  ${f}`).join('\n')}\n\nNext:\n  ove still ${file}/composition.json --frame 45 --output still.png\n  ove render ${file}/composition.json --output ${file}/out.mp4 --var title="Hi there"`); }
  else if (command === 'dev') { if (!file || file.startsWith('--')) throw new Error(usage); const port=option('--port') === undefined ? undefined : Number(option('--port')); if (port !== undefined && !(Number.isInteger(port) && port > 0 && port < 65536)) throw new Error('--port must be a port number');
    const allowHosts=argv.flatMap((arg, i) => arg === '--allow-host' && argv[i+1] ? [argv[i+1]!] : []); const dev=await startDevServer(file, { port, values: await suppliedValues(), allowHosts, allowCode: flag('--allow-code') }); console.log(`Previewing ${resolve(file)}\n  ${dev.url}\nSaving the file reloads the preview. Press Ctrl+C to stop.`);
    const stop=() => { dev.close().finally(() => process.exit(0)); }; process.once('SIGINT', stop); process.once('SIGTERM', stop); }
  else if (command === 'thumbnail') { if (!file || file.startsWith('--')) throw new Error(usage); await (await import('./thumbnail')).runThumbnail(argv, await readJson(file), await suppliedValues(), dirname(resolve(file))); }
  else if (command === 'track') await (await import('./track')).runTrack(argv);
  else if (command === 'build') await (await import('./build')).runBuild(argv);
  else if (command === 'blocks') await (await import('./blocks-cli')).runBlocks(argv);
  else if (command === 'add') await (await import('./blocks-cli')).runAdd(argv);
  else if (command === 'theme') await (await import('./blocks-cli')).runTheme(argv);
  else if (command === 'ai') { if (!file) { const { aiUsage } = await import('./ai'); console.log(aiUsage); } else process.exitCode=await (await import('./ai')).runAi(argv); }
  else { if (!command || !file) throw new Error(usage); const raw=await readJson(file); const baseDir=dirname(resolve(file));
    if (command === 'render' && option('--batch')) await renderBatch(raw, baseDir);
    else { const values=await suppliedValues(), composition=await prepareComposition(raw, values, baseDir);
      if (command === 'validate') console.log(`Valid: ${composition.name} (${composition.durationFrames} frames)`);
      else if (command === 'inspect') console.log(JSON.stringify({id:composition.id, durationSeconds:composition.durationFrames/composition.fps, durationFrames:composition.durationFrames, scenes:composition.scenes.map(s=>({ id: s.id, startFrame: s.startFrame, durationFrames: s.durationFrames })), export:composition.export, variables:composition.variables, assets:composition.assets.map(({ cues, ...asset }: any)=>asset), media: await measureMedia(raw, baseDir)},null,2));
      else if (command === 'captions') { const output=resolve(option('--output') ?? 'captions.srt'), format=output.toLowerCase().endsWith('.vtt') ? 'vtt' : 'srt', cues=captionTrack(composition); if (!cues.length) throw new Error('This composition has no captions layers with any lines'); await writeFile(output, formatCaptions(cues, format)); console.log(`Wrote ${cues.length} captions to ${output}`); }
      else if (command === 'still') { const frame=Number(option('--frame') ?? 0); if (!Number.isInteger(frame) || frame < 0 || frame >= composition.durationFrames) throw new Error(`--frame must be an integer from 0 to ${composition.durationFrames-1}`); const output=resolve(option('--output') ?? `still-${frame}.png`); await renderStill(composition, { frame, output, baseDir, allowCode: flag('--allow-code'), transparent: flag('--transparent') ? true : undefined }); console.log(`Created ${output}`); }
      else if (command === 'review') { const output=resolve(option('--output') ?? 'review.png'), every=option('--every') === undefined ? undefined : Number(option('--every')), sheetOption=option('--sheet-frames') ?? option('--frames'), sheetFrames=sheetOption === undefined ? undefined : Number(sheetOption);
        if (every !== undefined && !(Number.isInteger(every) && every > 0)) throw new Error('--every must be a whole number of frames'); if (sheetFrames !== undefined && !(Number.isInteger(sheetFrames) && sheetFrames > 0 && sheetFrames <= 60)) throw new Error('--sheet-frames must be from 1 to 60');
        const result=await reviewComposition(composition, { baseDir, allowCode: flag('--allow-code'), every, sheetFrames, onProgress: (done, total) => { if (!flag('--json') && (done === total || done % 10 === 0)) process.stderr.write(`Checked ${done}/${total} frames\r`); } }); await writeFile(output, result.sheet);
        if (flag('--json')) console.log(JSON.stringify({ sheet: output, sheetFrames: result.sheetFrames, sampledFrames: result.sampledFrames, loudness: result.loudness, issues: result.issues }, null, 2));
        else { process.stderr.write('\n'); const mark={ error: 'ERROR', warning: 'warn ', info: 'info ' }; for (const issue of result.issues) console.log(`${mark[issue.severity]}  ${issue.frame === undefined ? '' : `frame ${issue.frame} (${(issue.frame/composition.fps).toFixed(1)} s)  `}${issue.message}${issue.layer ? `  [${issue.layer}]` : ''}`);
          const count=(s: string) => result.issues.filter(i => i.severity === s).length; console.log(`${result.issues.length ? '\n' : ''}${count('error')} errors, ${count('warning')} warnings, ${count('info')} notes from ${result.sampledFrames} sampled frames${result.loudness ? `; sound ${result.loudness.integrated.toFixed(1)} LUFS, peak ${result.loudness.truePeak.toFixed(1)} dBTP` : ''}\nContact sheet: ${output} (frames ${result.sheetFrames.join(', ')})`); }
        if (result.issues.some(i => i.severity === 'error')) process.exitCode=1; }
      else if (command === 'render') await renderVideo(composition, baseDir, resolve(option('--output') ?? 'output.mp4'), renderSettings());
      else throw new Error(`Unknown command ${command}\n${usage}`); } }
} catch (error) { console.error(describeError(error)); process.exitCode=1; }
