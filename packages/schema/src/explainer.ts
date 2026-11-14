// An explainer is a short vertical video that teaches one idea, one scene at a time, drawn as small animated diagrams on a dark board:
// the kind of system-design, how-it-works and "explain it simply" videos people post as reels. This is its script: what each scene
// is about and what is said over it, with no coordinates, colours or frame numbers. A compiler (compileExplainer in @ove/core) turns
// it into a composition, so a person, a script or an AI can write the content and the pictures stay consistent and frame-exact.
import { z } from 'zod';

const words = (max: number) => z.string().trim().min(1).max(max);
const tone = z.enum(['gold', 'mint', 'red', 'muted']).describe('Colour of a label: gold (the focus), mint (good, done), red (a problem), muted (a quiet note)');
const labelSchema = z.object({ text: words(28), tone: tone.default('gold') });

const common = {
  step: words(48).optional().describe('The small line under the header, such as "STEP 1 · UPDATES → SERVER". Upper case reads best.'),
  say: words(420).optional().describe('What is said over this scene. The scene lasts as long as the line, so write it as speech: short sentences, one idea.'),
  layout: z.enum([...explainerLayouts, 'auto']).optional().describe('This scene\'s own layout, instead of the video\'s: card (centred, boxed), editorial (flush left, hairline rules; title, stat, steps and closing scenes) or auto (editorial when the scene carries a lot of text, card when it is short and punchy). Mix them on purpose, for example an editorial title and card diagrams.'),
  place: z.enum(['center', 'top']).optional().describe('Where the scene sits on the board: center (default, in the space between the header and the bottom of the frame) or top (pinned under the header).'),
};

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'A colour is a 6-digit hex such as #0b1c3f');
import { explainerBodyFonts, explainerCorners, explainerDisplayFonts, explainerLayouts, explainerLookDefs, explainerLooks, explainerMotions, explainerTextures, explainerTransitions, explainerWeights } from './explainer-looks';
/** The looks an explainer can wear: each is a whole design (colours, type, motion, texture, corners, weight); see explainer-looks. */
export { explainerLooks };

/** A colour in a freeform scene: one of the look's own (so the scene follows the look), or a hex. */
const paint = z.string().regex(/^(accent|accent2|text|muted|surface|bg|red|none|#[0-9a-fA-F]{6})$/, 'A colour is accent, accent2, text, muted, surface, bg, red, none or a 6-digit hex');
const appear = {
  at: z.number().min(0).max(0.9).default(0.1).describe('When it appears, as a fraction of the scene: 0 at the start, 0.5 halfway'),
  motion: z.enum(['rise', 'fade', 'pop', 'draw', 'none']).default('rise').describe('How it arrives: rise, fade, pop (scale in), draw (a box grows from its left edge) or none'),
};
const px = z.number().min(-200).max(1280), py = z.number().min(0).max(1920);
export const freeformElementSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: words(160), x: px, y: py, size: z.number().min(18).max(420).default(48), weight: z.number().int().min(300).max(900).default(600),
    color: paint.default('text'), align: z.enum(['left', 'center', 'right']).default('left').describe('left: x is the left edge. center: x is the middle. right: x is the right edge.'),
    font: z.enum(['display', 'body', 'mono']).default('body'), width: z.number().min(60).max(1040).optional().describe('Wrap the text at this width'), ...appear }),
  z.object({ type: z.literal('box'), x: px, y: py, w: z.number().min(1).max(1280), h: z.number().min(1).max(1920), radius: z.number().min(0).max(300).default(0),
    fill: paint.default('surface'), stroke: paint.optional(), strokeWidth: z.number().min(1).max(24).default(3), ...appear }),
  z.object({ type: z.literal('circle'), x: px.describe('The middle'), y: py.describe('The middle'), d: z.number().min(2).max(1200).describe('The diameter'),
    fill: paint.default('accent'), stroke: paint.optional(), strokeWidth: z.number().min(1).max(24).default(3), ...appear }),
]);

