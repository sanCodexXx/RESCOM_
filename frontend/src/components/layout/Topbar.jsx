import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Menu, Bell, MoreVertical, Check, CheckCheck, Trash2, Eye, X, Search, ChevronDown, Settings as SettingsIcon, LogOut, Users, Building2, AlertTriangle, CornerDownLeft } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { api } from '../../lib/api.js';
import { getSocket } from '../../lib/socket.js';
import { NAV } from './Sidebar.jsx';
import { setSeed } from '../../lib/searchSeed.js';

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
  const [openFull, setOpenFull] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const [viewing, setViewing] = useState(null);
  const ref = useRef(null);
  const menuRef = useRef(null);
  const searchInput = useRef(null);
  const [openMenu, setOpenMenu] = useState(false);
  const [openSearch, setOpenSearch] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [index, setIndex] = useState({ evacuees: [], centers: [], incidents: [] });
  const [indexLoading, setIndexLoading] = useState(false);

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
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpenNotif(false);
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpenMenu(false);
    }
    function onKey(e) { if (e.key === 'Escape') { setOpenMenu(false); setOpenNotif(false); closeSearch(); } }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, []);

  // ---- search ----
  async function openSearchBar() {
    setOpenNotif(false); setOpenMenu(false);
    setOpenSearch(true); setQuery(''); setActive(0);
    setTimeout(() => searchInput.current?.focus(), 30);
    setIndexLoading(true);
    try {
      const [evacuees, centers, incidents] = await Promise.all([api.get('/evacuees'), api.get('/centers'), api.get('/incidents')]);
      setIndex({ evacuees, centers, incidents });
    } catch (e) { /* suggestions fall back to page links only */ }
    finally { setIndexLoading(false); }
  }
  function closeSearch() { setOpenSearch(false); setQuery(''); }

  const q = query.trim().toLowerCase();
  const has = (...f) => f.filter(Boolean).join(' ').toLowerCase().includes(q);
  const pages = NAV.filter(n => !n.adminOnly || user?.role === 'ADMIN_STAFF');
  const groups = [];
  if (!q) {
    groups.push({ title: 'Quick links', icon: CornerDownLeft, items: pages.map(n => ({ key: 'p' + n.key, label: n.label, sub: 'Go to page', go: () => onNav(n.key) })) });
  } else {
    const ev = index.evacuees.filter(e => has(e.first_name, e.middle_name, e.last_name, e.family_name, e.barangay, e.center_name)).slice(0, 5)
      .map(e => ({ key: 'e' + e.evacuee_id, label: `${e.first_name} ${e.last_name}`, sub: [e.family_name, e.barangay, e.center_name].filter(Boolean).join(' · '), go: () => { setSeed('evacuees', `${e.first_name} ${e.last_name}`); onNav('evacuees'); } }));
    const ce = index.centers.filter(c => has(c.center_name, c.barangay, c.address)).slice(0, 4)
      .map(c => ({ key: 'c' + c.center_id, label: c.center_name, sub: `${c.barangay} · ${c.occupancy}/${c.capacity} · ${c.status}`, go: () => { setSeed('centers', c.center_id); onNav('centers'); } }));
    const inc = index.incidents.filter(i => has(i.disaster_name, i.disaster_type, i.brgy)).slice(0, 4)
      .map(i => ({ key: 'i' + i.incident_id, label: i.disaster_name, sub: [i.disaster_type, i.brgy, i.reporting_status].filter(Boolean).join(' · '), go: () => onNav('incidents') }));
    const pg = pages.filter(n => has(n.label)).slice(0, 3).map(n => ({ key: 'p' + n.key, label: n.label, sub: 'Go to page', go: () => onNav(n.key) }));
    if (ev.length) groups.push({ title: 'Evacuees', icon: Users, items: ev });
    if (ce.length) groups.push({ title: 'Evacuation Centers', icon: Building2, items: ce });
    if (inc.length) groups.push({ title: 'Disaster Incidents', icon: AlertTriangle, items: inc });
    if (pg.length) groups.push({ title: 'Pages', icon: CornerDownLeft, items: pg });
  }
  const flat = groups.flatMap(g => g.items);
  function pick(item) { if (!item) return; closeSearch(); item.go(); }
  function onSearchKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, flat.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(flat[active]); }
  }

  const unread = notifs.filter(n => !n.is_read).length;

  async function markRead(n) { await api.patch(`/notifications/${n.notification_id}/read`); load(); }
  async function markUnread(n) { await api.patch(`/notifications/${n.notification_id}/unread`); load(); }
  async function del(n) { await api.del(`/notifications/${n.notification_id}`); load(); }
  async function markAllRead() { await api.patch('/notifications/mark-all-read'); load(); }
  function view(n) { setViewing(n); if (!n.is_read) markRead(n); }

  const initials = user ? (user.first_name?.[0] || '') + (user.last_name?.[0] || '') : '';

  return (
    <header className="h-[62px] glass border-x-0 border-t-0 flex items-center px-3 sm:px-5 gap-2 sm:gap-3.5 sticky top-0 z-20" ref={ref}>
      <button onClick={onToggleSidebar} className="text-navy-900/60 hover:bg-navy-900/8 rounded-lg p-2"><Menu size={18} /></button>
      <div className="flex-1" />

      <button onClick={openSearchBar} aria-label="Search" title="Search" className="text-navy-900/60 hover:bg-navy-900/8 rounded-lg p-2"><Search size={18} /></button>

      <div className="relative">
        <button onClick={() => { setOpenMenu(false); setOpenNotif(v => !v); }} aria-label="Notifications" className="relative text-navy-900/60 hover:bg-navy-900/8 rounded-lg p-2">
          <Bell size={18} />
          {unread > 0 && <span className="absolute top-0.5 right-0.5 bg-danger text-white text-[9px] rounded-full px-1 font-bold">{unread}</span>}
        </button>
        {openNotif && (
          <div className="fixed left-3 right-3 top-[68px] sm:absolute sm:top-11 sm:left-auto sm:right-0 glass-strong rounded-2xl shadow-glass sm:w-[320px] overflow-hidden z-40">
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

      <div className="relative" ref={menuRef}>
        <button onClick={() => { setOpenNotif(false); setOpenMenu(v => !v); }} aria-haspopup="menu" aria-expanded={openMenu}
          className="flex items-center gap-2 hover:bg-navy-900/8 rounded-xl px-2 py-1">
          <div className="w-[34px] h-[34px] rounded-full bg-gradient-to-br from-accent-500 to-accent-700 text-white grid place-items-center text-[12px] font-bold shrink-0 border border-white/20">{initials}</div>
          <div className="hidden sm:block text-left leading-tight">
            <b className="block text-[12.5px] text-navy-900">{user?.first_name} {user?.last_name}</b>
            <span className="text-[10.5px] text-navy-900/50">{user?.role === 'ADMIN_STAFF' ? 'Admin Staff' : 'Field Personnel'}</span>
          </div>
          <ChevronDown size={14} className={`text-navy-900/45 transition ${openMenu ? 'rotate-180' : ''}`} />
        </button>
        {openMenu && (
          <div role="menu" className="absolute right-0 top-12 w-[230px] bg-white border border-navy-900/10 rounded-xl shadow-glass overflow-hidden z-40">
            <div className="px-4 py-3 border-b border-navy-900/8">
              <b className="block text-[13px] text-navy-900 truncate">{user?.first_name} {user?.last_name}</b>
              <span className="block text-[11px] text-navy-900/50 truncate">{user?.email}</span>
            </div>
            <button role="menuitem" onClick={() => { setOpenMenu(false); onNav('settings'); }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[12.5px] text-navy-900 hover:bg-navy-900/6"><SettingsIcon size={15} />Account Settings</button>
            <button role="menuitem" onClick={() => { setOpenMenu(false); onLogout(); }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[12.5px] text-danger hover:bg-danger-bg border-t border-navy-900/8"><LogOut size={15} />Logout</button>
          </div>
        )}
      </div>

      {openSearch && (
        <>
          <div className="fixed inset-0 z-30 bg-navy-900/25" onClick={closeSearch} />
          <div className="absolute inset-0 z-40 glass-strong flex items-center gap-2 px-3 sm:px-5">
            <Search size={18} className="text-navy-900/45 shrink-0" />
            <input ref={searchInput} value={query} onChange={e => { setQuery(e.target.value); setActive(0); }} onKeyDown={onSearchKey}
              placeholder="Search evacuees, centers, incidents, pages…" aria-label="Search" autoComplete="off"
              className="flex-1 min-w-0 bg-transparent outline-none text-[14px] text-navy-900 placeholder:text-navy-900/40 py-2" />
            <button onClick={closeSearch} aria-label="Close search" className="text-navy-900/50 hover:bg-navy-900/8 rounded-lg p-2"><X size={18} /></button>
          </div>
          <div className="fixed left-3 right-3 top-[68px] sm:left-auto sm:right-5 sm:w-[480px] z-40 bg-white border border-navy-900/10 rounded-2xl shadow-glass overflow-hidden">
            <div className="max-h-[60vh] overflow-y-auto scroll-thin py-1">
              {indexLoading && q && <div className="px-4 py-3 text-[12px] text-navy-900/45">Loading suggestions…</div>}
              {!indexLoading && q && flat.length === 0 && <div className="px-4 py-6 text-center text-[12.5px] text-navy-900/50">No results for “{query.trim()}”</div>}
              {groups.map(g => (
                <div key={g.title}>
                  <div className="px-4 pt-2.5 pb-1 text-[10.5px] uppercase tracking-wide font-semibold text-navy-900/40">{g.title}</div>
                  {g.items.map(it => {
                    const idx = flat.indexOf(it);
                    return (
                      <button key={it.key} onMouseEnter={() => setActive(idx)} onClick={() => pick(it)}
                        className={`w-full text-left px-4 py-2 flex items-center gap-3 ${idx === active ? 'bg-accent-500/10' : 'hover:bg-navy-900/4'}`}>
                        <g.icon size={15} className="text-navy-900/40 shrink-0" />
                        <span className="min-w-0 flex-1">
                          <b className="block text-[12.5px] text-navy-900 truncate">{it.label}</b>
                          {it.sub && <span className="block text-[11px] text-navy-900/50 truncate">{it.sub}</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="hidden sm:flex items-center gap-3 px-4 py-2 border-t border-navy-900/8 text-[10.5px] text-navy-900/40"><span>↑↓ to move</span><span>Enter to open</span><span>Esc to close</span></div>
          </div>
        </>
      )}

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