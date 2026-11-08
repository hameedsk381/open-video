import { createContext, useCallback, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode, type SVGProps } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'glow';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
};

export function Button({ variant = 'secondary', size = 'md', loading, icon, className = '', children, disabled, ...rest }: ButtonProps) {
  return (
    <button className={`btn ${variant} ${size} ${className}`} disabled={disabled || loading} {...rest}>
      {loading ? <Spinner /> : icon ? <span className="btn-icon">{icon}</span> : null}
      {children ? <span>{children}</span> : null}
    </button>
  );
}

export const Spinner = ({ size = 14 }: { size?: number }) => (
  <span className="spinner" style={{ width: size, height: size }} aria-hidden />
);

export const Badge = ({ children, tone = 'neutral', dot }: { children: ReactNode; tone?: 'neutral' | 'blue' | 'green' | 'amber' | 'red' | 'purple'; dot?: boolean }) => (
  <span className={`badge ${tone}`}>
    {dot ? <span className="badge-dot" /> : null}
    {children}
  </span>
);

export function Field({ label, hint, children }: { label: ReactNode; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      {children}
      {hint ? <span className="hint">{hint}</span> : null}
    </label>
  );
}

export const Notice = ({ tone = 'neutral', title, children, onDismiss }: { tone?: 'neutral' | 'error' | 'warn' | 'success'; title?: string; children: ReactNode; onDismiss?: () => void }) => (
  <div className={`notice ${tone}`}>
    {onDismiss ? <button className="notice-close" aria-label="Dismiss" onClick={onDismiss}>×</button> : null}
    {title ? <b className="notice-title">{title}</b> : null}
    <div className="notice-body">{children}</div>
  </div>
);

export const Empty = ({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) => (
  <div className="empty">
    {icon ? <div className="empty-icon">{icon}</div> : null}
    <h3>{title}</h3>
    {children}
  </div>
);

export const Skeleton = ({ width, height = 20, radius = 6, style }: { width?: string | number; height?: string | number; radius?: number; style?: React.CSSProperties }) => (
  <span className="skeleton" style={{ width, height, borderRadius: radius, ...style }} aria-hidden />
);

export function Page({ title, subtitle, actions, children, narrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; narrow?: boolean }) {
  return (
    <div className={`page ${narrow ? 'narrow' : ''}`}>
      <div className="page-head">
        <div>
          <h1>{title}</h1>
          {subtitle ? <p className="sub">{subtitle}</p> : null}
        </div>
        {actions ? <div className="page-actions">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

/* ==================== SVG Icons ==================== */
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

export const SparklesIcon = ({ size = 16, ...p }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
    <path d="M5 3v4" /><path d="M19 17v4" /><path d="M3 5h4" /><path d="M17 19h4" />
  </svg>
);

export const FilmIcon = ({ size = 16, ...p }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M7 3v18" /><path d="M3 7.5h4" /><path d="M3 12h18" /><path d="M3 16.5h4" /><path d="M17 3v18" /><path d="M17 7.5h4" /><path d="M17 16.5h4" />
  </svg>
);

export const PlayIcon = ({ size = 16, ...p }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...p}>
    <polygon points="6 3 20 12 6 21 6 3" />
  </svg>
);

export const PauseIcon = ({ size = 16, ...p }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...p}>
    <rect x="6" y="4" width="4" height="16" rx="1" />
    <rect x="14" y="4" width="4" height="16" rx="1" />
  </svg>
);

export const StepBackIcon = ({ size = 16, ...p }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...p}>
    <rect x="4" y="4" width="3" height="16" rx="0.5" />
    <polygon points="20 4 8 12 20 20 20 4" />
  </svg>
);

export const StepForwardIcon = ({ size = 16, ...p }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...p}>
    <polygon points="4 4 16 12 4 20 4 4" />
    <rect x="17" y="4" width="3" height="16" rx="0.5" />
  </svg>
);

export const WandIcon = ({ size = 16, ...p }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="m15 4-2 2" /><path d="m15 9-2-2" /><path d="M19 6h.01" /><path d="m9 15-5 5" /><path d="M19.7 13.7 10.3 4.3a2 2 0 0 0-2.8 0L2.3 9.5a2 2 0 0 0 0 2.8l9.4 9.4a2 2 0 0 0 2.8 0l5.2-5.2a2 2 0 0 0 0-2.8Z" />
  </svg>
);

export const PaletteIcon = ({ size = 16, ...p }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
    <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
    <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
    <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.7-.8 1.7-1.7 0-.4-.2-.8-.4-1.1-.3-.4-.5-.8-.5-1.3 0-.9.8-1.7 1.7-1.7H17c2.8 0 5-2.2 5-5 0-6.1-4.5-11.2-10-11.2Z" />
  </svg>
);

export const LayersIcon = ({ size = 16, ...p }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
    <path d="m22 12.5-9.17 4.16a2 2 0 0 1-1.66 0L2 12.5" />
    <path d="m22 17.5-9.17 4.16a2 2 0 0 1-1.66 0L2 17.5" />
  </svg>
);

export const ClockIcon = ({ size = 16, ...p }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
  </svg>
);

export const DownloadIcon = ({ size = 16, ...p }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" />
  </svg>
);

export const TrashIcon = ({ size = 16, ...p }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
  </svg>
);

export const CopyIcon = ({ size = 16, ...p }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </svg>
);

export const SearchIcon = ({ size = 16, ...p }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
  </svg>
);

