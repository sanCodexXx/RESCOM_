import React from 'react';
import logo from '../../assets/SanNicolasLogo.png';
import bg from '../../assets/medicfullbg.png';
import medics from '../../assets/medicnobg.png';
import ambulance from '../../assets/ambulance2buddies.png';

export const Logo = ({ size = 56 }) => <img src={logo} alt="San Nicolas MDRRMC" style={{ width: size, height: size }} className="object-contain" />;

/* Login: full-bleed photo, message on the left, form card on the right. */
export function LoginLayout({ children }) {
  return (
    <div className="min-h-screen relative bg-navy-900 overflow-hidden flex">
      <img src={bg} alt="" className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#0a1450]/90 via-[#0a1450]/70 to-[#0a1450]/45" />
      <div className="relative z-10 w-full min-w-0 max-w-[1280px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6 px-4 sm:px-10">
        <div className="hidden lg:flex flex-col py-10">
          <div className="flex items-center gap-3">
            <Logo size={64} />
            <div><b className="text-white text-[22px] block leading-tight">MDRRMO</b><span className="text-white/70 text-[13px]">San Nicolas, Ilocos Norte</span></div>
          </div>
          <h2 className="text-white text-[44px] font-bold leading-[1.1] mt-14 max-w-[420px]">Together for a Safer Community</h2>
          <p className="text-white/75 text-[16px] mt-4 max-w-[340px]">Monitoring, reporting, and responding to emergencies effectively.</p>
          <img src={medics} alt="" className="mt-auto w-[440px] max-w-full -mb-2 drop-shadow-2xl" />
        </div>
        <div className="min-w-0 flex flex-col items-center justify-center py-8 sm:py-10">
          <div className="lg:hidden flex items-center justify-center gap-3 mb-6 max-w-full"><Logo size={52} /><b className="text-white text-lg leading-tight">MDRRMO San Nicolas</b></div>
          {children}
          <p className="text-white/60 text-[11.5px] mt-6 text-center px-2">©2026 MDRRMO San Nicolas, Ilocos Norte. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}

/* Register: photo panel with form card on the left, info + ambulance on the right. */
export function RegisterLayout({ children }) {
  const items = [['Create Account', 'Sign up to access the system and its features.'], ['Stay Informed', 'Receive real-time updates and alerts.'], ['Report Easily', 'Submit reports and monitor evacuation activities.']];
  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-[1.05fr_1fr]">
      <div className="relative min-w-0 flex flex-col items-center justify-center px-4 sm:px-6 py-8 sm:py-10 overflow-hidden">
        <img src={bg} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-[#0a1450]/70" />
        <div className="lg:hidden relative z-10 flex items-center justify-center gap-3 mb-5 max-w-full"><Logo size={48} /><b className="text-white text-lg leading-tight">MDRRMO San Nicolas</b></div>
        <div className="relative z-10 w-full min-w-0 flex justify-center">{children}</div>
      </div>
      <div className="hidden lg:flex flex-col items-center bg-[#eaf2fd] px-12 pt-14 overflow-hidden">
        <Logo size={92} />
        <b className="text-navy-900 text-[20px] mt-3">MDRRMO</b>
        <span className="text-navy-900/60 text-[13px]">San Nicolas, Ilocos Norte</span>
        <div className="mt-10 space-y-5 w-full max-w-[380px]">
          {items.map(([t, d], i) => (
            <div key={i} className="flex gap-3.5 items-start">
              <span className="w-9 h-9 rounded-full bg-accent-700 text-white grid place-items-center text-[13px] font-bold shrink-0">{i + 1}</span>
              <div><b className="text-[14px] text-navy-900 block">{t}</b><span className="text-[12.5px] text-navy-900/60">{d}</span></div>
            </div>
          ))}
        </div>
        <img src={ambulance} alt="" className="mt-auto w-[460px] max-w-full" />
      </div>
    </div>
  );
}

/* Forgot Password: plain light page, single white card, illustration +
   copy on the left, the active step's form on the right. */
export function ForgotLayout({ children }) {
  return (
    <div className="min-h-screen bg-[#f4f5f7] flex items-center justify-center p-4 sm:p-6">
      <div className="bg-white rounded-2xl shadow-2xl w-full min-w-0 max-w-[900px] grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10 p-6 sm:p-10 items-center">
        {children}
      </div>
    </div>
  );
}

export function AuthCard({ children, className = '' }) {
  return <div className={`bg-white rounded-2xl shadow-2xl p-6 sm:p-9 w-full max-w-[430px] min-w-0 ${className}`}>{children}</div>;
}
export default LoginLayout;
