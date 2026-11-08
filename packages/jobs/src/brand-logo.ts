// A saved brand's logo and contact line sign the last scene of every video. The placement is computed, not asked of the
// model: it is drawn clear of the platform UI bands a reel plays under, fades in at the start of the closing scene, and is
// written into the saved source as well so editing or re-resolving the project keeps it.
import { safeZoneBands } from '@ove/core';

type Scene = { id?: string; durationFrames?: number; layers?: any[] };
type Canvas = { width: number; height: number; fps: number; scenes: Scene[]; variables?: Record<string, { default?: unknown }> };

const lastRealScene = (scenes: Scene[] | undefined): Scene | undefined => [...(scenes ?? [])].reverse().find(scene => scene && scene.id !== 'overlay');
const hasLayer = (scene: Scene, id: string) => (scene.layers ?? []).some(layer => layer?.id === id);
const token = (composition: Canvas, name: string, fallback: string) => {
  const value = composition.variables?.[name]?.default;
  return typeof value === 'string' && value.trim() ? value : fallback;
};
const fadeFrames = (composition: Canvas, scene: Scene) => {
  const sceneFrames = Number(scene.durationFrames) || 0, fps = Number(composition.fps) || 30;
  return Math.max(1, Math.min(Math.round(fps / 3), Math.max(1, Math.round(sceneFrames / 4))));
};

/** The layer, sized against the canvas and kept out of the app chrome. */
export function brandLogoLayer(composition: Canvas, scene: Scene, src: string): Record<string, unknown> {
  const min = Math.min(composition.width, composition.height);
  const size = Math.round(min * 0.085), margin = Math.round(min * 0.045);
  const bands = safeZoneBands(composition.width, composition.height);
  const bottom = bands.find(band => band.name === 'bottom UI band'), right = bands.find(band => band.name === 'right UI band');
  const x = Math.round(composition.width - margin - (right ? composition.width - right.x0 : 0) - size);
  const y = Math.round(composition.height - margin - (bottom ? composition.height - bottom.y0 : 0) - size);
  const fade = fadeFrames(composition, scene);
  return {
    id: 'brand-logo', type: 'image', src, x, y, width: size, height: size, objectFit: 'contain', opacity: 0.95,
    animations: [{ property: 'opacity', keyframes: [{ frame: 0, value: 0 }, { frame: fade, value: 0.95 }] }],
  };
}

/**
 * The contact line, right-aligned on the logo's row (or in its corner when the logo is off). It wraps upward from the
 * bottom of that row, so a long line never runs into the app's controls, and takes the composition's own muted colour
 * and body font so it belongs to the design.
 */
export function brandContactLayer(composition: Canvas, scene: Scene, contact: string): Record<string, unknown> {
  const min = Math.min(composition.width, composition.height);
  const margin = Math.round(min * 0.045);
  const bands = safeZoneBands(composition.width, composition.height);
  const bottom = bands.find(band => band.name === 'bottom UI band'), right = bands.find(band => band.name === 'right UI band');
  const safeRight = Math.round(composition.width - margin - (right ? composition.width - right.x0 : 0));
  const safeBottom = Math.round(composition.height - margin - (bottom ? composition.height - bottom.y0 : 0));
  const logo = (scene.layers ?? []).find(layer => layer?.id === 'brand-logo');
  const fontSize = Math.max(13, Math.round(min * 0.022)), lineHeight = 1.3, line = Math.round(fontSize * lineHeight);
  const edge = logo ? Math.round(Number(logo.x) || 0) - Math.round(min * 0.02) : safeRight;
  const maxWidth = Math.max(Math.round(composition.width * 0.3), edge - margin);
  const perLine = Math.max(8, Math.floor(maxWidth / (fontSize * 0.55)));
  const lines = Math.max(1, Math.ceil(contact.length / perLine));
  const baseline = logo ? Math.round((Number(logo.y) || 0) + (Number(logo.height) || 0)) : safeBottom;
  const fade = fadeFrames(composition, scene);
  return {
    id: 'brand-contact', type: 'text', content: contact, x: edge, y: Math.round(baseline - lines * line),
    fontSize, lineHeight, maxWidth, textAlign: 'right', opacity: 0.78,
    color: token(composition, 'muted', token(composition, 'text', '#ffffff')),
    fontFamily: token(composition, 'fontBody', 'Inter'),
    animations: [{ property: 'opacity', keyframes: [{ frame: 0, value: 0 }, { frame: fade, value: 0.78 }] }],
  };
}

/** Adds the logo to the closing scene of the video and of the source it is saved with. Returns whether it did. */
export function addBrandLogo(composition: Canvas, source: { scenes?: Scene[] } | undefined, src: string): boolean {
  const scene = lastRealScene(composition.scenes);
  if (!scene || !Array.isArray(scene.layers) || hasLayer(scene, 'brand-logo')) return false;
  const layer = brandLogoLayer(composition, scene, src);
  scene.layers.push(layer);
  const raw = source && Array.isArray(source.scenes) ? lastRealScene(source.scenes) : undefined;
  if (raw && Array.isArray(raw.layers) && !hasLayer(raw, 'brand-logo')) raw.layers.push(structuredClone(layer));
  return true;
}

/** Adds the contact line to the closing scene of the video and of the source it is saved with. */
export function addBrandContact(composition: Canvas, source: { scenes?: Scene[] } | undefined, contact: string): boolean {
  const text = typeof contact === 'string' ? contact.trim() : '';
  const scene = lastRealScene(composition.scenes);
  if (!text || !scene || !Array.isArray(scene.layers) || hasLayer(scene, 'brand-contact')) return false;
  const layer = brandContactLayer(composition, scene, text);
  scene.layers.push(layer);
  const raw = source && Array.isArray(source.scenes) ? lastRealScene(source.scenes) : undefined;
  if (raw && Array.isArray(raw.layers) && !hasLayer(raw, 'brand-contact')) raw.layers.push(structuredClone(layer));
  return true;
}
