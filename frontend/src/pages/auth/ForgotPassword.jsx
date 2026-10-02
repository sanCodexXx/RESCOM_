import React, { useState } from 'react';
import { ArrowLeft, Lock, KeyRound, MessageSquare, Info } from 'lucide-react';
import { ForgotLayout } from './AuthLayout.jsx';
import { Field, Ctrl, TextInput } from '../../components/ui/Field.jsx';
import Button from '../../components/ui/Button.jsx';
import { useUi } from '../../context/UiContext.jsx';
import { api } from '../../lib/api.js';
import illustration from '../../assets/forgotpass.png';

// Same 3-step PIN flow as before (backend/routes/auth.routes.js), as its
// own page instead of a modal, matching the reference layout:
//   1) request a PIN (email by default, SMS optional)
//   2) verify the 6-digit PIN
//   3) set a new password
//
// Dev note: until SMTP/SMS is configured in backend/.env, nothing is
// actually emailed/texted — the backend logs the PIN to its own console
// AND returns it as `dev_pin` in the response, which this page shows
// directly below the button so you don't have to dig through server logs
// to test the flow. That banner disappears automatically once real
// delivery is configured and working.
export default function ForgotPassword({ goto }) {
  const { toast, openSuccess } = useUi();
  const [step, setStep] = useState(1);
  const [identifier, setIdentifier] = useState('');
  const [channel, setChannel] = useState('email');
  const [pin, setPin] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [devPin, setDevPin] = useState(null);

  async function requestPin(e) {
    e?.preventDefault();
    if (!identifier.trim()) return toast('Enter your email or username.', 'bad');
    setBusy(true);
    setDevPin(null);
    try {
      const r = await api.post('/auth/forgot-password/request', { identifier: identifier.trim(), channel }, { auth: false });
      toast(r.dev_pin ? 'PIN generated (dev mode — see below)' : r.message, r.dev_pin ? 'warn' : 'ok');
      if (r.dev_pin) setDevPin(r.dev_pin);
      setStep(2);
    } catch (e) { toast(e.message, 'bad'); }
    finally { setBusy(false); }
  }

  async function verifyPin(e) {
    e?.preventDefault();
    if (pin.trim().length !== 6) return toast('Enter the 6-digit code.', 'bad');
    setBusy(true);
    try {
      await api.post('/auth/forgot-password/verify', { identifier: identifier.trim(), pin: pin.trim() }, { auth: false });
      setStep(3);
    } catch (e) { toast(e.message, 'bad'); }
    finally { setBusy(false); }
  }

  async function resetPassword(e) {
    e?.preventDefault();
    if (pw.length < 6) return toast('Password must be at least 6 characters.', 'bad');
    if (pw !== pw2) return toast('Passwords do not match.', 'bad');
    setBusy(true);
    try {
      await api.post('/auth/forgot-password/reset', { identifier: identifier.trim(), pin: pin.trim(), new_password: pw }, { auth: false });
      openSuccess({ title: 'Password updated', message: 'You can now log in with your new password.' });
      goto('login');
    } catch (e) { toast(e.message, 'bad'); }
    finally { setBusy(false); }
  }

  const COPY = {
    1: { title: 'Forgot Password?', sub: "No worries! Enter your email and we'll send you a code to reset your password." },
    2: { title: 'Verify Your Code', sub: `We sent a 6-digit code to you via ${channel === 'email' ? 'email' : 'SMS'}. Enter it below — it expires in 10 minutes.` },
    3: { title: 'Reset Your Password', sub: 'Create a new password for your account.' }
  }[step];

  return (
    <ForgotLayout>
      <div>
        <h1 className="text-[28px] font-extrabold text-navy-900 mb-2 leading-tight">{COPY.title}</h1>
        <p className="text-accent-700 text-[14px] leading-relaxed mb-8 max-w-[340px]">{COPY.sub}</p>
        <img src={illustration} alt="" className="w-full max-w-[320px] mx-auto md:mx-0" />
      </div>

      <div>
        {step === 1 && (
          <form onSubmit={requestPin}>
            <Field label="Email Address">
              <Ctrl><TextInput placeholder="Enter your email address" value={identifier} onChange={e => setIdentifier(e.target.value)} autoFocus /></Ctrl>
            </Field>
            <Button type="submit" variant="dark" block disabled={busy}>{busy ? 'Sending…' : 'Send Reset Link'}</Button>
            <button
              type="button"
              onClick={() => setChannel(c => c === 'email' ? 'sms' : 'email')}
              className="w-full text-center text-[12px] font-medium text-navy-900/45 hover:text-accent-700 mt-3 flex items-center justify-center gap-1.5"
            >
              <MessageSquare size={13} /> {channel === 'email' ? 'Send the code by SMS instead' : 'Send the code by email instead'}
            </button>
            <button type="button" onClick={() => goto('login')} className="w-full text-center text-[13px] font-semibold text-accent-700 hover:underline mt-5 flex items-center justify-center gap-1.5">
              <ArrowLeft size={14} /> Back to Login
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={verifyPin}>
            {devPin && (
              <div className="flex items-start gap-2.5 bg-warn-bg text-warn rounded-xl px-3.5 py-3 mb-5 text-[12px] leading-relaxed">
                <Info size={15} className="shrink-0 mt-0.5" />
                <div>
                  <b className="block mb-0.5">Email/SMS isn't configured yet — here's your code for testing:</b>
                  <span className="text-[20px] font-extrabold tracking-[4px] block mt-1">{devPin}</span>
                  <span className="opacity-80">Configure SMTP_HOST / SMTP_USER / SMTP_PASS in backend/.env to send this for real.</span>
                </div>
              </div>
            )}
            <Field label="6-digit Code">
              <Ctrl icon={<KeyRound size={16} />}>
                <TextInput
                  value={pin}
                  onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                  inputMode="numeric"
                  className="tracking-[6px] font-bold"
                  autoFocus
                />
              </Ctrl>
            </Field>
            <Button type="submit" variant="dark" block disabled={busy}>{busy ? 'Verifying…' : 'Verify Code'}</Button>
            <button type="button" onClick={requestPin} className="w-full text-center text-[12px] font-semibold text-accent-700 hover:underline mt-3">Resend code</button>
            <button type="button" onClick={() => setStep(1)} className="w-full text-center text-[13px] font-semibold text-accent-700 hover:underline mt-4 flex items-center justify-center gap-1.5">
              <ArrowLeft size={14} /> Back
            </button>
          </form>
        )}

        {step === 3 && (
          <form onSubmit={resetPassword}>
            <Field label="New Password">
              <Ctrl icon={<Lock size={16} />}><TextInput type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="At least 6 characters" autoFocus /></Ctrl>
            </Field>
            <Field label="Confirm New Password">
              <Ctrl icon={<Lock size={16} />}><TextInput type="password" value={pw2} onChange={e => setPw2(e.target.value)} placeholder="Re-enter password" /></Ctrl>
            </Field>
            <Button type="submit" variant="dark" block disabled={busy}>{busy ? 'Saving…' : 'Reset Password'}</Button>
          </form>
        )}
      </div>
    </ForgotLayout>
  );
}
