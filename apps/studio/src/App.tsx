import { useEffect } from 'react';
import { connectJobs, useJobs } from './api';
import { Making, Create } from './pages/Create';
import { Editor } from './pages/Editor';
import { Library, Settings } from './pages/Library';
import { Projects } from './pages/Projects';
import { useRoute } from './router';
import { Spinner, UiProvider } from './ui';

const nav = [['projects', '#/', 'Projects'], ['library', '#/library', 'Library'], ['settings', '#/settings', 'Settings']] as const;

export function App() {
  useEffect(connectJobs, []);
  const route = useRoute(), jobs = useJobs();
  const running = Object.values(jobs).filter(j => j.status === 'running' || j.status === 'queued')[0];
  const section = route.name === 'new' || route.name === 'making' || route.name === 'editor' ? 'projects' : route.name;
  return <UiProvider>
    <div className="shell">
      <header className="topbar">
        <a className="brand" href="#/"><svg viewBox="0 0 24 24"><path d="M12 3 22 21H2z" /></svg><span>OVE</span><span className="slash">/</span><span>AI studio</span></a>
        <nav className="navtabs">{nav.map(([name, href, label]) => <a key={name} href={href} className={section === name ? 'on' : ''}>{label}</a>)}</nav>
        <div className="grow" />
        {running ? <div className="busy"><Spinner /><span>{running.messages.at(-1) ?? `Working on ${running.kind}…`}</span></div> : null}
        <a className="btn primary sm" href="#/new">New video</a>
      </header>
      <main className={`main ${route.name === 'editor' ? 'fixed' : ''}`}>
        {route.name === 'new' ? <Create /> : route.name === 'making' ? <Making id={route.id} job={route.job} /> : route.name === 'editor' ? <Editor key={route.id} id={route.id} tab={route.tab} />
          : route.name === 'library' ? <Library /> : route.name === 'settings' ? <Settings /> : <Projects />}
      </main>
    </div>
  </UiProvider>;
}
