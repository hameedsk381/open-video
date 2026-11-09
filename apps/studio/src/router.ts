import { useMemo, useSyncExternalStore } from 'react';

export type Route =
  | { name: 'home' | 'showcase' | 'projects' | 'library' | 'settings' | 'generation' | 'explainer' }
  | { name: 'new'; design?: string; kind?: string; prompt?: string; from?: string }
  | { name: 'notfound'; path: string }
  | { name: 'reset' | 'verify'; token: string }
  | { name: 'making'; id: string; job: string }
  | { name: 'editor'; id: string; tab: string }
  | { name: 'production'; id: string; section: string };

const read = () => location.hash;
const subscribe = (fn: () => void) => { window.addEventListener('hashchange', fn); return () => window.removeEventListener('hashchange', fn); };

export function parse(hash: string): Route {
  const clean = hash.replace(/^#\/?/, '');
  const [path, query] = clean.split('?');
  const params = new URLSearchParams(query ?? '');
  const parts = (path ?? '').split('/').filter(Boolean).map(decodeURIComponent);
  if ((parts[0] === 'reset' || parts[0] === 'verify') && parts[1]) return { name: parts[0], token: parts[1] };
  if (parts[0] === 'projects') return { name: 'projects' };
  if (parts[0] === 'showcase' || parts[0] === 'discover') return { name: 'showcase' };
  if (parts[0] === 'new') return { name: 'new', design: params.get('design') ?? undefined, kind: params.get('kind') ?? undefined, prompt: params.get('prompt') ?? undefined, from: params.get('from') ?? undefined };
  if (parts[0] === 'library') return { name: 'library' };
  if (parts[0] === 'generation') return { name: 'generation' };
  if (parts[0] === 'explainer') return { name: 'explainer' };
  if (parts[0] === 'settings') return { name: 'settings' };
  if (parts[0] === 'making' && parts[1]) return { name: 'making', id: parts[1], job: parts[2] ?? '' };
  if (parts[0] === 'p' && parts[1] && parts[2] === 'plan') return { name: 'production', id: parts[1], section: parts[3] ?? 'brief' };
  if (parts[0] === 'p' && parts[1]) return { name: 'editor', id: parts[1], tab: parts[2] ?? 'edit' };
  if (parts.length === 0) return { name: 'home' };
  return { name: 'notfound', path: `/${parts.join('/')}` };
}
export const useRoute = (): Route => {
  const hash = useSyncExternalStore(subscribe, read);
  return useMemo(() => parse(hash), [hash]);
};
export const go = (path: string) => { location.hash = path; };
export const editorPath = (id: string, tab?: string) => `#/p/${encodeURIComponent(id)}${tab ? '/' + tab : ''}`;
export const planPath = (id: string, section = 'brief') => `#/p/${encodeURIComponent(id)}/plan/${section}`;
export const discoverPath = '#/discover';
export const generationPath = '#/generation';

