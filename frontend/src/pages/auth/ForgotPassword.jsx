import React, { useState } from 'react';
import { ArrowLeft, Lock, KeyRound, Mail, Phone, Info } from 'lucide-react';
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
  const [channel, setChannel] = useState('email');       // 'email' | 'sms'
  const [emailVal, setEmailVal] = useState('');
  const [phoneVal, setPhoneVal] = useState('');
  const [pin, setPin] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [devPin, setDevPin] = useState(null);

  // Steps 2 and 3 must identify the account the same way step 1 did.
  const who = () => (channel === 'email' ? { identifier: emailVal.trim() } : { phone: phoneVal.trim() });

  async function requestPin(e) {
    e?.preventDefault();
    if (channel === 'email' && !emailVal.trim()) return toast('Enter your email or username.', 'bad');
    if (channel === 'sms' && phoneVal.replace(/\D/g, '').length < 10) return toast('Enter a valid mobile number, e.g. 0917 123 4567.', 'bad');
    setBusy(true);
    setDevPin(null);
    try {
      const r = await api.post('/auth/forgot-password/request', { ...who(), channel }, { auth: false });
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
      await api.post('/auth/forgot-password/verify', { ...who(), pin: pin.trim() }, { auth: false });
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
      await api.post('/auth/forgot-password/reset', { ...who(), pin: pin.trim(), new_password: pw }, { auth: false });
      openSuccess({ title: 'Password updated', message: 'You can now log in with your new password.' });
      goto('login');
    } catch (e) { toast(e.message, 'bad'); }
    finally { setBusy(false); }
  }

  const COPY = {
    1: {
      title: 'Forgot Password?',
      sub: channel === 'email'
        ? "No worries! Enter your email and we'll send you a code to reset your password."
        : "No worries! Enter the mobile number saved on your account and we'll text you a code."
    },
    2: { title: 'Verify Your Code', sub: `We sent a 6-digit code to your ${channel === 'email' ? 'email' : 'mobile number by SMS'}. Enter it below — it expires in 10 minutes.` },
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
            {/* Email / Phone switch */}
            <div role="tablist" aria-label="Send code to" className="grid grid-cols-2 gap-1 p-1 mb-5 rounded-xl bg-navy-900/[0.06]">
              {[['email', 'Email', Mail], ['sms', 'Phone', Phone]].map(([key, label, Icon]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={channel === key}
                  onClick={() => setChannel(key)}
                  className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-[13px] font-semibold transition ${channel === key ? 'bg-white text-navy-900 shadow-sm' : 'text-navy-900/50 hover:text-navy-900/80'}`}
                >
                  <Icon size={15} /> {label}
                </button>
              ))}
            </div>

            {channel === 'email' ? (
              <Field label="Email Address or Username" key="email-field">
                <Ctrl icon={<Mail size={16} />}>
                  <TextInput
                    type="text"
                    autoComplete="username"
                    placeholder="Enter your email address"
                    value={emailVal}
                    onChange={e => setEmailVal(e.target.value)}
                    autoFocus
                  />
                </Ctrl>
              </Field>
            ) : (
              <Field label="Mobile Number" key="phone-field">
                <Ctrl icon={<Phone size={16} />}>
                  <TextInput
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="09XX XXX XXXX"
                    value={phoneVal}
                    onChange={e => setPhoneVal(e.target.value.replace(/[^\d+\s()-]/g, ''))}
                    autoFocus
                  />
                </Ctrl>
                <div className="text-[11.5px] text-navy-900/50 mt-1.5">Use the mobile number saved on your account.</div>
              </Field>
            )}

            <Button type="submit" variant="dark" block disabled={busy}>
              {busy ? 'Sending…' : channel === 'email' ? 'Send Code by Email' : 'Send Code by SMS'}
            </Button>
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
