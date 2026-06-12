import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { me as fetchMe } from '../api/auth.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('bc_user')); } catch { return null; }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('bc_token');
    if (!token) { setLoading(false); return; }
    fetchMe()
      .then(setUser)
      .catch(() => { localStorage.removeItem('bc_token'); localStorage.removeItem('bc_user'); })
      .finally(() => setLoading(false));
  }, []);

  const saveSession = useCallback((token, userData) => {
    localStorage.setItem('bc_token', token);
    localStorage.setItem('bc_user', JSON.stringify(userData));
    setUser(userData);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('bc_token');
    localStorage.removeItem('bc_user');
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, saveSession, logout, isAdmin: user?.role === 'ADMIN' }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
