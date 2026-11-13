import React, { useEffect, useState } from 'react';
import { ArrowLeft, Fingerprint, LockKeyhole, Mail } from 'lucide-react';
import { AuthField, PasswordField } from './AuthLayout.jsx';
import { useUi } from '../../context/UiContext.jsx';
import { api } from '../../lib/api.js';
import './Recovery.css';

const STEPS = {
  1: {
    icon: Fingerprint,
    title: 'Forgot your password?',
    description: 'Enter the email address on your RESCOM account.',
    action: 'Send reset code',
    pending: 'Sending…'
  },
  2: {
    icon: Mail,
    title: 'Verify your email',
    description: 'Enter the 6-digit code from your email. It expires in 10 minutes.',
    action: 'Verify code',
    pending: 'Verifying…'
  },
  3: {
    icon: LockKeyhole,
    title: 'Reset your password',
    description: 'Choose a new password for your RESCOM account.',
    action: 'Reset password',
    pending: 'Saving…'
  }
};

export default function ForgotPassword({ goto }) {
  const { openSuccess } = useUi();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => { window.scrollTo(0, 0); }, [step]);

  function back() {
    if (step === 1) {
      goto('login');
      return;
    }
    setError('');
    setNotice('');
    setStep(step - 1);
  }

  async function requestPin(event) {
    event.preventDefault();
    if (busy) return;
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const result = await api.post('/auth/forgot-password/request', { identifier: email.trim() }, { auth: false });
      if (step === 2) setNotice(result.message);
      setPin('');
      setStep(2);
    } catch (problem) {
      setError(problem.message || 'Could not request a reset code.');
    } finally {
      setBusy(false);
    }
  }

  async function verifyPin(event) {
    event.preventDefault();
    if (busy) return;
    setNotice('');
    if (pin.length !== 6) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      await api.post('/auth/forgot-password/verify', { identifier: email.trim(), pin }, { auth: false });
      setStep(3);
    } catch (problem) {
      setError(problem.message || 'Could not verify the code.');
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(event) {
    event.preventDefault();
    if (busy) return;
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      await api.post('/auth/forgot-password/reset', {
        identifier: email.trim(), pin, new_password: password
      }, { auth: false });
      openSuccess({ title: 'Password updated', message: 'You can now sign in with your new password.' });
      goto('login');
    } catch (problem) {
      setError(problem.message || 'Could not reset the password.');
    } finally {
      setBusy(false);
    }
  }

  const { icon: Icon, title, description, action, pending } = STEPS[step];
  const submit = [requestPin, verifyPin, resetPassword][step - 1];
  const errorId = error ? 'recovery-error' : undefined;

  return (
    <main className="recovery-screen">
      <section className="recovery-panel" aria-labelledby="recovery-title">
        <header className="recovery-topbar">
          <button className="recovery-back" type="button" aria-label="Go back" disabled={busy} onClick={back}>
            <ArrowLeft size={21} aria-hidden="true" />
          </button>
          <strong>RESCOM</strong>
        </header>
        <div className="recovery-content">
          <div className="recovery-heading" aria-live="polite">
            <span className="recovery-icon"><Icon size={24} strokeWidth={1.6} aria-hidden="true" /></span>
            <h1 id="recovery-title">{title}</h1>
            <p>{description}</p>
          </div>

          <form className="recovery-form" onSubmit={submit}>
            {step === 1 && (
              <AuthField
                label="Email address"
                leading={<Mail size={17} />}
                type="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="Enter your email address"
                value={email}
                onChange={event => setEmail(event.target.value)}
                maxLength={150}
                aria-describedby={errorId}
                disabled={busy}
                required
              />
            )}

            {step === 2 && (
              <div className="recovery-pin">
                <input
                  aria-label="6-digit code"
                  aria-describedby={errorId}
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  value={pin}
                  onChange={event => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  disabled={busy}
                  required
                />
                <div className="recovery-pin-slots" aria-hidden="true">
                  {Array.from({ length: 6 }, (_, index) => (
                    <span key={index} data-current={index === Math.min(pin.length, 5)}>{pin[index]}</span>
                  ))}
                </div>
              </div>
            )}

            {step === 3 && (
              <>
                <PasswordField
                  label="New password"
                  leading={<LockKeyhole size={17} />}
                  placeholder="At least 6 characters"
                  autoComplete="new-password"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  minLength={6}
                  disabled={busy}
                  required
                />
                <PasswordField
                  label="Confirm new password"
                  leading={<LockKeyhole size={17} />}
                  placeholder="Re-enter your new password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={event => setConfirmPassword(event.target.value)}
                  minLength={6}
                  aria-describedby={errorId}
                  disabled={busy}
                  required
                />
              </>
            )}

            {error && <p id="recovery-error" className="auth-error" role="alert">{error}</p>}
            <button className="recovery-primary" type="submit" disabled={busy}>{busy ? pending : action}</button>
          </form>

          {step === 1 && (
            <button className="recovery-link recovery-return" type="button" disabled={busy} onClick={() => goto('login')}>
              <ArrowLeft size={16} aria-hidden="true" /> Back to sign in
            </button>
          )}
          {step === 2 && (
            <div className="recovery-resend">
              <span>Didn’t get a code?</span> <button className="recovery-link" type="button" disabled={busy} onClick={requestPin}>Resend code</button>
              {notice && <p role="status">{notice}</p>}
            </div>
          )}
          {step === 3 && (
            <button className="recovery-secondary" type="button" disabled={busy} onClick={() => goto('login')}>Cancel</button>
          )}
        </div>
      </section>
    </main>
  );
}
