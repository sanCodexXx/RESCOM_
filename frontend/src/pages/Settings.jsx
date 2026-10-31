import React, { useState, useEffect } from 'react';
import { User, Mail, Lock } from 'lucide-react';
import { PageHeader } from '../components/layout/Shell.jsx';
import Button from '../components/ui/Button.jsx';
import { Field, Ctrl, TextInput } from '../components/ui/Field.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useUi } from '../context/UiContext.jsx';

export default function Settings() {
  const { user, updateUser, logout } = useAuth();
  const { toast } = useUi();
  const [form, setForm] = useState({ first_name: user.first_name, last_name: user.last_name, email: user.email, password: '' });
  const [textSize, setTextSize] = useState(() => Number(localStorage.getItem('rescom_text_size')) || 100);
  useEffect(() => {
    document.documentElement.style.fontSize = `${textSize}%`;
    localStorage.setItem('rescom_text_size', String(textSize));
  }, [textSize]);
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  async function save() {
    setBusy(true);
    try {
      const updated = await api.put('/users/me/profile', form);
      updateUser(updated);
      setForm(f => ({ ...f, password: '' }));
      toast('Profile updated', 'ok');
    } catch (e) { toast(e.message, 'bad'); }
    finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader title="Account Settings" subtitle="Manage your RESCOM account" />

      <div className="max-w-[560px] flex flex-col gap-4">
        <div className="glass rounded-glass shadow-glass-sm p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-[64px] h-[64px] rounded-full bg-gradient-to-br from-accent-500 to-accent-700 border border-white/20 grid place-items-center text-white text-[1.125rem] font-bold">
              {user.first_name?.[0]}{user.last_name?.[0]}
            </div>
            <div>
              <b className="text-navy-900 text-[0.9375rem] block">{user.first_name} {user.last_name}</b>
              <span className="text-navy-900/50 text-[0.75rem]">{user.role === 'ADMIN_STAFF' ? 'Admin Staff' : 'Field Personnel'} · {user.unit || 'Unassigned'}</span>
            </div>
          </div>

          <Field label="First Name"><Ctrl icon={<User size={16} />}><TextInput value={form.first_name} onChange={set('first_name')} /></Ctrl></Field>
          <Field label="Last Name"><Ctrl icon={<User size={16} />}><TextInput value={form.last_name} onChange={set('last_name')} /></Ctrl></Field>
          <Field label="Email Address"><Ctrl icon={<Mail size={16} />}><TextInput value={form.email} onChange={set('email')} /></Ctrl></Field>
          <Field label="New Password (optional)">
            <Ctrl icon={<Lock size={16} />}><TextInput type="password" placeholder="Leave blank to keep current password" value={form.password} onChange={set('password')} /></Ctrl>
          </Field>

          <div className="flex gap-2.5 mt-2">
            <Button disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save Changes'}</Button>
            <Button variant="ghost" onClick={() => setForm({ first_name: user.first_name, last_name: user.last_name, email: user.email, password: '' })}>Discard</Button>
          </div>
        </div>

        <section className="glass rounded-glass p-6">
          <h2 className="font-semibold text-navy-900 mb-2">Display preferences</h2>
          <p className="text-sm text-slate-600 mb-4">Adjust interface text for this device.</p>
          <label htmlFor="text-size" className="text-sm font-medium flex justify-between">Text size <output>{textSize}%</output></label>
          <input id="text-size" aria-label="Text size" type="range" min="100" max="125" step="5" value={textSize} onChange={e => setTextSize(Number(e.target.value))} className="w-full my-4 accent-blue-600" />
          <Button variant="ghost" size="sm" onClick={() => setTextSize(100)}>Reset text size</Button>
        </section>
      </div>
    </>
  );
}