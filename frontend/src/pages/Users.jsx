import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Download, Search, Eye, Edit2, Trash2, X, Check, ShieldCheck, Users as UsersIcon, UserCheck, AlertTriangle, ChevronDown } from 'lucide-react';
import { PageHeader } from '../components/layout/Shell.jsx';
import Button from '../components/ui/Button.jsx';
import Badge, { STATUS_PILL } from '../components/ui/Badge.jsx';
import { Field, Ctrl, TextInput, Select } from '../components/ui/Field.jsx';
import { api } from '../lib/api.js';
import { useUi } from '../context/UiContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getSocket } from '../lib/socket.js';

const ROLE_LABEL = { ADMIN_STAFF: 'Admin Staff', FIELD_PERSONNEL: 'Field Personnel' };
const STATUS_STYLE = {
  Active: 'bg-success-bg text-success',
  Pending: 'bg-warn-bg text-warn',
  Inactive: 'bg-navy-900/8 text-navy-900/55'
};
const fullName = u => `${u.first_name} ${u.last_name}`;
const initials = u => `${u.first_name?.[0] || ''}${u.last_name?.[0] || ''}`.toUpperCase();

function timeAgo(ts) {
  if (!ts) return 'Never';
  const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return 'Just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h > 1 ? 's' : ''} ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'Yesterday';
  if (d < 14) return `${d} days ago`;
  const w = Math.floor(d / 7);
  if (d < 60) return `${w} weeks ago`;
  return new Date(ts).toLocaleDateString();
}

function Avatar({ user, size = 40 }) {
  return (
    <span style={{ width: size, height: size }} className="rounded-full grid place-items-center shrink-0 text-white text-[12.5px] font-bold bg-gradient-to-br from-[#5b7bc2] to-[#2f4a91]">
      {initials(user)}
    </span>
  );
}

function MiniStat({ icon, label, value, hint, tint }) {
  const tints = {
    accent: { tile: 'bg-accent-50 text-accent-600', label: 'text-accent-600' },
    success: { tile: 'bg-success-bg text-success', label: 'text-success' },
    warn: { tile: 'bg-warn-bg text-warn', label: 'text-warn' },
    danger: { tile: 'bg-danger-bg text-danger', label: 'text-danger' }
  }[tint];
  return (
    <div className="bg-white rounded-2xl shadow-glass-sm p-5 flex gap-4 items-start">
      <span className={`w-11 h-11 rounded-xl grid place-items-center shrink-0 ${tints.tile}`}>{icon}</span>
      <div className="min-w-0">
        <div className={`text-[13px] font-semibold ${tints.label}`}>{label}</div>
        <div className="text-[26px] font-bold leading-tight text-navy-900">{value}</div>
        <div className="text-[12px] text-navy-900/50">{hint}</div>
      </div>
    </div>
  );
}

function IconBtn({ title, onClick, disabled, hover, children }) {
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick} disabled={disabled}
      className={`p-1.5 rounded-lg text-navy-900/40 transition hover:bg-navy-900/6 ${hover} disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed`}>
      {children}
    </button>
  );
}

