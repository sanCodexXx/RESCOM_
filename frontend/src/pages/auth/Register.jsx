import React, { useState } from 'react';
import { User, Mail, Lock, Eye, EyeOff, AtSign, Phone, KeyRound, ShieldCheck, ClipboardList, ArrowLeft } from 'lucide-react';
import { RegisterLayout, AuthCard } from './AuthLayout.jsx';
import { Field, Ctrl, TextInput } from '../../components/ui/Field.jsx';
import Button from '../../components/ui/Button.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useUi } from '../../context/UiContext.jsx';
import { normalizePhPhone, stripPhoneChars } from '../../lib/barangays.js';

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

const ROLES = [
  { value: 'ADMIN_STAFF', title: 'Admin Staff', icon: ShieldCheck, desc: 'Office-based MDRRMO staff. Monitor all evacuation centers, view the dashboard and generate DROMIC reports.' },
  { value: 'FIELD_PERSONNEL', title: 'Field Personnel', icon: ClipboardList, desc: 'Personnel deployed at evacuation centers. Register evacuees, flag priority cases and update center status.' }
];

export default function Register({ goto }) {
  const { register } = useAuth();
  const { toast, openModal, closeModal } = useUi();
  const [role, setRole] = useState('');
  const [step, setStep] = useState(1);
  const [f, setF] = useState({ full: '', email: '', username: '', phone: '', password: '', confirm: '', admin_code: '' });
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
    const phone = f.phone.trim() ? normalizePhPhone(f.phone) : null;
    if (f.phone.trim() && !phone) return setError('Enter a valid Philippine mobile number, e.g. +63 917 123 4567 or 0917 123 4567.');
    if (role === 'ADMIN_STAFF' && !f.admin_code.trim()) return setError('Enter the admin registration code from your MDRRMO administrator.');
    if (f.password.length < 6) return setError('Password must be at least 6 characters.');
    if (f.password !== f.confirm) return setError('Passwords do not match.');
    if (!agree) return setError('Please accept the Terms of Service and Privacy Policy.');
    setError(''); setBusy(true);
    try {
      await register({
        first_name: parts.slice(0, -1).join(' '), last_name: parts.at(-1),
        username: f.username, email: f.email, phone: phone || undefined,
        password: f.password, role, admin_code: role === 'ADMIN_STAFF' ? f.admin_code.trim() : undefined
      });
      toast('Account created. Welcome!', 'ok');
    } catch (err) { setError(err.message); toast(err.message, 'bad'); } finally { setBusy(false); }
  }
  const eye = (v, fn) => <button type="button" aria-label="Toggle password" onClick={() => fn(x => !x)} className="text-navy-900/45 p-1">{v ? <EyeOff size={16} /> : <Eye size={16} />}</button>;

  if (step === 1) {
    return (
      <RegisterLayout>
        <AuthCard className="max-w-[420px]">
          <h1 className="text-[28px] font-extrabold text-[#0a1490] text-center">Choose Your Role</h1>
          <p className="text-center text-navy-900/70 text-[14px] mb-6">Select how you will use RESCOM</p>
          <div role="radiogroup" aria-label="Account role" className="space-y-3">
            {ROLES.map(r => {
              const Icon = r.icon, on = role === r.value;
              return (
                <label key={r.value} className={`flex gap-3 items-start rounded-xl border p-4 cursor-pointer transition ${on ? 'border-[#0a5cb8] bg-[#0a5cb8]/6 ring-2 ring-[#0a5cb8]/25' : 'border-navy-900/15 hover:border-navy-900/30 bg-white'}`}>
                  <input type="radio" name="role" value={r.value} checked={on} onChange={() => setRole(r.value)} className="sr-only" />
                  <span className={`w-10 h-10 rounded-full grid place-items-center shrink-0 ${on ? 'bg-[#0a5cb8] text-white' : 'bg-navy-900/6 text-navy-900/60'}`}><Icon size={19} /></span>
                  <span className="flex-1 min-w-0">
                    <b className="block text-[14.5px] text-navy-900">{r.title}</b>
                    <span className="block text-[12px] leading-relaxed text-navy-900/60 mt-0.5">{r.desc}</span>
                  </span>
                  <span className={`w-5 h-5 rounded-full border-2 shrink-0 mt-1 grid place-items-center ${on ? 'border-[#0a5cb8]' : 'border-navy-900/25'}`}>{on && <span className="w-2.5 h-2.5 rounded-full bg-[#0a5cb8]" />}</span>
                </label>
              );
            })}
          </div>
          <button type="button" disabled={!role} onClick={() => { setError(''); setStep(2); }} className="w-full mt-5 rounded-xl bg-[#0a5cb8] hover:bg-[#084a96] text-white font-semibold py-3 text-[14px] transition disabled:opacity-40 disabled:cursor-not-allowed">Continue</button>
          <div className="text-center text-[12.5px] text-navy-900/60 mt-5">Already have an account? <button type="button" className="font-semibold text-accent-700 hover:underline" onClick={() => goto('login')}>Login</button></div>
        </AuthCard>
      </RegisterLayout>
    );
  }

  const chosen = ROLES.find(r => r.value === role);
  return (
    <RegisterLayout>
      <AuthCard className="max-w-[420px]">
        <h1 className="text-[28px] font-extrabold text-[#0a1490] text-center">Create Your Account</h1>
        <p className="text-center text-navy-900/70 text-[14px] mb-4">Enter your details to finish signing up</p>
        <div className="flex items-center justify-between gap-2 rounded-xl bg-[#0a5cb8]/8 border border-[#0a5cb8]/20 px-3 py-2 mb-5 text-[12.5px]">
          <span className="text-navy-900/70">Registering as <b className="text-navy-900">{chosen?.title}</b></span>
          <button type="button" onClick={() => { setError(''); setStep(1); }} className="flex items-center gap-1 font-semibold text-accent-700 hover:underline"><ArrowLeft size={13} />Change</button>
        </div>
        <form onSubmit={submit}>
          {role === 'ADMIN_STAFF' && (
            <Field className="mb-3"><Ctrl icon={<KeyRound size={16} />}><TextInput type="password" placeholder="Admin registration code" value={f.admin_code} onChange={set('admin_code')} autoComplete="off" /></Ctrl>
              <p className="text-[11px] text-navy-900/50 mt-1 ml-1">Ask your MDRRMO administrator for this code.</p></Field>
          )}
          <Field className="mb-3"><Ctrl icon={<User size={16} />}><TextInput placeholder="Full Name" value={f.full} onChange={set('full')} /></Ctrl></Field>
          <Field className="mb-3"><Ctrl icon={<Mail size={16} />}><TextInput type="email" placeholder="Email Address" value={f.email} onChange={set('email')} /></Ctrl></Field>
          <Field className="mb-3"><Ctrl icon={<AtSign size={16} />}><TextInput placeholder="Username" value={f.username} onChange={set('username')} autoComplete="username" /></Ctrl></Field>
          <Field className="mb-3"><Ctrl icon={<Phone size={16} />}><TextInput type="tel" inputMode="tel" autoComplete="tel" maxLength={17} placeholder="Phone Number (+63 9XX XXX XXXX, optional)" value={f.phone} onChange={e => setF(s => ({ ...s, phone: stripPhoneChars(e.target.value) }))} /></Ctrl></Field>
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