import { useState, useEffect } from 'react';
import { createClass, listClasses, deleteClass, updateEnrollment } from '../api/teacher.js';
import { useAuth } from '../context/AuthContext.jsx';

const STATUS_LABEL = { PENDING: 'Pending', APPROVED: 'Approved', REJECTED: 'Rejected' };

export default function TeacherClassesPage() {
  const { isViewOnly } = useAuth();
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    listClasses().then(setClasses).finally(() => setLoading(false));
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setError('');
    setCreating(true);
    try {
      const cls = await createClass(name.trim());
      setClasses((prev) => [{ ...cls, enrollments: [] }, ...prev]);
      setName('');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create class');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this class? Its tasks and submissions will be deleted too.')) return;
    await deleteClass(id);
    setClasses((prev) => prev.filter((c) => c.id !== id));
  };

  const handleEnrollment = async (classId, enrollmentId, status) => {
    const updated = await updateEnrollment(classId, enrollmentId, status);
    setClasses((prev) => prev.map((c) => (
      c.id !== classId ? c : { ...c, enrollments: c.enrollments.map((e) => (e.id === updated.id ? { ...e, status: updated.status } : e)) }
    )));
  };

  return (
    <div className="page">
      <div className="container section">
        <h2 style={styles.heading}>My Classes</h2>
        <p className="text-muted text-sm" style={{ marginBottom: 24 }}>
          Students request to join your classes; approve them here before assigning tasks.
        </p>

        {!isViewOnly && (
          <form onSubmit={handleCreate} style={styles.createForm}>
            <input type="text" placeholder="Class name (e.g. Grade 10-A)" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1 }} />
            <button className="btn btn-primary" type="submit" disabled={creating}>
              {creating ? 'Creating…' : '+ Create Class'}
            </button>
          </form>
        )}
        {error && <p className="form-error">{error}</p>}

        {loading && <div className="spinner" />}

        {!loading && classes.length === 0 && (
          <div style={styles.empty}>
            <div style={{ fontSize: 60 }}>🏷️</div>
            <h3>No classes yet</h3>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {classes.map((cls) => {
            const pending = cls.enrollments.filter((e) => e.status === 'PENDING');
            const others = cls.enrollments.filter((e) => e.status !== 'PENDING');
            return (
              <div key={cls.id} className="card" style={styles.classCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: 16 }}>{cls.name}</strong>
                  {!isViewOnly && (
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(cls.id)}>Delete</button>
                  )}
                </div>

                {pending.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <p className="text-sm" style={{ fontWeight: 700 }}>Pending requests</p>
                    {pending.map((e) => (
                      <div key={e.id} style={styles.enrollRow}>
                        <span>{e.student.name || e.student.email}</span>
                        {!isViewOnly && (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-primary btn-sm" onClick={() => handleEnrollment(cls.id, e.id, 'APPROVED')}>Approve</button>
                            <button className="btn btn-outline btn-sm" onClick={() => handleEnrollment(cls.id, e.id, 'REJECTED')}>Reject</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {others.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <p className="text-sm" style={{ fontWeight: 700 }}>Members</p>
                    {others.map((e) => (
                      <div key={e.id} style={styles.enrollRow}>
                        <span>{e.student.name || e.student.email}</span>
                        <span className={`badge ${e.status === 'REJECTED' ? 'badge-admin' : ''}`}>{STATUS_LABEL[e.status]}</span>
                      </div>
                    ))}
                  </div>
                )}

                {cls.enrollments.length === 0 && <p className="text-sm text-muted" style={{ marginTop: 8 }}>No join requests yet.</p>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const styles = {
  heading: { fontSize: 24, fontWeight: 700, marginBottom: 4 },
  createForm: { display: 'flex', gap: 10, marginBottom: 16, maxWidth: 480 },
  empty: { textAlign: 'center', padding: '80px 0', color: 'var(--mid)' },
  classCard: { padding: 16 },
  enrollRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)' },
};
