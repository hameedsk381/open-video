import { useEffect, useState } from 'react';
import { modKeyLabel } from './platform';
import { api, connectJobs, useJobs, cleanUserStatus } from './api';
import { CommandPalette } from './CommandPalette';
import { Making, Create } from './pages/Create';
import { Editor } from './pages/Editor';
import { Generation } from './pages/Generation';
import { Home } from './pages/Home';
import { Assets } from './pages/Assets';
import { Settings } from './pages/Library';
import { ProductionPlan } from './pages/ProductionPlan';
import { Projects } from './pages/Projects';
import { Showcase } from './pages/Showcase';
import { AuthPage, TokenPage, type Me } from './pages/Auth';
import { useRoute, type Route } from './router';
import {
  ClockIcon,
  CompassIcon,
  FilmIcon,
  HomeIcon,
  ImagesIcon,
  MenuIcon,
  MoonIcon,
  PlusIcon,
  SearchIcon,
  SlidersIcon,
  SparklesIcon,
  Spinner,
  StudioBrandLogo,
  SunIcon,
  UiProvider,
} from './ui';

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

  useEffect(() => {
    const cycle = () => setMode(current => modes[(modes.indexOf(current) + 1) % modes.length]!);
    window.addEventListener('ove-cycle-theme', cycle);
    return () => window.removeEventListener('ove-cycle-theme', cycle);
  }, []);

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

function ProviderBadge() {
  const [provider, setProvider] = useState<{ id: string; model: string } | null>(null);
  useEffect(() => {
    fetch('/api/status').then(r => r.json()).then(s => {
      if (s?.provider) setProvider(s.provider);
    }).catch(() => {});
  }, []);

  if (!provider) return null;
  const label = provider.id === 'freellmapi' ? 'FreeLLMAPI' : provider.id;
  return (
    <a className="provider" href="#/settings" title={`AI Motion Engine: ${label}`}>
      <span className="provider-dot" />
      <span className="lbl">{label}</span>
    </a>
  );
}

const nav = [
  ['home', '#/', 'Home', HomeIcon] as const,
  ['new', '#/new', 'Create', PlusIcon] as const,
  ['projects', '#/projects', 'Projects', FilmIcon] as const,
  ['library', '#/library', 'Assets', ImagesIcon] as const,
  ['generation', '#/generation', 'Generation', ClockIcon] as const,
  ['showcase', '#/discover', 'Discover', CompassIcon] as const,
];

const sections: Record<Route['name'], string> = {
  home: 'Home',
  showcase: 'Discover',
  projects: 'Projects',
  library: 'Assets',
  generation: 'Generation',
  settings: 'Settings',
  new: 'Create',
  reset: 'Account',
  verify: 'Account',
  making: 'Production',
  production: 'Production plan',
  editor: 'Studio',
};

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

function Sidebar({ route, session, onSignOut }: { route: Route; session: Session; onSignOut: () => void }) {
  return (
    <aside className="sidebar">
      <a className="side-brand" href="#/">
        <StudioBrandLogo size={26} />
        <span className="side-brand-text">
          <b>MotionRender</b>
          <small>Studio</small>
        </span>
      </a>

      <div className="workspace-card">
        <span className="ws-mark">P</span>
        <span className="ws-text">
          <b>Personal studio</b>
          <small>{session.state === 'in' ? session.user.email : 'Local workspace'}</small>
        </span>
      </div>

      <nav className="side-nav">
        <span className="nav-label">Workspace</span>
        {nav.map(([name, href, label, Icon]) => (
          <a key={name} href={href} className={route.name === name ? 'on' : ''} title={label}>
            <Icon size={16} />
            <span>{label}</span>
          </a>
        ))}
      </nav>

      <div className="side-foot">
        <a href="#/settings" className={`side-link ${route.name === 'settings' ? 'on' : ''}`} title="Settings">
          <SlidersIcon size={15} />
          <span>Settings</span>
        </a>
        <ProviderBadge />
        <ThemeToggle />
        {session.state === 'in' ? (
          <div className="side-user">
            <span className="avatar">{session.user.email.slice(0, 1).toUpperCase()}</span>
            <span className="ws-text">
              <b>{session.user.email.split('@')[0]}</b>
              <small>{session.user.verified ? 'Verified account' : 'Member'}</small>
            </span>
            <button className="btn ghost sm" onClick={onSignOut} title={session.user.email}>Sign out</button>
          </div>
        ) : (
          <div className="side-user">
            <span className="avatar"><SparklesIcon size={13} /></span>
            <span className="ws-text">
              <b>Local studio</b>
              <small>Everything stays on this machine</small>
            </span>
          </div>
        )}
        <div className="side-meta">MotionRender Engine</div>
      </div>
    </aside>
  );
}

