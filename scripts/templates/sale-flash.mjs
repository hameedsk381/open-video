// A loud vertical sale: a big offer, what is included, a deadline, a code.
import { aurora, anim, circle, composition, field, fade, frame, headline, label, pop, rect, rise, scene, sfx, grow, text, tokens, vignette } from './kit.mjs';

const W = 1080, H = 1920;
export default {
  id: 'sale-flash',
  meta: { name: 'Sale flash', description: 'A 9-second vertical sale ad: a huge offer, three perks, a deadline and a promo code. Themeable.', tags: ['sale', 'offer', 'promo', 'ad', 'discount', 'reel', '9:16', 'themed'], order: 9, previewFrame: 50, brief: 'A vertical sale ad: the discount, what is included, when it ends, and the code to use.' },
  build() {
    const a = 100, b = 100, c = 90;
    return composition({
      id: 'sale-flash', name: 'Sale flash', size: 'tall',
      variables: { ...tokens({ bg: '#fff23d', surface: '#ffffff', text: '#0b0b0b', muted: '#3a3a30', accent: '#0b0b0b', accent2: '#ff3d2e', motion: 'pop', transition: 'push', headWeight: 900 }),
        kicker: field('FLASH SALE', 'Small label'), offer: field('40%\nOFF', 'The offer; a line break starts a new line'), sub: field('Everything in the shop, this weekend only.', 'One line under the offer'),
        p1: field('Free shipping', 'Perk 1'), p2: field('30-day returns', 'Perk 2'), p3: field('Gift wrap on us', 'Perk 3'),
        ends: field('ENDS SUNDAY MIDNIGHT', 'Deadline'), codeLabel: field('USE CODE', 'Label above the code'), code: field('FLASH40', 'Promo code'), url: field('shop.example.com', 'Address') },
      scenes: [
        scene('offer', 'Offer', a, [aurora(W, H, a, { strength: 0.6 }), frame(W, H),
          label('kicker', '{{kicker}}', 540, 330, { align: 'center', color: '{{text}}', anims: [[fade(2)]] }),
          headline('offer', '{{offer}}', 540, 420, { size: 520, align: 'center', maxWidth: 960, maxLines: 2, minSize: 200, ls: -20, lh: 0.88, split: { stagger: 5, duration: 24 } }),
          text('sub', '{{sub}}', 540, 1450, { size: 46, weight: 700, align: 'center', maxWidth: 880, maxLines: 3, lh: 1.25, anims: [rise(1450, 40, 24, 22)] }),
          sfx('thump', 4, 0.7), sfx('whoosh', 2, 0.4)], { tin: false, zoom: 1.08 }),
        scene('perks', 'Perks', b, [aurora(W, H, b, { strength: 0.6 }), frame(W, H),
          ...[1, 2, 3].flatMap(n => { const y = 360 + (n - 1) * 360, at = 4 + (n - 1) * 22; return [
            rect(`pill${n}`, 80, y, 920, 280, { radius: 140, fill: '{{accent}}', anims: [[fade(at, 10), anim('x', [at, n % 2 ? -200 : 200], [at + 22, 80, 'land'])]] }),
            text(`pk${n}`, `{{p${n}}}`, 540, y + 100, { font: '{{fontDisplay}}', weight: 900, size: 84, color: '{{bg}}', align: 'center', maxWidth: 800, maxLines: 1, minSize: 50, anims: [[fade(at + 8, 12)]] }),
            sfx('pop', at + 2, 0.5)]; })]),
        scene('code', 'Code', c, [aurora(W, H, c, { strength: 0.6 }), frame(W, H),
          label('ends', '{{ends}}', 540, 380, { align: 'center', color: '{{text}}', size: 30, anims: [[fade(2)]] }),
          label('codeLabel', '{{codeLabel}}', 540, 620, { align: 'center', color: '{{text}}', anims: [[fade(8)]] }),
          rect('codebox', 100, 700, 880, 280, { radius: 36, fill: '{{accent}}', originX: 440, originY: 140, anims: [pop(10, 24, 0.7)] }),
          headline('code', '{{code}}', 540, 760, { size: 180, align: 'center', color: '{{bg}}', maxWidth: 800, maxLines: 1, minSize: 80, ls: -4, split: { by: 'letters', stagger: 2, duration: 18 }, start: 16 }),
          text('url', '{{url}}', 540, 1200, { font: 'JetBrains Mono', size: 36, ls: 4, weight: 700, align: 'center', anims: [rise(1200, 36, 16, 20)] }),
          sfx('ding', 14, 0.6)]),
      ],
    });
  },
};
