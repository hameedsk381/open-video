// Where text may sit in vertical video without landing under a platform's buttons, captions or header. Pure geometry, no React.
export type CanvasTextItem = {
  id: string;
  path: string;
  sceneId: string;
  sceneName: string;
  content: string;
  x: number;
  y: number;
  width: number;
  height: number;
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
  fontSize: number;
  fontFamily: string;
  fontWeight: number;
  textAlign: 'left' | 'center' | 'right';
  variableName?: string;
};

export type SafeZoneCollision = {
  band: 'top' | 'bottom' | 'right' | 'left';
  name: string;
  hint: string;
  dx: number;
  dy: number;
};

/** Checks whether a text item intrudes into mobile UI overlay exclusion zones (Reels, TikTok, Shorts). */
export function checkSafeZoneCollision(
  item: CanvasTextItem,
  compWidth: number,
  compHeight: number
): SafeZoneCollision | null {
  if (compHeight < compWidth) return null; // Safe zones apply to vertical / square social formats

  const screen = (compWidth * 16) / 9;
  const letterbox = Math.max(0, (screen - compHeight) / 2);
  const topThreshold = Math.max(0, 0.08 * screen - letterbox);
  const bottomThreshold = compHeight - Math.max(0, 0.18 * screen - letterbox);
  const rightThreshold = compWidth - 0.11 * compWidth;
  const leftThreshold = 0.02 * compWidth;

  const itemRight = item.x + item.width;
  const itemBottom = item.y + item.height;

  // 1. Bottom obstruction (Reels / TikTok caption, account handle & audio tags)
  if (itemBottom > bottomThreshold) {
    const dy = Math.round(bottomThreshold - itemBottom - 16);
    return {
      band: 'bottom',
      name: 'Bottom Caption & Feed Zone',
      hint: 'Obstructed by TikTok/Reels captions & sound tags',
      dx: 0,
      dy,
    };
  }

  // 2. Top obstruction (Top status bar, search bar, stories/reels header)
  if (item.y < topThreshold) {
    const dy = Math.round(topThreshold - item.y + 16);
    return {
      band: 'top',
      name: 'Top Header Zone',
      hint: 'Obstructed by platform header & search bar',
      dx: 0,
      dy,
    };
  }

  // 3. Right obstruction (Action buttons: Like, Comment, Share, Audio Disc)
  if (itemRight > rightThreshold) {
    const dx = Math.round(rightThreshold - itemRight - 16);
    return {
      band: 'right',
      name: 'Right Action Buttons',
      hint: 'Obstructed by Like, Comment & Share buttons',
      dx,
      dy: 0,
    };
  }

  // 4. Left bezel margin
  if (item.x < leftThreshold) {
    const dx = Math.round(leftThreshold - item.x + 12);
    return {
      band: 'left',
      name: 'Left Margin',
      hint: 'Too close to screen bezel',
      dx,
      dy: 0,
    };
  }

  return null;
}

/** What auto-fix does to one text layer: slide it, and wrap it to `maxWidth` when it is wider than the room between the platform's buttons. */
export type SafeZoneMove = { dx: number; dy: number; maxWidth?: number };
/** A safe-zone move for the layer at a path in the composition. */
export type LayerMove = SafeZoneMove & { path: string };

/**
 * The whole move that brings an item clear of every platform zone (a corner item crosses two). Null when it already is.
 * Text wider than the safe room cannot be slid clear, so it is wrapped to that width first; the studio's own estimate of its
 * height is redone for the wrapped lines.
 */
export function resolveSafeZone(item: CanvasTextItem, compWidth: number, compHeight: number): SafeZoneMove | null {
  if (compHeight < compWidth) return null;
  const left = 0.02 * compWidth + 12, right = compWidth - 0.11 * compWidth - 16, room = Math.floor(right - left);
  let cur = item, dx = 0, dy = 0, maxWidth: number | undefined;
  if (item.width > room + 1) {
    maxWidth = room;
    const lines = Math.max(1, Math.ceil((item.content.length * item.fontSize * 0.56) / maxWidth));
    const anchor = item.textAlign === 'center' ? item.x + item.width / 2 : item.textAlign === 'right' ? item.x + item.width : item.x;
    const newAnchor = item.textAlign === 'center' ? left + maxWidth / 2 : item.textAlign === 'right' ? left + maxWidth : left;
    dx = Math.round(newAnchor - anchor);
    cur = { ...item, x: left, width: maxWidth, height: Math.max(item.fontSize * 1.3, lines * item.fontSize * 1.3) };
  }
  const startX = dx;
  for (let pass = 0; pass < 4; pass++) {
    const hit = checkSafeZoneCollision({ ...cur, x: cur.x + (dx - startX), y: cur.y + dy }, compWidth, compHeight);
    if (!hit) break;
    dx += hit.dx; dy += hit.dy;
  }
  return dx || dy || maxWidth !== undefined ? { dx, dy, ...(maxWidth !== undefined ? { maxWidth } : {}) } : null;
}