export const GlobeIcon = ({ size = 16, ...p }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <circle cx="12" cy="12" r="10" /><line x1="2" x2="22" y1="12" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

export const CheckIcon = ({ size = 16, ...p }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export const AlertCircleIcon = ({ size = 16, ...p }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" />
  </svg>
);

export const ArrowLeftIcon = ({ size = 16, ...p }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="m12 19-7-7 7-7" /><path d="M19 12H5" />
  </svg>
);

export const PlusIcon = ({ size = 16, ...p }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M5 12h14" /><path d="M12 5v14" />
  </svg>
);

export const ShieldIcon = ({ size = 16, ...p }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
  </svg>
);

export const SlidersIcon = ({ size = 16, ...p }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <line x1="4" x2="4" y1="21" y2="14" /><line x1="4" x2="4" y1="10" y2="3" /><line x1="12" x2="12" y1="21" y2="12" /><line x1="12" x2="12" y1="8" y2="3" /><line x1="20" x2="20" y1="21" y2="16" /><line x1="20" x2="20" y1="12" y2="3" /><line x1="1" x2="7" y1="14" y2="14" /><line x1="9" x2="15" y1="8" y2="8" /><line x1="17" x2="23" y1="16" y2="16" />
  </svg>
);

export const SunIcon = ({ size = 16, ...p }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" />
  </svg>
);

export const MoonIcon = ({ size = 16, ...p }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
  </svg>
);

export const MusicIcon = ({ size = 16, ...p }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
  </svg>
);

export const VolumeIcon = ({ size = 16, ...p }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
  </svg>
);

export const TypeIcon = ({ size = 16, ...p }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <polyline points="4 7 4 4 20 4 20 7" /><line x1="9" x2="15" y1="20" y2="20" /><line x1="12" x2="12" y1="4" y2="20" />
  </svg>
);

export const HomeIcon = ({ size = 16, ...p }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /><path d="M9 21V12h6v9" />
  </svg>
);

export const CompassIcon = ({ size = 16, ...p }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <circle cx="12" cy="12" r="10" /><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
  </svg>
);

export const ImagesIcon = ({ size = 16, ...p }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <rect width="18" height="18" x="3" y="3" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21" />
  </svg>
);

export const MenuIcon = ({ size = 16, ...p }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <line x1="4" x2="20" y1="6" y2="6" /><line x1="4" x2="20" y1="12" y2="12" /><line x1="4" x2="20" y1="18" y2="18" />
  </svg>
);


/* ==================== Brand Mark / Logo ==================== */
export const StudioBrandLogo = ({ size = 22 }: { size?: number }) => (
  <div className="brand-symbol" style={{ width: size, height: size }} aria-hidden>
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ color: 'var(--text)' }}>
      <path d="M4 4h7.5c4.5 0 8.5 3.5 8.5 8s-4 8-8.5 8H4V4z" fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <polygon points="9,8 16,12 9,16" fill="currentColor" />
    </svg>
  </div>
);

/* ==================== Toasts and dialogs ==================== */
type Ui = {
  toast: (message: string, tone?: 'info' | 'error' | 'success') => void;
  ask: (title: string, value: string) => Promise<string | null>;
  confirm: (message: string, action?: string) => Promise<boolean>;
};

const UiContext = createContext<Ui>(null as never);
export const useUi = () => useContext(UiContext);

export function UiProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<{ id: number; message: string; tone: string }[]>([]);
  const [dialog, setDialog] = useState<{ kind: 'ask' | 'confirm'; title: string; value: string; action: string; done: (value: any) => void } | null>(null);
  const next = useRef(0);

  const toast = useCallback((message: string, tone: 'info' | 'error' | 'success' = 'info') => {
    const id = ++next.current;
    setToasts(list => [...list, { id, message, tone }]);
    setTimeout(() => setToasts(list => list.filter(item => item.id !== id)), tone === 'error' ? 7000 : 3200);
  }, []);

  const ask = useCallback((title: string, value: string) => new Promise<string | null>(done => setDialog({ kind: 'ask', title, value, action: 'Save', done })), []);
  const confirm = useCallback((message: string, action = 'Confirm') => new Promise<boolean>(done => setDialog({ kind: 'confirm', title: message, value: '', action, done })), []);
  const close = (value: unknown) => { dialog?.done(value); setDialog(null); };

  return (
    <UiContext.Provider value={{ toast, ask, confirm }}>
      {children}
      <div className="toasts">
        {toasts.map(item => (
          <div key={item.id} className={`toast ${item.tone}`}>
            {item.tone === 'error' ? <AlertCircleIcon size={16} /> : item.tone === 'success' ? <CheckIcon size={16} /> : <SparklesIcon size={16} />}
            <span>{item.message}</span>
          </div>
        ))}
      </div>
      {dialog ? <Dialog dialog={dialog} close={close} /> : null}
    </UiContext.Provider>
  );
}

function Dialog({ dialog, close }: { dialog: { kind: string; title: string; value: string; action: string }; close: (value: unknown) => void }) {
  const [value, setValue] = useState(dialog.value), input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); input.current?.select(); }, []);
  const submit = () => close(dialog.kind === 'ask' ? value.trim() || null : true);

  return (
    <div className="overlay" onMouseDown={() => close(dialog.kind === 'ask' ? null : false)}>
      <div className="dialog" role="dialog" onMouseDown={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') close(dialog.kind === 'ask' ? null : false); if (e.key === 'Enter') submit(); }}>
        <h3>{dialog.title}</h3>
        {dialog.kind === 'ask' ? <input ref={input} className="input" value={value} onChange={e => setValue(e.target.value)} /> : null}
        <div className="dialog-actions">
          <Button variant="secondary" onClick={() => close(dialog.kind === 'ask' ? null : false)}>Cancel</Button>
          <Button variant={dialog.kind === 'confirm' ? 'danger' : 'primary'} onClick={submit}>{dialog.action}</Button>
        </div>
      </div>
    </div>
  );
}
