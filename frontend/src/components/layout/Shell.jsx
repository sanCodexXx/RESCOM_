import React from 'react';
import ConnectionStatus from '../ui/ConnectionStatus.jsx';
import { useUi } from '../../context/UiContext.jsx';
import { Plus, Users, AlertTriangle, X } from 'lucide-react';
import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';

export default function Shell({ route, sidebarOpen, onToggleSidebar, onNav, onLogout, role, children }) {
  const [quickOpen, setQuickOpen] = React.useState(false);
  const { modal, confirm } = useUi();
  React.useEffect(() => { setQuickOpen(false); }, [route]);
  React.useEffect(() => {
    const close = e => { if (e.key === 'Escape') setQuickOpen(false); };
    window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close);
  }, []);
  React.useEffect(() => {
    if (!sidebarOpen || window.innerWidth >= 768) return;
    const nav = document.getElementById('main-navigation');
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const buttons = () => [...nav.querySelectorAll('button')].filter(b => !b.disabled);
    buttons()[0]?.focus();
    const key = e => {
      if (e.key === 'Escape') { e.preventDefault(); onToggleSidebar(); }
      if (e.key === 'Tab') {
        const items = buttons(), first = items[0], last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', key);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', key); previous?.focus?.(); };
  }, [sidebarOpen]);
  return (
    <div className="min-h-screen">
      <a className="skip-link" href="#main-content">Skip to content</a>
      {sidebarOpen && <div className="md:hidden fixed inset-0 bg-black/45 z-30" onClick={onToggleSidebar} />}
      <Sidebar open={sidebarOpen} route={route} onNav={onNav} onLogout={onLogout} role={role} />
      <div className={`flex-1 min-w-0 flex flex-col min-h-screen transition-[margin-left] duration-200 ${sidebarOpen ? 'md:ml-[240px]' : 'md:ml-0'}`}>
        <Topbar sidebarOpen={sidebarOpen} route={route} onToggleSidebar={onToggleSidebar} onNav={onNav} onLogout={onLogout} />
        <main id="main-content" tabIndex={-1} className="p-4 sm:p-6 flex-1 min-w-0">
          <ConnectionStatus />{children}
        </main>
        {!modal && !confirm && route !== 'starlink' && <div className="quick-actions md:hidden">
          {quickOpen && <div id="quick-actions-list" className="quick-actions-list">
            <button onClick={() => { onNav('evacuees', { quickAction: 'register' }); setQuickOpen(false); }}><Users size={17} />Register evacuee</button>
            <button onClick={() => { onNav('incidents', { quickAction: 'incident' }); setQuickOpen(false); }}><AlertTriangle size={17} />Log incident</button>
          </div>}
          <button className="quick-actions-toggle" aria-label={quickOpen ? 'Close quick actions' : 'Open quick actions'} aria-controls="quick-actions-list" aria-expanded={quickOpen} onClick={() => setQuickOpen(v => !v)}>
            {quickOpen ? <X size={23} /> : <Plus size={23} />}<span>Quick add</span>
          </button>
        </div>}
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-5 flex flex-wrap gap-3 items-start justify-between">
      <div>
        <h1 className="text-[1.4375rem] font-bold m-0 text-navy-900">{title}</h1>
        {subtitle && <p className="text-[0.8125rem] text-navy-900/55 mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex gap-2.5 flex-wrap">{actions}</div>
    </div>
  );
}
