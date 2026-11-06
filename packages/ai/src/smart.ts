// The routing that turns a brief into a video, kept out of any one host: which template fits, whether the planner's
// beats should be filled or written, how a template's own length is stretched to the brief, and what happens when a
// template's pictures and sounds have to travel with the composition.
//
// This used to live in the CLI, which meant anything that composed videos — the studio's job queue, a deployed worker,
// an MCP server — had to depend on the CLI's template folder to get the same routing. The catalogues and the file
// copies are injected instead, so the host says where templates come from and the rules stay in one place.
import type { AiProvider } from './providers';
import { composeVideo, type ComposeOptions, type ComposeResult } from './compose';
import { planBuild, type BuildPlan } from './plan';
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

export type SmartResult = ComposeResult & { template?: string; source?: Record<string, unknown> };

/**
 * Compose by filling a ready-made template — the primary path, chosen whenever a template's kind and aspect fit the
 * brief — and write the whole composition only when that cannot work: `full` was asked for, assets or batch fields
 * were supplied (templates use neither), no template has the wanted shape, or the model finds none that suits the
 * brief. Before either path, the planner (plan.ts) decides the route and, for a JSON video, supplies the beats the
 * composition must follow. Planning failure or `noPlan` keeps the same template-first routing.
 */
export async function composeSmart(provider: AiProvider, options: ComposeOptions, source: TemplateSource, mode: SmartMode = {}): Promise<SmartResult> {
  // Templates take pictures but not sounds or clips, and have no batch fields; anything else needs a full composition.
  const needsFull = mode.full || !!options.fields?.length || (options.assets ?? []).some(asset => asset.type !== 'image');
  let plan: BuildPlan | undefined;
  if (!mode.noPlan && !mode.full && !mode.template && (mode.registry || source.registry)) {
    const registry = mode.registry ?? await source.registry!();
    try { plan = await planBuild(provider, { ...options, registry, maxAttempts: Math.min(options.maxAttempts ?? 2, 2) }); }
    catch (error) { options.onProgress?.(`Planning skipped (${(error as Error).message.split('\n')[0]}); using the built-in routing.`); }
  }
  // A refusal to plan keeps the safest pre-planner behaviour: try the template catalogue first, else write from scratch.
  const templatePath = (plan ? plan.path === 'template' : !needsFull) || Boolean(mode.template);
  if (templatePath && !needsFull) {
    try {
      const choices = await source.templates();
      const targetTemplateId = mode.template ?? plan?.template;
      const picked = targetTemplateId ? choices.filter(choice => choice.id === targetTemplateId) : choices;
      const allThemes = source.themes ? await source.themes() : [];
      const targetThemeId = mode.theme ?? plan?.theme;
      const themes = targetThemeId ? allThemes.filter(theme => theme.id === targetThemeId) : allThemes;
      const filled = await composeFromTemplate(provider, picked.length ? picked : choices, { ...options, themes: themes.length ? themes : allThemes });
      if (filled) {
        // A template keeps its own length unless the brief asked for another: stretch or trim the resolved
        // composition to fit. The saved source stays the untouched template only when no retiming happened —
        // retimed timing is bespoke, so the plain composition is saved instead (it stays fully editable).
        const wanted = options.durationSeconds;
        const current = filled.composition.durationFrames / filled.composition.fps;
        let composition = filled.composition, sourceSaved: Record<string, unknown> | undefined = filled.source;
        const warnings = [...filled.warnings];
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
        return { composition, source: sourceSaved, attempts: filled.attempts + (plan ? 1 : 0), issues: [], warnings, template: filled.template };
      }
      options.onProgress?.('No template suits this brief; writing a full composition.');
    } catch (error) {
      options.onProgress?.(`Template mode failed (${(error as Error).message.split('\n')[0]}); writing a full composition.`);
    }
  }
  // The planner's beats become the motion plan the composition must follow, so planning is never wasted.
  const motionPlan = plan && plan.path !== 'template' ? { idea: plan.idea, beats: plan.beats } : undefined;
  return composeVideo(provider, { ...options, plan: options.plan || motionPlan !== undefined, motionPlan });
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
