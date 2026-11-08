// Four words, each its own full-screen beat, landing on a line. Pure type.
import { aurora, anim, composition, field, fade, frame, headline, label, rect, scene, sfx, grow, text, tokens, vignette } from './kit.mjs';

const W = 1080, H = 1920;
export default {
  id: 'kinetic-type',
  meta: { name: 'Kinetic type', description: 'An 8-second vertical video of four huge words and a closing line. Pure typography. Themeable.', tags: ['type', 'kinetic', 'reel', '9:16', 'themed'], order: 2, previewFrame: 40, brief: 'A vertical kinetic-typography video: four big words one after another, then a one-line message.' },
  build() {
    const beat = 54, end = 90;
    const words = [1, 2, 3, 4].map(n => scene(`w${n}`, `Word ${n}`, beat, [
      aurora(W, H, beat, { strength: 1 + n * 0.1 }), vignette(W, H), frame(W, H),
      label(`idx${n}`, `0${n}/04`, 80, 190, { color: '{{muted}}', anims: [[fade(2)]] }),
      headline(`word${n}`, `{{word${n}}}`, 540, 790, { size: 330, align: 'center', maxWidth: 960, maxLines: 1, minSize: 120, ls: -14, split: { by: 'letters', stagger: 2, duration: 18 } }),
      rect(`bar${n}`, 80, 1260, 0, 10, { radius: 5, fill: '{{accent}}', anims: [[grow('width', 920, 6, 30)]] }),
      sfx('pop', 2, 0.55),
    ], { zoom: 1.1, tinFrames: 8 }));
    return composition({
      id: 'kinetic-type', name: 'Kinetic type', size: 'tall',
      variables: { ...tokens({ bg: '#f2efe8', surface: '#e6e2d8', text: '#0e0e0f', muted: '#6d6a62', accent: '#ff3d2e', accent2: '#ffb4a8', motion: 'pop', transition: 'push', texture: 'paper', textureColor: '#000000', textureOpacity: 0.06 }),
        word1: field('MOVE', 'Word 1'), word2: field('FASTER', 'Word 2'), word3: field('THINK', 'Word 3'), word4: field('BIGGER', 'Word 4'),
        message: field('Say it with motion.', 'The closing line'), url: field('motionrender.dev', 'Small address under the closing line') },
      scenes: [...words, scene('end', 'Message', end, [
        aurora(W, H, end, { strength: 1.5 }), vignette(W, H), frame(W, H),
        headline('message', '{{message}}', 540, 640, { size: 190, align: 'center', maxWidth: 940, maxLines: 3, minSize: 100, split: { stagger: 6, duration: 26 } }),
        text('url', '{{url}}', 540, 1320, { font: 'JetBrains Mono', size: 32, ls: 4, color: '{{accent}}', align: 'center', anims: [[fade(40)]] }),
        sfx('whoosh', 0, 0.4)])],
    });
  },
};
