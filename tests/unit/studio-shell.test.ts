import { describe, expect, it } from 'vitest';
import { filterCommands } from '../../apps/studio/src/commands';
import { parse } from '../../apps/studio/src/router';

describe('studio shell routes', () => {
  it('serves Discover at both aliases and Home at the root', () => {
    expect(parse('#/discover')).toEqual({ name: 'showcase' });
    expect(parse('#/showcase')).toEqual({ name: 'showcase' });
    expect(parse('#/')).toEqual({ name: 'home' });
    expect(parse('')).toEqual({ name: 'home' });
  });

  it('carries the prompt typed on the Home composer into Create', () => {
    expect(parse('#/new?prompt=Launch%20film')).toEqual({ name: 'new', template: undefined, kind: undefined, prompt: 'Launch film' });
  });

  it('keeps editor and production-plan paths stable', () => {
    expect(parse('#/p/abc')).toEqual({ name: 'editor', id: 'abc', tab: 'edit' });
    expect(parse('#/p/abc/plan/shots')).toEqual({ name: 'production', id: 'abc', section: 'shots' });
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
