// A 4-second brand sting: rings open, the name lands, a line draws, the tagline arrives.
import { aurora, anim, circle, composition, field, fade, frame, headline, label, rect, scene, sfx, grow, text, tokens, vignette, rise } from './kit.mjs';

const W = 1920, H = 1080;
export default {
  id: 'logo-sting',
  meta: { name: 'Logo sting', description: 'A 4-second wide brand sting: expanding rings, the name, a tagline. For intros and outros. Themeable.', tags: ['logo', 'sting', 'intro', 'outro', 'wide', '16:9', 'themed'], order: 3, previewFrame: 70, brief: 'A short brand sting: the name lands over expanding rings, with a tagline.' },
  build() {
    const f = 120;
    return composition({
      id: 'logo-sting', name: 'Logo sting', size: 'wide',
      variables: { ...tokens({ bg: '#07070a', accent: '#7c5cff', accent2: '#c4b5ff' }), name: field('MOTIONRENDER', 'The brand name'), tagline: field('Video, written as code.', 'The tagline') },
      scenes: [scene('sting', 'Sting', f, [
        aurora(W, H, f, { strength: 1.3 }), vignette(W, H),
        ...[0, 1, 2].map(i => circle(`ring${i}`, 960, 540, 300, { fill: '#00000000', stroke: i === 0 ? '{{accent}}' : '{{text}}', strokeWidth: i === 0 ? 3 : 1, opacity: 0, anims: [[anim('scale', [i * 6, 0.4], [i * 6 + 60, 3.2 + i, 'land']), anim('opacity', [i * 6, 0], [i * 6 + 8, i === 0 ? 0.7 : 0.25], [i * 6 + 60, 0, 'exit'])]] })),
        headline('name', '{{name}}', 960, 440, { size: 160, align: 'center', maxWidth: 1600, maxLines: 1, minSize: 70, ls: -4, split: { by: 'letters', stagger: 2, duration: 20 }, start: 14 }),
        rect('line', 960 - 180, 640, 0, 4, { radius: 2, fill: '{{accent}}', anims: [[grow('width', 360, 40, 24)]] }),
        text('tagline', '{{tagline}}', 960, 680, { size: 36, color: '{{muted}}', align: 'center', ls: 2, anims: [rise(680, 52, 16, 20)] }),
        sfx('whoosh', 2, 0.45), sfx('thump', 18, 0.6), sfx('ding', 56, 0.35)], { tin: false, zoom: 1.04 })],
    });
  },
};
