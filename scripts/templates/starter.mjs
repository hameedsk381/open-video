// The default starting point: a title, three points, a close. Wide, calm, easy to retheme.
import { spot, aurora, anim, composition, field, fade, frame, pop, headline, label, rect, rise, scene, sfx, grow, text, tokens, vignette } from './kit.mjs';

const W = 1920, H = 1080;
export default {
  id: 'starter',
  meta: { name: 'Starter', description: 'A 12-second wide video: title, three points, closing line. The cleanest place to begin. Themeable.', tags: ['starter', 'wide', '16:9', 'explainer', 'themed'], order: 0, previewFrame: 60, brief: 'A short 16:9 explainer: a title, three key points and a closing line.' },
  build() {
    const a = 150, b = 250, c = 100;
    return composition({
      id: 'starter', name: 'Starter', size: 'wide', assets: [{ id: 'logo', type: 'image', src: './assets/logo.svg' }],
      variables: {
        ...tokens({ bg: '#0c0d10', accent: '#5b8cff', accent2: '#b6caff' }),
        kicker: field('INTRODUCING', 'Small label above the title'), title: field('Say it once,\nclearly.', 'The title; a line break starts a new line'), subtitle: field('A short video that explains one idea.', 'One line under the title'),
        pointsTitle: field('Three things to know', 'Heading of the points'),
        p1: field('It is fast', 'Point 1'), p1d: field('From brief to render in minutes.', 'Point 1 detail'),
        p2: field('It is exact', 'Point 2'), p2d: field('Every frame is the same, every time.', 'Point 2 detail'),
        p3: field('It is yours', 'Point 3'), p3d: field('Plain files you can edit and keep.', 'Point 3 detail'),
        closing: field('Make something worth watching.', 'The closing line'), url: field('motionrender.dev', 'Address under the closing line'),
      },
      scenes: [
        scene('title', 'Title', a, [aurora(W, H, a), vignette(W, H), frame(W, H),
          { id: 'logo', type: 'image', src: 'logo', x: 160, y: 180, width: 96, height: 96, objectFit: 'contain', animations: [...pop(0, 22, 0.8)] },
          label('kicker', '{{kicker}}', 160, 330, { anims: [[fade(4)]] }),
          headline('title', '{{title}}', 160, 400, { size: 190, maxWidth: 1500, maxLines: 2, minSize: 110, split: { stagger: 6, duration: 28 } }),
          rect('rule', 160, 790, 0, 8, { radius: 4, fill: '{{accent}}', anims: [[grow('width', 220, 40, 24)]] }),
          text('subtitle', '{{subtitle}}', 160, 830, { size: 40, color: '{{muted}}', maxWidth: 1200, anims: [rise(830, 46, 24, 24)] }),
          sfx('whoosh', 4, 0.4)], { tin: false }),
        scene('points', 'Points', b, [aurora(W, H, b, { strength: 0.8 }), vignette(W, H), frame(W, H),
          label('heading', '{{pointsTitle}}', 160, 150, { anims: [[fade(2)]] }),
          ...[1, 2, 3].flatMap(n => { const x = 160 + (n - 1) * 560, at = 10 + (n - 1) * 50; return [
            rect(`card${n}`, x, 300, 500, 560, { radius: '{{radius}}', fill: '{{surface}}', stroke: '{{text}}', strokeWidth: 1, opacity: 1, anims: [rise(300, at, 50, 26)] }),
            text(`num${n}`, `0${n}`, x + 44, 340, { font: '{{fontDisplay}}', weight: 900, size: 110, color: '{{accent}}', ls: -4, anims: [[anim('y', [at + 6, 370], [at + 30, 340, 'land']), spot(at + 6, n < 3 ? at + 76 : undefined, 18)]] }),
            headline(`pt${n}`, `{{p${n}}}`, x + 44, 560, { size: 66, maxWidth: 410, maxLines: 2, minSize: 44, split: { stagger: 4, duration: 22 }, start: at + 10, anims: [[spot(0, n < 3 ? 66 : undefined, 18)]] }),
            text(`pd${n}`, `{{p${n}d}}`, x + 44, 730, { size: 30, color: '{{muted}}', maxWidth: 410, maxLines: 3, lh: 1.35, anims: [rise(730, at + 18, 20, 22)] }),
            sfx('pop', at + 4, 0.4)]; })]),
        scene('close', 'Close', c, [aurora(W, H, c, { strength: 1.3 }), vignette(W, H), frame(W, H),
          headline('closing', '{{closing}}', 960, 380, { size: 130, align: 'center', maxWidth: 1500, maxLines: 3, minSize: 80, split: { stagger: 5, duration: 26 } }),
          text('url', '{{url}}', 960, 800, { font: 'JetBrains Mono', size: 30, ls: 4, color: '{{accent}}', align: 'center', anims: [rise(800, 36, 20, 20)] }),
          sfx('ding', 30, 0.4)]),
      ],
    });
  },
};
