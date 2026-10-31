import React, { useEffect, useState, useCallback, lazy, Suspense } from 'react';
import { useAuth } from './context/AuthContext.jsx';
import { ModalHost } from './components/ui/Modal.jsx';
import { Toasts } from './components/ui/Toasts.jsx';
import { Skeleton } from './components/ui/DataStates.jsx';
import Shell from './components/layout/Shell.jsx';

import Splash from './pages/Splash.jsx';
const Login = lazy(() => import('./pages/auth/Login.jsx'));
const Register = lazy(() => import('./pages/auth/Register.jsx'));
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword.jsx'));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Centers = lazy(() => import('./pages/Centers.jsx'));
const Evacuees = lazy(() => import('./pages/Evacuees.jsx'));
const PriorityCases = lazy(() => import('./pages/PriorityCases.jsx'));
const Incidents = lazy(() => import('./pages/Incidents.jsx'));
const DromicReports = lazy(() => import('./pages/DromicReports.jsx'));
const Users = lazy(() => import('./pages/Users.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));

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
    const t = setTimeout(() => setShowSplash(false), 400);
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
        <Suspense fallback={<Skeleton label="Loading sign-in" />}><AuthPage goto={setAuthView} /></Suspense>
      ) : (
        <Shell
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
