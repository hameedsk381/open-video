import { useEffect, useState } from 'react';
import { connectJobs, useJobs } from './api';
import { Making, Create } from './pages/Create';
import { Editor } from './pages/Editor';
import { Library, Settings } from './pages/Library';
import { Projects } from './pages/Projects';
import { AuthPage, TokenPage, type Me } from './pages/Auth';
import { api } from './api';
import { useRoute } from './router';
import { FilmIcon, LayersIcon, MoonIcon, PlusIcon, SlidersIcon, Spinner, StudioBrandLogo, SunIcon, UiProvider } from './ui';

type Mode = 'dark' | 'light' | 'system';
const modes: Mode[] = ['dark', 'light', 'system'];

const apply = (mode: Mode) => {
  document.documentElement.dataset.theme = mode === 'system'
    ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    : mode;
};

function ThemeToggle() {
  const [mode, setMode] = useState<Mode>(() => {
    try { return (localStorage.getItem('ove-theme') as Mode) || 'dark'; } catch { return 'dark'; }
  });

  useEffect(() => {
    apply(mode);
    try { localStorage.setItem('ove-theme', mode); } catch { /* private window */ }
    if (mode !== 'system') return;
    const query = matchMedia('(prefers-color-scheme: light)');
    const follow = () => apply('system');
    query.addEventListener('change', follow);
    return () => query.removeEventListener('change', follow);
  }, [mode]);

  const label = { dark: 'Dark', light: 'Light', system: 'Auto' }[mode];

  return (
    <button
      className="btn ghost sm theme"
      title={`Theme: ${label}. Click to switch.`}
      onClick={() => setMode(modes[(modes.indexOf(mode) + 1) % modes.length]!)}
    >
      {mode === 'dark' ? <MoonIcon size={14} /> : mode === 'light' ? <SunIcon size={14} /> : <span style={{ fontSize: 13 }}>◐</span>}
      <span className="lbl">{label}</span>
    </button>
  );
}

const nav = [
  ['projects', '#/', 'Projects', FilmIcon] as const,
  ['library', '#/library', 'Library', LayersIcon] as const,
  ['settings', '#/settings', 'Settings', SlidersIcon] as const,
];

type Session = { state: 'loading' } | { state: 'local' } | { state: 'out'; signups: boolean } | { state: 'in'; user: Me };

function useSession() {
  const [session, setSession] = useState<Session>({ state: 'loading' });
  useEffect(() => {
    fetch('/api/auth/me').then(async r => {
      if (!r.ok) return setSession({ state: 'local' });
      const j = await r.json();
      setSession(j.user ? { state: 'in', user: j.user } : { state: 'out', signups: j.signups !== false });
    }, () => setSession({ state: 'local' }));

    const out = () => setSession(current => current.state === 'in' ? { state: 'out', signups: true } : current);
    window.addEventListener('ove-signed-out', out);
    return () => window.removeEventListener('ove-signed-out', out);
  }, []);
  return [session, setSession] as const;
}

export function App() {
  const [session, setSession] = useSession();
  useEffect(() => {
    if (session.state === 'local' || session.state === 'in') return connectJobs();
  }, [session.state]);

  const route = useRoute();
  const jobs = useJobs();
  const running = Object.values(jobs).filter(j => j.status === 'running' || j.status === 'queued')[0];
  const section = route.name === 'new' || route.name === 'making' || route.name === 'editor' ? 'projects' : route.name;

  return (
    <UiProvider>
      <div className="shell">
        <header className="topbar">
          <a className="brand" href="#/">
            <StudioBrandLogo size={24} />
            <div className="brand-title">
              <span>Open Video</span>
              <span className="brand-badge">Studio</span>
            </div>
          </a>

          <nav className="navtabs">
            {nav.map(([name, href, label, Icon]) => (
              <a key={name} href={href} className={section === name ? 'on' : ''}>
                <Icon size={14} />
                <span>{label}</span>
              </a>
            ))}
          </nav>

          <div className="grow" />

          {running ? (
            <div className="busy">
              <Spinner size={12} />
              <span>{running.messages.at(-1) ?? `Processing video…`}</span>
            </div>
          ) : null}

          <ThemeToggle />

          {session.state === 'in' ? (
            <button
              className="btn ghost sm"
              title={session.user.email}
              onClick={() => api('/api/auth/logout', {}).then(() => { setSession({ state: 'out', signups: true }); location.hash = '#/'; })}
            >
              Sign out
            </button>
          ) : null}

          <a className="btn primary sm" href="#/new">
            <PlusIcon size={14} />
            <span>New Video</span>
          </a>
        </header>

        <main className={`main ${route.name === 'editor' ? 'fixed' : ''}`}>
          {session.state === 'loading' ? (
            <div className="center"><Spinner size={32} /></div>
          ) : route.name === 'reset' || route.name === 'verify' ? (
            <TokenPage kind={route.name} token={route.token} />
          ) : session.state === 'out' ? (
            <AuthPage signups={session.signups} onSignedIn={user => setSession({ state: 'in', user })} />
          ) : route.name === 'new' ? (
            <Create />
          ) : route.name === 'making' ? (
            <Making id={route.id} job={route.job} />
          ) : route.name === 'editor' ? (
            <Editor key={route.id} id={route.id} tab={route.tab} />
          ) : route.name === 'library' ? (
            <Library />
          ) : route.name === 'settings' ? (
            <Settings />
          ) : (
            <Projects />
          )}
        </main>
      </div>
    </UiProvider>
  );
}
