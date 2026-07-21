import { useState, useEffect } from 'react';
import { listStudents, resetStudentPassword, lockStudent, unlockStudent } from '../api/teacher.js';
import Modal from '../components/ui/Modal.jsx';

export default function TeacherStudentsPage() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [tempPasswordResult, setTempPasswordResult] = useState(null); // { student, temporaryPassword } | null
  const [copied, setCopied] = useState(false);

  const load = () => listStudents().then(setStudents).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const handleResetPassword = async (student) => {
    if (!window.confirm(`Generate a new temporary password for ${student.name || student.email}? Their current password will stop working immediately.`)) return;
    setError(''); setBusyId(student.id);
    try {
      const result = await resetStudentPassword(student.id);
      setTempPasswordResult(result);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not reset password');
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleLock = async (student) => {
    setError(''); setBusyId(student.id);
    try {
      if (student.disabled) await unlockStudent(student.id);
      else await lockStudent(student.id);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not update account status');
    } finally {
      setBusyId(null);
    }
  };

  const classSection = (s) => s.gradeLevel ? [s.gradeLevel, s.section].filter(Boolean).join(' ') : [s.department, s.year].filter(Boolean).join(' ');

  return (
    <div className="page">
      <div className="container section">
        <h2 style={styles.heading}>My Students</h2>
        <p className="text-muted text-sm" style={{ marginBottom: 24 }}>
          Students registered under your institution. Reset a student's password if they've lost access —
          they'll need a temporary password from you since students don't use email recovery.
        </p>

        {error && <p className="form-error" style={{ marginBottom: 16 }}>{error}</p>}
        {loading && <div className="spinner" />}

        {!loading && students.length === 0 && (
          <div style={styles.empty}>
            <div style={{ fontSize: 60 }}>🎓</div>
            <h3>No students yet</h3>
            <p className="text-muted">Students will appear here once they register with your institution's code.</p>
          </div>
        )}

        {!loading && students.length > 0 && (
          <div className="card" style={{ padding: 0, overflow: 'hidden', overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.thead}>
                  <th style={styles.th}>Name</th>
                  <th style={styles.th}>Email</th>
                  <th style={styles.th}>Class / Section</th>
                  <th style={styles.th}>Roll No</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Last Login</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id} style={styles.tr}>
                    <td style={styles.td}>{s.name || '—'}</td>
                    <td style={styles.td}>{s.email}</td>
                    <td style={styles.td}>{classSection(s) || '—'}</td>
                    <td style={styles.td}>{s.rollNo || '—'}</td>
                    <td style={styles.td}>
                      <span style={s.disabled ? styles.badgeLocked : styles.badgeActive}>{s.disabled ? 'Locked' : 'Active'}</span>
                    </td>
                    <td style={styles.td}>{s.lastLoginAt ? new Date(s.lastLoginAt).toLocaleString() : 'Never'}</td>
                    <td style={styles.td}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="btn btn-sm btn-outline"
                          disabled={busyId === s.id}
                          onClick={() => handleResetPassword(s)}
                        >
                          Reset Password
                        </button>
                        <button
                          className="btn btn-sm btn-outline"
                          disabled={busyId === s.id}
                          onClick={() => handleToggleLock(s)}
                        >
                          {s.disabled ? 'Unlock' : 'Lock'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={!!tempPasswordResult}
        onClose={() => { setTempPasswordResult(null); setCopied(false); load(); }}
        title="Temporary password generated"
      >
        {tempPasswordResult && (
          <div>
            <p className="text-sm" style={{ marginBottom: 12 }}>
              For <strong>{tempPasswordResult.student.name || tempPasswordResult.student.email}</strong>.
              Share this with the student in person — it will not be shown again.
            </p>
            <div style={styles.tempPasswordBox}>
              <span style={styles.tempPasswordText}>{tempPasswordResult.temporaryPassword}</span>
              <button
                className="btn btn-sm btn-secondary"
                onClick={() => {
                  navigator.clipboard.writeText(tempPasswordResult.temporaryPassword);
                  setCopied(true);
                }}
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="text-muted text-sm" style={{ marginTop: 12 }}>
              Expires in 24 hours. The student will be asked to set their own password the moment they log in with it.
            </p>
            <button
              className="btn btn-primary w-full"
              style={{ marginTop: 16 }}
              onClick={() => { setTempPasswordResult(null); setCopied(false); load(); }}
            >
              Done
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}

const styles = {
  heading: { fontSize: 24, fontWeight: 700, marginBottom: 4 },
  empty: { textAlign: 'center', padding: '80px 0', color: 'var(--mid)' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 800 },
  thead: { background: 'var(--primary-light)' },
  tr: { borderBottom: '1px solid var(--border)' },
  th: { padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap' },
  td: { padding: '10px 14px', whiteSpace: 'nowrap' },
  badgeActive: { fontSize: 12, fontWeight: 600, color: 'var(--success)', background: 'rgba(16,185,129,0.12)', padding: '3px 10px', borderRadius: 999 },
  badgeLocked: { fontSize: 12, fontWeight: 600, color: 'var(--danger)', background: 'rgba(239,68,68,0.12)', padding: '3px 10px', borderRadius: 999 },
  tempPasswordBox: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    background: 'var(--light)', border: '1.5px solid var(--border)', borderRadius: 10, padding: '12px 16px',
  },
  tempPasswordText: { fontSize: 22, fontWeight: 700, letterSpacing: 2, fontFamily: 'monospace' },
};
