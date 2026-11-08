// A vertical social reel: a hook, three steps, a call to action. The headline template for launches, tips and how-tos.
import { aurora, anim, circle, composition, drift, field, fade, frame, headline, label, leave, path, pop, rect, rise, scene, sfx, slideX, grow, text, tokens, vignette } from './kit.mjs';

const W = 1080, H = 1920;
const orbit = (cx, cy, r, frames, turns = 1) => ['x', 'y'].map(prop => anim(prop, ...Array.from({ length: 13 }, (_, i) => [Math.round((frames * i) / 12), Math.round((prop === 'x' ? cx + Math.cos((i / 12) * Math.PI * 2 * turns - 1.2) * r : cy + Math.sin((i / 12) * Math.PI * 2 * turns - 1.2) * r))])));

export default {
  id: 'hook-reel',
  meta: { name: 'Hook reel', description: 'A 17-second vertical reel: a big hook, three numbered steps and a call to action. Built for launches, tips and how-tos. Themeable.', tags: ['reel', 'social', '9:16', 'launch', 'steps', 'themed'], order: 1, previewFrame: 90, brief: 'A 17-second vertical reel: a bold hook, three short steps, and a clear call to action.' },
  build() {
    const hook = 180, steps = 270, cta = 140, gap = 76;
    return composition({
      id: 'hook-reel', name: 'Hook reel', size: 'tall',
      variables: {
        ...tokens({ bg: '#0a0a0b', accent: '#ff4a1c', accent2: '#ffb199' }),
        brand: field('MOTIONRENDER', 'Small brand line in the top corner'),
        kicker: field('NEW · 2026', 'Small label above the headline'),
        title: field('Make it\nmove.', 'The hook; a line break starts a new line'),
        detail: field('One brief in. A finished video out. Every frame checked.', 'One sentence under the hook'),
        stepsTitle: field('HOW IT WORKS', 'Label above the three steps'),
        step1Title: field('Write the brief', 'Step 1 title'), step1Body: field('Say what it is for in a sentence.', 'Step 1 detail'),
        step2Title: field('Check the plan', 'Step 2 title'), step2Body: field('Every scene and line, before it renders.', 'Step 2 detail'),
        step3Title: field('Render it', 'Step 3 title'), step3Body: field('Frame-exact, the same every time.', 'Step 3 detail'),
        ctaKicker: field('READY?', 'Small label above the call to action'),
        cta: field('Start\nnow.', 'The call to action; a line break starts a new line'),
        ctaButton: field('Try it free', 'Text on the button'),
        url: field('motionrender.dev', 'Address under the button'),
      },
      scenes: [
        scene('hook', 'Hook', hook, [
          aurora(W, H, hook, { strength: 1.1 }), vignette(W, H), frame(W, H),
          label('brand', '{{brand}}', 80, 200, { size: 24, color: '{{muted}}', anims: [[fade(4)]] }),
          label('kicker', '{{kicker}}', 80, 640, { anims: [[fade(8), anim('x', [8, 56], [30, 80, 'land'])]] }),
          circle('ring', 540, 880, 880, { fill: '#00000000', stroke: '{{accent}}', strokeWidth: 2, opacity: 0.4, anims: [[fade(0, 30, 0.4), anim('scale', [0, 0.82], [40, 1, 'land'])]] }),
          circle('ring-inner', 540, 880, 620, { fill: '#00000000', stroke: '{{text}}', strokeWidth: 1, opacity: 0.12, anims: [[fade(6, 30, 0.12), anim('scale', [6, 0.7], [46, 1, 'land'])]] }),
          circle('orbit', 540, 440, 26, { fill: '{{accent}}', anims: [orbit(540, 880, 440, hook, 1), [fade(14, 10)]] }),
          headline('title', '{{title}}', 80, 720, { size: 250, maxWidth: 930, maxLines: 3, minSize: 120, split: { stagger: 6, duration: 28 } }),
          rect('rule', 80, 1290, 0, 10, { radius: 5, fill: '{{accent}}', anims: [[grow('width', 280, 44, 26)]] }),
          text('detail', '{{detail}}', 80, 1350, { size: 40, color: '{{muted}}', maxWidth: 820, maxLines: 3, lh: 1.3, anims: [rise(1350, 40, 28, 26)] }),
          label('count', '01 / 03', 80, 1500, { size: 24, color: '{{muted}}', anims: [[fade(30)]] }),
          path('arrow', 'M0 0 L0 54 M-18 36 L0 56 L18 36', 970, 1760, { stroke: '{{accent}}', strokeWidth: 4, anims: [[fade(44, 14), anim('y', [44, 1740], [74, 1766, 'land'])]] }),
          sfx('whoosh', 4, 0.45), sfx('thump', 20, 0.6),
        ], { tin: false, zoom: 1.08 }),
        scene('steps', 'Steps', steps, [
          aurora(W, H, steps, { strength: 0.9 }), vignette(W, H), frame(W, H),
          label('steps-title', '{{stepsTitle}}', 80, 176, { anims: [[fade(4)]] }),
          rect('rail-track', 1004, 300, 4, 1380, { fill: '{{text}}', opacity: 0.12 }),
          rect('rail', 1004, 300, 4, 0, { fill: '{{accent}}', anims: [[anim('height', [10, 0], [52, 460, 'land'], [52 + gap, 920, 'land'], [52 + gap * 2, 1380, 'land'])]] }),
          ...[1, 2, 3].flatMap(n => {
            const y = 230 + (n - 1) * 430, at = 12 + (n - 1) * gap, dim = at + gap;
            const fadeOthers = n < 3 ? [anim('opacity', [at, 0], [at + 14, 1, 'glide'], [dim, 1], [dim + 16, 0.4, 'glide'])] : [fade(at, 14)];
            return [
              text(`n${n}`, `0${n}`, 70, y, { font: '{{fontDisplay}}', weight: 900, size: 250, ls: -10, color: '{{accent}}', opacity: 1, anims: [fadeOthers, anim('x', [at, 20], [at + 26, 70, 'land'])] }),
              headline(`s${n}-title`, `{{step${n}Title}}`, 90, y + 260, { size: 92, ls: -3, maxWidth: 860, maxLines: 2, minSize: 60, split: { stagger: 4, duration: 22 }, start: at, anims: n < 3 ? [[anim('opacity', [dim, 1], [dim + 16, 0.4, 'glide'])]] : [] }),
              text(`s${n}-body`, `{{step${n}Body}}`, 92, y + 372, { size: 40, color: '{{muted}}', maxWidth: 820, maxLines: 2, lh: 1.3, anims: [rise(y + 372, at + 14, 22, 22), ...(n < 3 ? [anim('opacity', [dim, 1], [dim + 16, 0.4, 'glide'])] : [])] }),
              rect(`s${n}-line`, 90, y + 440, 0, 2, { fill: '{{text}}', opacity: 0.2, anims: [[grow('width', 860, at + 6, 30)]] }),
              sfx('pop', at + 2, 0.45),
            ];
          }),
          sfx('whoosh', 2, 0.35),
        ], { zoom: 1.04 }),
        scene('cta', 'Call to action', cta, [
          aurora(W, H, cta, { strength: 1.4 }), vignette(W, H), frame(W, H),
          label('cta-kicker', '{{ctaKicker}}', 540, 520, { align: 'center', anims: [[fade(2)]] }),
          headline('cta', '{{cta}}', 540, 600, { size: 250, align: 'center', maxWidth: 940, maxLines: 2, minSize: 120, ls: -10, split: { stagger: 6, duration: 28 } }),
          circle('pulse', 540, 1250, 640, { fill: '#00000000', stroke: '{{accent}}', strokeWidth: 3, opacity: 0.5, anims: [[{ ...anim('scale', [20, 0.7], [70, 1.5, 'land']), repeat: 3 }, { ...anim('opacity', [20, 0.55], [70, 0, 'exit']), repeat: 3 }]] }),
          rect('button', 200, 1175, 680, 150, { radius: 75, fill: '{{accent}}', shadow: { color: '{{accent}}66', blur: 60, offsetX: 0, offsetY: 24 }, anims: [pop(16, 24, 0.7)], originX: 340, originY: 75 }),
          text('button-text', '{{ctaButton}}', 540, 1220, { font: '{{fontDisplay}}', weight: 800, size: 58, color: '{{bg}}', align: 'center', anims: [[fade(22, 12)]] }),
          text('url', '{{url}}', 540, 1400, { font: 'JetBrains Mono', size: 32, ls: 4, color: '{{muted}}', align: 'center', anims: [rise(1400, 34, 18, 20)] }),
          sfx('whoosh', 0, 0.4), sfx('ding', 24, 0.5),
        ], { zoom: 1.05 }),
      ],
      overlay: [
        rect('progress-track', 80, 1852, 920, 3, { fill: '{{text}}', opacity: 0.14 }),
        rect('progress', 80, 1852, 0, 3, { fill: '{{accent}}', anims: [[anim('width', [0, 0], [560, 920])]] }),
      ],
    });
  },
};
