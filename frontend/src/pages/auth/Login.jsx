import React, { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import AuthLayout, { AuthField, PasswordField } from './AuthLayout.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useUi } from '../../context/UiContext.jsx';

export default function Login({ goto }) {
  const { login } = useAuth();
  const { toast } = useUi();
  const saved = localStorage.getItem('rescom_remember') || '';
  const [username, setUsername] = useState(saved);
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(Boolean(saved));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      await login(username, password);
      if (remember) localStorage.setItem('rescom_remember', username);
      else localStorage.removeItem('rescom_remember');
      toast('Welcome back!', 'ok');
    } catch (problem) {
      setError(problem.message || 'Could not sign in.');
    } finally { setBusy(false); }
  }

  return (
    <AuthLayout>
      <p className="auth-eyebrow">STAFF WORKSPACE</p>
      <h1>Welcome back.</h1>
      <p className="auth-subtitle">Sign in to continue to RESCOM.</p>
      <form className="auth-form" onSubmit={submit}>
        <AuthField label="Email or username" autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false} value={username} onChange={event => setUsername(event.target.value)} required />
        <PasswordField autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required />
        <div className="auth-form-row">
          <label className="auth-check"><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} /> Remember me</label>
          <button type="button" className="auth-link" onClick={() => goto('forgot')}>Forgot password?</button>
        </div>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button type="submit" className="auth-primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'} <ArrowRight size={17} /></button>
      </form>
      <p className="auth-switch">New to RESCOM? <button type="button" className="auth-link" onClick={() => goto('register')}>Create an account</button></p>
    </AuthLayout>
  );
}
