import { useState, useEffect } from 'react';
import { listStudents } from '../api/teacher.js';

export default function TeacherStudentsPage() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listStudents().then(setStudents).finally(() => setLoading(false));
  }, []);

  return (
    <div className="page">
      <div className="container section">
        <h2 style={styles.heading}>My Students</h2>
        <p className="text-muted text-sm" style={{ marginBottom: 24 }}>
          Students registered under your institution.
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
          <div className="card" style={{ padding: 0, overflow: 'hidden', maxWidth: 640 }}>
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
                  <tr key={s.id} style={styles.tr}>
                    <td style={styles.td}>{s.name || '—'}</td>
                    <td style={styles.td}>{s.email}</td>
                    <td style={styles.td}>{new Date(s.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  heading: { fontSize: 24, fontWeight: 700, marginBottom: 4 },
  empty: { textAlign: 'center', padding: '80px 0', color: 'var(--mid)' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  thead: { background: 'var(--primary-light)' },
  tr: { borderBottom: '1px solid var(--border)' },
  th: { padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 13 },
  td: { padding: '10px 14px' },
};
