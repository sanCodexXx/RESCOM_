import React from 'react';
import logo from '../assets/SanNicolasLogo.png';

export default function Splash() {
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center text-center text-white rescom-dark-surface">
      <div className="anim-rise">
        <img src={logo} alt="San Nicolas MDRRMC" className="w-[120px] mx-auto" />
        <h3 className="text-[12px] tracking-[.16em] mt-6 mb-1 text-white/60 font-semibold uppercase">
          Real-time Evacuation Status
        </h3>
        <h1 className="text-[44px] my-1 font-extrabold tracking-wide" style={{ textShadow: '0 0 40px rgba(96,165,250,.4)' }}>
          RESCOM
        </h1>
        <p className="text-white/60 text-[13px] font-medium">Coordination &amp; Monitoring System</p>
        <div className="w-[180px] h-1 rounded-full bg-white/10 mx-auto mt-7 overflow-hidden">
          <div className="h-full bg-accent-400 animate-[fill_1.4s_ease_forwards]" style={{ width: 0 }} />
        </div>
      </div>
      <style>{`@keyframes fill { to { width: 100%; } }`}</style>
    </div>
  );
}
