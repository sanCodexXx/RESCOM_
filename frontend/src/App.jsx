import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from './context/AuthContext.jsx';
import { ModalHost } from './components/ui/Modal.jsx';
import { Toasts } from './components/ui/Toasts.jsx';
import Shell from './components/layout/Shell.jsx';

import Splash from './pages/Splash.jsx';
import Login from './pages/auth/Login.jsx';
import Register from './pages/auth/Register.jsx';
import ForgotPassword from './pages/auth/ForgotPassword.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Centers from './pages/Centers.jsx';
import Evacuees from './pages/Evacuees.jsx';
import PriorityCases from './pages/PriorityCases.jsx';
import Incidents from './pages/Incidents.jsx';
import DromicReports from './pages/DromicReports.jsx';
import Users from './pages/Users.jsx';
import Settings from './pages/Settings.jsx';

const PAGES = {
  dashboard: Dashboard,
  centers: Centers,
  evacuees: Evacuees,
  priority: PriorityCases,
  incidents: Incidents,
  dromic: DromicReports,
  users: Users,
  settings: Settings
};

const AUTH_PAGES = {
  login: Login,
  register: Register,
  forgot: ForgotPassword
};

export default function App() {
  const { user, loading, logout } = useAuth();
  const [showSplash, setShowSplash] = useState(true);
  const [authView, setAuthView] = useState('login');
  const [route, setRoute] = useState('dashboard');
  const [ctx, setCtx] = useState({});
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth >= 768);

  // Open the sidebar when the window grows to desktop width, close it when it shrinks to mobile.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = (e) => setSidebarOpen(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setShowSplash(false), 1600);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (user) setRoute('dashboard');
    else setAuthView('login'); // reset to login after logout
  }, [user?.user_id]);

  const nav = useCallback((r, c = {}) => {
    setRoute(r);
    setCtx(c);
    if (window.innerWidth < 768) setSidebarOpen(false);
    window.scrollTo(0, 0);
  }, []);

  if (showSplash) return <Splash />;

  const Page = PAGES[route] || Dashboard;
  const AuthPage = AUTH_PAGES[authView] || Login;

  return (
    <>
      {loading ? (
        <div className="min-h-screen grid place-items-center text-navy-900/50 text-sm">Loading RESCOM…</div>
      ) : !user ? (
        <AuthPage goto={setAuthView} />
      ) : (
        <Shell
          route={route}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
          onNav={nav}
          onLogout={logout}
          role={user.role}
        >
          <Page onNav={nav} ctx={ctx} />
        </Shell>
      )}
      {/* Always mounted regardless of auth state, so modals/toasts/the
          success checkmark work on the login/register/forgot screens too. */}
      <ModalHost />
      <Toasts />
    </>
  );
}
