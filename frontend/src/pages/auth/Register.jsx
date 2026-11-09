import React, { useState } from 'react';
import { AtSign, Clock3, Lock, Mail, User } from 'lucide-react';
import { AuthCard, AuthField, PasswordField, RegisterLayout } from './AuthLayout.jsx';
import Button from '../../components/ui/Button.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useUi } from '../../context/UiContext.jsx';

const roles = [
  { value: 'ADMIN_STAFF', label: 'Admin Staff' },
  { value: 'FIELD_PERSONNEL', label: 'Field Personnel' }
];

const terms = (
  <div className="space-y-3">
    <h3 className="font-semibold">Terms of Service</h3>
    <p>This system is for authorized MDRRMO San Nicolas personnel and partners. Submit accurate reports only, keep your credentials private, and use evacuee data solely for disaster response coordination. Accounts that misuse the system may be disabled by Admin Staff without notice.</p>
    <h3 className="font-semibold">Privacy Policy</h3>
    <p>We store your name, email, username and account activity needed to coordinate evacuations. Evacuee records are visible only to signed-in staff and are never sold or shared outside disaster response and DROMIC reporting. You may request corrections to your account details at any time.</p>
  </div>
);

export default function Register({ goto }) {
  const { register } = useAuth();
  const { toast, openModal, closeModal } = useUi();
  const [form, setForm] = useState({ name: '', email: '', username: '', password: '', confirm: '', role: '' });
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const change = field => event => setForm(previous => ({ ...previous, [field]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const names = form.name.trim().split(/\s+/);
    if (names.length < 2 || !form.username.trim()) return setError('Enter your first and last name and a username.');
    const firstName = names.slice(0, -1).join(' ');
    const lastName = names.at(-1);
    if (firstName.length > 100 || lastName.length > 100) return setError('Use up to 100 characters each for your first and last name.');
    const email = form.email.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('Enter a valid email address.');
    if (form.password !== form.confirm) return setError('Passwords do not match.');
    if (!roles.some(role => role.value === form.role)) return setError('Choose a role.');
    if (!agree) return setError('Accept the terms and privacy policy to continue.');
    setError('');
    setBusy(true);
    try {
      const result = await register({
        first_name: firstName, last_name: lastName, email,
        username: form.username.trim(), password: form.password, role: form.role
      });
      if (result?.pending) setPending(true);
      else toast('Account created. Welcome!', 'ok');
    } catch (problem) {
      setError(problem.message || 'Could not create the account.');
    } finally { setBusy(false); }
  }

  function reviewTerms() {
    openModal({ title: 'Terms and privacy policy', body: terms,
      footer: <Button onClick={() => { setAgree(true); closeModal(); }}>I agree</Button> });
  }

  return (
    <RegisterLayout>
      <AuthCard>
        {pending ? <>
          <header className="auth-heading">
            <div className="auth-step-icon"><Clock3 size={21} /></div>
            <h1>Request Submitted</h1>
            <p className="auth-subtitle">An MDRRMO administrator will review your request for {roles.find(role => role.value === form.role)?.label} access.</p>
          </header>
          <button type="button" className="auth-primary" onClick={() => goto('login')}>Back to Login</button>
        </> : <>
          <header className="auth-heading">
            <h1>Create Your Account</h1>
            <p className="auth-subtitle">Enter your details to finish signing up</p>
          </header>
          <form className="auth-form auth-register-form" onSubmit={submit}>
            <AuthField label="Full name" hideLabel leading={<User size={16} />} placeholder="Full Name" autoComplete="name" value={form.name} onChange={change('name')} maxLength={201} required />
            <AuthField label="Email address" hideLabel leading={<Mail size={16} />} placeholder="Email Address" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={form.email} onChange={change('email')} maxLength={150} required />
            <AuthField label="Username" hideLabel leading={<AtSign size={16} />} placeholder="Username" autoComplete="username" autoCapitalize="none" spellCheck={false} value={form.username} onChange={change('username')} maxLength={100} required />
            <PasswordField label="Password" hideLabel leading={<Lock size={16} />} placeholder="Password" autoComplete="new-password" value={form.password} onChange={change('password')} minLength={6} required />
            <PasswordField label="Confirm password" hideLabel leading={<Lock size={16} />} placeholder="Confirm Password" autoComplete="new-password" value={form.confirm} onChange={change('confirm')} minLength={6} required />
            <fieldset className="auth-roles">
              <legend>Requested role</legend>
              <div className="auth-role-grid">{roles.map(role => (
                <label key={role.value} className="auth-role">
                  <input type="radio" name="role" value={role.value} checked={form.role === role.value} onChange={change('role')} required />
                  {role.label}
                </label>
              ))}</div>
            </fieldset>
            <div className="auth-terms">
              <label className="auth-check"><input type="checkbox" aria-label="I accept the terms and privacy policy" checked={agree} onChange={event => setAgree(event.target.checked)} /> I accept the</label>
              <button type="button" className="auth-link" onClick={reviewTerms}>terms and privacy policy</button>
            </div>
            {error && <p className="auth-error" role="alert">{error}</p>}
            <button type="submit" className="auth-primary" disabled={busy}>{busy ? 'Submitting…' : 'Sign Up'}</button>
          </form>
          <p className="auth-switch">Already have an account? <button type="button" className="auth-link" onClick={() => goto('login')}>Login</button></p>
        </>}
      </AuthCard>
    </RegisterLayout>
  );
}
