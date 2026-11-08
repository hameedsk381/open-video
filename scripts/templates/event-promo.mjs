// A 4:5 event announcement: the event, the date and place, who is speaking, how to join.
import { spot, aurora, anim, circle, composition, field, fade, frame, headline, label, pop, rect, rise, scene, sfx, grow, text, tokens, vignette } from './kit.mjs';

const W = 1080, H = 1350;
export default {
  id: 'event-promo',
  meta: { name: 'Event promo', description: 'A 10-second 4:5 event announcement: name, date and place, three speakers or sessions, and how to join. Themeable.', tags: ['event', 'webinar', 'announcement', 'invite', 'portrait', '4:5', 'themed'], order: 7, previewFrame: 60, brief: 'A portrait event invite: the event name, date, place, who is speaking, and how to register.' },
  build() {
    const a = 130, b = 170, c = 70;
    return composition({
      id: 'event-promo', name: 'Event promo', size: 'portrait',
      variables: { ...tokens({ bg: '#120a1f', surface: '#1d1230', accent: '#ff5fa2', accent2: '#ffb3d4', text: '#faf5ff', muted: '#a99bc0', motion: 'slide', transition: 'wipe' }),
        kicker: field('YOU ARE INVITED', 'Small label'), event: field('Motion\nSummit 26', 'Event name; a line break starts a new line'), date: field('12 NOV · 18:00', 'Date and time'), place: field('Online and in Berlin', 'Place'),
        who: field('WHO IS ON STAGE', 'Label above the speakers'), a1: field('Ada Okafor', 'Speaker 1'), a1d: field('Designing for motion', 'Speaker 1 topic'), a2: field('Ben Lindqvist', 'Speaker 2'), a2d: field('Video as code', 'Speaker 2 topic'), a3: field('Chloe Martin', 'Speaker 3'), a3d: field('Shipping weekly', 'Speaker 3 topic'),
        cta: field('Save your seat', 'Button text'), url: field('summit.example.com', 'Address') },
      scenes: [
        scene('name', 'Event', a, [aurora(W, H, a, { strength: 1.2 }), vignette(W, H), frame(W, H),
          label('kicker', '{{kicker}}', 80, 200, { anims: [[fade(4)]] }),
          headline('event', '{{event}}', 80, 290, { size: 190, maxWidth: 920, maxLines: 3, minSize: 100, split: { stagger: 6, duration: 28 } }),
          rect('rule', 80, 880, 0, 8, { radius: 4, fill: '{{accent}}', anims: [[grow('width', 240, 40, 24)]] }),
          text('date', '{{date}}', 80, 930, { font: '{{fontDisplay}}', weight: 800, size: 70, anims: [rise(930, 48, 20, 22)] }),
          text('place', '{{place}}', 80, 1020, { size: 32, color: '{{muted}}', anims: [rise(1020, 58, 20, 22)] }),
          sfx('whoosh', 4, 0.4), sfx('thump', 24, 0.5)], { tin: false }),
        scene('who', 'Speakers', b, [aurora(W, H, b, { strength: 0.9 }), vignette(W, H), frame(W, H),
          label('who', '{{who}}', 80, 130, { anims: [[fade(2)]] }),
          ...[1, 2, 3].flatMap(n => { const y = 230 + (n - 1) * 330, at = 6 + (n - 1) * 34, next = n < 3 ? at + 34 : undefined; return [
            circle(`av${n}`, 200, y + 130, 200, { fill: '{{surface}}', stroke: '{{accent}}', strokeWidth: 3, anims: [pop(at, 22)] }),
            text(`ini${n}`, `0${n}`, 200, y + 92, { font: '{{fontDisplay}}', weight: 900, size: 84, color: '{{accent}}', align: 'center', anims: [[spot(at + 4, next)]] }),
            headline(`sp${n}`, `{{a${n}}}`, 340, y + 80, { size: 70, maxWidth: 650, maxLines: 1, minSize: 40, split: { stagger: 4, duration: 20 }, start: at + 6, anims: [[spot(0, next === undefined ? next : next - at - 6)]] }),
            text(`st${n}`, `{{a${n}d}}`, 342, y + 175, { size: 32, color: '{{muted}}', maxWidth: 640, maxLines: 2, anims: [[anim('y', [at + 14, y + 191], [at + 34, y + 175, 'land']), spot(at + 14, undefined, 20)]] }),
            sfx('pop', at + 2, 0.4)]; })]),
        scene('join', 'Join', c, [aurora(W, H, c, { strength: 1.4 }), vignette(W, H), frame(W, H),
          rect('btn', 190, 560, 700, 150, { radius: 75, fill: '{{accent}}', shadow: { color: '{{accent}}66', blur: 60, offsetX: 0, offsetY: 24 }, originX: 350, originY: 75, anims: [pop(2, 24, 0.7)] }),
          text('btn-text', '{{cta}}', 540, 606, { font: '{{fontDisplay}}', weight: 800, size: 58, color: '{{bg}}', align: 'center', anims: [[fade(8, 10)]] }),
          text('url', '{{url}}', 540, 780, { font: 'JetBrains Mono', size: 32, ls: 4, color: '{{muted}}', align: 'center', anims: [[fade(18)]] }),
          sfx('ding', 6, 0.5)]),
      ],
    });
  },
};
