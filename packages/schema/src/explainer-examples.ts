// What an agent needs to write an explainer script without guessing: for each scene kind, what it shows, when to use it, and a complete example
// that is checked against the schema by a test. `mr explainer kinds` and the MCP tool print these.
import { z } from 'zod';
import { explainerKinds, explainerSchema } from './explainer';

export type ExplainerKindDoc = { kind: typeof explainerKinds[number]; shows: string; use: string; example: Record<string, unknown> };

export const explainerKindDocs: ExplainerKindDoc[] = [
  { kind: 'title', shows: 'The opening card: a big brand word, a small chip, and the question or promise on a card.', use: 'Always the first scene.',
    example: { kind: 'title', brand: 'Short', chip: 'SYSTEM DESIGN INTERVIEW', lines: ['How do you build a', 'URL SHORTENER', 'for millions of users?'], say: 'How do you build a URL shortener for millions of users?' } },
  { kind: 'flow', shows: 'Senders on the left, a buffer (queue, cache, load balancer) in the middle, a sink on the right, with a spike warning.', use: 'Traffic, events, messages, anything that arrives faster than it is handled.',
    example: { kind: 'flow', step: 'STEP 1 · TRAFFIC → SERVER', sources: ['Web', 'App', 'API', 'Bot'], buffer: 'LOAD BALANCER', sink: 'SERVER', spike: '100× TRAFFIC', note: { text: 'SPREAD THE LOAD', tone: 'gold' }, result: { text: 'NO ONE SERVER FALLS ✓', tone: 'mint' }, caption: 'Every click goes through a load balancer first.', say: 'Every click goes through a load balancer first, so no single server takes the whole spike.' } },
  { kind: 'grid', shows: 'A grid of numbers (counters) or a coloured heatmap with a hot area and a callout.', use: 'Cells, regions, counters, density, a hotspot.',
    example: { kind: 'grid', mode: 'heatmap', rows: 6, cols: 6, hot: { row: 1, col: 4 }, callout: 'TOO MANY RIDERS, TOO FEW DRIVERS', result: 'Live heatmap', caption: 'Red is where demand is highest.', say: 'The map shows where demand is highest right now.' } },
  { kind: 'steps', shows: 'Two to five numbered steps that appear one after another.', use: 'A process or a recipe.',
    example: { kind: 'steps', step: 'STEP 2 · MAKE THE SHORT LINK', items: [{ title: 'Get a unique ID', detail: 'From a counter or an ID service' }, { title: 'Encode it in base62', detail: 'Digits and letters give 7 characters' }, { title: 'Store the pair', detail: 'short code → long URL' }], say: 'Get a unique ID, encode it in base 62, and store the pair.' } },
  { kind: 'compare', shows: 'Two cards side by side: the problem (red, crosses) and the answer (green, ticks).', use: 'Before and after, bad and good, option A and option B.',
    example: { kind: 'compare', left: { title: 'One counter', points: ['One machine becomes the bottleneck', 'The next link is easy to guess'] }, right: { title: 'ID ranges', points: ['Each server owns a range of IDs', 'Links stay hard to guess'] }, caption: 'Hand out ranges, not single numbers.', say: 'Give each server a range of IDs instead of one shared counter.' } },
  { kind: 'stat', shows: 'One big number or phrase with a label and a note.', use: 'A single figure that matters. Put the source in the note.',
    example: { kind: 'stat', value: '1.46 billion', label: 'people live in India', note: 'World Bank, 2025', tone: 'gold', caption: 'More than any other country.', say: 'India has about one point four six billion people.' } },
  { kind: 'chart', shows: 'Bars (compare amounts) or a line (change over time) with a highlighted item.', use: 'Two to eight values. Put the source in the caption.',
    example: { kind: 'chart', type: 'bars', items: [{ label: 'India', value: 1.46 }, { label: 'Brazil', value: 0.21 }, { label: 'USA', value: 0.34 }], unit: 'B', highlight: 0, caption: 'Population in billions, World Bank 2025.', say: 'India is far ahead of Brazil and the United States.' } },
  { kind: 'timeline', shows: 'Two to six events down a line, each with a time, a title and a detail.', use: 'History, a roadmap, a process over time.',
    example: { kind: 'timeline', events: [{ when: 'Day 1', title: 'Launch', detail: 'Quiet start' }, { when: 'Day 30', title: 'First scale-up' }, { when: 'Day 90', title: 'Rewrite' }], caption: 'Three moments that shaped it.', say: 'Three moments shaped the product.' } },
  { kind: 'pile', shows: 'Many small things fall into a container and pile up, with physics.', use: 'Load, volume, overflow, backlog.',
    example: { kind: 'pile', title: 'REQUESTS', bucket: 'SERVER', count: 60, shape: 'circle', tone: 'mixed', caption: 'Everything piles up at once.', say: 'When requests arrive faster than they are served, they pile up.' } },
  { kind: 'media', shows: 'A picture or video in a rounded frame with a title and caption over it. Give a file (src) or a prompt to draw.', use: 'A real place, product or scene. Needs a file in the project, or an image model for a prompt.',
    example: { kind: 'media', src: 'assets/city.jpg', title: 'The city at night', caption: 'Where the demand is.', credit: 'Photo: Someone on Pexels', say: 'This is the city we are talking about.' } },
  { kind: 'phone', shows: 'A phone screen with up to five chat bubbles (incoming left, outgoing right).', use: 'Apps, messages, notifications.',
    example: { kind: 'phone', app: 'Rides', messages: [{ side: 'in', text: 'Where is my ride?' }, { side: 'out', text: 'Two minutes away' }], caption: 'One request, one match.', say: 'The rider asks, and the nearest driver answers.' } },
  { kind: 'hex', shows: 'A map of hexagon cells with some lit and tagged.', use: 'Regions, zones, shards, cells.',
    example: { kind: 'hex', columns: 5, rows: 4, lit: [2, 7, 12], tags: ['A', 'B', 'C'], caption: 'The city is cut into cells.', say: 'The city is cut into hexagon cells, and busy cells light up.' } },
  { kind: 'freeform', shows: 'A board you lay out yourself: text, boxes (a thin box is a line or bar) and circles, each placed on the 1080 x 1920 column and timed to appear.', use: 'Anything the other kinds cannot draw: a sequence between two parties, a row of slots, a custom diagram. The content decides the layout. Colours may be the look\'s own (accent, accent2, text, muted, surface, bg, red).',
    example: { kind: 'freeform', step: 'THE REQUEST', elements: [
      { type: 'box', x: 90, y: 480, w: 330, h: 150, radius: 18, fill: 'surface', stroke: 'accent', at: 0.05, motion: 'pop' },
      { type: 'text', text: 'Browser', x: 255, y: 530, size: 46, align: 'center', font: 'display', at: 0.08 },
      { type: 'box', x: 660, y: 480, w: 330, h: 150, radius: 18, fill: 'surface', stroke: 'accent2', at: 0.1, motion: 'pop' },
      { type: 'text', text: 'Server', x: 825, y: 530, size: 46, align: 'center', font: 'display', at: 0.13 },
      { type: 'box', x: 440, y: 553, w: 200, h: 6, fill: 'accent', at: 0.3, motion: 'draw' },
      { type: 'text', text: 'GET /', x: 540, y: 590, size: 34, align: 'center', color: 'muted', font: 'mono', at: 0.35 }],
      caption: 'One request, one answer.', say: 'The browser asks, and the server answers.' } },
  { kind: 'closing', shows: 'The takeaway: a big title, up to three ticked points, and a call to action.', use: 'Always the last scene.',
    example: { kind: 'closing', title: 'A short link is just an ID', points: ['Generate a unique ID', 'Encode it short', 'Cache the redirect'], cta: 'Follow for more', say: 'That is all a short link is: a unique ID, encoded short, and cached.' } },
];

/** A whole example script that uses every kind once, in a sensible order. */
export const explainerExample = (): Record<string, unknown> => ({
  version: '1.0', topic: 'URL SHORTENER', series: 'SYSTEM DESIGN', handle: '@yourhandle', look: 'navy', aspect: '9:16',
  scenes: ['title', 'flow', 'steps', 'compare', 'closing'].map(kind => explainerKindDocs.find(doc => doc.kind === kind)!.example),
});

/** The JSON Schema of an explainer script, for an agent (or an editor) to write against. */
export const explainerJsonSchema = z.toJSONSchema(explainerSchema, { target: 'draft-2020-12', io: 'input' });
