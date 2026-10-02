import React, { useState } from 'react';
import { User, Lock, Eye, EyeOff } from 'lucide-react';
import { LoginLayout, AuthCard } from './AuthLayout.jsx';
import { Field, Ctrl, TextInput } from '../../components/ui/Field.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useUi } from '../../context/UiContext.jsx';

export default function Login({ goto }) {
  const { login } = useAuth();
  const { toast } = useUi();
  const saved = localStorage.getItem('rescom_remember') || '';
  const [username, setUsername] = useState(saved);
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(!!saved);
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e?.preventDefault();
    if (!username || !password) { setError('Enter your username and password.'); return; }
    setError(''); setBusy(true);
    try {
      await login(username, password);
      remember ? localStorage.setItem('rescom_remember', username) : localStorage.removeItem('rescom_remember');
      toast('Welcome back!', 'ok');
    } catch (err) { setError(err.message); toast(err.message, 'bad'); } finally { setBusy(false); }
  }

  return (
    <LoginLayout>
      <AuthCard>
        <h1 className="text-[28px] font-extrabold text-[#0a1490] text-center">Welcome Back!</h1>
        <p className="text-center text-navy-900/60 text-[13px] mb-6">Login to continue to your account</p>
        <form onSubmit={submit}>
          <Field error={error}><Ctrl icon={<User size={16} />} error={!!error}><TextInput placeholder="Email or Username" value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" /></Ctrl></Field>
          <Field><Ctrl icon={<Lock size={16} />}>
            <TextInput type={showPw ? 'text' : 'password'} placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
            <button type="button" aria-label="Toggle password" onClick={() => setShowPw(v => !v)} className="text-navy-900/45 p-1">{showPw ? <EyeOff size={16} /> : <Eye size={16} />}</button>
          </Ctrl></Field>
          <div className="flex items-center justify-between text-[12.5px] mb-5">
            <label className="flex items-center gap-2 cursor-pointer text-navy-900/75"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} className="w-4 h-4 accent-[#0a1490]" />Remember me</label>
            <button type="button" className="font-semibold text-accent-700 hover:underline" onClick={() => goto('forgot')}>Forgot Password?</button>
          </div>
          <button type="submit" disabled={busy} className="w-full rounded-xl bg-[#0a1490] hover:bg-[#08106f] text-white font-semibold py-3 text-[14px] transition disabled:opacity-50">{busy ? 'Signing in…' : 'Login'}</button>
        </form>
        <div className="text-center text-[12.5px] text-navy-900/60 mt-5">Don't have an account? <button type="button" className="font-semibold text-accent-700 hover:underline" onClick={() => goto('register')}>Sign up</button></div>
      </AuthCard>
    </LoginLayout>
  );
}
