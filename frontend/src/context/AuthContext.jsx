import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { api } from '../lib/api.js';
import { isPrepared, lockOffline, refreshRecords, setReachable, setVerifiedUser, syncStatus } from '../lib/sync.js';
import { getSocket } from '../lib/socket.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [serverUser, setServerUser] = useState(null);
  const [deviceUser, setDeviceUser] = useState(null);

  const rejectedToken = useRef(null);

  const restoreDevice = useCallback(async () => {
    const user = await api.restoreOffline();
    if (user) setDeviceUser(user);
    return user;
  }, []);

  const confirmSession = useCallback(async (user, token) => {
    const recovered = !syncStatus().reachable;
    rejectedToken.current = null;
    setReachable(true);
    setVerifiedUser(user, token);
    setServerUser(user);
    setDeviceUser(previous => previous?.user_id === user.user_id ? user : null);
    getSocket().connect();
    const restored = await restoreDevice().catch(() => null);
    if (localStorage.getItem('rescom_token') !== token) return;
    api.syncOffline().catch(() => {}).then(() => {
      if ((restored || recovered) && syncStatus().reachable) refreshRecords();
    });
  }, [restoreDevice]);

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
      if (localStorage.getItem('rescom_token') === token) await confirmSession(user, token);
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
    await confirmSession(user, token);
    return user;
  }, [confirmSession]);

  const register = useCallback(async payload => {
    const res = await api.post('/auth/register', payload, { auth: false });
    if (!res.token) return { pending: true, message: res.message, user: res.user };
    localStorage.setItem('rescom_token', res.token);
    await confirmSession(res.user, res.token);
    return res.user;
  }, [confirmSession]);

  const signInToSync = useCallback(() => {
    localStorage.removeItem('rescom_token');
    getSocket().disconnect();
    setVerifiedUser(null);
    setServerUser(null);
    setDeviceUser(null);
  }, []);

  const logout = useCallback(() => {
    lockOffline();
    signInToSync();
  }, [signInToSync]);

  const openDevice = useCallback(async passphrase => {
    const user = await api.openOffline(serverUser, passphrase);
    setDeviceUser(user);
    refreshRecords();
    api.syncOffline().catch(() => {});
  }, [serverUser]);

  const updateUser = useCallback(patch => setServerUser(user => user && ({ ...user, ...patch })), []);

  return (
    <AuthContext.Provider value={{
      user: serverUser || deviceUser, login, register, logout, updateUser, openDevice, restoreDevice, signInToSync,
      refreshSession: bootstrap
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
