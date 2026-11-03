// Reading and checking what a job request says. Every helper throws an Error whose message is shown to the person who made the request.
import { defaultConcurrency, defaultPreset, x264Presets } from '@ove/core';
import type { BatchSettings } from '@ove/ai';

const kinds: Record<string, { aspect: string; duration: number; label: string }> = {
  reel: { aspect: '9:16', duration: 20, label: 'vertical social reel' },
  product: { aspect: '1:1', duration: 18, label: 'product video' },
  promo: { aspect: '16:9', duration: 30, label: 'promo' },
  project: { aspect: '16:9', duration: 60, label: 'project or case-study video' },
};
const aspects: Record<string, [number, number]> = { '9:16': [1080, 1920], '1:1': [1080, 1080], '16:9': [1920, 1080], '4:5': [1080, 1350], '3:4': [1080, 1440] };

export const textOf = (value: unknown, label: string) => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new Error(`${label} is required`);
  return text;
};
export const optionalText = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : undefined;
export const boolOf = (value: unknown) => value === true || value === 'true' || value === 'on';

export function numberIn(value: unknown, fallback: number, label: string, min: number, max: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) throw new Error(`${label} must be a number from ${min} to ${max}`);
  return number;
}
export function optionalNumber(value: unknown, label: string, min: number, max: number): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return numberIn(value, 0, label, min, max);
}
export function integerIn(value: unknown, fallback: number, label: string, min: number, max: number): number {
  const number = numberIn(value, fallback, label, min, max);
  if (!Number.isInteger(number)) throw new Error(`${label} must be a whole number`);
  return number;
}

/** The canvas from the same presets the CLI uses, so a page and a command produce the same shape. */
export function canvasFor(input: Record<string, unknown> = {}) {
  const kindName = optionalText(input.kind) ?? 'promo';
  const preset = kinds[kindName];
  if (!preset) throw new Error(`kind must be one of: ${Object.keys(kinds).join(', ')}`);
  const aspect = optionalText(input.aspect) ?? preset.aspect;
  const custom = /^(\d+)x(\d+)$/.exec(aspect);
  const dimensions = custom ? [Number(custom[1]), Number(custom[2])] as [number, number] : aspects[aspect];
  if (!dimensions) throw new Error(`aspect must be one of ${Object.keys(aspects).join(', ')}, or WIDTHxHEIGHT`);
  return {
    kind: preset.label,
    width: dimensions[0],
    height: dimensions[1],
    durationSeconds: numberIn(input.duration, preset.duration, 'duration', 0.1, 3600),
    fps: integerIn(input.fps, 30, 'fps', 1, 120),
  };
}

/** A folder name that is safe on Windows and POSIX, used when the page leaves the folder blank. */
export function folderName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'video';
}

export function renderSettings(input: Record<string, unknown>): BatchSettings {
  const preset = optionalText(input.preset) ?? defaultPreset;
  if (!x264Presets.includes(preset as never)) throw new Error(`preset must be one of: ${x264Presets.join(', ')}`);
  return {
    scale: optionalNumber(input.scale, 'scale', 0.05, 1),
    loudness: optionalNumber(input.loudness, 'loudness', -60, 0),
    crf: optionalNumber(input.crf, 'crf', 0, 51),
    preset: preset as BatchSettings['preset'],
    concurrency: defaultConcurrency(),
  };
}
