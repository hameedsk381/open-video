// The tools a packaged build carries with it: ffmpeg and ffprobe for encoding, and a Chromium for drawing frames. The engine
// already reads OVE_FFMPEG_PATH, OVE_FFPROBE_PATH and OVE_CHROMIUM_EXECUTABLE first, so the shell only has to point them at
// resources/tools. In a development run the folder is absent and the engine falls back to whatever is installed on the machine.
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const exe = process.platform === 'win32' ? '.exe' : '';

const chromiumCandidates = [
  join('chromium', `chrome${exe}`),
  join('chromium', 'chrome-win', 'chrome.exe'),
  join('chromium', 'Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
  join('chromium', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
];

/** Environment for the studio process and every render job it starts. Empty entries are simply left unset. */
export function toolEnv(toolsDir) {
  const env = {};
  if (!toolsDir || !existsSync(toolsDir)) return env;
  const ffmpeg = join(toolsDir, `ffmpeg${exe}`);
  const ffprobe = join(toolsDir, `ffprobe${exe}`);
  const chromium = chromiumCandidates.map(candidate => join(toolsDir, candidate)).find(existsSync);
  if (existsSync(ffmpeg)) env.OVE_FFMPEG_PATH = ffmpeg;
  if (existsSync(ffprobe)) env.OVE_FFPROBE_PATH = ffprobe;
  if (chromium) env.OVE_CHROMIUM_EXECUTABLE = chromium;
  return env;
}

/** What the shell found, for the smoke report and for troubleshooting a packaged install. */
export function toolReport(toolsDir) {
  return {
    dir: toolsDir ?? null,
    ffmpeg: Boolean(toolsDir && existsSync(join(toolsDir, `ffmpeg${exe}`))),
    ffprobe: Boolean(toolsDir && existsSync(join(toolsDir, `ffprobe${exe}`))),
    chromium: Boolean(toolsDir && chromiumCandidates.map(candidate => join(toolsDir, candidate)).some(existsSync)),
  };
}