export const explainerSceneSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('title'), ...common,
    brand: words(20).optional().describe('A big name at the top, such as the company or the subject'),
    chip: words(36).optional().describe('A small boxed label under it, such as "SYSTEM DESIGN INTERVIEW"'),
    lines: z.array(words(32)).min(1).max(3).describe('The question or promise on the card, as up to three short lines. One line is shown large and gold: by default the middle of three, else the first.'),
    highlight: z.number().int().min(0).max(2).optional().describe('Which line is large and gold') }),
  z.object({ kind: z.literal('flow'), ...common,
    sources: z.array(words(6)).min(2).max(7).describe('The things that send (users, devices, drivers): short ids such as "D17" or "App"'),
    buffer: words(16).default('QUEUE').describe('What the sends pass through on the way, such as QUEUE, CACHE or LOAD BALANCER'),
    sink: words(10).default('SERVER').describe('Where they end up, such as SERVER or DATABASE'),
    spike: words(16).optional().describe('A warning shown on a growing bar at the top, such as "10× SPIKE"'),
    note: labelSchema.optional().describe('A label under the middle box, such as "JAISE KAFKA"'),
    result: labelSchema.optional().describe('A label that appears at the end, such as "0 UPDATES LOST ✓"'),
    caption: words(120).optional().describe('One sentence at the bottom of the screen') }),
  z.object({ kind: z.literal('grid'), ...common,
    mode: z.enum(['counters', 'heatmap']).describe('counters: a number in every cell, one changes. heatmap: the cells are coloured by their number, red hot, green quiet.'),
    rows: z.number().int().min(3).max(9).default(9), cols: z.number().int().min(3).max(8).default(8),
    hot: z.object({ row: z.number().int().min(0).max(8), col: z.number().int().min(0).max(7) }).optional().describe('The cell, or the middle of the hot area, the scene is about'),
    seed: z.number().int().min(0).max(9999).default(7).describe('Changes the pattern of numbers and colours'),
    callout: words(36).optional().describe('heatmap: a label beside the hot area, such as "BHEED ZYADA, DRIVERS KAM"'),
    result: words(28).optional().describe('heatmap: a card that names what the picture is, such as "Live heatmap"'),
    resultNote: words(36).optional().describe('heatmap: a small line under the card'),
    caption: words(120).optional().describe('One sentence at the bottom of the screen') }),
  z.object({ kind: z.literal('steps'), ...common,
    items: z.array(z.object({ title: words(48), detail: words(80).optional() })).min(2).max(5).describe('Numbered steps, shown one after another'),
    caption: words(120).optional().describe('One sentence at the bottom of the screen') }),
  z.object({ kind: z.literal('compare'), ...common,
    left: z.object({ title: words(24), points: z.array(words(48)).min(1).max(4) }).describe('The problem side (red): what goes wrong'),
    right: z.object({ title: words(24), points: z.array(words(48)).min(1).max(4) }).describe('The answer side (green): what works'),
    caption: words(120).optional().describe('One sentence at the bottom of the screen') }),
  z.object({ kind: z.literal('stat'), ...common,
    value: words(14).describe('The one big number or short phrase, such as "87%" or "3×"'),
    label: words(90).describe('What the number means, in one line'),
    note: words(90).optional().describe('A smaller line under it, such as where the number comes from'),
    tone: tone.default('gold').describe('Colour of the number') }),
  z.object({ kind: z.literal('chart'), ...common,
    type: z.enum(['bars', 'line']).default('bars').describe('bars: compare amounts side by side. line: show a change over time.'),
    items: z.array(z.object({ label: words(14), value: z.number().min(0).max(1e9) })).min(2).max(8).describe('One bar or point each, in order, with a short label and a value'),
    unit: words(6).optional().describe('Added after each value, such as "%" or "ms"'),
    highlight: z.number().int().min(0).max(7).optional().describe('Which bar or point is picked out in gold; the largest by default'),
    caption: words(120).optional().describe('One sentence at the bottom of the screen') }),
  z.object({ kind: z.literal('timeline'), ...common,
    events: z.array(z.object({ when: words(16), title: words(48), detail: words(80).optional() })).min(2).max(6).describe('What happened or happens, in order, down the screen'),
    caption: words(120).optional().describe('One sentence at the bottom of the screen') }),
  z.object({ kind: z.literal('pile'), ...common,
    title: words(24).optional().describe('A label above what falls, such as "REQUESTS" or "ORDERS"'),
    bucket: words(16).optional().describe('A label on the container, such as "SERVER" or "QUEUE"'),
    count: z.number().int().min(5).max(120).default(40).describe('How many pieces fall'),
    shape: z.enum(['circle', 'rect']).default('circle').describe('The shape of each piece'),
    tone: z.enum(['mixed', 'gold', 'mint', 'red']).default('mixed').describe('Colour of the pieces'),
    caption: words(120).optional().describe('One sentence at the bottom of the screen') }),
  z.object({ kind: z.literal('media'), ...common,
    src: words(200).optional().describe('A picture or video file of the project, relative to the video (such as assets/city.mp4); it fills a rounded frame on the board. Give this or prompt, not both'),
    prompt: words(400).optional().describe('Instead of a file: what to draw, as a plain description of one clear picture without words or logos. The picture is made with the image model when the video is built, and needs one'),
    title: words(60).optional().describe('Large text over the lower part of the picture, such as the name of a place or idea'),
    caption: words(120).optional().describe('One sentence under the title'),
    credit: words(80).optional().describe('A small credit line in a corner, such as "Video: Bo Reel on Pexels"') }),
  z.object({ kind: z.literal('phone'), ...common,
    app: words(20).describe('The name of the app, in the bar at the top of the phone, such as "Chat" or "Maps"'),
    messages: z.array(z.object({ side: z.enum(['in', 'out']).default('in').describe('in: arrives from someone else, on the left. out: sent from this phone, on the right'), text: words(70) })).min(1).max(5).describe('What shows on the screen, one bubble after another'),
    caption: words(90).optional().describe('A line under the phone') }),
  z.object({ kind: z.literal('hex'), ...common,
    columns: z.number().int().min(3).max(7).default(5), rows: z.number().int().min(2).max(6).default(4),
    lit: z.array(z.number().int().min(0).max(41)).max(12).optional().describe('Which cells light up, counted left to right, top to bottom. Left out, a few are chosen'),
    tags: z.array(words(14)).max(3).default([]).describe('Short names pinned on the first lit cells, such as "Zone A"'),
    seed: z.number().int().default(3).describe('Picks the lit cells when lit is left out'),
    caption: words(90).optional().describe('A line under the map') }),
  z.object({ kind: z.literal('freeform'), ...common,
    elements: z.array(freeformElementSchema).min(1).max(80).describe('What is on the board, placed by you on a 1080 x 1920 column: text, boxes (also lines and bars: a thin box) and circles. Keep text between y 270 and y 1540 and left of x 960, where reel apps do not cover it.'),
    duration: z.number().min(2).max(30).optional().describe('At least this many seconds, when the picture needs longer than its spoken line'),
    caption: words(120).optional().describe('One sentence at the bottom of the screen') }),
  z.object({ kind: z.literal('closing'), ...common,
    title: words(40).describe('The takeaway, large'),
    points: z.array(words(60)).max(3).default([]).describe('Up to three short reminders'),
    cta: words(40).default('Follow for more').describe('The call to action in the box at the bottom') }),
]);

