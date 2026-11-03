import { useSyncExternalStore } from 'react';

export type Route = { name: 'projects' | 'new' | 'library' | 'settings' } | { name: 'making'; id: string; job: string } | { name: 'editor'; id: string; tab: string };

const read = () => location.hash;
const subscribe = (fn: () => void) => { window.addEventListener('hashchange', fn); return () => window.removeEventListener('hashchange', fn); };

export function parse(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'new') return { name: 'new' };
  if (parts[0] === 'library') return { name: 'library' };
  if (parts[0] === 'settings') return { name: 'settings' };
  if (parts[0] === 'making' && parts[1]) return { name: 'making', id: parts[1], job: parts[2] ?? '' };
  if (parts[0] === 'p' && parts[1]) return { name: 'editor', id: parts[1], tab: parts[2] ?? 'edit' };
  return { name: 'projects' };
}
export const useRoute = (): Route => parse(useSyncExternalStore(subscribe, read));
export const go = (path: string) => { location.hash = path; };
export const editorPath = (id: string, tab?: string) => `#/p/${encodeURIComponent(id)}${tab ? '/' + tab : ''}`;
