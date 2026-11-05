import { useSyncExternalStore } from 'react';

export type Route =
  | { name: 'showcase' | 'projects' | 'library' | 'settings' }
  | { name: 'new'; template?: string; kind?: string; prompt?: string }
  | { name: 'reset' | 'verify'; token: string }
  | { name: 'making'; id: string; job: string }
  | { name: 'editor'; id: string; tab: string };

const read = () => location.hash;
const subscribe = (fn: () => void) => { window.addEventListener('hashchange', fn); return () => window.removeEventListener('hashchange', fn); };

export function parse(hash: string): Route {
  const clean = hash.replace(/^#\/?/, '');
  const [path, query] = clean.split('?');
  const params = new URLSearchParams(query ?? '');
  const parts = (path ?? '').split('/').filter(Boolean).map(decodeURIComponent);
  if ((parts[0] === 'reset' || parts[0] === 'verify') && parts[1]) return { name: parts[0], token: parts[1] };
  if (parts[0] === 'projects') return { name: 'projects' };
  if (parts[0] === 'showcase') return { name: 'showcase' };
  if (parts[0] === 'new') return { name: 'new', template: params.get('template') ?? undefined, kind: params.get('kind') ?? undefined, prompt: params.get('prompt') ?? undefined };
  if (parts[0] === 'library') return { name: 'library' };
  if (parts[0] === 'settings') return { name: 'settings' };
  if (parts[0] === 'making' && parts[1]) return { name: 'making', id: parts[1], job: parts[2] ?? '' };
  if (parts[0] === 'p' && parts[1]) return { name: 'editor', id: parts[1], tab: parts[2] ?? 'edit' };
  return { name: 'showcase' };
}
export const useRoute = (): Route => parse(useSyncExternalStore(subscribe, read));
export const go = (path: string) => { location.hash = path; };
export const editorPath = (id: string, tab?: string) => `#/p/${encodeURIComponent(id)}${tab ? '/' + tab : ''}`;
