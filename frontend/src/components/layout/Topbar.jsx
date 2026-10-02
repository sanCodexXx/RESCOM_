import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Menu, Bell, ChevronDown, Settings, LogOut, MoreVertical, Check, CheckCheck, Trash2, Eye, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useUi } from '../../context/UiContext.jsx';
import { api } from '../../lib/api.js';
import { getSocket } from '../../lib/socket.js';

const TYPE_DOT = { info: 'bg-accent-500', success: 'bg-success', warning: 'bg-warn', danger: 'bg-danger' };

function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function NotifRow({ n, onRead, onUnread, onDelete, onView }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className={`relative px-4 py-3 border-b border-navy-900/6 text-[12.5px] flex gap-2.5 ${!n.is_read ? 'bg-accent-50/50' : ''}`}>
      <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${TYPE_DOT[n.type] || TYPE_DOT.info}`} />
      <div className="min-w-0 flex-1 cursor-pointer" onClick={() => onView(n)}>
        <b className="block text-navy-900 truncate">{n.title}</b>
        <span className="text-[11px] text-navy-900/50 line-clamp-2">{n.message}</span>
        <span className="text-[10px] text-navy-900/35 block mt-0.5">{timeAgo(n.created_at)}</span>
      </div>
      <div className="relative shrink-0">
        <button onClick={() => setMenuOpen(v => !v)} className="text-navy-900/35 hover:bg-navy-900/8 rounded-lg p-1"><MoreVertical size={14} /></button>
        {menuOpen && (
          <div className="absolute right-0 top-7 bg-white border border-navy-900/10 rounded-xl shadow-glass w-[150px] overflow-hidden z-50" onMouseLeave={() => setMenuOpen(false)}>
            <button onClick={() => { onView(n); setMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-[11.5px] hover:bg-navy-900/6 text-navy-900"><Eye size={13} />View</button>
            {n.is_read
              ? <button onClick={() => { onUnread(n); setMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-[11.5px] hover:bg-navy-900/6 text-navy-900"><Bell size={13} />Mark unread</button>
              : <button onClick={() => { onRead(n); setMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-[11.5px] hover:bg-navy-900/6 text-navy-900"><Check size={13} />Mark read</button>}
            <button onClick={() => { onDelete(n); setMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-[11.5px] hover:bg-danger-bg text-danger"><Trash2 size={13} />Delete</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Topbar({ onToggleSidebar, onNav, onLogout }) {
  const { user } = useAuth();
  const [openNotif, setOpenNotif] = useState(false);
  const [openMenu, setOpenMenu] = useState(false);
  const [openFull, setOpenFull] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const [viewing, setViewing] = useState(null);
  const ref = useRef(null);

  const load = useCallback(async () => {
    try { setNotifs(await api.get('/notifications')); } catch (e) { /* silent */ }
  }, []);

  useEffect(() => {
    load();
    const s = getSocket();
    const onNotif = () => load();
    s.on('notification', onNotif);
    return () => s.off('notification', onNotif);
  }, [load]);

  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) { setOpenNotif(false); setOpenMenu(false); } }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const unread = notifs.filter(n => !n.is_read).length;

  async function markRead(n) { await api.patch(`/notifications/${n.notification_id}/read`); load(); }
  async function markUnread(n) { await api.patch(`/notifications/${n.notification_id}/unread`); load(); }
  async function del(n) { await api.del(`/notifications/${n.notification_id}`); load(); }
  async function markAllRead() { await api.patch('/notifications/mark-all-read'); load(); }
  function view(n) { setViewing(n); if (!n.is_read) markRead(n); }

  const initials = user ? (user.first_name?.[0] || '') + (user.last_name?.[0] || '') : '';

  return (
    <header className="h-[62px] glass border-x-0 border-t-0 flex items-center px-5 gap-3.5 sticky top-0 z-20" ref={ref}>
      <button onClick={onToggleSidebar} className="text-navy-900/60 hover:bg-navy-900/8 rounded-lg p-2"><Menu size={18} /></button>
      <div className="flex-1" />

      <div className="relative">
        <button onClick={() => setOpenNotif(v => !v)} className="relative text-navy-900/60 hover:bg-navy-900/8 rounded-lg p-2">
          <Bell size={18} />
          {unread > 0 && <span className="absolute top-0.5 right-0.5 bg-danger text-white text-[9px] rounded-full px-1 font-bold">{unread}</span>}
        </button>
        {openNotif && (
          <div className="absolute top-11 right-0 glass-strong rounded-2xl shadow-glass w-[320px] overflow-hidden z-40">
            <div className="px-4 py-3.5 border-b border-navy-900/8 flex items-center justify-between">
              <h4 className="text-[13px] font-semibold m-0 text-navy-900">Notifications</h4>
              {unread > 0 && <button onClick={markAllRead} className="text-[11px] font-semibold text-accent-700 hover:underline flex items-center gap-1"><CheckCheck size={12} />Mark all read</button>}
            </div>
            <div className="max-h-[360px] overflow-y-auto scroll-thin">
              {notifs.length === 0 && <div className="px-4 py-6 text-center text-[12px] text-navy-900/45">No notifications yet</div>}
              {notifs.slice(0, 8).map(n => (
                <NotifRow key={n.notification_id} n={n} onRead={markRead} onUnread={markUnread} onDelete={del} onView={view} />
              ))}
            </div>
            {notifs.length > 0 && (
              <button onClick={() => { setOpenFull(true); setOpenNotif(false); }} className="w-full text-center py-2.5 text-[11.5px] font-semibold text-accent-700 hover:bg-navy-900/4 border-t border-navy-900/8">
                View all notifications
              </button>
            )}
          </div>
        )}
      </div>

      <div className="relative">
        <button onClick={() => setOpenMenu(v => !v)} className="flex items-center gap-2 hover:bg-navy-900/8 rounded-xl px-2 py-1">
          <div className="w-[34px] h-[34px] rounded-full bg-gradient-to-br from-accent-500 to-accent-700 text-white grid place-items-center text-[12px] font-bold shrink-0 border border-white/20">
            {initials}
          </div>
          <div className="hidden sm:block text-left leading-tight">
            <b className="block text-[12.5px] text-navy-900">{user?.first_name} {user?.last_name}</b>
            <span className="text-[10.5px] text-navy-900/50">{user?.role === 'ADMIN_STAFF' ? 'Admin Staff' : 'Field Personnel'}</span>
          </div>
          <ChevronDown size={14} className="text-navy-900/45" />
        </button>
        {openMenu && (
          <div className="absolute top-11 right-0 glass-strong rounded-2xl shadow-glass w-[200px] overflow-hidden z-40">
            {[{ label: 'Settings', icon: Settings, fn: () => onNav('settings') }, { label: 'Log out', icon: LogOut, fn: onLogout }].map((m, i) => (
              <div key={i} className="px-4 py-3 flex items-center gap-2.5 text-[12.5px] cursor-pointer hover:bg-navy-900/6 text-navy-900" onClick={() => { setOpenMenu(false); m.fn(); }}>
                <m.icon size={15} /> <b className="font-medium">{m.label}</b>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Full notifications view */}
      {openFull && (
        <div className="fixed inset-0 bg-navy-900/40 grid place-items-center z-[80] p-5 anim-fade" onClick={e => { if (e.target === e.currentTarget) setOpenFull(false); }}>
          <div className="glass-strong rounded-glass w-full max-w-[520px] max-h-[80vh] overflow-hidden shadow-glass anim-pop flex flex-col">
            <div className="px-6 py-4 flex items-center justify-between border-b border-navy-900/8">
              <b className="text-[16px] text-navy-900">All Notifications</b>
              <div className="flex items-center gap-3">
                {unread > 0 && <button onClick={markAllRead} className="text-[11.5px] font-semibold text-accent-700 hover:underline">Mark all read</button>}
                <button onClick={() => setOpenFull(false)} className="text-navy-900/50 hover:bg-navy-900/8 rounded-lg p-1.5"><X size={16} /></button>
              </div>
            </div>
            <div className="overflow-y-auto scroll-thin flex-1">
              {notifs.length === 0 && <div className="px-6 py-10 text-center text-[12.5px] text-navy-900/45">No notifications yet</div>}
              {notifs.map(n => (
                <NotifRow key={n.notification_id} n={n} onRead={markRead} onUnread={markUnread} onDelete={del} onView={view} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Single notification detail */}
      {viewing && (
        <div className="fixed inset-0 bg-navy-900/40 grid place-items-center z-[90] p-5 anim-fade" onClick={e => { if (e.target === e.currentTarget) setViewing(null); }}>
          <div className="glass-strong rounded-glass w-full max-w-[420px] p-6 shadow-glass anim-pop">
            <div className="flex items-start justify-between gap-3 mb-2">
              <b className="text-[15px] text-navy-900">{viewing.title}</b>
              <button onClick={() => setViewing(null)} className="text-navy-900/50 hover:bg-navy-900/8 rounded-lg p-1.5"><X size={16} /></button>
            </div>
            <p className="text-[13px] text-navy-900/70 leading-relaxed">{viewing.message}</p>
            <span className="text-[11px] text-navy-900/40 block mt-3">{new Date(viewing.created_at).toLocaleString()}</span>
          </div>
        </div>
      )}
    </header>
  );
}
