import React, { useState } from 'react';
import { User, Mail, Lock } from 'lucide-react';
import { PageHeader } from '../components/layout/Shell.jsx';
import Button from '../components/ui/Button.jsx';
import RecoverPreviousSaves from '../components/ui/OfflineAccess.jsx';
import { Field, Ctrl, TextInput } from '../components/ui/Field.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useUi } from '../context/UiContext.jsx';

export default function Settings() {
  const { user, updateUser } = useAuth();
  const { toast } = useUi();
  const [form, setForm] = useState({ first_name: user.first_name || '', last_name: user.last_name || '', email: user.email || '', password: '' });
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  async function save(event) {
    event.preventDefault();
    if (busy) return;
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

      <div className="mx-auto flex w-full max-w-[560px] flex-col gap-4">
        <div className="glass rounded-glass shadow-glass-sm p-6">
          <div className="flex flex-col items-center gap-3 text-center mb-6">
            <div className="w-[64px] h-[64px] rounded-full bg-gradient-to-br from-accent-500 to-accent-700 border border-white/20 grid place-items-center text-white text-[1.125rem] font-bold">
              {user.first_name?.[0]}{user.last_name?.[0]}
            </div>
            <div>
              <b className="text-navy-900 text-[0.9375rem] block">{user.first_name} {user.last_name}</b>
              <span className="text-navy-900/50 text-[0.75rem]">{user.role === 'ADMIN_STAFF' ? 'Admin Staff' : 'Field Personnel'} · {user.unit || 'Unassigned'}</span>
            </div>
          </div>

          <form onSubmit={save} className="mx-auto max-w-[440px]">
            <Field label="First Name"><Ctrl icon={<User size={16} />}><TextInput autoComplete="given-name" value={form.first_name} onChange={set('first_name')} /></Ctrl></Field>
            <Field label="Last Name"><Ctrl icon={<User size={16} />}><TextInput autoComplete="family-name" value={form.last_name} onChange={set('last_name')} /></Ctrl></Field>
            <Field label="Email Address"><Ctrl icon={<Mail size={16} />}><TextInput type="email" autoComplete="email" value={form.email} onChange={set('email')} /></Ctrl></Field>
            <Field label="New Password (optional)">
              <Ctrl icon={<Lock size={16} />}><TextInput type="password" autoComplete="new-password" placeholder="Leave blank to keep current password" value={form.password} onChange={set('password')} /></Ctrl>
            </Field>

            <div className="flex flex-wrap justify-center gap-2.5 mt-2">
              <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save Changes'}</Button>
              <Button variant="ghost" onClick={() => setForm({ first_name: user.first_name || '', last_name: user.last_name || '', email: user.email || '', password: '' })}>Discard</Button>
            </div>
          </form>
        </div>
        <RecoverPreviousSaves />
      </div>
    </>
  );
}