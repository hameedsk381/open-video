// A square quote: an oversized mark, the words arriving, the author. Testimonials, wisdom, customer voices.
import { aurora, anim, composition, field, fade, frame, headline, label, rect, rise, scene, sfx, grow, text, tokens, vignette } from './kit.mjs';

const W = 1080, H = 1080;
export default {
  id: 'quote-card',
  meta: { name: 'Quote card', description: 'A 7-second square quote with an oversized mark, the words arriving one by one, and the author. Themeable.', tags: ['quote', 'testimonial', 'square', '1:1', 'themed'], order: 6, previewFrame: 100, brief: 'A square quote card: one quote, who said it and their role.' },
  build() {
    const f = 210;
    return composition({
      id: 'quote-card', name: 'Quote card', size: 'square',
      variables: { ...tokens({ bg: '#f4efe6', surface: '#e9e3d6', text: '#14110d', muted: '#6f675a', accent: '#d9381e', accent2: '#f0a898', fontDisplay: 'Fraunces', headWeight: 600, texture: 'paper', textureColor: '#000000', textureOpacity: 0.06, motion: 'blur', transition: 'fade' }),
        quote: field('It finally feels like video is something we can write, not just something we wait for.', 'The quote'), author: field('Priya Raman', 'Who said it'), role: field('Head of Content, Northwind', 'Their role') },
      scenes: [scene('quote', 'Quote', f, [aurora(W, H, f, { strength: 0.9 }), vignette(W, H, '55'), frame(W, H),
        text('mark', '“', 80, 40, { font: '{{fontDisplay}}', weight: 700, size: 520, color: '{{accent}}', opacity: 0.9, anims: [[fade(0, 24, 0.9), anim('y', [0, 90], [30, 40, 'land'])]] }),
        headline('quote', '{{quote}}', 90, 330, { size: 74, maxWidth: 900, maxLines: 6, minSize: 40, lh: 1.08, ls: -2, split: { stagger: 3, duration: 22 }, start: 14 }),
        rect('rule', 90, 880, 0, 4, { radius: 2, fill: '{{accent}}', anims: [[grow('width', 120, 100, 24)]] }),
        text('author', '{{author}}', 90, 910, { font: '{{fontDisplay}}', weight: 700, size: 44, anims: [rise(910, 112, 18, 20)] }),
        text('role', '{{role}}', 90, 970, { size: 28, color: '{{muted}}', anims: [rise(970, 120, 14, 20)] }),
        sfx('whoosh', 6, 0.3), sfx('ding', 104, 0.3)], { tin: false, zoom: 1.04 })],
    });
  },
};
