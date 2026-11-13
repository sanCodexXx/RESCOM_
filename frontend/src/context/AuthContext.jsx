import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { api } from '../lib/api.js';
import { forgetCachedReport, isPrepared, lockOffline, refreshRecords, setReachable, setVerifiedUser, syncStatus } from '../lib/sync.js';
import { getSocket } from '../lib/socket.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [serverUser, setServerUser] = useState(null);
  const [deviceUser, setDeviceUser] = useState(null);

  const rejectedToken = useRef(null);

  const restoreDevice = useCallback(async () => {
    const token = localStorage.getItem('rescom_token');
    const user = await api.restoreOffline();
    if (user && localStorage.getItem('rescom_token') === token) setDeviceUser(user);
    return user;
  }, []);

  const prepareDevice = useCallback(async () => {
    const token = localStorage.getItem('rescom_token');
    const user = await api.prepareOffline();
    if (!user || localStorage.getItem('rescom_token') !== token) return;
    setDeviceUser(previous => previous?.user_id === user.user_id ? previous : user);
    api.warmOffline();
  }, []);

  const confirmSession = useCallback((user, token) => {
    const recovered = !syncStatus().reachable;
    rejectedToken.current = null;
    setReachable(true);
    setVerifiedUser(user, token);
    setServerUser(user);
    setDeviceUser(previous => previous?.user_id === user.user_id ? user : null);
    getSocket().connect();
    prepareDevice().catch(() => {}).then(async () => {
      if (localStorage.getItem('rescom_token') !== token) return;
      await api.syncOffline().catch(() => {});
      if (recovered && syncStatus().reachable) refreshRecords();
    });
  }, [prepareDevice]);

  const bootstrap = useCallback(async () => {
    const token = localStorage.getItem('rescom_token');
    if (!token || rejectedToken.current === token) return;
    if (!navigator.onLine) {
      setReachable(false);
      await restoreDevice().catch(() => {});
      return;
    }
    try {
      const { user } = await api.getSession(token, isPrepared() ? 5000 : 45000);
      if (localStorage.getItem('rescom_token') === token) confirmSession(user, token);
    } catch (error) {
      if (localStorage.getItem('rescom_token') !== token) return;
      if (error.network || error.status >= 500) {
        setReachable(false);
        await restoreDevice().catch(() => {});
        return;
      }
      if (error.status !== 401 && error.status !== 403) return;

      getSocket().disconnect();
      setVerifiedUser(null);
      setServerUser(null);
      if (error.message === 'Invalid or expired token') {
        const device = await restoreDevice().catch(() => null);
        if (localStorage.getItem('rescom_token') !== token) return;
        if (device) {
          rejectedToken.current = token;
          return;
        }
      }
      lockOffline();
      setDeviceUser(null);
      localStorage.removeItem('rescom_token');
    }
  }, [confirmSession, restoreDevice]);

  useEffect(() => {
    const sessionChanged = event => {
      if (event.key !== 'rescom_token') return;
      getSocket().disconnect();
      setVerifiedUser(null);
      lockOffline();
      setServerUser(null);
      setDeviceUser(null);
      if (event.newValue) bootstrap();
    };
    bootstrap();
    window.addEventListener('online', bootstrap);
    window.addEventListener('storage', sessionChanged);
    return () => {
      window.removeEventListener('online', bootstrap);
      window.removeEventListener('storage', sessionChanged);
    };
  }, [bootstrap]);

  const login = useCallback(async (username, password) => {
    const { user, token } = await api.post('/auth/login', { username, password }, { auth: false });
    localStorage.setItem('rescom_token', token);
    confirmSession(user, token);
    return user;
  }, [confirmSession]);

  const register = useCallback(async payload => {
    const res = await api.post('/auth/register', payload, { auth: false });
    if (!res.token) return { pending: true, message: res.message, user: res.user };
    localStorage.setItem('rescom_token', res.token);
    confirmSession(res.user, res.token);
    return res.user;
  }, [confirmSession]);

  const signInToSync = useCallback(() => {
    lockOffline();
    localStorage.removeItem('rescom_token');
    getSocket().disconnect();
    setVerifiedUser(null);
    setServerUser(null);
    setDeviceUser(null);
  }, []);

  useEffect(() => {
    if (!serverUser) return;
    const socket = getSocket();
    const reportDeleted = ({ report_id }) => forgetCachedReport(report_id).catch(() => {}).then(refreshRecords);
    socket.on('dromic_report_deleted', reportDeleted);
    return () => socket.off('dromic_report_deleted', reportDeleted);
  }, [serverUser?.user_id]);

  const updateUser = useCallback(patch => setServerUser(user => user && ({ ...user, ...patch })), []);

  return (
    <AuthContext.Provider value={{
      user: serverUser || deviceUser, login, register, logout: signInToSync, updateUser, prepareDevice, signInToSync,
      refreshSession: bootstrap
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
