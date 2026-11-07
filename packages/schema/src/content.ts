import { z } from 'zod';

// The content layer: what the video actually says and the data it says it with. Scenes are visuals, the planner is
// design, and this is the meaning both derive from. Every number or claim that needs a citation names a source here.

/** A page or dataset the claims came from. `quote` is the verified excerpt, not model paraphrase. */
export const contentSourceSchema = z.object({
  id: z.string().min(1).describe('Referenced by beats and data, e.g. "s1"'),
  title: z.string().optional(),
  url: z.url().optional().describe('Where it was read from'),
  publisher: z.string().optional(),
  retrievedAt: z.string().optional().describe('ISO date the page was read'),
  quote: z.string().optional().describe('The exact excerpt that backs the claims using this source'),
});

/** One figure in the script, with where it came from. */
export const contentDatumSchema = z.object({
  label: z.string().min(1).describe('What the number is, e.g. "global EV sales"'),
  value: z.union([z.string().min(1), z.number()]).describe('The figure as it should appear, e.g. "17.2M" or 17.2'),
  unit: z.string().optional().describe('Million, %, days'),
  period: z.string().optional().describe('2025, Q3, 2019-2024'),
  sourceIds: z.array(z.string()).default([]).describe('Sources backing this figure'),
});

/** One narrative beat: the spoken line, the on-screen line, and the evidence behind them. */
export const contentBeatSchema = z.object({
  id: z.string().min(1).describe('Stable id, referenced by the scene that renders it'),
  name: z.string().min(1).describe('Hook, Problem, Proof, Offer, Call to action'),
  seconds: z.number().positive().optional().describe('How long this beat should take'),
  narration: z.string().optional().describe('The words spoken here; joined in order into the voiceover'),
  onScreen: z.string().min(1).describe('The copy the viewer reads, not a description of a picture'),
  claim: z.string().optional().describe('The factual assertion this beat makes, if any'),
  data: z.array(contentDatumSchema).default([]).describe('Figures shown in this beat'),
  sourceIds: z.array(z.string()).default([]).describe('Sources backing the claim'),
  motion: z.string().optional().describe('Optional entrance for this beat, such as rise or pop'),
});

export const contentSchema = z.object({
  audience: z.string().optional().describe('Who this is for'),
  promise: z.string().optional().describe('What the viewer gets, in one line'),
  cta: z.string().optional().describe('What they should do next'),
  sources: z.array(contentSourceSchema).default([]),
  beats: z.array(contentBeatSchema).min(1).max(24),
}).superRefine((content, ctx) => {
  const sourceIds = new Set<string>();
  content.sources.forEach((source, index) => {
    if (sourceIds.has(source.id)) ctx.addIssue({ code: 'custom', path: ['sources', index, 'id'], message: `Source id "${source.id}" is used twice` });
    sourceIds.add(source.id);
  });
  const beatIds = new Set<string>();
  const cited = new Set<string>();
  content.beats.forEach((beat, index) => {
    if (beatIds.has(beat.id)) ctx.addIssue({ code: 'custom', path: ['beats', index, 'id'], message: `Beat id "${beat.id}" is used twice` });
    beatIds.add(beat.id);
    if (beat.claim && !beat.sourceIds.length) ctx.addIssue({ code: 'custom', path: ['beats', index, 'sourceIds'], message: `Beat "${beat.id}" makes a claim but cites no source` });
    for (const [position, id] of beat.sourceIds.entries()) {
      cited.add(id);
      if (!sourceIds.has(id)) ctx.addIssue({ code: 'custom', path: ['beats', index, 'sourceIds', position], message: `Beat "${beat.id}" cites "${id}", which is not in sources` });
    }
    beat.data.forEach((datum, datumIndex) => {
      if (!datum.sourceIds.length) ctx.addIssue({ code: 'custom', path: ['beats', index, 'data', datumIndex, 'sourceIds'], message: `"${datum.label}" in beat "${beat.id}" cites no source` });
      datum.sourceIds.forEach((id, position) => {
        cited.add(id);
        if (!sourceIds.has(id)) ctx.addIssue({ code: 'custom', path: ['beats', index, 'data', datumIndex, 'sourceIds', position], message: `"${datum.label}" cites "${id}", which is not in sources` });
      });
    });
  });
  // A cited source without its verified quote is not evidence: the figure could not be checked against it.
  content.sources.forEach((source, index) => {
    if (cited.has(source.id) && !source.quote?.trim()) ctx.addIssue({ code: 'custom', path: ['sources', index, 'quote'], message: `Source "${source.id}" is cited but has no quote` });
  });
});

export type VideoContent = z.infer<typeof contentSchema>;
export type ContentSource = z.infer<typeof contentSourceSchema>;
export type ContentBeat = z.infer<typeof contentBeatSchema>;
export type ContentDatum = z.infer<typeof contentDatumSchema>;

/** The spoken script, in beat order. Empty when the content has no narration at all. */
export function narrationText(content: VideoContent): string {
  return content.beats
    .map(beat => (beat.narration ?? '').trim())
    .filter(Boolean)
    .join('\n\n');
}

/** Beat ids a scene can point at, for prompts and lints. */
export const beatIds = (content: VideoContent): string[] => content.beats.map(beat => beat.id);
