import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api.js';
import { getSocket } from '../lib/socket.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const bootstrap = useCallback(async () => {
    const token = localStorage.getItem('rescom_token');
    if (!token) { setLoading(false); return; }
    try {
      const { user } = await api.get('/auth/me');
      setUser(user);
      getSocket().connect();
    } catch (e) {
      localStorage.removeItem('rescom_token');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { bootstrap(); }, [bootstrap]);

  const login = useCallback(async (username, password) => {
    const { user, token } = await api.post('/auth/login', { username, password }, { auth: false });
    localStorage.setItem('rescom_token', token);
    setUser(user);
    getSocket().connect();
    return user;
  }, []);

  // Returns { pending: true } for a new sign-up awaiting approval (no login happens),
  // or the user when the account was signed in straight away (the first admin).
  const register = useCallback(async (payload) => {
    const res = await api.post('/auth/register', payload, { auth: false });
    if (!res.token) return { pending: true, message: res.message, user: res.user };
    localStorage.setItem('rescom_token', res.token);
    setUser(res.user);
    getSocket().connect();
    return res.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('rescom_token');
    getSocket().disconnect();
    setUser(null);
  }, []);

  const updateUser = useCallback((patch) => setUser((u) => ({ ...u, ...patch })), []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);