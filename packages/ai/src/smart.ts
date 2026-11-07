// The routing that turns a brief into a video, kept out of any one host: which template fits, whether the planner's
// beats should be filled or written, how a template's own length is stretched to the brief, and what happens when a
// template's pictures and sounds have to travel with the composition.
//
// This used to live in the CLI, which meant anything that composed videos — the studio's job queue, a deployed worker,
// an MCP server — had to depend on the CLI's template folder to get the same routing. The catalogues and the file
// copies are injected instead, so the host says where templates come from and the rules stay in one place.
import { describeError, reviewComposition, type ReviewIssue } from '@ove/core';
import { contentSchema, type VideoContent } from '@ove/schema';
import type { AiProvider } from './providers';
import { writeContent } from './content';
import { composeVideo, type ComposeOptions, type ComposeResult } from './compose';
import { planBuild, type BuildPlan } from './plan';
import { brandLook, mergeLook } from './brand-look';
import { copyProblems } from './copy';
import { composeFromTemplate, type TemplateChoice, type ThemeChoice } from './template';
import { retimeComposition } from './retime';
import type { Registry } from './registry';
import { narrate, type NarrateOptions, type NarrateResult } from './narrate';
import { narrateScenes } from './voiceover';

/** What a host can offer the router: catalogues to pick from and a way to move a template's files. */
export type TemplateSource = {
  /** The templates available here, already read and described. */
  templates: () => Promise<TemplateChoice[]>;
  /** Palettes a themed template can be re-skinned with; absent means templates are used as they ship. */
  themes?: () => Promise<ThemeChoice[]>;
  /** The capability list the planner is shown; absent means no planning, just the built-in routing. */
  registry?: () => Promise<Registry>;
  /**
   * Copies the template's own pictures and sounds next to the new composition so its relative paths resolve. Throwing
   * is how a host says "these files did not travel"; the router reports it rather than shipping a video with holes in it.
   */
  copyAssets?: (templateId: string, destDir: string) => Promise<void>;
  /**
   * Writes the video as React code when the plan asks for it. Only a host that will run the generated code itself (the
   * local CLI and studio) supplies this: a hosted worker must never offer it, because the brief would decide what
   * JavaScript runs on the operator's machine.
   */
  react?: (plan: BuildPlan, options: ComposeOptions, mode: SmartMode) => Promise<SmartResult>;
};

export type SmartMode = {
  /** Write a full composition instead of filling a template. */
  full?: boolean;
  /** Skip the planner and use the template-first routing directly. */
  noPlan?: boolean;
  /** A ready registry instead of asking the source for one (tests and hosts that cache it). */
  registry?: Registry;
  theme?: string;
  template?: string;
};

export type SmartResult = ComposeResult & { template?: string; source?: Record<string, unknown>; /** How the video was produced, for surfaces that explain the result. */ route?: 'template' | 'json' | 'react' };

/** A template was named and the catalogue has no such id. Thrown past the template fallback: a named template that
 *  cannot be filled must not be quietly replaced by a different video. */
class UnknownTemplateError extends Error {
  constructor(id: string, available: string[]) {
    super(`There is no template "${id}". Available templates: ${available.sort().join(', ')}.`);
    this.name = 'UnknownTemplateError';
  }
}

/**
 * Runs the renderer's design review over a filled template. Errors and warnings are returned as issues; warnings are
 * also copied into `warnings` so a surface that only reads notes still says something changed or is wrong. A review
 * that cannot run leaves the video unchecked and says so — it must not throw away a composition that was already made.
 */
async function reviewTemplate(composition: ComposeResult['composition'], options: ComposeOptions, warnings: string[]): Promise<ReviewIssue[]> {
  if (!options.review) return [];
  options.onProgress?.('Reviewing the template with the renderer…');
  try {
    const review = await reviewComposition(composition, { baseDir: options.baseDir ?? process.cwd(), audio: false, allowCode: true });
    warnings.push(...review.issues.filter(issue => issue.severity === 'warning').map(issue => issue.message));
    return review.issues;
  } catch (error) {
    warnings.push(`The design review could not run: ${describeError(error)}. The video is unchecked.`);
    return [];
  }
}

