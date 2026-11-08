// The designs on the Create page: what a small business is making, not which template is filled. Each design names
// the shipped template behind it and the few details only the customer knows, and turns those into a brief.

export type DesignField = {
  key: string;
  label: string;
  placeholder: string;
  hint?: string;
  required?: boolean;
  multiline?: boolean;
};

export type Design = {
  id: string;
  title: string;
  summary: string;
  template: string;
  kind: 'reel' | 'product' | 'promo';
  aspect: '9:16' | '1:1' | '4:5' | '16:9';
  length: string;
  art: [string, string];
  fields: DesignField[];
  brief: (values: Record<string, string>, extra: string) => string;
};

const lines = (...items: Array<string | false | undefined>) => items.filter(Boolean).join('\n');
const bullets = (value: string) => value.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => `- ${line}`).join('\n');
const reader = (values: Record<string, string>) => (key: string) => (values[key] ?? '').trim();
const closing = 'Use only these details; do not invent dates, prices or claims.';

export const designs: Design[] = [
  {
    id: 'social-reel',
    title: 'Instagram reel',
    summary: 'A short vertical video for a product, a tip or a quick story.',
    template: 'hook-reel',
    kind: 'reel',
    aspect: '9:16',
    length: '17s',
    art: ['#ff3cac', '#6d28d9'],
    fields: [
      { key: 'brand', label: 'Brand or creator', placeholder: 'Ember & Oak', required: true },
      { key: 'hook', label: 'The hook', placeholder: 'Three ways to make candles last longer', required: true, hint: 'The first line viewers see. Make it specific to what you are showing.' },
      { key: 'points', label: 'Three quick things to show', placeholder: 'Trim the wick every burn\nBurn for two hours at a time\nStore away from sunlight', multiline: true, hint: 'One per line. The reel numbers them for you.' },
      { key: 'close', label: 'Closing line', placeholder: 'Shop the ritual at emberandoak.com' },
    ],
    brief: (values, extra) => {
      const v = reader(values);
      return lines(
        `A vertical social reel for ${v('brand')}.`,
        v('hook') && `The hook: ${v('hook')}`,
        v('points') && `Things to show:\n${bullets(v('points'))}`,
        v('close') && `Closing line or call to action: ${v('close')}`,
        extra && `Anything else: ${extra}`,
        closing,
      );
    },
  },
  {
    id: 'sale-announcement',
    title: 'Sale announcement',
    summary: 'A punchy offer with perks, a deadline and a promo code.',
    template: 'sale-flash',
    kind: 'reel',
    aspect: '9:16',
    length: '9s',
    art: ['#ef4444', '#f59e0b'],
    fields: [
      { key: 'business', label: 'Business name', placeholder: 'Ember & Oak', required: true },
      { key: 'offer', label: 'The offer', placeholder: '30% off every candle', required: true, hint: 'What the viewer gets, in as few words as possible.' },
      { key: 'perks', label: 'Reasons to buy', placeholder: 'Free shipping over $50\nGift wrapping included\nNew seasonal scents', multiline: true, hint: 'One per line. Three works best.' },
      { key: 'ends', label: 'Sale ends', placeholder: 'Sunday 15 June' },
      { key: 'code', label: 'Promo code', placeholder: 'WARM30' },
      { key: 'website', label: 'Where to buy', placeholder: 'emberandoak.com' },
    ],
    brief: (values, extra) => {
      const v = reader(values);
      return lines(
        `A sale announcement for ${v('business')}.`,
        v('offer') && `The offer: ${v('offer')}`,
        v('perks') && `Reasons to buy:\n${bullets(v('perks'))}`,
        v('ends') && `The sale ends: ${v('ends')}`,
        v('code') && `Promo code: ${v('code')}`,
        v('website') && `Website: ${v('website')}`,
        extra && `Anything else: ${extra}`,
        closing,
      );
    },
  },
  {
    id: 'new-product',
    title: 'New product',
    summary: 'A square launch video with the promise, three features and the price.',
    template: 'product-spotlight',
    kind: 'product',
    aspect: '1:1',
    length: '12s',
    art: ['#38bdf8', '#4f46e5'],
    fields: [
      { key: 'product', label: 'Product name', placeholder: 'The Aurora Candle', required: true },
      { key: 'promise', label: 'What it does, in one line', placeholder: 'A candle that burns clean for 60 hours', required: true },
      { key: 'features', label: 'Three things that make it different', placeholder: 'Soy wax, no soot\nHand-poured in small batches\nRefillable glass jar', multiline: true, hint: 'One per line.' },
      { key: 'price', label: 'Price', placeholder: '$38' },
      { key: 'website', label: 'Where to buy', placeholder: 'emberandoak.com' },
    ],
    brief: (values, extra) => {
      const v = reader(values);
      return lines(
        `A product launch for ${v('product')}.`,
        v('promise') && `What it does: ${v('promise')}`,
        v('features') && `What makes it different:\n${bullets(v('features'))}`,
        v('price') && `Price: ${v('price')}`,
        v('website') && `Website: ${v('website')}`,
        extra && `Anything else: ${extra}`,
        closing,
      );
    },
  },
  {
    id: 'event-invite',
    title: 'Event invite',
    summary: 'A portrait invitation with the date, place and what is happening.',
    template: 'event-promo',
    kind: 'promo',
    aspect: '4:5',
    length: '9s',
    art: ['#f59e0b', '#db2777'],
    fields: [
      { key: 'event', label: 'Event name', placeholder: 'The Slow Craft Fair', required: true },
      { key: 'date', label: 'Date and time', placeholder: 'Saturday 24 May, 10am–6pm', required: true },
      { key: 'place', label: 'Place', placeholder: 'Kraftwerk Berlin', required: true },
      { key: 'audience', label: 'Who it is for', placeholder: 'Makers, designers and anyone who loves handmade things' },
      { key: 'highlights', label: 'What is happening', placeholder: '20 makers and their stalls\nLive pottery demonstrations\nEvening talks and music', multiline: true, hint: 'Speakers, sessions or activities, one per line.' },
      { key: 'website', label: 'Where to RSVP', placeholder: 'slowcraftfair.com' },
    ],
    brief: (values, extra) => {
      const v = reader(values);
      return lines(
        `An invitation to ${v('event')}.`,
        v('date') && `Date and time: ${v('date')}`,
        v('place') && `Place: ${v('place')}`,
        v('audience') && `Who it is for: ${v('audience')}`,
        v('highlights') && `What is happening:\n${bullets(v('highlights'))}`,
        v('website') && `Website: ${v('website')}`,
        extra && `Anything else: ${extra}`,
        closing,
      );
    },
  },
  {
    id: 'quote-card',
    title: 'Quote card',
    summary: 'Words worth sharing, set on a designed square card.',
    template: 'quote-card',
    kind: 'product',
    aspect: '1:1',
    length: '7s',
    art: ['#0ea5e9', '#0f766e'],
    fields: [
      { key: 'quote', label: 'The quote', placeholder: 'Good design is as little design as possible.', required: true, multiline: true },
      { key: 'author', label: 'Who said it', placeholder: 'Dieter Rams', required: true },
      { key: 'role', label: 'Their role or company', placeholder: 'Industrial designer' },
    ],
    brief: (values, extra) => {
      const v = reader(values);
      return lines(
        `A quote card.`,
        v('quote') && `The quote: "${v('quote')}"`,
        v('author') && `Said by: ${v('author')}`,
        v('role') && `Their role: ${v('role')}`,
        extra && `Anything else: ${extra}`,
        closing,
      );
    },
  },
  {
    id: 'stats-story',
    title: 'Stats story',
    summary: 'Three big numbers that make your point in seconds.',
    template: 'stats-showcase',
    kind: 'promo',
    aspect: '16:9',
    length: '11s',
    art: ['#22c55e', '#0284c7'],
    fields: [
      { key: 'story', label: 'What the story is about', placeholder: 'Our first year in numbers', required: true },
      { key: 'numbers', label: 'Three numbers', placeholder: '40% — less energy used\n12,000 — new customers\n4.9 — average rating', required: true, multiline: true, hint: 'One per line, written as "number — what it means".' },
      { key: 'closing', label: 'Closing line', placeholder: 'See the full report' },
    ],
    brief: (values, extra) => {
      const v = reader(values);
      return lines(
        `A results story: ${v('story')}.`,
        v('numbers') && `Numbers to show:\n${bullets(v('numbers'))}`,
        v('closing') && `Closing line: ${v('closing')}`,
        extra && `Anything else: ${extra}`,
        closing,
      );
    },
  },
  {
    id: 'how-to',
    title: 'How-to video',
    summary: 'A four-step tutorial with a progress rail and a result.',
    template: 'tutorial-steps',
    kind: 'promo',
    aspect: '16:9',
    length: '26s',
    art: ['#8b5cf6', '#0891b2'],
    fields: [
      { key: 'goal', label: 'What does it teach?', placeholder: 'How to brew pour-over coffee at home', required: true },
      { key: 'steps', label: 'The four steps', placeholder: 'Rinse the filter with hot water\nAdd 20g of medium-ground coffee\nPour 60g of water and wait 30 seconds\nPour the rest slowly in circles', required: true, multiline: true, hint: 'One per line, with a short explanation if it helps.' },
      { key: 'result', label: 'What they get at the end', placeholder: 'A clean, bright cup in four minutes' },
      { key: 'website', label: 'Where to learn more', placeholder: 'emberandoak.com/brew-guide' },
    ],
    brief: (values, extra) => {
      const v = reader(values);
      return lines(
        `A how-to video: ${v('goal')}.`,
        v('steps') && `Steps:\n${bullets(v('steps'))}`,
        v('result') && `The result: ${v('result')}`,
        v('website') && `Website: ${v('website')}`,
        extra && `Anything else: ${extra}`,
        closing,
      );
    },
  },
  {
    id: 'logo-sting',
    title: 'Logo sting',
    summary: 'A four-second brand intro with your name and tagline.',
    template: 'logo-sting',
    kind: 'promo',
    aspect: '16:9',
    length: '4s',
    art: ['#64748b', '#1e293b'],
    fields: [
      { key: 'name', label: 'Brand name', placeholder: 'Ember & Oak', required: true },
      { key: 'tagline', label: 'Tagline', placeholder: 'Light the everyday', required: true },
    ],
    brief: (values, extra) => {
      const v = reader(values);
      return lines(
        `A logo sting for ${v('name')}.`,
        v('tagline') && `Tagline: ${v('tagline')}`,
        extra && `Anything else: ${extra}`,
        closing,
      );
    },
  },
  {
    id: 'kinetic-words',
    title: 'Kinetic words',
    summary: 'Four huge words and a closing line. Pure type, no pictures.',
    template: 'kinetic-type',
    kind: 'reel',
    aspect: '9:16',
    length: '9s',
    art: ['#f43f5e', '#7c3aed'],
    fields: [
      { key: 'words', label: 'Four words to flash', placeholder: 'Make, ship, learn, repeat', required: true, hint: 'Separate them with commas or new lines.' },
      { key: 'message', label: 'The line to land on', placeholder: 'Start your first project today', required: true },
      { key: 'website', label: 'Where to send people', placeholder: 'emberandoak.com' },
    ],
    brief: (values, extra) => {
      const v = reader(values);
      return lines(
        `A kinetic type video.`,
        v('words') && `Words to flash, in order: ${v('words')}`,
        v('message') && `Closing line: ${v('message')}`,
        v('website') && `Website: ${v('website')}`,
        extra && `Anything else: ${extra}`,
        closing,
      );
    },
  },
];

export const designById = (id: string) => designs.find(design => design.id === id);
export const designForTemplate = (template?: string) => template ? designs.find(design => design.template === template) : undefined;

/** The brief a design's details add up to: the opening line, one line per filled field, then the optional note. */
export const designBrief = (design: Design, values: Record<string, string>, extra = '') => design.brief(values, extra.trim());

/** A project name from the first required detail, so "Ember & Oak sale announcement" rather than the whole brief. */
export function designName(design: Design, values: Record<string, string>): string {
  const first = design.fields.find(field => field.required && (values[field.key] ?? '').trim());
  const head = first ? (values[first.key] ?? '').replace(/\s+/g, ' ').trim() : '';
  const name = `${head} ${design.title}`.replace(/\s+/g, ' ').trim();
  return name.length > 70 ? name.slice(0, 70).trim() : name;
}

/** The required fields still empty, by label, so the form can say what to add. */
export const missingFields = (design: Design, values: Record<string, string>) =>
  design.fields.filter(field => field.required && !(values[field.key] ?? '').trim()).map(field => field.label);
