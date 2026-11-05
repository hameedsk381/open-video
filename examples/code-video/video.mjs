// A video written as code (motionrender/builder). `ove build examples/code-video/video.mjs` writes composition.json beside it; the
// particle field is a code layer, so render with --allow-code. In your own project: import from 'motionrender/builder'.
import { createVideo, text, rect, circle, group, code, sfx, sample, spring, tween, keyframes, riseIn, fadeIn } from '../../packages/builder/src/index.ts';

const v = createVideo({ id: 'code-video', name: 'A video written as code', width: 1920, height: 1080, fps: 30, background: '#0b1020', motionBlur: true });
v.export({ loudness: -16 });

// Plain TypeScript decides the content: a list becomes a row of cards, a function of the frame becomes a spring.
const features = ['Code is the source', 'Frames are exact', 'JSON out, always'];
const accent = '#22d3ee';

v.scene('intro', { seconds: 4, transitionIn: undefined }, scene => {
  // A canvas drawn by your own JavaScript every frame: a drifting field of dots that react to a noise function.
  scene.add(code(function draw(ctx, { frame, width, height, api }) {
    const rand = api.random(11);
    for (let i = 0; i < 90; i++) {
      const x0 = rand() * width, y0 = rand() * height, size = 2 + rand() * 5, phase = rand() * 10;
      const drift = api.noise(x0 / 300, y0 / 300, frame / 90) * 60;
      ctx.globalAlpha = 0.15 + 0.35 * api.noise(i, frame / 40, phase) ** 2 * 2;
      ctx.fillStyle = i % 3 ? '#22d3ee' : '#a78bfa';
      ctx.beginPath(); ctx.arc((x0 + drift + frame * 0.4) % width, y0 + drift * 0.5, size, 0, Math.PI * 2); ctx.fill();
    }
  }, { id: 'field', width: 1920, height: 1080 }));

  scene.add(text('Write the video.', { x: 160, y: 330, fontSize: 150, fontWeight: 800, color: '#f5f7fb', maxWidth: 1600,
    split: { by: 'words', stagger: 5, preset: 'rise', duration: 20 } }));
  scene.add(text('Exact, repeatable video, from code.', { x: 160, y: 560, fontSize: 48, color: '#9aa6c4', maxWidth: 1400,
    animations: riseIn(560, 30, 20, 24) }));
  // spring() sampled into keyframes: the bar settles with a real spring curve, with no code running at render time.
  scene.add(rect({ x: 160, y: 700, width: 1, height: 10, radius: 5, fill: accent,
    animations: [sample('width', 20, 70, f => spring({ frame: f - 20, damping: 12, stiffness: 120, from: 1, to: 520 }), { step: 2 })] }));
  scene.add(sfx('whoosh', { startFrame: 4, volume: 0.45 }));
});

v.scene('features', { seconds: 4, transitionIn: { type: 'push', durationFrames: 16, direction: 'left' } }, scene => {
  scene.add(rect({ x: 0, y: 0, width: 1920, height: 1080, fill: '#0b1020' }));
  scene.add(group(features.map((label, i) => group([
    circle({ x: 28, y: 28, width: 56, fill: accent, animations: [tween('scale', 0, 1, { frames: 14, delay: 8 + i * 10, easing: 'pop' })] }),
    text(label, { x: 90, y: 0, fontSize: 64, color: '#f5f7fb', animations: [fadeIn(12, 8 + i * 10)] }),
  ], { y: i * 150 })), { x: 260, y: 300 }));
  scene.add(text('3', { x: 1500, y: 420, fontSize: 420, fontWeight: 900, color: accent, opacity: 0.9,
    animations: [keyframes('scale', [[0, 0.7, 'pop'], [24, 1]]), fadeIn(10)] }));
  for (let i = 0; i < features.length; i++) scene.add(sfx('tick', { startFrame: 8 + i * 10, volume: 0.35 }));
});

export default v;
