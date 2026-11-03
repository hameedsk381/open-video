import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { canvasFor, folderName, within } from '../../packages/cli/src/ai-studio';

// These helpers keep the page and the CLI in step: same canvas presets, same safe folder names, and one definition of
// "inside the output folder" for every file the server is asked to read or write.
describe('ai studio canvas', () => {
  it('uses the same presets as the CLI', () => {
    expect(canvasFor({ kind: 'reel' })).toEqual({ kind: 'vertical social reel', width: 1080, height: 1920, durationSeconds: 20, fps: 30 });
    expect(canvasFor({ kind: 'promo' })).toMatchObject({ width: 1920, height: 1080, durationSeconds: 30 });
    expect(canvasFor({ kind: 'product' })).toMatchObject({ width: 1080, height: 1080, durationSeconds: 18 });
    expect(canvasFor({ kind: 'project' })).toMatchObject({ width: 1920, height: 1080, durationSeconds: 60 });
  });
  it('takes an aspect override and custom WIDTHxHEIGHT', () => {
    expect(canvasFor({ kind: 'reel', aspect: '1:1' })).toMatchObject({ width: 1080, height: 1080 });
    expect(canvasFor({ aspect: '640x360', duration: 2.5 })).toMatchObject({ width: 640, height: 360, durationSeconds: 2.5 });
  });
  it('rejects values the renderer cannot use', () => {
    expect(() => canvasFor({ kind: 'podcast' })).toThrow(/kind must be one of/);
    expect(() => canvasFor({ aspect: 'wide' })).toThrow(/aspect must be one of/);
    expect(() => canvasFor({ duration: 0 })).toThrow(/duration must be a number/);
    expect(() => canvasFor({ fps: 0.5 })).toThrow(/fps must be a number/);
    expect(() => canvasFor({ fps: 29.97 })).toThrow(/whole number/);
  });
});

describe('ai studio folder names', () => {
  it('makes a name that is safe on Windows and POSIX', () => {
    expect(folderName('Spring Coffee: A Story!')).toBe('spring-coffee-a-story');
    expect(folderName('  __  ')).toBe('video');
    expect(folderName('C:\\Users\\me\\video?.mp4')).toBe('c-users-me-video-mp4');
  });
  it('keeps names short enough for a folder', () => {
    expect(folderName('a'.repeat(200))).toHaveLength(60);
  });
});

describe('ai studio path confinement', () => {
  const root = join('C:', 'projects', 'ai-videos');
  it('accepts files strictly below the root', () => {
    expect(within(root, join(root, 'reel', 'composition.json'))).toBe(true);
    expect(within(root, join(root, 'out.mp4'))).toBe(true);
  });
  it('refuses the root itself, parents and siblings', () => {
    expect(within(root, root)).toBe(false);
    expect(within(root, join(root, '..'))).toBe(false);
    expect(within(root, join(root, '..', 'secrets.txt'))).toBe(false);
    expect(within(root, join(root, 'other', '..', '..', 'outside', 'x'))).toBe(false);
  });
});
