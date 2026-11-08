// A wide how-to: the goal, four steps with a progress rail, the result.
import { aurora, anim, circle, composition, field, fade, frame, headline, label, pop, rect, rise, scene, sfx, grow, text, tokens, vignette } from './kit.mjs';

const W = 1920, H = 1080;
export default {
  id: 'tutorial-steps',
  meta: { name: 'Tutorial steps', description: 'A 17-second wide how-to: the goal, four numbered steps with a progress rail, and the result. Themeable.', tags: ['tutorial', 'how-to', 'steps', 'guide', 'wide', '16:9', 'themed'], order: 8, previewFrame: 150, brief: 'A wide how-to video that shows four steps to reach one goal.' },
  build() {
    const a = 90, step = 160, c = 100;
    const steps = [1, 2, 3, 4].map(n => scene(`step${n}`, `Step ${n}`, step, [
      aurora(W, H, step, { strength: 0.9 }), vignette(W, H), frame(W, H),
      label('goal', '{{goal}}', 160, 110, { color: '{{muted}}', anims: [[fade(2)]] }),
      text(`big${n}`, `0${n}`, 140, 250, { font: '{{fontDisplay}}', weight: 900, size: 520, ls: -22, color: '{{accent}}', opacity: 0.16, anims: [[fade(0, 20, 0.16), anim('x', [0, 100], [30, 140, 'land'])]] }),
      headline(`t${n}`, `{{step${n}}}`, 160, 400, { size: 140, maxWidth: 1300, maxLines: 2, minSize: 80, split: { stagger: 5, duration: 24 } }),
      text(`d${n}`, `{{step${n}d}}`, 164, 700, { size: 44, color: '{{muted}}', maxWidth: 1100, maxLines: 3, lh: 1.3, anims: [rise(700, 20, 20, 22)] }),
      rect('rail-track', 160, 960, 1600, 4, { fill: '{{text}}', opacity: 0.14 }),
      rect('rail', 160, 960, 1, 4, { fill: '{{accent}}', anims: [[anim('width', [0, 400 * (n - 1) + 1], [24, 400 * n, 'land'])]] }),
      ...[1, 2, 3, 4].map(k => circle(`dot${k}`, 160 + (k - 1) * 400 + (k === 4 ? 0 : 0), 962, 22, { fill: k <= n ? '{{accent}}' : '{{surface}}', stroke: '{{text}}', strokeWidth: 1 })),
      sfx('pop', 4, 0.5),
    ], { zoom: 1.04, tinFrames: 10 }));
    return composition({
      id: 'tutorial-steps', name: 'Tutorial steps', size: 'wide',
      variables: { ...tokens({ bg: '#0a1210', surface: '#14211d', accent: '#3ddc97', accent2: '#a6f0cc', text: '#eefaf4', muted: '#8fa89d', texture: 'dots', textureOpacity: 0.05, motion: 'rise', transition: 'push' }),
        kicker: field('HOW TO', 'Small label'), goal: field('SET UP YOUR FIRST VIDEO', 'The goal, shown small on every step'), title: field('Your first video\nin four steps.', 'Opening title; a line break starts a new line'),
        step1: field('Write the brief', 'Step 1 title'), step1d: field('One sentence about who it is for and what it should say.', 'Step 1 detail'),
        step2: field('Pick a template', 'Step 2 title'), step2d: field('Start from one that matches the shape and length you need.', 'Step 2 detail'),
        step3: field('Fill in the words', 'Step 3 title'), step3d: field('Replace the placeholder lines with your own copy.', 'Step 3 detail'),
        step4: field('Render and share', 'Step 4 title'), step4d: field('Export the video and post it where your audience is.', 'Step 4 detail'),
        result: field('That is all it takes.', 'The closing line'), url: field('motionrender.dev/docs', 'Address') },
      scenes: [
        scene('open', 'Open', a, [aurora(W, H, a), vignette(W, H), frame(W, H),
          label('kicker', '{{kicker}}', 160, 330, { anims: [[fade(4)]] }),
          headline('title', '{{title}}', 160, 400, { size: 170, maxWidth: 1500, maxLines: 2, minSize: 100, split: { stagger: 6, duration: 28 } }), sfx('whoosh', 4, 0.4)], { tin: false }),
        ...steps,
        scene('done', 'Result', c, [aurora(W, H, c, { strength: 1.4 }), vignette(W, H), frame(W, H),
          headline('result', '{{result}}', 960, 400, { size: 230, align: 'center', maxWidth: 1500, maxLines: 2, minSize: 90, split: { stagger: 5, duration: 26 } }),
          text('url', '{{url}}', 960, 760, { font: 'JetBrains Mono', size: 32, ls: 4, color: '{{accent}}', align: 'center', anims: [rise(760, 30, 16, 20)] }), sfx('ding', 24, 0.4)]),
      ],
    });
  },
};
