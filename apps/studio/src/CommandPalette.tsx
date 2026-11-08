import { useEffect, useMemo, useRef, useState } from 'react';
import { api, type Project } from './api';
import { filterCommands, type Command } from './commands';
import { editorPath, go } from './router';
import { SearchIcon } from './ui';

const baseCommands = (): Command[] => [
  { id: 'new', label: 'Create a new video', hint: 'Prompt', group: 'Create', run: () => go('#/new') },
  { id: 'home', label: 'Go to Home', hint: 'Dashboard', group: 'Navigate', run: () => go('#/') },
  { id: 'projects', label: 'Open Projects', hint: 'All videos', group: 'Navigate', run: () => go('#/projects') },
  { id: 'library', label: 'Open Assets', hint: 'Templates, themes and blocks', group: 'Navigate', run: () => go('#/library') },
  { id: 'discover', label: 'Browse Discover', hint: 'Example briefs', group: 'Navigate', run: () => go('#/discover') },
  { id: 'settings', label: 'Open Settings', hint: 'Account and advanced options', group: 'Preferences', run: () => go('#/settings') },
  { id: 'theme', label: 'Switch theme', hint: 'Dark, light or auto', group: 'Preferences', run: () => window.dispatchEvent(new Event('ove-cycle-theme')) },
];

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [projects, setProjects] = useState<{ id: string; name: string; seconds: number; modified: number }[]>([]);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    input.current?.focus();
    api<{ projects: Project[] }>('/api/projects').then(
      result => setProjects(result.projects.slice(0, 8).map(project => ({ id: project.id, name: project.name, seconds: project.seconds, modified: project.modified }))),
      () => setProjects([])
    );
  }, [open]);

  const commands = useMemo(() => {
    const projectCommands: Command[] = projects.map(project => ({
      id: `project-${project.id}`,
      label: project.name,
      hint: 'Project',
      group: 'Projects',
      run: () => go(editorPath(project.id)),
    }));
    return filterCommands(query, [...baseCommands(), ...projectCommands]).slice(0, 12);
  }, [query, projects]);

  useEffect(() => { setActive(0); }, [query]);

  if (!open) return null;

  const choose = (command: Command | undefined) => {
    if (!command) return;
    onClose();
    command.run();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!commands.length) return;
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      setActive(current => (current + direction + commands.length) % commands.length);
      return;
    }
    if (event.key === 'Enter') { event.preventDefault(); choose(commands[active]); }
  };

  let lastGroup = '';
  return (
    <div className="palette-overlay" onMouseDown={onClose}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette" onMouseDown={event => event.stopPropagation()}>
        <div className="palette-input">
          <SearchIcon size={16} />
          <input
            ref={input}
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search projects or jump to…"
            aria-label="Search projects or commands"
          />
          <kbd className="kbd-pill">esc</kbd>
        </div>
        <div className="palette-list" role="listbox">
          {commands.map((command, index) => {
            const heading = command.group !== lastGroup ? command.group : '';
            lastGroup = command.group;
            return (
              <div key={command.id}>
                {heading ? <div className="palette-group">{heading}</div> : null}
                <button
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  className={`palette-item ${index === active ? 'on' : ''}`}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(command)}
                >
                  <span>{command.label}</span>
                  {command.hint ? <small>{command.hint}</small> : null}
                </button>
              </div>
            );
          })}
          {commands.length === 0 ? <p className="palette-empty">Nothing matches “{query}”.</p> : null}
        </div>
        <div className="palette-foot">
          <span><kbd className="kbd-pill">↑</kbd> <kbd className="kbd-pill">↓</kbd> to move</span>
          <span><kbd className="kbd-pill">↵</kbd> to open</span>
        </div>
      </div>
    </div>
  );
}
