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
};

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
  z.object({ kind: z.literal('closing'), ...common,
    title: words(40).describe('The takeaway, large'),
    points: z.array(words(60)).max(3).default([]).describe('Up to three short reminders'),
    cta: words(40).default('Follow for more').describe('The call to action in the box at the bottom') }),
]);

export const explainerSchema = z.object({
  version: z.literal('1.0').default('1.0'),
  topic: words(40).describe('The topic, shown in the header on every scene, such as "UBER LIVE HEATMAP"'),
  handle: words(30).default('@yourhandle').describe('The creator handle, shown in the header'),
  voice: words(40).optional().describe('The Edge voice that speaks, such as en-IN-NeerjaNeural or en-US-AriaNeural'),
  scenes: z.array(explainerSceneSchema).min(1).max(16),
});

export type Explainer = z.infer<typeof explainerSchema>;
export type ExplainerInput = z.input<typeof explainerSchema>;
export type ExplainerScene = z.infer<typeof explainerSceneSchema>;
/** The scene kinds, for prompts and menus. */
export const explainerKinds = ['title', 'flow', 'grid', 'steps', 'compare', 'closing'] as const;
