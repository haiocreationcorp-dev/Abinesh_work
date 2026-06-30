import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useUITheme } from '../../context/UIThemeContext.jsx';
import ProfileMenu from './ProfileMenu.jsx';

function IconSettings() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function IconBell() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function IconSun() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
    </svg>
  );
}

function IconMoon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

function IconMenu() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

export default function Navbar() {
  const { user, isAdmin, isTeacher, isStudent, isChief } = useAuth();
  const { mode, toggle } = useUITheme();
  const [notifOpen, setNotifOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  // Role-specific quick links — rendered inline (desktop) or collapsed into the
  // "More" menu below 860px (see .navbar-actions/.navbar-more-btn in index.css).
  const roleLinks = [
    isChief && { to: '/chief/billing', label: 'Billing' },
    isTeacher && { to: '/teacher/students', label: 'My Students' },
    isTeacher && { to: '/teacher/classes', label: 'My Classes' },
    isTeacher && { to: '/teacher/tasks', label: 'Assign Task' },
    isStudent && { to: '/student/instructors', label: 'Instructors' },
    isStudent && { to: '/student/tasks', label: 'My Assignments' },
  ].filter(Boolean);

  return (
    <nav style={styles.nav}>
      <span className="navbar-welcome" style={styles.welcome}>Welcome back, {user?.name || 'Boss'}!</span>

      <Link to="/dashboard" style={styles.brand}>
        BharathComic
      </Link>

      <div style={styles.right}>
        {user && (
          <>
            {isAdmin && (
              <div className="navbar-search" style={styles.searchWrap} title="Coming soon">
                <IconSearch />
                <input style={styles.searchInput} placeholder="Search comics, users, institutions…" disabled />
              </div>
            )}

            {roleLinks.length > 0 && (
              <div className="navbar-actions">
                {roleLinks.map((l) => (
                  <Link key={l.to} to={l.to}>
                    <button className="btn btn-outline btn-sm">{l.label}</button>
                  </Link>
                ))}
              </div>
            )}

            {roleLinks.length > 0 && (
              <div className="navbar-more-btn" style={styles.iconWrap}>
                {moreOpen && <div style={styles.overlay} onClick={() => setMoreOpen(false)} />}
                <button style={styles.iconBtn} onClick={() => setMoreOpen((o) => !o)} aria-label="More" title="More">
                  <IconMenu />
                </button>
                {moreOpen && (
                  <div style={styles.notifMenu}>
                    {roleLinks.map((l) => (
                      <Link key={l.to} to={l.to} onClick={() => setMoreOpen(false)}>
                        <button className="btn btn-outline btn-sm w-full" style={{ marginBottom: 6 }}>{l.label}</button>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}

            {isAdmin && (
              <div style={styles.iconWrap}>
                {notifOpen && <div style={styles.overlay} onClick={() => setNotifOpen(false)} />}
                <button style={styles.iconBtn} onClick={() => setNotifOpen((o) => !o)} aria-label="Notifications" title="Notifications">
                  <IconBell />
                </button>
                {notifOpen && (
                  <div style={styles.notifMenu}>
                    <div style={styles.notifTitle}>Notifications</div>
                    <p className="text-muted text-sm" style={{ textAlign: 'center', padding: '12px 0' }}>No notifications yet.</p>
                  </div>
                )}
              </div>
            )}

            {isAdmin && (
              <Link to="/admin">
                <button style={styles.iconBtn} aria-label="Configure" title="Configure">
                  <IconSettings />
                </button>
              </Link>
            )}

            <button style={styles.iconBtn} onClick={toggle} aria-label="Toggle dark mode" title="Toggle dark mode">
              {mode === 'dark' ? <IconSun /> : <IconMoon />}
            </button>

            <ProfileMenu />
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
    height: 72,
    background: 'var(--header-gradient)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 24px',
    zIndex: 100,
    boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
  },
  welcome: { fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.85)', flex: '0 0 auto' },
  brand: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    fontFamily: 'var(--font-display)',
    fontSize: 26,
    color: '#fff',
    letterSpacing: 1,
  },
  right: { display: 'flex', alignItems: 'center', gap: 12 },
  searchWrap: {
    display: 'flex', alignItems: 'center', gap: 8,
    background: 'rgba(255,255,255,0.08)', borderRadius: 'var(--radius-sm)',
    padding: '7px 12px', color: '#94a3b8', width: 220,
  },
  searchInput: { background: 'transparent', border: 'none', color: '#fff', fontSize: 13, width: '100%', padding: 0 },
  iconWrap: { position: 'relative' },
  overlay: { position: 'fixed', inset: 0, zIndex: 99 },
  iconBtn: {
    width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.08)',
    color: '#cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center',
    position: 'relative', zIndex: 100,
  },
  notifMenu: {
    position: 'absolute', right: 0, top: 46, background: 'var(--surface)',
    border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-lg)',
    padding: 14, width: 240, zIndex: 100,
  },
  notifTitle: { fontSize: 13, fontWeight: 700, color: 'var(--dark)' },
};
