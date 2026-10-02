import React from 'react';

export function Field({ label, error, children, className = '' }) {
  return (
    <div className={`mb-4 ${className}`}>
      {label && <label className="block text-xs font-semibold text-navy-900/70 mb-1.5">{label}</label>}
      {children}
      {error && <div className="text-[11.5px] text-danger mt-1">{error}</div>}
    </div>
  );
}

export function Ctrl({ icon, error, children, className = '' }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-xl px-3 bg-white border transition
        ${error ? 'border-danger/70 ring-2 ring-danger/20' : 'border-navy-900/15 focus-within:border-accent-500/70 focus-within:ring-2 focus-within:ring-accent-400/25'}
        ${className}`}
    >
      {icon && <span className="text-navy-900/40 w-4 h-4 shrink-0">{icon}</span>}
      {children}
    </div>
  );
}

export function TextInput(props) {
  return <input {...props} className={`flex-1 border-0 outline-none bg-transparent py-2.5 text-[13.5px] text-navy-900 min-w-0 ${props.className || ''}`} />;
}

export function TextArea(props) {
  return <textarea {...props} className={`flex-1 border-0 outline-none bg-transparent py-2.5 text-[13.5px] text-navy-900 min-w-0 resize-y min-h-[84px] ${props.className || ''}`} />;
}

export function Select({ children, ...props }) {
  return (
    <select {...props} className={`flex-1 border-0 outline-none bg-transparent py-2.5 text-[13.5px] text-navy-900 min-w-0 cursor-pointer [&>option]:text-black ${props.className || ''}`}>
      {children}
    </select>
  );
}
