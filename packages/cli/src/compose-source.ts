// What the CLI offers the router in @ove/ai: the capability list built from its own block catalogue, and, on a machine that runs the video
// itself, the React authoring route.
import { listBlocks } from './blocks';
import { reactFromPlan } from './react-video';
import { buildRegistry, composeSmart as routeComposition, type AiProvider, type ComposeOptions, type ComposeSource, type Registry, type SmartMode, type SmartResult } from '@ove/ai';

/** The capability registry built from this package's own catalogue (blocks) plus the built-in effects, sounds and React kit @ove/ai adds. Read by the planner and `ove ai capabilities`. */
export async function cliRegistry(): Promise<Registry> {
  const blocks = await listBlocks();
  return buildRegistry({ blocks: blocks.map(block => ({ id: block.id, name: block.name, description: block.description, category: block.category, kind: block.kind, durationFrames: block.durationFrames })) });
}

export const cliComposeSource: ComposeSource = { registry: cliRegistry };

/**
 * Compose with this CLI's catalogue; the routing itself lives in @ove/ai so every host shares it. `allowReact` adds the React authoring
 * route, and only surfaces that run on the user's own machine may pass it: the generated component executes JavaScript inside the renderer.
 */
export async function composeSmart(provider: AiProvider, options: ComposeOptions, mode: SmartMode = {}, allowReact = false): Promise<SmartResult> {
  return routeComposition(provider, options, allowReact
    ? { ...cliComposeSource, react: (plan, reactOptions, reactMode) => reactFromPlan(provider, plan, reactOptions, reactMode) }
    : cliComposeSource, mode);
}
