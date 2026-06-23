import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { listComics, createComic, deleteComic } from '../api/comics.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function DashboardPage() {
  const { user, isViewOnly } = useAuth();
  const navigate = useNavigate();
  const [comics, setComics] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listComics().then(setComics).finally(() => setLoading(false));
  }, []);

  const handleCreate = async () => {
    const comic = await createComic({ title: 'Untitled Comic' });
    navigate(`/editor/${comic.id}`);
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!confirm('Delete this comic?')) return;
    await deleteComic(id);
    setComics((prev) => prev.filter((c) => c.id !== id));
  };

  return (
    <div className="page">
      <div className="container section">
        <div style={styles.header}>
          <div>
            <h2 style={styles.greeting}>Hello, {user?.name || user?.email} 👋</h2>
            <p className="text-muted text-sm">
              {isViewOnly ? '🔒 View only — your institution\'s subscription has expired' : 'Your comic strips'}
            </p>
          </div>
          {!isViewOnly && <button className="btn btn-primary" onClick={handleCreate}>+ New Comic</button>}
        </div>

        {loading && <div className="spinner" />}

        {!loading && comics.length === 0 && (
          <div style={styles.empty}>
            <div style={{ fontSize: 60 }}>📖</div>
            <h3>No comics yet</h3>
            <p className="text-muted">Click "New Comic" to start your first strip</p>
          </div>
        )}

        <div style={styles.grid}>
          {comics.map((comic) => (
            <div
              key={comic.id}
              className="card"
              style={styles.comicCard}
              onClick={() => navigate(`/editor/${comic.id}`)}
            >
              <div style={styles.comicThumb}>
                <span style={{ fontSize: 40 }}>🎨</span>
              </div>
              <div style={styles.comicInfo}>
                <strong style={{ fontSize: 15 }}>{comic.title}</strong>
                <p className="text-sm text-muted">{comic.panels?.length ?? 0} panel(s)</p>
                <p className="text-sm text-muted">{new Date(comic.updatedAt).toLocaleDateString()}</p>
              </div>
              {!isViewOnly && (
                <button
                  className="btn btn-danger btn-sm"
                  style={{ margin: '0 12px 12px auto', display: 'block' }}
                  onClick={(e) => handleDelete(comic.id, e)}
                >
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles = {
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 },
  greeting: { fontSize: 24, fontWeight: 700 },
  empty: { textAlign: 'center', padding: '80px 0', color: 'var(--mid)' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 20 },
  comicCard: { cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s' },
  comicThumb: { height: 140, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  comicInfo: { padding: '12px 12px 8px', display: 'flex', flexDirection: 'column', gap: 3 },
};
