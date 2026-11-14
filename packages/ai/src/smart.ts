// The routing that turns a brief into a video, kept out of any one host: whether the planner's beats are written as React motion code or as a
// JSON composition, and how a narrated video is cut to its voiceover.
//
// This used to live in the CLI, which meant anything that composed videos (the studio's job queue, a deployed worker, an MCP server) had to
// depend on the CLI to get the same routing. What a host can offer is injected instead, so the rules stay in one place.
import { contentSchema, type VideoContent } from '@ove/schema';
import type { AiProvider } from './providers';
import { writeContent } from './content';
import { composeVideo, type ComposeOptions, type ComposeResult } from './compose';
import { planBuild, type BuildPlan } from './plan';
import { brandLook, mergeLook } from './brand-look';
import type { Registry } from './registry';

/** What a host can offer the router: a catalogue to plan against and, locally, a way to write React. */
export type ComposeSource = {
  /** The capability list the planner is shown; absent means no planning, just the built-in routing. */
  registry?: () => Promise<Registry>;
  /**
   * Writes the video as React code when the plan asks for it. Only a host that will run the generated code itself (the
   * local CLI and studio) supplies this: a hosted worker must never offer it, because the brief would decide what
   * JavaScript runs on the operator's machine.
   */
  react?: (plan: BuildPlan, options: ComposeOptions, mode: SmartMode) => Promise<SmartResult>;
};

export type SmartMode = {
  /** Write a full composition instead of letting the planner choose. */
  full?: boolean;
  /** Skip the planner and write a composition directly. */
  noPlan?: boolean;
  /** A ready registry instead of asking the source for one (tests and hosts that cache it). */
  registry?: Registry;
};

export type SmartResult = ComposeResult & { source?: Record<string, unknown>; /** How the video was produced, for surfaces that explain the result. */ route?: 'json' | 'react' };

/**
 * Compose a video: the planner decides the route and, for a JSON video, supplies the beats the composition must follow. Where the host can
 * write React (it will run the code itself) a designed video is written as React; anything else is a full JSON composition.
 */
export async function composeSmart(provider: AiProvider, options: ComposeOptions, source: ComposeSource, mode: SmartMode = {}): Promise<SmartResult> {
  // Content first: the script and its evidence are written (or supplied) before design.
  let content: VideoContent | undefined = options.content === false ? undefined : options.content && contentSchema.parse(options.content);
  if (!content && options.content !== false) {
    options.onProgress?.('Writing the script and checking its sources…');
    content = await writeContent(provider, {
      brief: options.brief,
      durationSeconds: options.durationSeconds,
      kind: options.kind,
      language: options.language,
      sources: options.sources,
      research: options.research,
      maxAttempts: Math.min(options.maxAttempts ?? 2, 2),
      signal: options.signal,
      onProgress: options.onProgress,
    });
    if (content) options.onProgress?.(`Script ready: ${content.beats.length} beats, ${content.sources.length} source${content.sources.length === 1 ? '' : 's'}.`);
  }
  const { content: _requested, ...withoutContent } = options;
  const scripted = content ? { ...withoutContent, content } : withoutContent;
  const needsFull = mode.full || !!options.fields?.length || (options.assets ?? []).some(asset => asset.type !== 'image');
  let plan: BuildPlan | undefined;
  if (!mode.noPlan && !mode.full && (mode.registry || source.registry)) {
    const registry = mode.registry ?? await source.registry!();
    try { plan = await planBuild(provider, { ...scripted, registry, allowReact: Boolean(source.react), brand: options.brand, maxAttempts: Math.min(options.maxAttempts ?? 2, 2) }); }
    catch (error) { options.onProgress?.(`Planning skipped (${(error as Error).message.split('\n')[0]}); using the built-in routing.`); }
  }
  // A brand's colours and fonts are not a suggestion: they replace the planner's, field by field, on every route.
  const brandStyle = brandLook(options.brand);
  if (plan && brandStyle) plan = { ...plan, look: mergeLook(plan.look, brandStyle) };
  // A video is written as React wherever the host can run the code (it executes inside the renderer). The planner's own "json" answer
  // is not honoured, and a failed React build is an error, not a quiet switch to a composition. JSON authoring is left only for what
  // React cannot express: a host that cannot run code, batch variable fields, non-image assets, or an explicit `full`.
  if (!needsFull && source.react) {
    const reactPlan: BuildPlan = plan
      ? { ...plan, path: 'react' }
      : { path: 'react', idea: options.brief, beats: (content?.beats ?? []).map(beat => ({ name: beat.name, onScreen: beat.onScreen, seconds: beat.seconds, motion: beat.motion })), reasons: [] };
    options.onProgress?.('Writing this video as React motion code…');
    let made;
    try { made = await source.react(reactPlan, scripted, mode); }
    catch (error) { throw new Error(`React authoring failed: ${(error as Error).message}`); }
    // The script travels in the composition whatever route built it, so narration and captions later derive from it.
    const composition = content ? { ...made.composition, content } : made.composition;
    return { ...made, composition, attempts: made.attempts + 1, route: 'react' };
  }
  // The planner's beats and art direction become the motion plan the composition must follow, so planning is never wasted.
  const motionPlan = plan ? { idea: plan.idea, beats: plan.beats, look: plan.look, ...(content ? { content } : {}) } : (content ? { beats: content.beats.map(beat => ({ name: beat.name, onScreen: beat.onScreen, seconds: beat.seconds, motion: beat.motion })), ...(brandStyle ? { look: brandStyle } : {}), content } : undefined);
  return { ...(await composeVideo(provider, { ...scripted, plan: options.plan || motionPlan !== undefined, motionPlan })), route: 'json' };
}
