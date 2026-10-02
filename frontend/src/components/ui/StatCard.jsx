import React from 'react';

export function StatCard({ icon, label, value, hint, tint = 'accent', onClick }) {
  const tints = {
    accent: 'bg-accent-50 text-accent-700',
    danger: 'bg-danger-bg text-danger',
    warn: 'bg-warn-bg text-warn',
    success: 'bg-success-bg text-success',
    pink: 'bg-pink-bg text-pink'
  };
  return (
    <div
      onClick={onClick}
      className="glass rounded-glass shadow-glass-sm p-[18px] flex gap-3 items-start cursor-pointer transition hover:-translate-y-0.5 hover:bg-accent-50"
    >
      <div className={`w-[42px] h-[42px] rounded-xl grid place-items-center shrink-0 ${tints[tint]}`}>{icon}</div>
      <div>
        <div className="text-[12px] font-semibold text-navy-900/60">{label}</div>
        <div className="text-[25px] font-bold leading-tight text-navy-900">{value}</div>
        <div className="text-[11.5px] text-navy-900/45">{hint}</div>
      </div>
    </div>
  );
}

export function ProgressBar({ pct, color = '#2563EB' }) {
  return (
    <div className="h-2 rounded-full bg-navy-900/10 overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: Math.min(100, pct) + '%', background: color }} />
    </div>
  );
}
