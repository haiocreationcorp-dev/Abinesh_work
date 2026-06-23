import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { listStudents, listStudentComics } from '../api/teacher.js';

export default function TeacherStudentsPage() {
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null); // student object
  const [comics, setComics] = useState([]);
  const [comicsLoading, setComicsLoading] = useState(false);

  useEffect(() => {
    listStudents().then(setStudents).finally(() => setLoading(false));
  }, []);

  const openStudent = async (student) => {
    setSelected(student);
    setComicsLoading(true);
    try {
      const { comics } = await listStudentComics(student.id);
      setComics(comics);
    } finally {
      setComicsLoading(false);
    }
  };

  return (
    <div className="page">
      <div className="container section">
        <h2 style={styles.heading}>My Students</h2>
        <p className="text-muted text-sm" style={{ marginBottom: 24 }}>
          Comics created by students in your institution. View only.
        </p>

        {loading && <div className="spinner" />}

        {!loading && students.length === 0 && (
          <div style={styles.empty}>
            <div style={{ fontSize: 60 }}>🎓</div>
            <h3>No students yet</h3>
            <p className="text-muted">Students will appear here once they register with your institution's code.</p>
          </div>
        )}

        {!loading && students.length > 0 && (
          <div style={styles.layout}>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table style={styles.table}>
                <thead>
                  <tr style={styles.thead}>
                    <th style={styles.th}>Name</th>
                    <th style={styles.th}>Email</th>
                    <th style={styles.th}>Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => (
                    <tr
                      key={s.id}
                      style={{ ...styles.tr, cursor: 'pointer', background: selected?.id === s.id ? 'var(--primary-light)' : 'transparent' }}
                      onClick={() => openStudent(s)}
                    >
                      <td style={styles.td}>{s.name || '—'}</td>
                      <td style={styles.td}>{s.email}</td>
                      <td style={styles.td}>{new Date(s.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {selected && (
              <div>
                <h3 style={{ fontSize: 17, marginBottom: 12 }}>{selected.name || selected.email}'s comics</h3>
                {comicsLoading && <div className="spinner" />}
                {!comicsLoading && comics.length === 0 && <p className="text-muted">No comics yet.</p>}
                <div style={styles.grid}>
                  {comics.map((comic) => (
                    <div
                      key={comic.id}
                      className="card"
                      style={styles.comicCard}
                      onClick={() => navigate(`/teacher/view/${selected.id}/${comic.id}`)}
                    >
                      <div style={styles.comicThumb}>
                        <span style={{ fontSize: 40 }}>🎨</span>
                      </div>
                      <div style={styles.comicInfo}>
                        <strong style={{ fontSize: 15 }}>{comic.title}</strong>
                        <p className="text-sm text-muted">{comic.panels?.length ?? 0} panel(s)</p>
                        <p className="text-sm text-muted">{new Date(comic.updatedAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  heading: { fontSize: 24, fontWeight: 700, marginBottom: 4 },
  empty: { textAlign: 'center', padding: '80px 0', color: 'var(--mid)' },
  layout: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, alignItems: 'start' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  thead: { background: 'var(--primary-light)' },
  tr: { borderBottom: '1px solid var(--border)' },
  th: { padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 13 },
  td: { padding: '10px 14px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 },
  comicCard: { cursor: 'pointer' },
  comicThumb: { height: 110, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  comicInfo: { padding: '12px 12px 12px', display: 'flex', flexDirection: 'column', gap: 3 },
};
