import { useEffect, useState } from 'react';
import { api } from '../api';
import { go } from '../router';
import { Button, Field, Notice } from '../ui';

export type Me = { id: string; email: string; verified: boolean };
type Mode = 'signin' | 'signup' | 'forgot';

/** Sign in, sign up and password reset, for a hosted studio. Everything goes to /api/auth/*. */
export function AuthPage({ onSignedIn, signups }: { onSignedIn: (user: Me) => void; signups: boolean }) {
  const [mode, setMode] = useState<Mode>('signin'), [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [note, setNote] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setNote(''); setBusy(true);
    try {
      if (mode === 'forgot') { await api('/api/auth/forgot', { email }); setNote('If that address has an account, we have sent a link to choose a new password.'); }
      else { const r = await api<{ user: Me }>(mode === 'signup' ? '/api/auth/signup' : '/api/auth/login', { email, password }); onSignedIn(r.user); }
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const title = mode === 'signup' ? 'Create your account' : mode === 'forgot' ? 'Reset your password' : 'Sign in to OVE';
  return <div className="center" style={{ maxWidth: 400 }}>
    <h2 style={{ marginBottom: 20 }}>{title}</h2>
    <form onSubmit={submit} style={{ textAlign: 'left' }}>
      <Field label="Email"><input className="input" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} autoFocus /></Field>
      {mode !== 'forgot' ? <Field label="Password" hint={mode === 'signup' ? 'At least 10 characters.' : undefined}><input className="input" type="password" required autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} /></Field> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}{note ? <Notice>{note}</Notice> : null}
      <Button variant="primary" size="lg" loading={busy} type="submit" style={{ width: '100%' }}>{mode === 'signup' ? 'Create account' : mode === 'forgot' ? 'Send reset link' : 'Sign in'}</Button>
    </form>
    <p className="sub" style={{ marginTop: 20 }}>
      {mode === 'signin' ? <>{signups ? <>New here? <a className="link" onClick={() => setMode('signup')}>Create an account</a> · </> : null}<a className="link" onClick={() => setMode('forgot')}>Forgot your password?</a></> : <a className="link" onClick={() => setMode('signin')}>Back to sign in</a>}
    </p>
  </div>;
}

/** The page behind the link in a reset or confirmation email. */
export function TokenPage({ kind, token }: { kind: 'reset' | 'verify'; token: string }) {
  const [password, setPassword] = useState(''), [state, setState] = useState<'idle' | 'busy' | 'done'>(kind === 'verify' ? 'busy' : 'idle'), [error, setError] = useState('');
  useEffect(() => { if (kind === 'verify') api('/api/auth/verify', { token }).then(() => setState('done'), e => { setError(e.message); setState('idle'); }); }, [kind, token]);
  const reset = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setState('busy');
    try { await api('/api/auth/reset', { token, password }); setState('done'); } catch (e) { setError((e as Error).message); setState('idle'); }
  };
  if (state === 'done') return <div className="center"><h2>{kind === 'reset' ? 'Password changed' : 'Email confirmed'}</h2><p className="sub">{kind === 'reset' ? 'Sign in with your new password.' : 'Thanks, you are all set.'}</p><Button variant="primary" onClick={() => { location.hash = '#/'; location.reload(); }}>Continue</Button></div>;
  if (kind === 'verify') return <div className="center">{error ? <Notice tone="error">{error}</Notice> : <p className="sub">Confirming your email…</p>}<Button onClick={() => go('#/')}>Back</Button></div>;
  return <div className="center" style={{ maxWidth: 400 }}><h2 style={{ marginBottom: 20 }}>Choose a new password</h2>
    <form onSubmit={reset} style={{ textAlign: 'left' }}><Field label="New password" hint="At least 10 characters."><input className="input" type="password" required autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} autoFocus /></Field>
      {error ? <Notice tone="error">{error}</Notice> : null}<Button variant="primary" size="lg" type="submit" loading={state === 'busy'} style={{ width: '100%' }}>Change password</Button></form></div>;
}
