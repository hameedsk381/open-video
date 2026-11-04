import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync, mkdirSync, chmodSync, createWriteStream, unlinkSync, renameSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';

const isWin = process.platform === 'win32';
const binDir = join(homedir(), '.motionrender', 'bin');
export const localFfmpegPath = join(binDir, isWin ? 'ffmpeg.exe' : 'ffmpeg');
export const localFfprobePath = join(binDir, isWin ? 'ffprobe.exe' : 'ffprobe');

let checkedSystemFfmpeg = false;
let systemFfmpegAvailable = false;
let checkedSystemFfprobe = false;
let systemFfprobeAvailable = false;

export function hasSystemFfmpeg(): boolean {
  if (checkedSystemFfmpeg) return systemFfmpegAvailable;
  try {
    const res = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    systemFfmpegAvailable = res.status === 0;
  } catch {
    systemFfmpegAvailable = false;
  }
  checkedSystemFfmpeg = true;
  return systemFfmpegAvailable;
}

export function hasSystemFfprobe(): boolean {
  if (checkedSystemFfprobe) return systemFfprobeAvailable;
  try {
    const res = spawnSync('ffprobe', ['-version'], { stdio: 'ignore' });
    systemFfprobeAvailable = res.status === 0;
  } catch {
    systemFfprobeAvailable = false;
  }
  checkedSystemFfprobe = true;
  return systemFfprobeAvailable;
}

export const getFfmpegPath = (): string => {
  if (process.env.OVE_FFMPEG_PATH) return process.env.OVE_FFMPEG_PATH;
  if (existsSync(localFfmpegPath)) return localFfmpegPath;
  if (hasSystemFfmpeg()) return 'ffmpeg';
  return localFfmpegPath;
};

export const getFfprobePath = (): string => {
  if (process.env.OVE_FFPROBE_PATH) return process.env.OVE_FFPROBE_PATH;
  if (existsSync(localFfprobePath)) return localFfprobePath;
  if (hasSystemFfprobe()) return 'ffprobe';
  return localFfprobePath;
};

const RELEASE_TAG = 'b6.1.1';
const BASE_URL = `https://github.com/eugeneware/ffmpeg-static/releases/download/${RELEASE_TAG}`;

function getPlatformArch(): { platform: string; arch: string } {
  const p = process.platform;
  const a = process.arch;
  if (p === 'win32') return { platform: 'win32', arch: 'x64' };
  if (p === 'darwin') return { platform: 'darwin', arch: a === 'arm64' ? 'arm64' : 'x64' };
  if (p === 'linux') return { platform: 'linux', arch: a === 'arm64' ? 'arm64' : (a === 'arm' ? 'arm' : 'x64') };
  return { platform: p, arch: a };
}

async function downloadAndExtract(
  name: 'ffmpeg' | 'ffprobe',
  destPath: string,
  onProgress?: (msg: string) => void
): Promise<void> {
  const { platform, arch } = getPlatformArch();
  const url = `${BASE_URL}/${name}-${platform}-${arch}.gz`;

  if (onProgress) onProgress(`Downloading ${name} (${platform}-${arch})...`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download ${name} from ${url} (HTTP ${res.status})`);
  }

  const tmpPath = `${destPath}.tmp-${Date.now()}`;
  try {
    const fileStream = createWriteStream(tmpPath);
    const nodeReadable = Readable.fromWeb(res.body as any);
    await pipeline(nodeReadable, createGunzip(), fileStream);

    if (!isWin) {
      chmodSync(tmpPath, 0o755);
    }

    if (existsSync(destPath)) {
      try { unlinkSync(destPath); } catch {}
    }
    renameSync(tmpPath, destPath);
  } catch (err) {
    try { if (existsSync(tmpPath)) unlinkSync(tmpPath); } catch {}
    throw err;
  }
}

let ensureFfmpegPromise: Promise<{ ffmpeg: string; ffprobe: string }> | null = null;

export async function ensureFfmpeg(options?: { onProgress?: (msg: string) => void }): Promise<{ ffmpeg: string; ffprobe: string }> {
  if (ensureFfmpegPromise) return ensureFfmpegPromise;

  ensureFfmpegPromise = (async () => {
    const ffmpegFromEnv = process.env.OVE_FFMPEG_PATH;
    const ffprobeFromEnv = process.env.OVE_FFPROBE_PATH;

    const hasLocalFfmpeg = existsSync(localFfmpegPath);
    const hasLocalFfprobe = existsSync(localFfprobePath);

    const hasSysFfmpeg = !ffmpegFromEnv && !hasLocalFfmpeg ? hasSystemFfmpeg() : false;
    const hasSysFfprobe = !ffprobeFromEnv && !hasLocalFfprobe ? hasSystemFfprobe() : false;

    const ffmpegReady = Boolean(ffmpegFromEnv || hasLocalFfmpeg || hasSysFfmpeg);
    const ffprobeReady = Boolean(ffprobeFromEnv || hasLocalFfprobe || hasSysFfprobe);

    if (ffmpegReady && ffprobeReady) {
      return { ffmpeg: getFfmpegPath(), ffprobe: getFfprobePath() };
    }

    if (!existsSync(binDir)) {
      mkdirSync(binDir, { recursive: true });
    }

    const log = options?.onProgress ?? ((msg: string) => console.log(msg));

    if (!ffmpegReady) {
      log('FFmpeg not found. Automatically downloading static build (one-time setup)...');
      await downloadAndExtract('ffmpeg', localFfmpegPath, log);
      log('✓ FFmpeg installed successfully.');
    }

    if (!ffprobeReady) {
      log('ffprobe not found. Automatically downloading static build (one-time setup)...');
      await downloadAndExtract('ffprobe', localFfprobePath, log);
      log('✓ ffprobe installed successfully.');
    }

    return { ffmpeg: getFfmpegPath(), ffprobe: getFfprobePath() };
  })();

  try {
    return await ensureFfmpegPromise;
  } catch (err) {
    ensureFfmpegPromise = null;
    throw err;
  }
}

