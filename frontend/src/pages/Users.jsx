import React, { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, ShieldCheck } from 'lucide-react';
import { PageHeader } from '../components/layout/Shell.jsx';
import Button from '../components/ui/Button.jsx';
import Badge, { STATUS_PILL } from '../components/ui/Badge.jsx';
import { Field, Ctrl, TextInput, Select } from '../components/ui/Field.jsx';
import { api } from '../lib/api.js';
import { useUi } from '../context/UiContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getSocket } from '../lib/socket.js';

export default function Users() {
  const { user: me } = useAuth();
  const { toast, openModal, closeModal, openConfirm } = useUi();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try { setUsers(await api.get('/users')); }
    catch (e) { toast(e.message, 'bad'); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    load();
    const s = getSocket();
    const handler = () => load();
    s.on('user_updated', handler);
    return () => s.off('user_updated', handler);
  }, []);

  if (me?.role !== 'ADMIN_STAFF') {
    return (
      <div className="glass rounded-glass shadow-glass-sm p-10 text-center">
        <ShieldCheck size={28} className="mx-auto text-navy-900/35 mb-3" />
        <b className="text-navy-900 block mb-1">Admin Staff only</b>
        <p className="text-navy-900/45 text-[12.5px]">User management is restricted to Admin Staff accounts.</p>
      </div>
    );
  }

  function userModal(existing) {
    let form = existing
      ? { ...existing, password: '' }
      : { first_name: '', last_name: '', username: '', email: '', password: '', role: 'FIELD_PERSONNEL', unit: '' };
    openModal({
      title: existing ? 'Edit User' : 'Add New User',
      sub: existing ? existing.email : 'Create an Admin Staff or Field Personnel account',
      body: <UserForm initial={form} isNew={!existing} onChange={f => (form = f)} />,
      footer: <>
        <Button variant="ghost" block onClick={closeModal}>Cancel</Button>
        <Button block onClick={async () => {
          if (!form.first_name || !form.last_name || !form.email || (!existing && (!form.username || form.password.length < 6))) {
            toast('Please complete all required fields (password 6+ characters)', 'bad'); return;
          }
          try {
            if (existing) await api.put(`/users/${existing.user_id}`, form);
            else await api.post('/users', form);
            closeModal(); toast(existing ? 'User updated' : 'User created', 'ok'); load();
          } catch (e) { toast(e.message, 'bad'); }
        }}>{existing ? 'Save Changes' : 'Create User'}</Button>
      </>
    });
  }

  function delUser(u) {
    if (u.user_id === me.user_id) { toast("You can't delete your own account", 'bad'); return; }
    openConfirm({
      title: 'Delete user?',
      msg: `<b>${u.first_name} ${u.last_name}</b> will lose access to RESCOM immediately.`,
      onConfirm: async () => {
        try { await api.del(`/users/${u.user_id}`); toast('User deleted', 'bad'); load(); }
        catch (e) { toast(e.message, 'bad'); }
      }
    });
  }

  return (
    <>
      <PageHeader title="Users Management" subtitle="Admin Staff and Field Personnel accounts"
        actions={<Button onClick={() => userModal(null)}><Plus size={14} />Add User</Button>} />

      <div className="glass rounded-glass shadow-glass-sm overflow-x-auto scroll-thin">
        <table className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr>{['Name', 'Username', 'Role', 'Unit', 'Joined', ''].map(h => (
              <th key={h} className="text-left text-[11px] uppercase tracking-wide text-navy-900/45 font-semibold px-4 py-3">{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.user_id} className="border-b border-navy-900/8">
                <td className="px-4 py-3 text-[12.5px] text-navy-900">
                  <b>{u.first_name} {u.last_name}</b>
                  <div className="text-[11px] text-navy-900/45">{u.email}</div>
                </td>
                <td className="px-4 py-3 text-[12.5px] text-navy-900/65">{u.username}</td>
                <td className="px-4 py-3"><Badge className={STATUS_PILL[u.role]}>{u.role === 'ADMIN_STAFF' ? 'Admin Staff' : 'Field Personnel'}</Badge></td>
                <td className="px-4 py-3 text-[12.5px] text-navy-900/65">{u.unit || '—'}</td>
                <td className="px-4 py-3 text-[12px] text-navy-900/45">{new Date(u.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1.5 text-navy-900/45">
                    <button onClick={() => userModal(u)} className="hover:text-accent-400 p-1"><Edit2 size={15} /></button>
                    <button onClick={() => delUser(u)} className="hover:text-danger p-1"><Trash2 size={15} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!loading && !users.length && <p className="text-navy-900/45 text-[12.5px] mt-4">No users found.</p>}
    </>
  );
}

function UserForm({ initial, isNew, onChange }) {
  const [form, setForm] = useState(initial);
  const set = (k, v) => { const next = { ...form, [k]: v }; setForm(next); onChange(next); };
  return (
    <>
      <div className="grid grid-cols-2 gap-x-3">
        <Field label="First Name"><Ctrl><TextInput value={form.first_name} onChange={e => set('first_name', e.target.value)} /></Ctrl></Field>
        <Field label="Last Name"><Ctrl><TextInput value={form.last_name} onChange={e => set('last_name', e.target.value)} /></Ctrl></Field>
      </div>
      {isNew && <Field label="Username"><Ctrl><TextInput value={form.username} onChange={e => set('username', e.target.value)} /></Ctrl></Field>}
      <Field label="Email Address"><Ctrl><TextInput value={form.email} onChange={e => set('email', e.target.value)} /></Ctrl></Field>
      <div className="grid grid-cols-2 gap-x-3">
        <Field label="Role"><Ctrl><Select value={form.role} onChange={e => set('role', e.target.value)}>
          <option value="FIELD_PERSONNEL">Field Personnel</option>
          <option value="ADMIN_STAFF">Admin Staff</option>
        </Select></Ctrl></Field>
        <Field label="Unit / Team"><Ctrl><TextInput value={form.unit || ''} onChange={e => set('unit', e.target.value)} /></Ctrl></Field>
      </div>
      <Field label={isNew ? 'Password' : 'New Password (optional)'}>
        <Ctrl><TextInput type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder={isNew ? 'At least 6 characters' : 'Leave blank to keep current'} /></Ctrl>
      </Field>
    </>
  );
}
