import { describe, expect, it } from 'vitest';
import { loadComposition } from '@ove/schema';
import { fillTemplate, type ThemeChoice } from '@ove/ai';
import { addBlock, applyTheme, emptyComposition, listBlocks, listThemes, readBlock, readTheme, themeDefaults, themeTokens } from '../../packages/cli/src/blocks';
import { listTemplates, templateChoices } from '../../packages/cli/src/templates';

// Blocks are reusable scenes and overlays sized from the canvas; themes are the colours they read. Every block must work in every
// theme and on every shape of video, and a template made of blocks must be a valid composition on its own.
const sizes: [number, number][] = [[1920, 1080], [1080, 1920], [1080, 1080]];

describe('blocks and themes', () => {
  it('ship a starter set that is complete and consistent', async () => {
    const [blocks, themes] = [await listBlocks(), await listThemes()];
    expect(blocks.length).toBeGreaterThanOrEqual(12); expect(themes.map(theme => theme.id)).toEqual(expect.arrayContaining(['midnight', 'paper', 'neon', 'espresso', 'signal']));
    for (const theme of themes) expect(Object.keys(theme.variables).sort(), theme.id).toEqual([...themeTokens].sort());
    expect((await readTheme('midnight')).variables).toEqual(themeDefaults.variables);
    expect(new Set(blocks.map(block => block.id)).size).toBe(blocks.length);
  });

  it('fit every theme and every canvas shape', async () => {
    const [blocks, themes] = [(await listBlocks()).filter(b => b.category !== 'effect' && b.category !== 'base'), await listThemes()];
    for (const [width, height] of sizes) for (const theme of themes) {
      let raw: any = emptyComposition('t', width, height); applyTheme(raw, theme);
      for (const block of blocks.filter(b => b.kind === 'scene')) raw = addBlock(raw, block).composition;
      for (const block of blocks.filter(b => b.kind === 'overlay')) raw = addBlock(raw, block, { scene: raw.scenes[0].id }).composition;
      const composition = loadComposition(raw);
      expect(composition.scenes.length, `${width}x${height} ${theme.id}`).toBe(blocks.filter(b => b.kind === 'scene').length);
      expect(composition.durationFrames).toBeGreaterThan(0);
    }
  }, 120_000);

  it('has the effect library, each effect fitting a vertical and a landscape video over footage', async () => {
    const blocks = await listBlocks(), effects = blocks.filter(b => b.category === 'effect');
    expect(effects.length).toBeGreaterThanOrEqual(41);
    for (const id of ['fx-glass-cards', 'fx-duo-title', 'fx-icon-orbit', 'fx-stats-split', 'fx-spotlight', 'fx-checklist', 'fx-timeline', 'fx-command-bridge', 'fx-captions', 'fx-highlighter', 'fx-strike-rewrite', 'fx-glitch-title', 'fx-extruded-title', 'fx-typewriter-quote', 'fx-day-to-night', 'fx-light-leak', 'fx-duotone', 'fx-clone-wall', 'fx-pull-out', 'fx-punch-in', 'fx-notifications', 'fx-chat', 'fx-before-after', 'fx-counter-hero', 'fx-map-journey', 'fx-step-tracker', 'fx-split-reveal', 'fx-gallery', 'fx-cta-card', 'fx-neon-outline', 'fx-color-pop', 'fx-background-swap', 'fx-sticker-freeze', 'fx-tracked-label', 'fx-grade-look', 'fx-letterbox', 'fx-shake-hit', 'fx-progress-ring', 'fx-ticker', 'fx-lens-flare', 'fx-rgb-flash']) expect(effects.map(b => b.id), id).toContain(id);
    const footage = blocks.find(b => b.id === 'footage')!, signal = await readTheme('signal');
    for (const [width, height] of sizes.slice(0, 2)) for (const effect of effects) {
      let raw: any = emptyComposition('fx', width, height); applyTheme(raw, signal);
      raw = addBlock(raw, footage, { set: { src: 'clip.mp4' }, frames: 120 }).composition;
      raw = effect.kind === 'overlay' ? addBlock(raw, effect, { scene: 'footage', frames: effect.durationFrames }).composition : addBlock(raw, effect, { set: 'footage' in effect.params ? { footage: 'clip.mp4' } : {} }).composition;
      expect(loadComposition(raw).durationFrames, `${effect.id} ${width}x${height}`).toBeGreaterThan(0);
    }
  }, 180_000);

  it('add a scene block as editable JSON, with chosen text', async () => {
    const first = addBlock(emptyComposition('v', 1920, 1080), await readBlock('title-hero'), { set: { headline: 'Hello world' } });
    const second = addBlock(first.composition, await readBlock('title-hero'), { set: { headline: 'Again' } });
    expect(second.composition.components.title_hero.params.headline).toBeDefined();
    expect(second.composition.scenes.map((scene: any) => scene.id)).toEqual(['title-hero', 'title-hero-2']);
    expect(second.composition.scenes[0].layers[0]).toMatchObject({ use: 'title_hero', with: { headline: 'Hello world' } });
    expect(second.composition.scenes[1].transitionIn).toBeDefined(); expect(second.composition.scenes[0].transitionIn).toBeUndefined();
    expect(loadComposition(second.composition).durationFrames).toBe(120 + 120 - 16);
    expect(first.composition.variables.accent.default).toBe('#22d3ee');
  });

  it('add an overlay inside a scene, sized to fit it', async () => {
    const withScene = addBlock(emptyComposition('v', 1080, 1920), await readBlock('big-stat')).composition;
    const result = addBlock(withScene, await readBlock('progress-bar'), { at: 10 });
    const placed = result.composition.scenes[0].layers.at(-1);
    expect(placed).toMatchObject({ use: 'progress_bar', startFrame: 10, endFrame: 90, with: { frames: 80 } });
    const badge = await readBlock('badge');
    expect(() => addBlock(emptyComposition('v', 1080, 1920), badge)).toThrow(/goes inside a scene/);
  });

  it('refuse unknown parameters, wrong types and missing blocks', async () => {
    const block = await readBlock('big-stat'), bar = await readBlock('progress-bar');
    expect(() => addBlock(emptyComposition('v', 1920, 1080), block, { set: { nope: 'x' } })).toThrow(/no parameter "nope"/);
    expect(() => addBlock(addBlock(emptyComposition('v', 1920, 1080), block).composition, bar, { set: { frames: 'many' } })).toThrow(/expected a number/);
    await expect(readBlock('ghost')).rejects.toThrow(/no block "ghost"/);
    await expect(readTheme('ghost')).rejects.toThrow(/no theme "ghost"/);
  });

  it('switch a theme without touching other variables', async () => {
    const raw = addBlock(emptyComposition('v', 1920, 1080), await readBlock('quote')).composition;
    raw.variables.mine = { type: 'string', default: 'keep' };
    applyTheme(raw, await readTheme('neon'));
    expect(raw.variables.accent.default).toBe('#ff3cac'); expect(raw.variables.mine.default).toBe('keep');
    expect(loadComposition(raw).scenes).toHaveLength(1);
  });
});

describe('templates made of blocks', () => {
  it('are valid, cover the video shapes, and take a theme', async () => {
    const infos = await listTemplates(), ids = infos.map(info => info.id);
    for (const id of ['launch-wide', 'story-tall', 'explainer-square', 'keynote-wide', 'product-wide', 'showcase-tall']) expect(ids).toContain(id);
    const choices = await templateChoices(), themed = choices.filter(choice => choice.themed);
    expect(themed.map(choice => choice.id).sort()).toEqual(['explainer-square', 'keynote-wide', 'launch-wide', 'product-wide', 'showcase-tall', 'story-tall']);
    const neon = await readTheme('neon') as ThemeChoice, launch = themed.find(choice => choice.id === 'launch-wide')!;
    const composition = fillTemplate(launch, { title: 'Hello there' }, neon);
    expect(JSON.stringify(composition)).toContain('Hello there'); expect(JSON.stringify(composition)).toContain('#ff3cac');
  });
});

