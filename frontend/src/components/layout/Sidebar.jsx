import React from 'react';
import logo from '../../assets/SanNicolasLogo.png';
import { Home, Building2, Users, AlertTriangle, ShieldAlert, FileBarChart, UserCog, Settings, LogOut } from 'lucide-react';

export const NAV = [
  { key: 'dashboard', icon: Home, label: 'Dashboard' },
  { key: 'centers', icon: Building2, label: 'Evacuation Centers' },
  { key: 'evacuees', icon: Users, label: 'Evacuees' },
  { key: 'priority', icon: ShieldAlert, label: 'Priority Cases' },
  { key: 'incidents', icon: AlertTriangle, label: 'Disaster Incidents' },
  { key: 'dromic', icon: FileBarChart, label: 'DROMIC Reports' },
  { key: 'users', icon: UserCog, label: 'Users', adminOnly: true },
  { key: 'settings', icon: Settings, label: 'Settings' }
];

export default function Sidebar({ open, route, onNav, onLogout, role }) {
  return (
    <aside className={`w-[240px] shrink-0 glass-dark text-white p-3 flex flex-col sticky top-0 h-screen transition-[margin-left] ${!open ? '-ml-[240px]' : ''}`}>
      <div className="flex gap-2.5 items-center px-1.5 pb-5 pt-1">
        <img src={logo} alt="" className="w-[42px] h-[42px] object-contain shrink-0" />
        <div>
          <b className="block text-[16px] tracking-wide">RESCOM</b>
          <span className="block text-[9.5px] text-white/50">Evacuation Coordination</span>
        </div>
      </div>

      {NAV.filter(n => !n.adminOnly || role === 'ADMIN_STAFF').map(({ key, icon: Icon, label }) => {
        const active = route === key;
        return (
          <button
            key={key}
            onClick={() => onNav(key)}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] mb-1 w-full text-left transition
              ${active ? 'bg-accent-500/30 border border-white/20 text-white font-semibold shadow-glass-sm' : 'text-white/70 hover:bg-white/10 border border-transparent'}`}
          >
            <Icon size={15} />
            <span>{label}</span>
          </button>
        );
      })}

      <div className="grow" />
      <button onClick={onLogout} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] text-white/60 border-t border-white/10 mt-2 pt-3.5 w-full text-left hover:text-white">
        <LogOut size={15} /> Logout
      </button>
    </aside>
  );
}
