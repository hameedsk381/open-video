// A square product launch: name, three features on cards, price and call to action.
import { aurora, anim, circle, composition, field, fade, frame, headline, label, pop, rect, rise, scene, sfx, grow, text, tokens, vignette, wiggle } from './kit.mjs';

const W = 1080, H = 1080;
export default {
  id: 'product-spotlight',
  meta: { name: 'Product spotlight', description: 'A 13-second square launch video: product name, three feature cards, price and call to action. Themeable.', tags: ['product', 'launch', 'promo', 'square', '1:1', 'themed'], order: 4, previewFrame: 50, brief: 'A square product video: name and promise, three features, then price and where to get it.' },
  build() {
    const a = 120, b = 150, c = 120;
    return composition({
      id: 'product-spotlight', name: 'Product spotlight', size: 'square',
      variables: { ...tokens({ bg: '#0d1117', surface: '#171d27', accent: '#2ee6a6', accent2: '#a8f5d9', text: '#f1f5f9', muted: '#8a97a8' }),
        kicker: field('NOW AVAILABLE', 'Small label above the name'), product: field('Aero One', 'Product name'), promise: field('The lightest way to carry everything.', 'One-line promise'),
        f1: field('Featherweight', 'Feature 1'), f1d: field('Under 300 grams, fully loaded.', 'Feature 1 detail'),
        f2: field('Weatherproof', 'Feature 2'), f2d: field('Sealed seams, tested in the rain.', 'Feature 2 detail'),
        f3: field('Built to last', 'Feature 3'), f3d: field('A ten-year guarantee, no questions.', 'Feature 3 detail'),
        price: field('$129', 'Price'), priceNote: field('Free shipping this week', 'Line under the price'), button: field('Get it now', 'Button text'), url: field('example.com/aero', 'Address') },
      scenes: [
        scene('name', 'Product', a, [aurora(W, H, a), vignette(W, H), frame(W, H),
          label('kicker', '{{kicker}}', 540, 130, { align: 'center', anims: [[fade(4)]] }),
          circle('disc', 540, 540, 620, { fill: '{{surface}}', stroke: '{{accent}}', strokeWidth: 2, anims: [pop(0, 30, 0.4), wiggle('y', 540, { amount: 7, every: 45, seed: 3 })] }),
          headline('product', '{{product}}', 540, 420, { size: 170, align: 'center', maxWidth: 900, maxLines: 2, minSize: 90, split: { stagger: 6, duration: 26 }, start: 10 }),
          text('promise', '{{promise}}', 540, 890, { size: 36, color: '{{muted}}', align: 'center', maxWidth: 780, maxLines: 2, anims: [rise(890, 46, 20, 22)] }),
          sfx('whoosh', 2, 0.4), sfx('thump', 14, 0.5)], { tin: false }),
        scene('features', 'Features', b, [aurora(W, H, b, { strength: 0.8 }), vignette(W, H), frame(W, H),
          label('heading', 'WHY IT WINS', 80, 100, { anims: [[fade(2)]] }),
          ...[1, 2, 3].flatMap(n => { const y = 190 + (n - 1) * 268, at = 8 + (n - 1) * 30; return [
            rect(`card${n}`, 80, y, 920, 236, { radius: '{{radius}}', fill: '{{surface}}', stroke: '{{text}}', strokeWidth: 1, anims: [[fade(at, 12), anim('x', [at, 150], [at + 24, 80, 'land'])]] }),
            circle(`dot${n}`, 150, y + 118, 44, { fill: '{{accent}}', anims: [pop(at + 6, 22)] }),
            headline(`ft${n}`, `{{f${n}}}`, 230, y + 52, { size: 56, maxWidth: 740, maxLines: 1, minSize: 40, split: { stagger: 4, duration: 20 }, start: at + 8 }),
            text(`fd${n}`, `{{f${n}d}}`, 232, y + 138, { size: 32, color: '{{muted}}', maxWidth: 740, maxLines: 2, anims: [rise(y + 138, at + 16, 16, 20)] }),
            sfx('pop', at + 4, 0.4)]; })]),
        scene('buy', 'Price', c, [aurora(W, H, c, { strength: 1.4 }), vignette(W, H), frame(W, H),
          headline('price', '{{price}}', 540, 260, { size: 360, align: 'center', maxWidth: 940, maxLines: 1, minSize: 160, ls: -14, split: { by: 'letters', stagger: 3, duration: 22 } }),
          text('note', '{{priceNote}}', 540, 650, { size: 36, color: '{{muted}}', align: 'center', anims: [rise(650, 24, 16, 20)] }),
          rect('btn', 290, 760, 500, 120, { radius: 60, fill: '{{accent}}', shadow: { color: '{{accent}}55', blur: 50, offsetX: 0, offsetY: 18 }, originX: 250, originY: 60, anims: [pop(30, 24, 0.7)] }),
          text('btn-text', '{{button}}', 540, 796, { font: '{{fontDisplay}}', weight: 800, size: 46, color: '{{bg}}', align: 'center', anims: [[fade(36, 10)]] }),
          text('url', '{{url}}', 540, 930, { font: 'JetBrains Mono', size: 28, ls: 3, color: '{{muted}}', align: 'center', anims: [[fade(48)]] }),
          sfx('ding', 32, 0.5)]),
      ],
    });
  },
};
