import { useEffect, useState } from 'react';
import { api } from '../api';
import { go } from '../router';
import { Button, Field, Notice, StudioBrandLogo } from '../ui';

export type Me = { id: string; email: string; verified: boolean };
type Mode = 'signin' | 'signup' | 'forgot';

export function AuthPage({ onSignedIn, signups }: { onSignedIn: (user: Me) => void; signups: boolean }) {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setNote('');
    setBusy(true);
    try {
      if (mode === 'forgot') {
        await api('/api/auth/forgot', { email });
        setNote('If that email has an account, we sent instructions to reset your password.');
      } else {
        const r = await api<{ user: Me }>(mode === 'signup' ? '/api/auth/signup' : '/api/auth/login', {
          email,
          password,
        });
        onSignedIn(r.user);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const title = mode === 'signup' ? 'Create your Studio account' : mode === 'forgot' ? 'Reset your password' : 'Sign in to MotionRender Studio';

  return (
    <div className="center" style={{ maxWidth: 420 }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
        <StudioBrandLogo size={42} />
      </div>
      <h2 style={{ marginBottom: 8 }}>{title}</h2>
      <p className="sub" style={{ marginBottom: 24 }}>
        {mode === 'signup'
          ? 'Start creating broadcast-grade motion graphics in minutes.'
          : mode === 'forgot'
            ? 'Enter your account email to receive a recovery link.'
            : 'Welcome back. Access your video workspaces and creative projects.'}
      </p>

      <form onSubmit={submit} style={{ textAlign: 'left' }}>
        <Field label="Email Address">
          <input
            className="input"
            type="email"
            autoComplete="email"
            required
            placeholder="you@company.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoFocus
          />
        </Field>

        {mode !== 'forgot' ? (
          <Field label="Password" hint={mode === 'signup' ? 'At least 10 characters.' : undefined}>
            <input
              className="input"
              type="password"
              required
              placeholder="••••••••••••"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </Field>
        ) : null}

        {error ? <Notice tone="error" title="Authentication notice">{error}</Notice> : null}
        {note ? <Notice tone="success">{note}</Notice> : null}

        <div style={{ marginTop: 20 }}>
          <Button variant="primary" size="lg" loading={busy} type="submit" style={{ width: '100%' }}>
            {mode === 'signup' ? 'Create Account' : mode === 'forgot' ? 'Send Reset Link' : 'Sign In'}
          </Button>
        </div>
      </form>

      <p className="sub" style={{ marginTop: 22 }}>
        {mode === 'signin' ? (
          <>
            {signups ? (
              <>
                New to MotionRender? <a className="link" onClick={() => setMode('signup')}>Create an account</a> ·{' '}
              </>
            ) : null}
            <a className="link" onClick={() => setMode('forgot')}>Forgot your password?</a>
          </>
        ) : (
          <a className="link" onClick={() => setMode('signin')}>← Back to sign in</a>
        )}
      </p>
    </div>
  );
}

export function TokenPage({ kind, token }: { kind: 'reset' | 'verify'; token: string }) {
  const [password, setPassword] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'done'>(kind === 'verify' ? 'busy' : 'idle');
  const [error, setError] = useState('');

  useEffect(() => {
    if (kind === 'verify') {
      api('/api/auth/verify', { token }).then(
        () => setState('done'),
        e => {
          setError(e.message);
          setState('idle');
        }
      );
    }
  }, [kind, token]);

  const reset = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setState('busy');
    try {
      await api('/api/auth/reset', { token, password });
      setState('done');
    } catch (e) {
      setError((e as Error).message);
      setState('idle');
    }
  };

  if (state === 'done') {
    return (
      <div className="center">
        <h2>{kind === 'reset' ? 'Password Updated' : 'Email Confirmed'}</h2>
        <p className="sub">
          {kind === 'reset' ? 'You can now sign in with your new password.' : 'Your account is verified and ready.'}
        </p>
        <Button variant="primary" onClick={() => { location.hash = '#/'; location.reload(); }}>
          Continue to Studio
        </Button>
      </div>
    );
  }

  if (kind === 'verify') {
    return (
      <div className="center">
        {error ? <Notice tone="error">{error}</Notice> : <p className="sub">Confirming your email address…</p>}
        <Button onClick={() => go('#/')}>Back to Home</Button>
      </div>
    );
  }

  return (
    <div className="center" style={{ maxWidth: 420 }}>
      <h2 style={{ marginBottom: 12 }}>Choose a new password</h2>
      <p className="sub" style={{ marginBottom: 20 }}>
        Please enter your new secure password below.
      </p>

      <form onSubmit={reset} style={{ textAlign: 'left' }}>
        <Field label="New Password" hint="At least 10 characters.">
          <input
            className="input"
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoFocus
          />
        </Field>
        {error ? <Notice tone="error">{error}</Notice> : null}
        <Button variant="primary" size="lg" type="submit" loading={state === 'busy'} style={{ width: '100%', marginTop: 14 }}>
          Update Password
        </Button>
      </form>
    </div>
  );
}
