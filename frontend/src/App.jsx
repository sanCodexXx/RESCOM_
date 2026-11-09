import React, { useEffect, useState, useCallback, lazy, Suspense } from 'react';
import { useAuth } from './context/AuthContext.jsx';
import { ModalHost } from './components/ui/Modal.jsx';
import { Toasts } from './components/ui/Toasts.jsx';
import { Skeleton } from './components/ui/DataStates.jsx';
import Shell from './components/layout/Shell.jsx';
import { useOfflineAccess } from './components/ui/OfflineAccess.jsx';
import { canOpenOffline } from './lib/sync.js';

import Login from './pages/auth/Login.jsx';
import Register from './pages/auth/Register.jsx';
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword.jsx'));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Centers = lazy(() => import('./pages/Centers.jsx'));
const Evacuees = lazy(() => import('./pages/Evacuees.jsx'));
const PriorityCases = lazy(() => import('./pages/PriorityCases.jsx'));
const Incidents = lazy(() => import('./pages/Incidents.jsx'));
const DromicReports = lazy(() => import('./pages/DromicReports.jsx'));
const Users = lazy(() => import('./pages/Users.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));
const Starlink = lazy(() => import('./pages/Starlink.jsx'));

const PAGES = {
  dashboard: Dashboard,
  starlink: Starlink,
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
  const { user, logout } = useAuth();
  const [authView, setAuthView] = useState('login');
  const [route, setRoute] = useState('dashboard');
  const [ctx, setCtx] = useState({});
  const { openOffline } = useOfflineAccess({ restore: true });
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth >= 768);

  // Open the sidebar when the window grows to desktop width, close it when it shrinks to mobile.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = (e) => setSidebarOpen(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (user) setRoute('dashboard');
    else setAuthView('login'); // reset to login after logout
  }, [user?.user_id]);

  const nav = useCallback((r, c = {}) => {
    window.scrollTo(0, 0);
    setRoute(r);
    setCtx(c);
    if (window.innerWidth < 768) setSidebarOpen(false);
  }, []);

  const Page = PAGES[route] || Dashboard;
  const AuthPage = AUTH_PAGES[authView] || Login;

  return (
    <>
      {!user ? (
        <Suspense fallback={null}>
          <AuthPage goto={setAuthView} openOffline={canOpenOffline() ? openOffline : undefined} />
        </Suspense>
      ) : (
        <Shell
          key={user.user_id}
          route={route}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
          onNav={nav}
          onLogout={logout}
          role={user.role}
        >
          <Suspense fallback={<Skeleton label="Loading page" />}><Page onNav={nav} ctx={ctx} /></Suspense>
        </Shell>
      )}
      {/* Always mounted regardless of auth state, so modals/toasts/the
          success checkmark work on the login/register/forgot screens too. */}
      <ModalHost />
      <Toasts />
    </>
  );
}
