import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { me as fetchMe, heartbeat } from '../api/auth.js';

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

  // Send heartbeat every 30s while logged in so admin can see who's active
  useEffect(() => {
    if (!user) return;
    heartbeat().catch(() => {}); // immediate ping on login
    const id = setInterval(() => heartbeat().catch(() => {}), 30_000);
    return () => clearInterval(id);
  }, [user?.id]);

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

  const updateUser = useCallback((partial) => {
    setUser((prev) => {
      const next = { ...prev, ...partial };
      localStorage.setItem('bc_user', JSON.stringify(next));
      return next;
    });
  }, []);

  return (
    <AuthContext.Provider value={{
      user, loading, saveSession, logout, updateUser,
      isAdmin: user?.role === 'ADMIN',
      isTeacher: user?.role === 'TEACHER',
      isStudent: user?.role === 'STUDENT',
      isChief: user?.role === 'INSTITUTION_CHIEF',
      isViewOnly: !!user?.institutionId && user?.subscriptionActive === false,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
