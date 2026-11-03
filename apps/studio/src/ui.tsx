import { createContext, useCallback, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md' | 'lg'; loading?: boolean };
export function Button({ variant = 'secondary', size = 'md', loading, className = '', children, disabled, ...rest }: ButtonProps) {
  return <button className={`btn ${variant} ${size} ${className}`} disabled={disabled || loading} {...rest}>{loading ? <Spinner /> : null}{children}</button>;
}
export const Spinner = () => <span className="spinner" aria-hidden />;
export const Badge = ({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'blue' | 'green' | 'amber' | 'red' }) => <span className={`badge ${tone}`}>{children}</span>;

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="field"><span className="label">{label}</span>{children}{hint ? <span className="hint">{hint}</span> : null}</label>;
}
export const Notice = ({ tone = 'neutral', children }: { tone?: 'neutral' | 'error' | 'warn'; children: ReactNode }) => <div className={`notice ${tone}`}>{children}</div>;
export const Empty = ({ title, children }: { title: string; children?: ReactNode }) => <div className="empty"><h3>{title}</h3>{children}</div>;

export function Page({ title, subtitle, actions, children, narrow }: { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode; narrow?: boolean }) {
  return <div className={`page ${narrow ? 'narrow' : ''}`}>
    <div className="page-head"><div><h1>{title}</h1>{subtitle ? <p className="sub">{subtitle}</p> : null}</div>{actions}</div>{children}</div>;
}

/* Toasts and dialogs live in one provider so any screen can call them. */
type Ui = { toast: (message: string, tone?: 'info' | 'error') => void; ask: (title: string, value: string) => Promise<string | null>; confirm: (message: string, action?: string) => Promise<boolean> };
const UiContext = createContext<Ui>(null as never);
export const useUi = () => useContext(UiContext);

export function UiProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<{ id: number; message: string; tone: string }[]>([]);
  const [dialog, setDialog] = useState<{ kind: 'ask' | 'confirm'; title: string; value: string; action: string; done: (value: any) => void } | null>(null);
  const next = useRef(0);
  const toast = useCallback((message: string, tone: 'info' | 'error' = 'info') => {
    const id = ++next.current; setToasts(list => [...list, { id, message, tone }]);
    setTimeout(() => setToasts(list => list.filter(item => item.id !== id)), tone === 'error' ? 7000 : 2800);
  }, []);
  const ask = useCallback((title: string, value: string) => new Promise<string | null>(done => setDialog({ kind: 'ask', title, value, action: 'Save', done })), []);
  const confirm = useCallback((message: string, action = 'Confirm') => new Promise<boolean>(done => setDialog({ kind: 'confirm', title: message, value: '', action, done })), []);
  const close = (value: unknown) => { dialog?.done(value); setDialog(null); };
  return <UiContext.Provider value={{ toast, ask, confirm }}>
    {children}
    <div className="toasts">{toasts.map(item => <div key={item.id} className={`toast ${item.tone}`}>{item.message}</div>)}</div>
    {dialog ? <Dialog dialog={dialog} close={close} /> : null}
  </UiContext.Provider>;
}

function Dialog({ dialog, close }: { dialog: { kind: string; title: string; value: string; action: string }; close: (value: unknown) => void }) {
  const [value, setValue] = useState(dialog.value), input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); input.current?.select(); }, []);
  const submit = () => close(dialog.kind === 'ask' ? value.trim() || null : true);
  return <div className="overlay" onMouseDown={() => close(dialog.kind === 'ask' ? null : false)}>
    <div className="dialog" role="dialog" onMouseDown={event => event.stopPropagation()} onKeyDown={event => { if (event.key === 'Escape') close(dialog.kind === 'ask' ? null : false); if (event.key === 'Enter') submit(); }}>
      <h3>{dialog.title}</h3>
      {dialog.kind === 'ask' ? <input ref={input} className="input" value={value} onChange={event => setValue(event.target.value)} /> : null}
      <div className="dialog-actions"><Button variant="secondary" onClick={() => close(dialog.kind === 'ask' ? null : false)}>Cancel</Button><Button variant={dialog.kind === 'confirm' ? 'danger' : 'primary'} onClick={submit}>{dialog.action}</Button></div>
    </div></div>;
}
