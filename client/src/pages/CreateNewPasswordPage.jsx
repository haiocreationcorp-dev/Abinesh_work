import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { forceChangePassword } from '../api/auth.js';
import { useAuth } from '../context/AuthContext.jsx';

// Shown immediately after a student logs in with a teacher-issued temporary password
// (login response's mustChangePassword: true). The student cannot continue to the
// dashboard until they set their own password — enforced by ProtectedRoute checking
// user.mustChangePassword.
export default function CreateNewPasswordPage() {
  const { user, updateUser, logout } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await forceChangePassword(currentPassword, newPassword);
      updateUser({ mustChangePassword: false });
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not update password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.root}>
      <div className="card" style={styles.card}>
        <img src="/tool-icons/bharathcomic-wordmark.png" alt="BharathComic" style={styles.brandLogo} draggable={false} />
        <h2 style={styles.sub}>Create a new password</h2>
        <p style={styles.hint}>
          Hi {user?.name || 'there'} — your teacher gave you a temporary password. Please set your own password to continue.
        </p>
        <form onSubmit={handleSubmit} autoComplete="off">
          <div className="form-group">
            <label>Temporary password</label>
            <input type="password" required autoComplete="off" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </div>
          <div className="form-group">
            <label>New password</label>
            <input type="password" required autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Confirm new password</label>
            <input type="password" required autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          </div>
          {error && <p className="form-error">{error}</p>}
          <button className="btn btn-primary w-full" type="submit" disabled={loading} style={{ marginTop: 8 }}>
            {loading ? 'Saving…' : 'Set password & continue'}
          </button>
        </form>
        <button type="button" onClick={logout} style={styles.logoutLink}>Log out instead</button>
      </div>
    </div>
  );
}

const styles = {
  root: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--light)' },
  card: { width: '100%', maxWidth: 400, padding: 36 },
  brandLogo: { display: 'block', height: 70, width: 'auto', margin: '0 auto', objectFit: 'contain' },
  sub: { fontSize: 20, fontWeight: 600, margin: '8px 0 12px', textAlign: 'center' },
  hint: { fontSize: 13, color: 'var(--mid)', marginBottom: 20, lineHeight: 1.5, textAlign: 'center' },
  logoutLink: { display: 'block', margin: '16px auto 0', background: 'none', border: 'none', color: 'var(--mid)', fontSize: 13, cursor: 'pointer', textAlign: 'center', width: '100%' },
};
