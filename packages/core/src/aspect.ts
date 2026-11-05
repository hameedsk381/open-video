import type { Composition } from '@ove/schema';

export const STANDARD_ASPECTS: Record<string, [number, number]> = {
  '9:16': [1080, 1920],
  '16:9': [1920, 1080],
  '1:1': [1080, 1080],
  '4:5': [1080, 1350],
  '3:4': [1080, 1440],
  '21:9': [2560, 1080],
};

export function parseAspectRatio(aspect: string): [number, number] {
  const clean = aspect.trim().toLowerCase();
  if (STANDARD_ASPECTS[clean]) return STANDARD_ASPECTS[clean]!;
  const match = /^(\d+)x(\d+)$/i.exec(clean);
  if (match) {
    const w = Number(match[1]), h = Number(match[2]);
    if (w > 0 && h > 0) return [w, h];
  }
  throw new Error(`Invalid aspect ratio "${aspect}". Must be one of ${Object.keys(STANDARD_ASPECTS).join(', ')}, or WIDTHxHEIGHT (e.g. 1080x1920).`);
}

export type AspectAdaptOptions = {
  safeZoneShift?: boolean;
};

/**
 * Dynamically adapts an existing composition from its native dimensions to a target aspect ratio
 * (e.g. adapting 16:9 widescreen to 9:16 vertical reel or 1:1 square), recalculating layer coordinates,
 * typography wrapping, safe zones, and animations.
 */
