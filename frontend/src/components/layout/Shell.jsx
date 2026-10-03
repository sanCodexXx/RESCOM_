import React from 'react';
import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';

export default function Shell({ route, sidebarOpen, onToggleSidebar, onNav, onLogout, role, children }) {
  return (
    <div className="flex min-h-screen">
      {sidebarOpen && <div className="md:hidden fixed inset-0 bg-black/45 z-30" onClick={onToggleSidebar} />}
      <Sidebar open={sidebarOpen} route={route} onNav={onNav} onLogout={onLogout} role={role} />
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar onToggleSidebar={onToggleSidebar} onNav={onNav} onLogout={onLogout} />
        <div className="p-4 sm:p-6 flex-1">{children}</div>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-5 flex flex-wrap gap-3 items-start justify-between">
      <div>
        <h1 className="text-[23px] font-bold m-0 text-navy-900">{title}</h1>
        {subtitle && <p className="text-[13px] text-navy-900/55 mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex gap-2.5 flex-wrap">{actions}</div>
    </div>
  );
}