/**
 * The decision made before any scene is written: which shape the video takes. Three candidates are weighed and one chosen, because the first
 * structure that comes to mind for a topic is usually the cliché (a title, two cards, a closing). It travels with the script so the choice can be read.
 */
export const treatmentSchema = z.object({
  candidates: z.array(z.object({
    structure: words(200).describe('One way the video could be shaped, with the scene kinds it would use, such as "a worked example: title, freeform sequence, stat, closing"'),
    why: words(200).optional().describe('What this shape does well, or why it is not the one'),
  })).min(2).max(4).describe('Two to four genuinely different shapes: a journey, a before and after, a countdown, a list that turns, a mechanism walked step by step, one worked example'),
  chosen: z.number().int().min(0).max(3).describe('Which candidate was chosen, counted from 0'),
  logline: words(240).describe('The video in one sentence: what the viewer knows at the end that they did not at the start'),
  opening: words(160).optional().describe('What the first seconds show; something happens in the first 3 seconds'),
  signature: words(200).optional().describe('The one scene people will remember and why it is drawn the way it is (often a freeform scene shaped like the idea)'),
  ending: words(160).optional().describe('How the video ends, ideally echoing the opening'),
}).superRefine((treatment, ctx) => {
  if (treatment.chosen >= treatment.candidates.length) ctx.addIssue({ code: 'custom', path: ['chosen'], message: `chosen is ${treatment.chosen} but there are only ${treatment.candidates.length} candidates (count from 0)` });
});

