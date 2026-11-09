import React, { useEffect, useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import logo from '../../assets/SanNicolasLogo.png';
import './AuthLayout.css';

export function AuthField({ label, leading, trailing, ...input }) {
  const id = useId();
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
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

export default function AuthLayout({ children }) {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <main className="auth-screen">
      <aside className="auth-feature">
        <div className="auth-brand">
          <img src={logo} alt="" width="40" height="40" />
          <div><strong>RESCOM</strong><span>San Nicolas</span></div>
        </div>
        <div className="auth-feature-copy">
          <h2>Ready for the field.</h2>
          <p>Register evacuees, monitor centers, and coordinate your response.</p>
        </div>
      </aside>
      <div className="auth-content">
        <div className="auth-form-area">{children}</div>
      </div>
    </main>
  );
}
