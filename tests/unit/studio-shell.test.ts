import { describe, expect, it } from 'vitest';
import { filterCommands } from '../../apps/studio/src/commands';
import { designBrief, designById, designName, designs, missingFields } from '../../apps/studio/src/designs';
import { parse } from '../../apps/studio/src/router';



describe('studio shell routes', () => {
  it('serves Discover at both aliases and Home at the root', () => {
    expect(parse('#/discover')).toEqual({ name: 'showcase' });
    expect(parse('#/showcase')).toEqual({ name: 'showcase' });
    expect(parse('#/')).toEqual({ name: 'home' });
    expect(parse('')).toEqual({ name: 'home' });
  });

  it('carries the prompt typed on the Home composer into Create', () => {
    expect(parse('#/new?prompt=Launch%20film')).toEqual({ name: 'new', design: undefined, kind: undefined, prompt: 'Launch film' });
  });

  it('keeps editor and production-plan paths stable', () => {
    expect(parse('#/p/abc')).toEqual({ name: 'editor', id: 'abc', tab: 'edit' });
    expect(parse('#/p/abc/plan/shots')).toEqual({ name: 'production', id: 'abc', section: 'shots' });
  });
});

describe('Create gallery designs', () => {
  it('has a distinct id for every design and opens one by id', () => {
    expect(designs.map(design => design.title)).toEqual(expect.arrayContaining(['Instagram reel', 'Sale announcement', 'New product', 'Event invite']));
    expect(new Set(designs.map(design => design.id)).size).toBe(designs.length);
    expect(designById('sale-announcement')?.title).toBe('Sale announcement');
    expect(designById('nope')).toBeUndefined();
    expect(parse('#/new?design=sale-announcement')).toMatchObject({ name: 'new', design: 'sale-announcement' });
  });

  it('turns the details into a brief with the customer words and no blanks', () => {
    const design = designById('sale-announcement')!;
    const values = { business: 'Ember & Oak', offer: '30% off every candle', perks: 'Free shipping\nGift wrapping', ends: 'Sunday 15 June', code: 'WARM30', website: 'emberandoak.com' };
    const brief = designBrief(design, values, '  Mention the new seasonal scents.  ');
    expect(brief).toContain('A sale announcement for Ember & Oak.');
    expect(brief).toContain('The offer: 30% off every candle');
    expect(brief).toContain('- Free shipping\n- Gift wrapping');
    expect(brief).toContain('Anything else: Mention the new seasonal scents.');
    expect(brief).not.toContain('undefined');
    expect(designName(design, values)).toBe('Ember & Oak Sale announcement');
  });

  it('says which required details are still empty', () => {
    const design = designById('sale-announcement')!;
    expect(missingFields(design, { business: 'Ember & Oak' })).toEqual(['The offer']);
    expect(missingFields(design, { business: 'Ember & Oak', offer: '30% off' })).toEqual([]);
  });
});

describe('command palette filter', () => {
  const commands = [
    { id: 'create', label: 'Create a new video', hint: 'Prompt', group: 'Create', run() {} },
    { id: 'projects', label: 'Open Projects', hint: 'All productions', group: 'Navigate', run() {} },
    { id: 'launch', label: 'Q3 launch film', hint: 'Project', group: 'Projects', run() {} },
  ];

  it('matches every word across label, hint and group', () => {
    expect(filterCommands('launch project', commands).map(command => command.id)).toEqual(['launch']);
    expect(filterCommands('open', commands).map(command => command.id)).toEqual(['projects']);
  });

  it('returns every command for an empty query and nothing when nothing matches', () => {
    expect(filterCommands('   ', commands)).toHaveLength(3);
    expect(filterCommands('zzz', commands)).toHaveLength(0);
  });
});
