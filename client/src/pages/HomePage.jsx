import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function HomePage() {
  const { user } = useAuth();

  return (
    <div style={styles.root}>
      <nav style={styles.nav}>
        <span style={styles.brand}>BharathComic</span>
        <div style={{ display: 'flex', gap: 12 }}>
          {user ? (
            <Link to="/dashboard"><button className="btn btn-primary">Go to Dashboard</button></Link>
          ) : (
            <>
              <Link to="/login"><button className="btn btn-outline" style={{ color: '#fff', borderColor: '#fff' }}>Login</button></Link>
              <Link to="/register"><button className="btn btn-secondary">Get Started</button></Link>
            </>
          )}
        </div>
      </nav>

      <main style={styles.hero}>
        <h1 style={styles.title}>Create Comics<br />Like a Bharati.</h1>
        <p style={styles.sub}>
          A browser-based comic strip creator with drag-and-drop characters,<br />
          skeletal posing, speech bubbles, and one-click export.
        </p>
        <Link to={user ? '/dashboard' : '/register'}>
          <button className="btn btn-primary btn-lg" style={{ marginTop: 32 }}>
            Start Creating Free
          </button>
        </Link>

        <div style={styles.features}>
          {[
            { icon: '🎭', title: 'SVG Characters', desc: 'Pose characters with a click-and-drag skeletal rig' },
            { icon: '💬', title: 'Speech Bubbles', desc: 'Multiple styles — speech, thought, shout, whisper' },
            { icon: '🖼️', title: 'Panel Layouts', desc: '6 grid layouts for single to 6-panel comic strips' },
            { icon: '📤', title: 'PNG / PDF Export', desc: 'Export your strip in one click, print-ready' },
          ].map((f) => (
            <div key={f.title} style={styles.feature}>
              <div style={styles.featureIcon}>{f.icon}</div>
              <strong>{f.title}</strong>
              <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

const styles = {
  root: { minHeight: '100vh', background: 'linear-gradient(135deg, #1a1a2e 0%, #2a2a4a 100%)', color: '#fff' },
  nav: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 40px', height: 64 },
  brand: { fontFamily: 'var(--font-display)', fontSize: 28, color: '#a78bfa', letterSpacing: 1 },
  hero: { maxWidth: 900, margin: '0 auto', padding: '100px 24px 60px', textAlign: 'center' },
  title: { fontFamily: 'Bangers, cursive', fontSize: 72, lineHeight: 1.1, letterSpacing: 2, color: '#f8f9ff' },
  sub: { fontSize: 18, color: '#94a3b8', marginTop: 20, lineHeight: 1.7 },
  features: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 20, marginTop: 80, textAlign: 'left' },
  feature: { background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 20, border: '1px solid rgba(167,139,250,0.2)' },
  featureIcon: { fontSize: 28, marginBottom: 10 },
};