export function App() {
  const [session, setSession] = useSession();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (session.state === 'local' || session.state === 'in') return connectJobs();
  }, [session.state]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(open => !open);
      } else if (event.key === 'Escape') {
        setPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const route = useRoute();
  const jobs = useJobs();
  const running = Object.values(jobs).filter(job => job.status === 'running' || job.status === 'queued')[0];

  useEffect(() => { setNavOpen(false); }, [route]);

  const signOut = () => {
    api('/api/auth/logout', {}).then(() => {
      setSession({ state: 'out', signups: true });
      location.hash = '#/';
    });
  };

  const screen = (
    <>
      {session.state === 'loading' ? (
        <div className="center"><Spinner size={32} /></div>
      ) : route.name === 'reset' || route.name === 'verify' ? (
        <TokenPage kind={route.name} token={route.token} />
      ) : session.state === 'out' ? (
        <AuthPage signups={session.signups} onSignedIn={user => setSession({ state: 'in', user })} />
      ) : route.name === 'home' ? (
        <Home email={session.state === 'in' ? session.user.email : undefined} />
      ) : route.name === 'showcase' ? (
        <Showcase />
      ) : route.name === 'new' ? (
        <Create initialTemplate={route.template} initialKind={route.kind} initialPrompt={route.prompt} />
      ) : route.name === 'making' ? (
        <Making id={route.id} job={route.job} />
      ) : route.name === 'production' ? (
        <ProductionPlan key={route.id} id={route.id} section={route.section} />
      ) : route.name === 'generation' ? (
        <Generation />
      ) : route.name === 'editor' ? (
        <Editor key={route.id} id={route.id} tab={route.tab} />
      ) : route.name === 'library' ? (
        <Assets />
      ) : route.name === 'settings' ? (
        <Settings />
      ) : (
        <Projects />
      )}
    </>
  );

  const standalone = session.state === 'out' || route.name === 'reset' || route.name === 'verify';

  if (standalone) {
    return (
      <UiProvider>
        <main className="main auth-shell">{screen}</main>
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      </UiProvider>
    );
  }

  return (
    <UiProvider>
      <div className={`shell ${navOpen ? 'nav-open' : ''}`}>
        <Sidebar route={route} session={session} onSignOut={signOut} />
        <button className="scrim" aria-label="Close navigation" onClick={() => setNavOpen(false)} />

        <div className="shell-main">
          <header className="topbar">
            <button className="nav-toggle" onClick={() => setNavOpen(true)} aria-label="Open navigation">
              <MenuIcon size={18} />
            </button>
            <div className="crumb">
              <span>Workspace</span>
              <span className="crumb-sep">/</span>
              <b>{sections[route.name]}</b>
            </div>

            <button className="palette-trigger" onClick={() => setPaletteOpen(true)} title={`Search projects or jump to (${modKeyLabel('K')})`}>
              <SearchIcon size={15} />
              <span className="search-lbl">Search or jump to…</span>
              <kbd className="kbd-pill">{modKeyLabel('K')}</kbd>
            </button>

            <div className="grow" />

            {running ? (
              <div className="busy" title={cleanUserStatus(running.messages.at(-1))}>
                <Spinner size={12} />
                <span>{cleanUserStatus(running.messages.at(-1))}</span>
              </div>
            ) : null}

            {/* One filled button per view: only Discover and Assets have no primary action of their own, so the global shortcut steps back everywhere else. */}
            <a className={`btn ${['showcase', 'library'].includes(route.name) ? 'primary' : 'secondary'} sm`} href="#/new">
              <PlusIcon size={14} />
              <span>New video</span>
            </a>
          </header>

          <main className={`main ${route.name === 'editor' || route.name === 'production' ? 'fixed' : ''}`}>
            {screen}
          </main>
        </div>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </UiProvider>
  );
}