/**
 * Compose by filling a ready-made template — the primary path, chosen whenever a template's kind and aspect fit the
 * brief — and write the whole composition only when that cannot work: `full` was asked for, assets or batch fields
 * were supplied (templates use neither), no template has the wanted shape, or the model finds none that suits the
 * brief. Before either path, the planner (plan.ts) decides the route and, for a JSON video, supplies the beats the
 * composition must follow. Planning failure or `noPlan` keeps the same template-first routing.
 */
export async function composeSmart(provider: AiProvider, options: ComposeOptions, source: TemplateSource, mode: SmartMode = {}): Promise<SmartResult> {
  // Content first: the script and its evidence are written (or supplied) before design. Templates take pictures but not
  // sounds or clips, and have no batch fields; anything else needs a full composition.
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
  if (!mode.noPlan && !mode.full && !mode.template && (mode.registry || source.registry)) {
    const registry = mode.registry ?? await source.registry!();
    try { plan = await planBuild(provider, { ...scripted, registry, allowReact: Boolean(source.react), brand: options.brand, maxAttempts: Math.min(options.maxAttempts ?? 2, 2) }); }
    catch (error) { options.onProgress?.(`Planning skipped (${(error as Error).message.split('\n')[0]}); using the built-in routing.`); }
  }
  // A brand's colours and fonts are not a suggestion: they replace the planner's, field by field, on every route.
  const brandStyle = brandLook(options.brand);
  if (plan && brandStyle) plan = { ...plan, look: mergeLook(plan.look, brandStyle) };
  // The planner found no template or block composition that fits and the host can author code: this is the video the
  // brief describes. A failed authoring attempt falls back to a written composition rather than losing the job; an
  // explicit template or full composition still outranks the plan.
  // Which way a designed video is made. The planner chooses, but a weak one answers "json" for nearly everything, and then every video
  // is a few text cards on a coloured field. Where the host can write React (it will run the code itself), a video the planner did not
  // give to a template is written as React; a failed build still falls back to a composition. OVE_AI_ROUTE=planner honours the
  // planner's "json", and OVE_AI_ROUTE=json never writes React.
  const route = (process.env.OVE_AI_ROUTE ?? '').trim().toLowerCase();
  const promoted = plan?.path === 'json' && route !== 'planner';
  if (!needsFull && !mode.template && source.react && route !== 'json' && (plan?.path === 'react' || promoted)) {
    options.onProgress?.(promoted ? 'Writing this video as React motion code (the default for designed videos)…' : 'Writing this video as React motion code…');
    try {
      const made = await source.react(plan!, scripted, mode);
      // The script travels in the composition whatever route built it, so narration and captions later derive from it.
      const composition = content ? { ...made.composition, content } : made.composition;
      return { ...made, composition, attempts: made.attempts + 1, route: 'react' };
    } catch (error) {
      options.onProgress?.(`React authoring failed (${(error as Error).message.split('\n')[0]}); writing a full composition instead.`);
    }
  }
  // A refusal to plan keeps the safest pre-planner behaviour: try the template catalogue first, else write from scratch.
  const templatePath = (plan ? plan.path === 'template' : !needsFull) || Boolean(mode.template);
  if (templatePath && !needsFull) {
    try {
      const choices = await source.templates();
      // An explicit template is an instruction, not a preference: it is filled by id even when its canvas differs from
      // the brief's (the layout only works at its own size), and an id that does not exist is an error rather than a
      // reason to fill some other template or write a free-form video instead.
      const forced = mode.template ? choices.find(choice => choice.id === mode.template) : undefined;
      if (mode.template && !forced) throw new UnknownTemplateError(mode.template, choices.map(choice => choice.id));
      const targetTemplateId = mode.template ?? plan?.template;
      const picked = targetTemplateId ? (forced ? [forced] : choices.filter(choice => choice.id === targetTemplateId)) : choices;
      const allThemes = source.themes ? await source.themes() : [];
      const targetThemeId = mode.theme ?? plan?.theme;
      const themes = targetThemeId ? allThemes.filter(theme => theme.id === targetThemeId) : allThemes;
      const filled = await composeFromTemplate(provider, picked.length ? picked : choices, {
        ...scripted,
        ...(forced ? { width: forced.width, height: forced.height, chosen: true } : {}),
        themes: themes.length ? themes : allThemes,
        look: plan?.look ?? brandStyle,
      });
      if (filled) {
        // A template keeps its own length unless the brief asked for another: stretch or trim the resolved
        // composition to fit. The saved source stays the untouched template only when no retiming happened —
        // retimed timing is bespoke, so the plain composition is saved instead (it stays fully editable).
        const wanted = options.durationSeconds;
        const current = filled.composition.durationFrames / filled.composition.fps;
        let composition = filled.composition, sourceSaved: Record<string, unknown> | undefined = filled.source;
        const warnings = [...filled.warnings];
        if (forced && (options.width !== forced.width || options.height !== forced.height)) {
          warnings.push(`The ${forced.id} template is ${forced.width}×${forced.height}, so the video uses the template's canvas instead of ${options.width}×${options.height}.`);
        }
        if (wanted && Math.abs(wanted - current) > 0.25) {
          composition = retimeComposition(filled.composition, wanted);
          sourceSaved = undefined;
          warnings.push(`Retimed the ${filled.template} template from ${current.toFixed(1)} s to ${wanted.toFixed(1)} s; saved as a plain composition (the timing is now bespoke).`);
          options.onProgress?.(`Retiming the template from ${current.toFixed(1)} s to ${wanted.toFixed(1)} s.`);
        }
        // A template references its own files relatively, so they have to sit next to the composition it was filled into.
        if (options.baseDir && source.copyAssets) {
          try {
            await source.copyAssets(filled.template, options.baseDir);
          } catch (error) {
            warnings.push(`The template's own files could not be copied to ${options.baseDir}: ${(error as Error).message.split('\n')[0]} Its pictures or sounds may be missing from previews and the render.`);
            options.onProgress?.('The template assets could not be copied next to the composition; see the warnings.');
          }
        }
        // A template is a fixed layout filled with copy the model wrote, so the design review cannot feed corrections back
        // between attempts the way the free-form loop does. It still runs: a bad fill has to reach the caller with its
        // faults rather than pass as a clean job. Files were copied first, so the review sees the pictures the render will.
        // A template is filled with copy the model wrote; it cannot be repaired here, but a required line it lost is worth saying.
        warnings.push(...copyProblems(options.brief, composition, (content?.beats ?? []).map(beat => beat.name)).map(problem => `Copy: ${problem.message}`));
        const issues = await reviewTemplate(composition, options, warnings);
        return { composition, source: sourceSaved, attempts: filled.attempts + (plan ? 1 : 0), issues, warnings, template: filled.template, route: 'template' };
      }
      options.onProgress?.('No template suits this brief; writing a full composition.');
    } catch (error) {
      if (error instanceof UnknownTemplateError) throw error;
      options.onProgress?.(`Template mode failed (${(error as Error).message.split('\n')[0]}); writing a full composition.`);
    }
  }
  // The planner's beats and art direction become the motion plan the composition must follow, so planning is never
  // wasted — including when a template was planned but could not be filled and the video is written from scratch.
  const motionPlan = plan ? { idea: plan.idea, beats: plan.beats, look: plan.look, ...(content ? { content } : {}) } : (content ? { beats: content.beats.map(beat => ({ name: beat.name, onScreen: beat.onScreen, seconds: beat.seconds, motion: beat.motion })), ...(brandStyle ? { look: brandStyle } : {}), content } : undefined);
  return { ...(await composeVideo(provider, { ...scripted, plan: options.plan || motionPlan !== undefined, motionPlan })), route: 'json' };
}

/**
 * Narrate a composed video. A template video is cut to the voiceover (one spoken line per scene, scenes as long as their line);
 * a free-form composition gets one script over the whole video, as before.
 */
export async function narrateSmart(provider: AiProvider, composed: { template?: string }, options: NarrateOptions & { brief: string; composition: NonNullable<NarrateOptions['composition']> }): Promise<NarrateResult> {
  if (composed.template) {
    try {
      const voiced = await narrateScenes(provider, options.composition, { brief: options.brief, outDir: options.outDir, compositionPath: options.compositionPath, voice: options.voice, language: options.language, signal: options.signal, onProgress: options.onProgress });
      return { audio: voiced.audio, captions: voiced.captions, durationSeconds: voiced.durationSeconds, words: voiced.words, composition: voiced.composition, text: voiced.text };
    } catch (error) {
      options.onProgress?.(`Scene-by-scene voiceover failed (${(error as Error).message.split('\n')[0]}); narrating one script over the video.`);
    }
  }
  return narrate(provider, options);
}
