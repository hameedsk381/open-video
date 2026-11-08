// Preferences for the desktop shell: which project folder the studio was last opened on, the folders opened before it, and
// where the window sat. Kept in userData/settings.json beside the studio log; a corrupt file falls back to the defaults.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { cleanTheme } from './theme.mjs';

const RECENT_LIMIT = 8;

export const samePath = (a, b) => {
  if (!a || !b) return false;
  const left = a.replace(/[\\/]+$/, '');
  const right = b.replace(/[\\/]+$/, '');
  return process.platform === 'win32' || process.platform === 'darwin'
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
};

export function readSettings(file, defaults) {
  let raw = {};
  try { raw = JSON.parse(readFileSync(file, 'utf8')); } catch { /* first run, or a file somebody edited by hand */ }
  const recent = Array.isArray(raw.recent) ? raw.recent.filter(item => typeof item === 'string' && item.trim()) : [];
  const bounds = raw.bounds && typeof raw.bounds === 'object'
    && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(raw.bounds[key])) ? raw.bounds : undefined;
  return {
    projectRoot: typeof raw.projectRoot === 'string' && raw.projectRoot ? raw.projectRoot : defaults.projectRoot,
    recent: recent.filter((item, index) => recent.findIndex(other => samePath(other, item)) === index).slice(0, RECENT_LIMIT),
    bounds,
    maximized: raw.maximized === true,
    // The studio's theme, as last seen, so the window and its loading page open in the colours the studio will use.
    theme: cleanTheme(raw.theme),
  };
}

export function writeSettings(file, settings) {
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  writeFileSync(temp, `${JSON.stringify(settings, null, 2)}\n`);
  renameSync(temp, file);
}

export function rememberProject(settings, projectRoot) {
  settings.projectRoot = projectRoot;
  settings.recent = [projectRoot, ...settings.recent.filter(item => !samePath(item, projectRoot))].slice(0, RECENT_LIMIT);
  return settings;
}
