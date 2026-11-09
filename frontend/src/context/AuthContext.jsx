import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api.js';
import { lockOffline, refreshRecords, setReachable, setVerifiedUser, syncStatus } from '../lib/sync.js';
import { getSocket } from '../lib/socket.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [serverUser, setServerUser] = useState(null);
  const [deviceUser, setDeviceUser] = useState(null);

  const confirmSession = useCallback((user, token) => {
    const recovered = !syncStatus().reachable;
    setReachable(true);
    setVerifiedUser(user, token);
    setServerUser(user);
    setDeviceUser(previous => previous?.user_id === user.user_id ? user : null);
    getSocket().connect();
    api.syncOffline().catch(() => {}).then(() => {
      if (recovered && syncStatus().reachable) refreshRecords();
    });
  }, []);

  const bootstrap = useCallback(async () => {
    const token = localStorage.getItem('rescom_token');
    if (!token || !navigator.onLine) return;
    try {
      const { user } = await api.get('/auth/me');
      if (localStorage.getItem('rescom_token') === token) confirmSession(user, token);
    } catch (error) {
      if (localStorage.getItem('rescom_token') === token && (error.status === 401 || error.status === 403)) {
        localStorage.removeItem('rescom_token');
        getSocket().disconnect();
        setVerifiedUser(null);
        setServerUser(null);
      }
    }
  }, [confirmSession]);

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

  const openDevice = useCallback(async (passphrase, confirmation) => {
    const user = await api.openOffline(serverUser, passphrase, confirmation);
    setDeviceUser(user);
    refreshRecords();
    api.syncOffline().catch(() => {});
  }, [serverUser]);

  const updateUser = useCallback(patch => setServerUser(user => user && ({ ...user, ...patch })), []);

  return (
    <AuthContext.Provider value={{
      user: serverUser || deviceUser, login, register, logout, updateUser, openDevice, signInToSync,
      refreshSession: bootstrap
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
