import { useState, useEffect } from 'react';
import { gateCheck } from '../../api/auth.js';

const STORAGE_KEY = 'bc_gate_pw';

export default function SiteGate({ children }) {
  const [unlocked, setUnlocked] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (!saved) { setChecking(false); return; }
    gateCheck(saved)
      .then(() => setUnlocked(true))
      .catch(() => sessionStorage.removeItem(STORAGE_KEY))
      .finally(() => setChecking(false));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await gateCheck(password);
      sessionStorage.setItem(STORAGE_KEY, password);
      setUnlocked(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Incorrect password');
    } finally {
      setLoading(false);
    }
  };

  if (checking) return null;
  if (unlocked) return children;

  return (
    <div style={styles.root}>
      <div className="card" style={styles.card}>
        <h1 style={styles.title}>BharathComic</h1>
        <p style={styles.note}>This app is in development. Enter the access password to continue.</p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Access Password</label>
            <input
              type="password"
              required
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="form-error">{error}</p>}
          <button className="btn btn-primary w-full" type="submit" disabled={loading} style={{ marginTop: 8 }}>
            {loading ? 'Checking…' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  root: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--light)' },
  card: { width: '100%', maxWidth: 400, padding: 36 },
  title: { fontFamily: 'Bangers, cursive', fontSize: 32, color: 'var(--primary)', textAlign: 'center', letterSpacing: 1 },
  note: { fontSize: 13, color: 'var(--mid)', textAlign: 'center', margin: '8px 0 24px', lineHeight: 1.6 },
};
