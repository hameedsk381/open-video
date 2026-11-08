import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error the desktop shell is plain ES modules with no type declarations
import { cleanTheme, resolveTheme, shellColors, shellPalette } from '../../apps/desktop/src/theme.mjs';
// @ts-expect-error see above
import { readSettings, writeSettings } from '../../apps/desktop/src/settings.mjs';

// The desktop shell draws a few surfaces itself (the window behind the page, the loading page, the error page). They wear the studio's theme.
let dir: string;
beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'ove-desktop-')); });
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

describe('the shell follows the studio theme', () => {
  it('is light unless the studio says otherwise, like the studio itself', () => {
    expect(cleanTheme(undefined)).toBe('light');
    expect(cleanTheme('')).toBe('light');
    expect(cleanTheme('purple')).toBe('light');
    expect(cleanTheme('dark')).toBe('dark');
  });

  it('resolves "system" from the operating system and takes the other two as they are', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('uses the studio\'s own colours for the window background', () => {
    expect(shellPalette('light', false).background).toBe('#ffffff');
    expect(shellPalette('dark', false).background).toBe('#0b0d12');
    expect(shellPalette('system', true)).toBe(shellColors.dark);
  });

  it('keeps its text readable on its background in both themes (WCAG 4.5:1)', () => {
    const luminance = (hex: string) => { const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!; };
    const ratio = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };
    for (const theme of ['light', 'dark'] as const) {
      const colors = shellColors[theme];
      for (const text of [colors.text, colors.muted, colors.faint]) expect(ratio(text, colors.background)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('the theme is remembered between launches', () => {
  it('writes it and reads it back, and defaults a file from before it existed to light', async () => {
    const file = join(dir, 'settings.json');
    const settings = readSettings(file, { projectRoot: 'C:/p' });
    expect(settings.theme).toBe('light');
    settings.theme = 'dark';
    writeSettings(file, settings);
    expect(readSettings(file, { projectRoot: 'C:/p' }).theme).toBe('dark');

    await writeFile(file, JSON.stringify({ projectRoot: 'C:/q', recent: [] }));          // written by the first version of the shell
    expect(readSettings(file, { projectRoot: 'C:/p' }).theme).toBe('light');
    await writeFile(file, JSON.stringify({ theme: 'hotpink' }));                          // edited by hand
    expect(readSettings(file, { projectRoot: 'C:/p' }).theme).toBe('light');
    expect(JSON.parse(await readFile(file, 'utf8')).theme).toBe('hotpink');             // reading never rewrites the file
  });
});
