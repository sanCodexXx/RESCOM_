import React, { useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import logo from '../../assets/SanNicolasLogo.png';
import './AuthLayout.css';

export function AuthField({ label, trailing, ...input }) {
  const id = useId();
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <div className="auth-field-control"><input id={id} {...input} />{trailing}</div>
    </div>
  );
}

export function PasswordField({ label = 'Password', ...input }) {
  const [visible, setVisible] = useState(false);
  return <AuthField label={label} {...input} type={visible ? 'text' : 'password'} trailing={
    <button className="auth-eye" type="button" onClick={() => setVisible(value => !value)} aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}>
      {visible ? <EyeOff size={17} /> : <Eye size={17} />}
    </button>
  } />;
}

export function ForgotLayout({ children }) {
  return (
    <div className="min-h-screen bg-[#f4f5f7] flex items-center justify-center p-4 sm:p-6">
      <div className="bg-white rounded-2xl shadow-2xl w-full min-w-0 max-w-[900px] grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10 p-6 sm:p-10 items-center">
        {children}
      </div>
    </div>
  );
}

export default function AuthLayout({ children }) {
  return (
    <main className="auth-screen">
      <div className="auth-content">
        <div className="auth-brand">
          <img src={logo} alt="" width="40" height="40" />
          <div><strong>RESCOM</strong><span>San Nicolas MDRRMO</span></div>
        </div>
        <div className="auth-form-area">{children}</div>
        <footer className="auth-footer">Municipality of San Nicolas, Ilocos Norte</footer>
      </div>
      <aside className="auth-feature" aria-hidden="true">
        <div className="auth-feature-top"><span><i /> FIELD OPERATIONS</span><span>RESCOM / 01</span></div>
        <div className="auth-feature-copy">
          <p>EVACUATION COORDINATION</p>
          <h2>Ready for<br />the field.</h2>
          <span>Register evacuees, monitor centers, and coordinate your response.</span>
        </div>
      </aside>
    </main>
  );
}
