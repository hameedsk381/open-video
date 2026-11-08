// Wide results video: a headline, three big numbers, a closing line. For metrics, year in review, launch results.
import { aurora, anim, composition, field, fade, frame, headline, label, rect, rise, scene, sfx, grow, text, tokens, vignette } from './kit.mjs';

const W = 1920, H = 1080;
export default {
  id: 'stats-showcase',
  meta: { name: 'Stats showcase', description: 'A 12-second wide results video: a headline, three big numbers with captions, and a closing line. Themeable.', tags: ['stats', 'metrics', 'results', 'report', 'wide', '16:9', 'themed'], order: 5, previewFrame: 110, brief: 'A wide video that presents three headline numbers with a short caption each.' },
  build() {
    const a = 90, b = 180, c = 90;
    return composition({
      id: 'stats-showcase', name: 'Stats showcase', size: 'wide',
      variables: { ...tokens({ bg: '#0b0f14', surface: '#131a22', accent: '#ffc23d', accent2: '#ffe3a0', text: '#f5f2ea', muted: '#98a3b0', texture: 'grid', textureOpacity: 0.04 }),
        kicker: field('2026 IN NUMBERS', 'Small label'), title: field('A year of\nshipping.', 'Opening headline'),
        s1: field('12M', 'Stat 1 value'), s1d: field('videos rendered', 'Stat 1 caption'), s2: field('99.9%', 'Stat 2 value'), s2d: field('frames identical on re-render', 'Stat 2 caption'), s3: field('4x', 'Stat 3 value'), s3d: field('faster than last year', 'Stat 3 caption'),
        closing: field('And we are just getting started.', 'Closing line') },
      scenes: [
        scene('open', 'Open', a, [aurora(W, H, a), vignette(W, H), frame(W, H),
          label('kicker', '{{kicker}}', 160, 330, { anims: [[fade(4)]] }),
          headline('title', '{{title}}', 160, 400, { size: 240, maxWidth: 1500, maxLines: 2, minSize: 110, split: { stagger: 6, duration: 28 } }), sfx('whoosh', 4, 0.4)], { tin: false }),
        scene('stats', 'Stats', b, [aurora(W, H, b, { strength: 0.8 }), vignette(W, H), frame(W, H),
          ...[1, 2, 3].flatMap(n => { const x = 120 + (n - 1) * 590, at = 6 + (n - 1) * 36; return [
            rect(`top${n}`, x, 340, 0, 6, { fill: '{{accent}}', anims: [[grow('width', 520, at, 26)]] }),
            headline(`v${n}`, `{{s${n}}}`, x, 390, { size: 200, maxWidth: 540, maxLines: 1, minSize: 100, ls: -8, split: { by: 'letters', stagger: 3, duration: 22 }, start: at + 4 }),
            text(`c${n}`, `{{s${n}d}}`, x + 4, 650, { size: 38, color: '{{muted}}', maxWidth: 480, maxLines: 3, lh: 1.3, anims: [rise(650, at + 20, 20, 22)] }),
            sfx('pop', at + 4, 0.5)]; })]),
        scene('close', 'Close', c, [aurora(W, H, c, { strength: 1.4 }), vignette(W, H), frame(W, H),
          headline('closing', '{{closing}}', 960, 400, { size: 130, align: 'center', maxWidth: 1500, maxLines: 3, minSize: 80, split: { stagger: 5, duration: 26 } }), sfx('ding', 26, 0.4)]),
      ],
    });
  },
};
