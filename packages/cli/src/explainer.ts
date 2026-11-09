// `mr explainer`: from an explainer script (what each scene is about and what is said over it) to a composition. validate checks the
// script; the default run also records each scene's spoken line with a free Edge voice, so every scene lasts as long as its line,
// and writes composition.json for the existing still / review / render commands.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { explainerSchema, type Explainer } from '@ove/schema';
import { compileExplainer, type ExplainerAudio } from '@ove/core';
import { createProvider, synthesizeEdgeSpeech, writeExplainer } from '@ove/ai';

const option = (argv: string[], name: string) => { const index = argv.indexOf(name); return index < 0 ? undefined : argv[index + 1]; };

/** Reads a script and reports every problem at once, rather than the first. */
export function readExplainer(raw: unknown): Explainer {
  const parsed = explainerSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`The explainer cannot be used:\n${parsed.error.issues.map(issue => `- ${issue.path.join('.') || 'explainer'}: ${issue.message}`).join('\n')}`);
  return parsed.data;
}

/** The picture and video files a script's media scenes name that are not there, with the scene each belongs to. */
export function missingMedia(spec: Explainer, baseDir: string): string[] {
  return spec.scenes.flatMap((scene, i) => (scene.kind === 'media' && !existsSync(resolve(baseDir, scene.src)) ? [`${scene.src} (scene ${i + 1})`] : []));
}

/** The length of a PCM WAV recording in seconds, read from its header (which is all the spoken lines need). */
export function wavSeconds(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), tag = (at: number) => String.fromCharCode(...bytes.slice(at, at + 4));
  if (bytes.length < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('That is not a WAV recording');
  let byteRate = 0;
  for (let at = 12; at + 8 <= bytes.length;) {
    const size = view.getUint32(at + 4, true);
    if (tag(at) === 'fmt ') byteRate = view.getUint32(at + 16, true);
    if (tag(at) === 'data') { if (!byteRate) break; return Math.min(size, bytes.length - at - 8) / byteRate; }
    at += 8 + size + (size % 2);
  }
  throw new Error('That WAV recording has no readable length');
}

/** Records a scene's line, or reuses the recording made earlier for the same words and voice. */
async function speak(text: string, voice: string | undefined, file: string): Promise<ExplainerAudio & { fresh: boolean }> {
  const stamp = createHash('sha1').update(`${voice ?? ''}\n${text}`).digest('hex'), mark = `${file}.txt`;
  const same = await readFile(mark, 'utf8').then(saved => saved === stamp, () => false);
  if (same) { const bytes = await readFile(file).catch(() => undefined); if (bytes) return { src: '', seconds: wavSeconds(bytes), fresh: false }; }
  const speech = await synthesizeEdgeSpeech(text, { voice });
  if (!/wav/i.test(speech.extension)) throw new Error(`The voice answered with ${speech.extension} audio; only WAV is read here`);
  const bytes = Buffer.from(speech.data);
  await writeFile(file, bytes); await writeFile(mark, stamp);
  return { src: '', seconds: wavSeconds(bytes), fresh: true };
}

/** `mr explainer write "what to explain"`: the model writes the script; compile it next. */
async function writeCommand(argv: string[]): Promise<void> {
  const brief = argv[2];
  if (!brief || brief.startsWith('--')) throw new Error('Usage: mr explainer write "what the video should explain" [--scenes 5] [--language English] [--voice <name>] [--media a.mp4,b.jpg] [--output explainer.json]');
  const provider = createProvider({ provider: option(argv, '--provider'), model: option(argv, '--model'), baseUrl: option(argv, '--base-url') });
  const scenes = option(argv, '--scenes') === undefined ? undefined : Number(option(argv, '--scenes'));
  if (scenes !== undefined && !(Number.isInteger(scenes) && scenes >= 2 && scenes <= 16)) throw new Error('--scenes must be a whole number from 2 to 16');
  const { explainer, attempts } = await writeExplainer(provider, brief, { scenes, language: option(argv, '--language'), voice: option(argv, '--voice'), media: option(argv, '--media')?.split(',').map(item => item.trim()).filter(Boolean), onProgress: message => console.log(message) });
  const output = resolve(option(argv, '--output') ?? 'explainer.json');
  await writeFile(output, `${JSON.stringify(explainer, null, 2)}\n`);
  console.log(`Wrote ${output} (${explainer.scenes.length} scenes${attempts > 1 ? `, after ${attempts} attempts` : ''})\nNext: mr explainer compile ${relative(process.cwd(), output)}`);
}

export async function runExplainer(argv: string[]): Promise<void> {
  const [, action, file] = argv;
  if (action === 'write') return writeCommand(argv);
  if (action !== 'compile' && action !== 'validate') throw new Error('Usage: mr explainer write "<what to explain>" | validate <explainer.json> | compile <explainer.json> [--output composition.json] [--no-voice] [--voice <name>]');
  if (!file) throw new Error(`mr explainer ${action} needs an explainer file`);
  const spec = readExplainer(JSON.parse((await readFile(file, 'utf8')).replace(/^﻿/, '')));
  const spoken = spec.scenes.filter(scene => scene.say).length;
  if (action === 'validate') {
    console.log(`Valid explainer "${spec.topic}": ${spec.scenes.length} scene${spec.scenes.length === 1 ? '' : 's'} (${spec.scenes.map(scene => scene.kind).join(', ')}), ${spoken} spoken line${spoken === 1 ? '' : 's'}.`);
    return;
  }
  const output = resolve(option(argv, '--output') ?? join(dirname(resolve(file)), 'composition.json')), assets = join(dirname(output), 'assets');
  const missing = missingMedia(spec, dirname(output));
  if (missing.length) throw new Error(`The video needs files that are not next to it (${dirname(output)}):\n${missing.map(item => `- ${item}`).join('\n')}\nAdd them in the editor's Media tab or copy them there, then compile again.`);
  const voice = option(argv, '--voice') ?? spec.voice, withVoice = !argv.includes('--no-voice') && spoken > 0;
  const audio: (ExplainerAudio | undefined)[] = [];
  if (withVoice) {
    await mkdir(assets, { recursive: true });
    for (const [i, scene] of spec.scenes.entries()) {
      if (!scene.say) { audio.push(undefined); continue; }
      const name = `voice-${i + 1}.wav`, made = await speak(scene.say, voice, join(assets, name));
      console.log(`  scene ${i + 1}: ${made.fresh ? 'recorded' : 'reused'} ${made.seconds.toFixed(1)} s`);
      audio.push({ src: relative(dirname(output), join(assets, name)).replace(/\\/g, '/'), seconds: made.seconds });
    }
  }
  const { composition, notes } = compileExplainer(spec, { audio });
  await writeFile(output, JSON.stringify(composition, null, 2) + '\n');
  for (const note of notes) console.log(`  ${note}`);
  console.log(`Wrote ${output}\nNext: mr still ${relative(process.cwd(), output)} --frame 90 · mr render ${relative(process.cwd(), output)} --output out.mp4`);
}
