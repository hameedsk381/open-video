// Where a captions layer sits by default, so the platform's own UI does not cover it. The numbers match the
// safe-zone bands in @ove/core's review (safeZoneBands): on a 9:16 canvas the bottom 18% of the player is the
// caption, audio tag and action controls, and the right 11% is the action buttons; a wider tall canvas (4:5,
// square) is letterboxed in that player, so the chrome lands lower on the picture and the caption sits lower
// with it. Captions draw downward from y (textBaseline top), so y leaves room for a second line above the band.
export function captionsStyle(width: number, height: number) {
  const short = Math.min(width, height), tall = height >= width;
  const screen = width * 16 / 9, letterbox = tall ? Math.max(0, (screen - height) / 2) : 0;
  const bottom = tall ? Math.max(0, 0.18 * screen - letterbox) / height + 0.05 : 0.12;
  return {
    x: Math.round(width / 2), y: Math.round(height - height * bottom), textAlign: 'center' as const,
    maxWidth: Math.round(width * (tall ? 0.76 : 0.82)), fontSize: Math.round(short * 0.027),
    fontWeight: 700 as const, background: 'rgba(0,0,0,0.55)', padding: Math.round(short * 0.01), radius: Math.round(short * 0.008),
  };
}
