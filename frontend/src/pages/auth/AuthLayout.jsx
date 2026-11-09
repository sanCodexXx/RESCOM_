import React, { useEffect, useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import logo from '../../assets/SanNicolasLogo.png';
import bg from '../../assets/medicfullbg.png';
import medicsHero from '../../assets/medicnobg.png';
import ambulance from '../../assets/ambulance2buddies.png';
import './AuthLayout.css';

export function AuthField({ label, hideLabel = false, leading, trailing, ...input }) {
  const id = useId();
  return (
    <div className="auth-field">
      <label htmlFor={id} className={hideLabel ? 'sr-only' : undefined}>{label}</label>
      <div className="auth-field-control">
        {leading && <span className="auth-field-leading" aria-hidden="true">{leading}</span>}
        <input id={id} {...input} />
        {trailing}
      </div>
    </div>
  );
}

export function PasswordField({ label = 'Password', disabled, ...input }) {
  const [visible, setVisible] = useState(false);
  return <AuthField label={label} {...input} type={visible ? 'text' : 'password'} disabled={disabled} trailing={
    <button className="auth-eye" type="button" disabled={disabled} onClick={() => setVisible(value => !value)} aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}>
      {visible ? <EyeOff size={17} /> : <Eye size={17} />}
    </button>
  } />;
}

function Logo({ size }) {
  return <img src={logo} alt="San Nicolas MDRRMC" width={size} height={size} className="object-contain" />;
}

const registerSteps = [
  ['Create Account', 'Sign up to access the system and its features.'],
  ['Stay Informed', 'Receive real-time updates and alerts.'],
  ['Report Easily', 'Submit reports and monitor evacuation activities.']
];

export function LoginLayout({ children }) {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <div className="min-h-screen relative bg-navy-900 overflow-hidden flex">
      <img src={bg} alt="" className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#0a1450]/90 via-[#0a1450]/70 to-[#0a1450]/45" />
      <img
        src={medicsHero}
        alt=""
        aria-hidden="true"
        className="hidden lg:block absolute z-[5] pointer-events-none select-none object-contain object-left-bottom drop-shadow-2xl"
        style={{
          '--hero-height': 'min(max(300px, calc(100vh - 190px)), 44vw)',
          height: 'var(--hero-height)',
          width: 'auto',
          left: 'calc(var(--hero-height) * -0.13)',
          bottom: 'calc(var(--hero-height) * -0.18)'
        }}
      />
      <div className="hidden lg:flex flex-col absolute top-10 left-8 xl:left-12 z-20">
        <div className="flex items-center gap-3">
          <Logo size={64} />
          <div>
            <b className="text-white text-[1.375rem] block leading-tight">MDRRMO</b>
            <span className="text-white/70 text-[0.8125rem]">San Nicolas, Ilocos Norte</span>
          </div>
        </div>
        <h2 className="text-white text-[2.75rem] font-bold leading-[1.1] mt-14 max-w-[420px]">Together for a Safer Community</h2>
        <p className="text-white/75 text-[1rem] mt-4 max-w-[340px]">Monitoring, reporting, and responding to emergencies effectively.</p>
      </div>
      <div className="relative z-10 w-full min-w-0 max-w-[1280px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6 px-4 sm:px-10">
        <div className="hidden lg:block" />
        <div className="min-w-0 flex flex-col items-center justify-center py-8 sm:py-10">
          <div className="lg:hidden flex items-center justify-center gap-3 mb-6 max-w-full">
            <Logo size={52} />
            <b className="text-white text-lg leading-tight">MDRRMO San Nicolas</b>
          </div>
          {children}
          <p className="text-white/60 text-[0.71875rem] mt-6 text-center px-2">©2026 MDRRMO San Nicolas, Ilocos Norte. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}

export function RegisterLayout({ children }) {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-[1.05fr_1fr]">
      <div className="relative min-w-0 flex flex-col items-center justify-center px-4 sm:px-6 py-8 sm:py-10 overflow-hidden">
        <img src={bg} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-[#0a1450]/70" />
        <div className="lg:hidden relative z-10 flex items-center justify-center gap-3 mb-5 max-w-full">
          <Logo size={48} />
          <b className="text-white text-lg leading-tight">MDRRMO San Nicolas</b>
        </div>
        <div className="relative z-10 w-full min-w-0 flex justify-center">{children}</div>
      </div>
      <div className="hidden lg:flex flex-col items-center bg-[#eaf2fd] px-12 pt-14 overflow-hidden">
        <Logo size={92} />
        <b className="text-navy-900 text-[1.25rem] mt-3">MDRRMO</b>
        <span className="text-navy-900/60 text-[0.8125rem]">San Nicolas, Ilocos Norte</span>
        <div className="mt-10 space-y-5 w-full max-w-[380px]">
          {registerSteps.map(([title, description], index) => (
            <div key={title} className="flex gap-3.5 items-start">
              <span className="w-9 h-9 rounded-full bg-accent-700 text-white grid place-items-center text-[0.8125rem] font-bold shrink-0">
                {index + 1}
              </span>
              <div>
                <b className="text-[0.875rem] text-navy-900 block">{title}</b>
                <span className="text-[0.78125rem] text-navy-900/60">{description}</span>
              </div>
            </div>
          ))}
        </div>
        <img src={ambulance} alt="" className="mt-auto w-[460px] max-w-full" />
      </div>
    </div>
  );
}

export function AuthCard({ children }) {
  return <div className="auth-card bg-white rounded-2xl shadow-2xl p-6 sm:p-9 w-full max-w-[430px] min-w-0">{children}</div>;
}
