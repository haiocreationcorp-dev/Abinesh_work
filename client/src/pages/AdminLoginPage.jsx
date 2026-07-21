import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { login } from '../api/auth.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function AdminLoginPage() {
  const { saveSession } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { token, user } = await login(form);
      if (user.role !== 'ADMIN') {
        setError('This login is for administrators only.');
        return;
      }
      saveSession(token, user);
      navigate('/admin');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.root}>
      <div className="card" style={styles.card}>
        <img src="/tool-icons/bharathcomic-wordmark.png" alt="BharathComic" style={styles.brandLogo} draggable={false} />
        <h2 style={styles.sub}>🔐 Admin Sign In</h2>
        <form onSubmit={handleSubmit} autoComplete="off">
          <div className="form-group">
            <label>Email</label>
            <input type="email" required autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input type="password" required autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          {error && <p className="form-error">{error}</p>}
          <button className="btn btn-primary w-full" type="submit" disabled={loading} style={{ marginTop: 8 }}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
        <p style={{ textAlign: 'center', marginTop: 12 }}>
          <Link to="/forgot-password" style={{ color: 'var(--primary)', fontSize: 13, textDecoration: 'none' }}>Forgot password?</Link>
        </p>
      </div>
    </div>
  );
}

const styles = {
  root: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--light)' },
  card: { width: '100%', maxWidth: 400, padding: 36 },
  brandLogo: { display: 'block', height: 70, width: 'auto', margin: '0 auto', objectFit: 'contain' },
  sub: { fontSize: 20, fontWeight: 600, margin: '8px 0 24px', textAlign: 'center' },
};
