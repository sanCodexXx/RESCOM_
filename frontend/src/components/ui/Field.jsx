import React, { createContext, useContext, useId } from 'react';
const FieldContext = createContext({});

export function Field({ label, required, error, children, className = '' }) {
  const id = useId();
  return (
    <FieldContext.Provider value={{ id, error, required, label }}>
    <div className={`mb-4 ${className}`}>
      {label && <label htmlFor={id} className="block text-xs font-semibold text-navy-900/70 mb-1.5">{label}{required && <span className="text-danger ml-0.5" aria-hidden="true">*</span>}</label>}
      {children}
      {error && <div id={`${id}-error`} role="alert" className="text-[0.71875rem] text-danger mt-1">{error}</div>}
    </div>
    </FieldContext.Provider>
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
  const field = useContext(FieldContext);
  return <input id={field.id} aria-label={props['aria-label'] || (!field.label ? props.placeholder : undefined)} aria-invalid={Boolean(field.error)} aria-describedby={field.error ? `${field.id}-error` : undefined} aria-required={field.required || undefined} {...props} className={`flex-1 border-0 outline-none bg-transparent py-2.5 text-[0.84375rem] text-navy-900 min-w-0 ${props.className || ''}`} />;
}

export function TextArea(props) {
  const field = useContext(FieldContext);
  return <textarea id={field.id} aria-label={props['aria-label'] || (!field.label ? props.placeholder : undefined)} aria-invalid={Boolean(field.error)} aria-describedby={field.error ? `${field.id}-error` : undefined} aria-required={field.required || undefined} {...props} className={`flex-1 border-0 outline-none bg-transparent py-2.5 text-[0.84375rem] text-navy-900 min-w-0 resize-y min-h-[84px] ${props.className || ''}`} />;
}

export function Select({ children, ...props }) {
  const field = useContext(FieldContext);
  return (
    <select id={field.id} aria-label={props['aria-label'] || (!field.label ? props.placeholder : undefined)} aria-invalid={Boolean(field.error)} aria-describedby={field.error ? `${field.id}-error` : undefined} aria-required={field.required || undefined} {...props} className={`flex-1 border-0 outline-none bg-transparent py-2.5 text-[0.84375rem] text-navy-900 min-w-0 cursor-pointer [&>option]:text-black ${props.className || ''}`}>
      {children}
    </select>
  );
}

export function RadioGroup({ name, value, onChange, options, error }) {
  const field = useContext(FieldContext);
  return (
    <div id={field.id} aria-label={name} aria-describedby={field.error ? `${field.id}-error` : undefined} role="radiogroup" className="flex gap-3">
      {options.map(o => {
        const on = value === o;
        return (
          <label key={o} className={`flex-1 flex items-center gap-2 rounded-xl border px-3 py-2.5 cursor-pointer text-[0.84375rem] transition
            ${on ? 'border-accent-500/70 bg-accent-500/8 text-navy-900 font-semibold ring-2 ring-accent-400/25' : 'bg-white text-navy-900/70 hover:border-navy-900/30'}
            ${error && !on ? 'border-danger/70' : on ? '' : 'border-navy-900/15'}`}>
            <input type="radio" name={name} value={o} checked={on} onChange={() => onChange(o)} className="w-4 h-4 accent-[#1F5FBF]" />
            {o}
          </label>
        );
      })}
    </div>
  );
}