export const explainerSchema = z.object({
  version: z.literal('1.0').default('1.0'),
  series: words(24).default('EXPLAINED').describe('The small label before the topic in the header, such as "SYSTEM DESIGN", "HOW IT WORKS" or "MONEY BASICS"'),
  aspect: z.enum(['9:16', '1:1', '4:5', '16:9']).default('9:16').describe('The shape of the video. Scenes are drawn as a 9:16 column; other shapes show that column, scaled to fit, centred on the board'),
  sketch: z.boolean().default(false).describe('Draw the whole board by hand: wobbly outlines, redrawn every few frames like a cartoon'),
  look: z.enum(explainerLooks).default('navy').describe(`The whole design of the board. Choose the one that suits the subject, not the default: ${explainerLooks.map(name => `${name} (${explainerLookDefs[name].note})`).join('; ')}`),
  design: z.object({
    fontDisplay: z.enum(explainerDisplayFonts).optional().describe('Headline font'), fontBody: z.enum(explainerBodyFonts).optional().describe('Body font'),
    motion: z.enum(explainerMotions).optional().describe('How text arrives: rise, drop (from above), blur (comes into focus) or fade'), transition: z.enum(explainerTransitions).optional().describe('How scenes change'),
    texture: z.enum(explainerTextures).optional().describe('The pattern behind everything'), corners: z.enum(explainerCorners).optional().describe('How round the cards are'), weight: z.enum(explainerWeights).optional().describe('How heavy the headlines are'),
    layout: z.enum(explainerLayouts).optional().describe('card: centred, in boxed cards. editorial: flush left, no boxes, hairline rules, large numerals (title, stat, steps and closing scenes)'),
  }).optional().describe('Changes parts of the look: any field left out keeps the look\'s own'),
  colors: z.object({ bg: hex, surface: hex, text: hex, muted: hex, accent: hex, accent2: hex }).partial().optional().describe('Colours that replace the look\'s own, by name'),
  treatment: treatmentSchema.optional().describe('The shape chosen for this video and the shapes passed over; written before the scenes'),
  topic: words(40).describe('The topic, shown in the header on every scene, such as "UBER LIVE HEATMAP"'),
  handle: words(30).default('@yourhandle').describe('The creator handle, shown in the header'),
  voice: words(40).optional().describe('The Edge voice that speaks, such as en-IN-NeerjaNeural or en-US-AriaNeural'),
  voiceRate: z.number().int().min(-40).max(60).optional().describe('How much faster (+) or slower (-) the voice speaks, in percent: +15 suits a lively promo'),
  sources: z.array(z.object({ text: z.string().max(1000), source: z.string().max(200), url: z.string().max(500), date: z.string().max(20) })).max(30).default([]).describe('The facts the script was written from, with where each came from and when. They are not drawn; they stay with the script so its numbers can be checked.'),
  scenes: z.array(explainerSceneSchema).min(1).max(24).superRefine((scenes, ctx) => {
    scenes.forEach((scene, i) => { if (scene.kind === 'media' && (scene.src === undefined) === (scene.prompt === undefined)) ctx.addIssue({ code: 'custom', path: [i, 'src'], message: 'A media scene needs exactly one of "src" (a file) or "prompt" (a picture to draw)' }); });
  }),
});

export type Explainer = z.infer<typeof explainerSchema>;
export type ExplainerInput = z.input<typeof explainerSchema>;
export type ExplainerScene = z.infer<typeof explainerSceneSchema>;
export type FreeformElement = z.infer<typeof freeformElementSchema>;
/** The scene kinds, for prompts and menus. */
export const explainerKinds = ['title', 'flow', 'grid', 'steps', 'compare', 'stat', 'chart', 'timeline', 'pile', 'media', 'phone', 'hex', 'freeform', 'closing'] as const;
