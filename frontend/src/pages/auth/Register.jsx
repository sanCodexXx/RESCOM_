import React, { useState } from 'react';
import { User, Mail, Lock, Eye, EyeOff, AtSign, Phone } from 'lucide-react';
import { RegisterLayout, AuthCard } from './AuthLayout.jsx';
import { Field, Ctrl, TextInput } from '../../components/ui/Field.jsx';
import Button from '../../components/ui/Button.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useUi } from '../../context/UiContext.jsx';

const LEGAL_BODY = (
  <div className="max-h-[50vh] overflow-y-auto scroll-thin pr-1 space-y-5">
    <div>
      <b className="text-navy-900 text-[13.5px] block mb-1.5">Terms of Service</b>
      <p className="text-[13px] leading-relaxed text-navy-900/75">
        This system is for authorized MDRRMO San Nicolas personnel and partners. Submit accurate reports
        only, keep your credentials private, and use evacuee data solely for disaster response coordination.
        Accounts that misuse the system may be disabled by Admin Staff without notice.
      </p>
    </div>
    <div>
      <b className="text-navy-900 text-[13.5px] block mb-1.5">Privacy Policy</b>
      <p className="text-[13px] leading-relaxed text-navy-900/75">
        We store your name, email, username, phone number and activity needed to coordinate evacuations.
        Evacuee records are visible only to signed-in staff and are never sold or shared outside disaster
        response and DROMIC reporting. You may request corrections to your account details at any time.
      </p>
    </div>
  </div>
);

export default function Register({ goto }) {
  const { register } = useAuth();
  const { toast, openModal, closeModal } = useUi();
  const [f, setF] = useState({ full: '', email: '', username: '', phone: '', password: '', confirm: '' });
  const [agree, setAgree] = useState(false);
  const [show, setShow] = useState(false);
  const [show2, setShow2] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = k => e => setF(s => ({ ...s, [k]: e.target.value }));

  const showLegal = () => openModal({
    title: 'Terms of Service & Privacy Policy',
    sub: 'Please review before creating an account',
    body: LEGAL_BODY,
    footer: <Button block onClick={() => { setAgree(true); closeModal(); }}>I Agree</Button>
  });

  async function submit(e) {
    e.preventDefault();
    const parts = f.full.trim().split(/\s+/);
    if (parts.length < 2 || !f.email || !f.username) return setError('Enter your full name (first and last), email and username.');
    if (!/^\S+@\S+\.\S+$/.test(f.email)) return setError('Enter a valid email address.');
    if (f.password.length < 6) return setError('Password must be at least 6 characters.');
    if (f.password !== f.confirm) return setError('Passwords do not match.');
    if (!agree) return setError('Please accept the Terms of Service and Privacy Policy.');
    setError(''); setBusy(true);
    try {
      await register({
        first_name: parts.slice(0, -1).join(' '), last_name: parts.at(-1),
        username: f.username, email: f.email, phone: f.phone || undefined,
        password: f.password
      });
      toast('Account created. Welcome!', 'ok');
    } catch (err) { setError(err.message); toast(err.message, 'bad'); } finally { setBusy(false); }
  }
  const eye = (v, fn) => <button type="button" aria-label="Toggle password" onClick={() => fn(x => !x)} className="text-navy-900/45 p-1">{v ? <EyeOff size={16} /> : <Eye size={16} />}</button>;

  return (
    <RegisterLayout>
      <AuthCard className="max-w-[420px]">
        <h1 className="text-[28px] font-extrabold text-[#0a1490] text-center">Create Your Account</h1>
        <p className="text-center text-navy-900/70 text-[14px] mb-6">Sign up to get started</p>
        <form onSubmit={submit}>
          <p className="text-[12px] text-navy-900/60 mb-3.5 leading-snug">
            New accounts are created as Field Personnel. An MDRRMO administrator can upgrade your role later.
          </p>
          <Field className="mb-3"><Ctrl icon={<User size={16} />}><TextInput placeholder="Full Name" value={f.full} onChange={set('full')} /></Ctrl></Field>
          <Field className="mb-3"><Ctrl icon={<Mail size={16} />}><TextInput type="email" placeholder="Email Address" value={f.email} onChange={set('email')} /></Ctrl></Field>
          <Field className="mb-3"><Ctrl icon={<AtSign size={16} />}><TextInput placeholder="Username" value={f.username} onChange={set('username')} autoComplete="username" /></Ctrl></Field>
          <Field className="mb-3"><Ctrl icon={<Phone size={16} />}><TextInput placeholder="Phone Number (for SMS password reset, optional)" value={f.phone} onChange={set('phone')} /></Ctrl></Field>
          <Field className="mb-3"><Ctrl icon={<Lock size={16} />}><TextInput type={show ? 'text' : 'password'} placeholder="Password" value={f.password} onChange={set('password')} autoComplete="new-password" />{eye(show, setShow)}</Ctrl></Field>
          <Field className="mb-3"><Ctrl icon={<Lock size={16} />}><TextInput type={show2 ? 'text' : 'password'} placeholder="Confirm Password" value={f.confirm} onChange={set('confirm')} autoComplete="new-password" />{eye(show2, setShow2)}</Ctrl></Field>
          <label className="flex items-start gap-2 text-[12px] text-navy-900/70 mb-3 cursor-pointer">
            <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} className="w-4 h-4 mt-0.5 accent-[#0a1490]" />
            <span>I agree to the <button type="button" className="font-semibold text-accent-700 underline" onClick={showLegal}>Terms of Service &amp; Privacy Policy</button></span>
          </label>
          {error && <div className="text-[12px] text-danger mb-3">{error}</div>}
          <button type="submit" disabled={busy} className="w-full rounded-xl bg-[#0a5cb8] hover:bg-[#084a96] text-white font-semibold py-3 text-[14px] transition disabled:opacity-50">{busy ? 'Creating account…' : 'Sign Up'}</button>
        </form>
        <div className="text-center text-[12.5px] text-navy-900/60 mt-5">Already have an account? <button type="button" className="font-semibold text-accent-700 hover:underline" onClick={() => goto('login')}>Login</button></div>
      </AuthCard>
    </RegisterLayout>
  );
}