export default function Users() {
  const { user: me } = useAuth();
  const { toast, openModal, closeModal, openConfirm } = useUi();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('All');

  async function load() {
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

  const stats = useMemo(() => ({
    total: users.length,
    admins: users.filter(u => u.role === 'ADMIN_STAFF').length,
    active: users.filter(u => u.status === 'Active').length,
    pending: users.filter(u => u.status === 'Pending').length
  }), [users]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return users.filter(u =>
      (filter === 'All' || u.status === filter) &&
      (!t || [fullName(u), u.email, u.username, u.unit].some(v => (v || '').toLowerCase().includes(t)))
    );
  }, [users, q, filter]);

  if (me?.role !== 'ADMIN_STAFF') {
    return (
      <div className="glass rounded-glass shadow-glass-sm p-10 text-center">
        <ShieldCheck size={28} className="mx-auto text-navy-900/35 mb-3" />
        <b className="text-navy-900 block mb-1">Admin Staff only</b>
        <p className="text-navy-900/45 text-[12.5px]">User management is restricted to Admin Staff accounts.</p>
      </div>
    );
  }

  async function setStatus(u, status, okMsg) {
    try { await api.patch(`/users/${u.user_id}/status`, { status }); toast(okMsg, 'ok'); load(); }
    catch (e) { toast(e.message, 'bad'); }
  }

  function approve(u) {
    openConfirm({
      title: 'Approve this account?',
      msg: `<b>${fullName(u)}</b> will be able to log in as <b>${ROLE_LABEL[u.role]}</b>.`,
      confirmLabel: 'Approve',
      onConfirm: () => setStatus(u, 'Active', 'Account approved')
    });
  }

  function toggleActive(u) {
    if (u.status === 'Active') {
      if (u.user_id === me.user_id) { toast("You can't deactivate your own account", 'bad'); return; }
      openConfirm({
        title: 'Deactivate user?',
        msg: `<b>${fullName(u)}</b> will be signed out and unable to log in until reactivated.`,
        onConfirm: () => setStatus(u, 'Inactive', 'User deactivated')
      });
    } else if (u.status === 'Pending') approve(u);
    else setStatus(u, 'Active', 'User reactivated');
  }

  function delUser(u) {
    if (u.user_id === me.user_id) { toast("You can't delete your own account", 'bad'); return; }
    const pending = u.status === 'Pending';
    openConfirm({
      title: pending ? 'Reject registration?' : 'Delete user?',
      msg: pending
        ? `<b>${fullName(u)}</b>'s sign-up request will be rejected and removed.`
        : `<b>${fullName(u)}</b> will lose access to RESCOM immediately.`,
      onConfirm: async () => {
        try { await api.del(`/users/${u.user_id}`); toast(pending ? 'Registration rejected' : 'User deleted', 'bad'); load(); }
        catch (e) { toast(e.message, 'bad'); }
      }
    });
  }

  function viewUser(u) {
    const rows = [
      ['Username', u.username], ['Email', u.email], ['Phone', u.phone || '—'],
      ['Role', ROLE_LABEL[u.role]], ['Unit / Barangay', u.unit || '—'],
      ['Last active', u.last_active_at ? `${timeAgo(u.last_active_at)} (${new Date(u.last_active_at).toLocaleString()})` : 'Never'],
      ['Registered', new Date(u.created_at).toLocaleString()]
    ];
    openModal({
      title: 'User Details',
      body: (
        <div>
          <div className="flex items-center gap-3 mb-5">
            <Avatar user={u} size={52} />
            <div className="min-w-0">
              <b className="block text-[16px] text-navy-900">{fullName(u)}</b>
              <Badge className={STATUS_STYLE[u.status]}>{u.status}</Badge>
            </div>
          </div>
          <dl className="grid grid-cols-[120px_1fr] gap-y-3 text-[13px]">
            {rows.map(([k, v]) => (
              <React.Fragment key={k}>
                <dt className="text-navy-900/50">{k}</dt>
                <dd className="text-navy-900 font-medium break-words min-w-0">{v}</dd>
              </React.Fragment>
            ))}
          </dl>
        </div>
      ),
      footer: u.status === 'Pending'
        ? <>
            <Button variant="ghost" block onClick={() => { closeModal(); delUser(u); }}>Reject</Button>
            <Button block onClick={() => { closeModal(); approve(u); }}>Approve</Button>
          </>
        : <Button variant="ghost" block onClick={closeModal}>Close</Button>
    });
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

  function exportCsv() {
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['Name', 'Email', 'Username', 'Role', 'Unit', 'Phone', 'Status', 'Last Active', 'Registered'];
    const lines = shown.map(u => [
      fullName(u), u.email, u.username, ROLE_LABEL[u.role], u.unit, u.phone, u.status,
      u.last_active_at ? new Date(u.last_active_at).toLocaleString() : 'Never', new Date(u.created_at).toLocaleString()
    ].map(esc).join(','));
    const blob = new Blob(['\uFEFF' + [head.map(esc).join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `rescom-users-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <PageHeader title="Users Management" subtitle="System accounts, roles and permissions"
        actions={<>
          <Button variant="ghost" onClick={exportCsv} disabled={!shown.length}><Download size={14} />Export</Button>
          <Button onClick={() => userModal(null)}><Plus size={14} />Add User</Button>
        </>} />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        <MiniStat tint="accent" icon={<UsersIcon size={18} />} label="Total Users" value={stats.total} hint="Registered accounts" />
        <MiniStat tint="success" icon={<ShieldCheck size={18} />} label="Administrators" value={stats.admins} hint="Full system access" />
        <MiniStat tint="warn" icon={<UserCheck size={18} />} label="Active" value={stats.active} hint="Currently enabled" />
        <MiniStat tint="danger" icon={<AlertTriangle size={18} />} label="Pending Approval" value={stats.pending} hint="Awaiting activation" />
      </div>

      <div className="bg-white rounded-2xl shadow-glass-sm p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="flex items-center gap-2 rounded-xl border border-navy-900/15 px-3 w-full sm:w-[290px] focus-within:border-accent-500/70 focus-within:ring-2 focus-within:ring-accent-400/25 transition">
            <Search size={15} className="text-navy-900/40 shrink-0" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, email, username"
              className="flex-1 min-w-0 border-0 outline-none bg-transparent py-2.5 text-[13px] text-navy-900" />
          </div>
          <div className="relative">
            <select value={filter} onChange={e => setFilter(e.target.value)} aria-label="Filter by status"
              className="appearance-none rounded-xl border border-navy-900/15 bg-white pl-3 pr-9 py-2.5 text-[13px] font-semibold text-navy-900 outline-none cursor-pointer focus:border-accent-500/70">
              <option value="All">All</option>
              <option value="Active">Active</option>
              <option value="Pending">Pending</option>
              <option value="Inactive">Inactive</option>
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-navy-900/50 pointer-events-none" />
          </div>
          <span className="ml-auto text-[12.5px] text-navy-900/50">{shown.length} user{shown.length === 1 ? '' : 's'}</span>
        </div>

        <div className="overflow-x-auto scroll-thin">
          <table className="w-full min-w-[920px] border-collapse">
            <thead>
              <tr className="bg-navy-900/[0.04]">
                {['User', 'Username', 'Role', 'Unit / Barangay', 'Last Active', 'Status', 'Actions'].map((h, i, a) => (
                  <th key={h} className={`text-left text-[11.5px] uppercase tracking-wider text-navy-900/55 font-semibold px-4 py-3.5 ${i === 0 ? 'rounded-l-xl' : ''} ${i === a.length - 1 ? 'rounded-r-xl' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map(u => {
                const self = u.user_id === me.user_id;
                return (
                  <tr key={u.user_id} className="border-b border-navy-900/8 last:border-0">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <Avatar user={u} />
                        <div className="min-w-0">
                          <b className="block text-[13.5px] text-navy-900">{fullName(u)}{self && <span className="ml-1.5 text-[10.5px] font-semibold text-navy-900/40">(you)</span>}</b>
                          <span className="block text-[12px] text-navy-900/55">{u.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-[13px] text-navy-900/75">{u.username}</td>
                    <td className="px-4 py-3.5"><Badge className={STATUS_PILL[u.role]}>{ROLE_LABEL[u.role]}</Badge></td>
                    <td className="px-4 py-3.5 text-[13px] text-navy-900/75">{u.unit || '—'}</td>
                    <td className="px-4 py-3.5 text-[13px] text-navy-900/75 whitespace-nowrap">{timeAgo(u.last_active_at)}</td>
                    <td className="px-4 py-3.5"><Badge className={STATUS_STYLE[u.status]}>{u.status}</Badge></td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1">
                        <IconBtn title="View" onClick={() => viewUser(u)} hover="hover:text-accent-600"><Eye size={16} /></IconBtn>
                        <IconBtn title="Edit" onClick={() => userModal(u)} hover="hover:text-accent-600"><Edit2 size={16} /></IconBtn>
                        {u.status === 'Active'
                          ? <IconBtn title="Deactivate" onClick={() => toggleActive(u)} disabled={self} hover="hover:text-warn"><X size={16} /></IconBtn>
                          : <IconBtn title={u.status === 'Pending' ? 'Approve' : 'Activate'} onClick={() => toggleActive(u)} hover="hover:text-success"><Check size={16} /></IconBtn>}
                        <IconBtn title={u.status === 'Pending' ? 'Reject' : 'Delete'} onClick={() => delUser(u)} disabled={self} hover="hover:text-danger"><Trash2 size={16} /></IconBtn>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!loading && !shown.length && <p className="text-navy-900/45 text-[12.5px] text-center py-8">No users found.</p>}
      </div>
    </>
  );
}

function UserForm({ initial, isNew, onChange }) {
  const [form, setForm] = useState(initial);
  const set = (k, v) => { const next = { ...form, [k]: v }; setForm(next); onChange(next); };
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3">
        <Field label="First Name"><Ctrl><TextInput value={form.first_name} onChange={e => set('first_name', e.target.value)} /></Ctrl></Field>
        <Field label="Last Name"><Ctrl><TextInput value={form.last_name} onChange={e => set('last_name', e.target.value)} /></Ctrl></Field>
      </div>
      {isNew && <Field label="Username"><Ctrl><TextInput value={form.username} onChange={e => set('username', e.target.value)} /></Ctrl></Field>}
      <Field label="Email Address"><Ctrl><TextInput value={form.email} onChange={e => set('email', e.target.value)} /></Ctrl></Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3">
        <Field label="Role"><Ctrl><Select value={form.role} onChange={e => set('role', e.target.value)}>
          <option value="FIELD_PERSONNEL">Field Personnel</option>
          <option value="ADMIN_STAFF">Admin Staff</option>
        </Select></Ctrl></Field>
        <Field label="Unit / Barangay"><Ctrl><TextInput value={form.unit || ''} onChange={e => set('unit', e.target.value)} /></Ctrl></Field>
      </div>
      <Field label={isNew ? 'Password' : 'New Password (optional)'}>
        <Ctrl><TextInput type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder={isNew ? 'At least 6 characters' : 'Leave blank to keep current'} /></Ctrl>
      </Field>
    </>
  );
}