export function adaptCompositionAspect(
  composition: Composition,
  targetAspect: string,
  options: AspectAdaptOptions = {}
): Composition {
  const [targetWidth, targetHeight] = parseAspectRatio(targetAspect);
  const oldWidth = composition.width;
  const oldHeight = composition.height;

  if (oldWidth === targetWidth && oldHeight === targetHeight) {
    return JSON.parse(JSON.stringify(composition));
  }

  const next: Composition = JSON.parse(JSON.stringify(composition));
  next.width = targetWidth;
  next.height = targetHeight;

  const scaleX = targetWidth / oldWidth;
  const scaleY = targetHeight / oldHeight;
  const minScale = Math.min(scaleX, scaleY);
  const fontScale = targetWidth / oldWidth;

  const isTargetVertical = targetWidth < targetHeight;
  const isSourceVertical = oldWidth < oldHeight;

  // 1. Adapt Backgrounds
  if (next.background && typeof next.background === 'object') {
    const bg = next.background as any;
    if (bg.type === 'linear' && Array.isArray(bg.to)) {
      if (Math.abs(bg.to[0] - oldWidth) < 5 && Math.abs(bg.to[1] - oldHeight) < 5) {
        bg.to = [targetWidth, targetHeight];
      }
    } else if (bg.type === 'radial' && Array.isArray(bg.center)) {
      if (Math.abs(bg.center[0] - oldWidth / 2) < 5 && Math.abs(bg.center[1] - oldHeight / 2) < 5) {
        bg.center = [targetWidth / 2, targetHeight / 2];
      }
      if (typeof bg.radius === 'number') {
        bg.radius = Math.round(bg.radius * minScale);
      }
    }
  }

  // 2. Adapt Layer recursive helper
  const adaptLayer = (layer: any) => {
    if (!layer || typeof layer !== 'object') return;

    if (layer.type === 'group' && Array.isArray(layer.children)) {
      layer.children.forEach(adaptLayer);
    }

    // Check if horizontally centered in original canvas
    const wasHorizCentered = (typeof layer.x === 'number') &&
      (Math.abs(layer.x - oldWidth / 2) <= Math.max(16, oldWidth * 0.02) || layer.textAlign === 'center');

    // Check if vertically centered in original canvas
    const wasVertCentered = (typeof layer.y === 'number') &&
      (Math.abs(layer.y - oldHeight / 2) <= Math.max(16, oldHeight * 0.02));

    // Full-bleed layer detection (e.g. background rects or backdrops)
    const isFullBleed = (typeof layer.width === 'number' && layer.width >= oldWidth * 0.98) &&
      (typeof layer.height === 'number' && layer.height >= oldHeight * 0.98);

    if (isFullBleed) {
      layer.width = targetWidth;
      layer.height = targetHeight;
      if (typeof layer.x === 'number' && Math.abs(layer.x) < 5) layer.x = 0;
      if (typeof layer.y === 'number' && Math.abs(layer.y) < 5) layer.y = 0;
    } else {
      // Position X
      if (typeof layer.x === 'number') {
        if (wasHorizCentered) {
          layer.x = targetWidth / 2;
        } else {
          layer.x = Math.round(layer.x * scaleX);
        }
      }

      // Position Y with Safe Zone Intelligence
      if (typeof layer.y === 'number') {
        if (wasVertCentered) {
          layer.y = targetHeight / 2;
        } else {
          let nextY = Math.round(layer.y * scaleY);
          // When adapting to vertical 9:16 (Shorts/Reels), bottom 20% has action icons & captions
          if (isTargetVertical && !isSourceVertical && options.safeZoneShift !== false) {
            const bottomSafeLine = targetHeight * 0.78;
            if (nextY > bottomSafeLine && layer.type !== 'captions') {
              nextY = Math.round(bottomSafeLine);
            }
          }
          layer.y = nextY;
        }
      }

      // Width and Height
      if (typeof layer.width === 'number' && !isFullBleed) {
        layer.width = Math.round(layer.width * minScale);
      }
      if (typeof layer.height === 'number' && !isFullBleed) {
        layer.height = Math.round(layer.height * minScale);
      }
    }

    // Specific layer types
    if (layer.type === 'text') {
      if (typeof layer.fontSize === 'number') {
        layer.fontSize = Math.max(14, Math.round(layer.fontSize * fontScale));
      }
      if (typeof layer.maxWidth === 'number') {
        layer.maxWidth = Math.round(Math.min(targetWidth * 0.90, layer.maxWidth * fontScale));
      } else {
        layer.maxWidth = Math.round(targetWidth * 0.88);
      }
    } else if (layer.type === 'captions') {
      layer.x = targetWidth / 2;
      layer.y = Math.round(targetHeight * (isTargetVertical ? 0.72 : 0.80));
      layer.maxWidth = Math.round(targetWidth * (isTargetVertical ? 0.84 : 0.76));
      layer.fontSize = Math.round(targetWidth * (isTargetVertical ? 0.045 : 0.035));
    } else if (layer.type === 'circle') {
      if (typeof layer.radius === 'number') {
        layer.radius = Math.round(layer.radius * minScale);
      }
    } else if (layer.type === 'video' || layer.type === 'image') {
      if (isFullBleed || (layer.width === targetWidth && layer.height === targetHeight)) {
        layer.fit = layer.fit ?? 'cover';
      }
    }

    // Adapt Animations
    if (Array.isArray(layer.animations)) {
      for (const anim of layer.animations) {
        if (!anim || !Array.isArray(anim.keyframes)) continue;
        const prop = anim.property;
        for (const kf of anim.keyframes) {
          if (typeof kf?.value !== 'number') continue;
          if (prop === 'x') {
            kf.value = Math.round(kf.value * scaleX);
          } else if (prop === 'y') {
            kf.value = Math.round(kf.value * scaleY);
          } else if (prop === 'width') {
            kf.value = Math.round(kf.value * scaleX);
          } else if (prop === 'height') {
            kf.value = Math.round(kf.value * scaleY);
          } else if (prop === 'fontSize' || prop === 'radius') {
            kf.value = Math.round(kf.value * minScale);
          }
        }
      }
    }
  };

  // 3. Adapt Scenes & Camera
  for (const scene of next.scenes) {
    if (scene.camera) {
      if (typeof scene.camera.x === 'number') {
        scene.camera.x = targetWidth / 2;
      }
      if (typeof scene.camera.y === 'number') {
        scene.camera.y = targetHeight / 2;
      }
    }
    if (Array.isArray(scene.layers)) {
      scene.layers.forEach(adaptLayer);
    }
  }

  return next;
}

