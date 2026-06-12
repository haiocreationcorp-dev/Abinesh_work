import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';

export default function Navbar() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <nav style={styles.nav}>
      <Link to="/dashboard" style={styles.brand}>
        BharathComic
      </Link>
      <div style={styles.right}>
        {user && (
          <>
            <span style={styles.email}>{user.email}</span>
            {isAdmin && (
              <Link to="/admin">
                <button className="btn btn-outline btn-sm">Admin</button>
              </Link>
            )}
            <button className="btn btn-ghost btn-sm" onClick={handleLogout}>
              Logout
            </button>
          </>
        )}
      </div>
    </nav>
  );
}

const styles = {
  nav: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    height: 64,
    background: '#1a1a2e',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 24px',
    zIndex: 100,
    boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
  },
  brand: {
    fontFamily: 'Bangers, cursive',
    fontSize: 26,
    color: '#a78bfa',
    letterSpacing: 1,
  },
  right: { display: 'flex', alignItems: 'center', gap: 12 },
  email: { fontSize: 13, color: '#94a3b8' },
};
