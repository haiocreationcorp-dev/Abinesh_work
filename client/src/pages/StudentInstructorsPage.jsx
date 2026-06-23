import { useState, useEffect } from 'react';
import { listInstructors, joinClass } from '../api/student.js';
import { useAuth } from '../context/AuthContext.jsx';

function JoinButton({ cls, onJoined, disabled }) {
  const status = cls.enrollments?.[0]?.status;
  const [joining, setJoining] = useState(false);

  const handleJoin = async () => {
    setJoining(true);
    try {
      const enrollment = await joinClass(cls.id);
      onJoined(cls.id, enrollment);
    } finally {
      setJoining(false);
    }
  };

  if (status === 'APPROVED') return <button className="btn btn-sm" disabled style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>✓ Joined</button>;
  if (status === 'PENDING') return <button className="btn btn-outline btn-sm" disabled>Pending approval</button>;

  return (
    <button className="btn btn-primary btn-sm" onClick={handleJoin} disabled={disabled || joining}>
      {joining ? 'Requesting…' : status === 'REJECTED' ? 'Re-request' : 'Join Class'}
    </button>
  );
}

export default function StudentInstructorsPage() {
  const { isViewOnly } = useAuth();
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listInstructors().then(setTeachers).finally(() => setLoading(false));
  }, []);

  const handleJoined = (classId, enrollment) => {
    setTeachers((prev) => prev.map((t) => ({
      ...t,
      classesCreated: t.classesCreated.map((c) => (c.id === classId ? { ...c, enrollments: [enrollment] } : c)),
    })));
  };

  return (
    <div className="page">
      <div className="container section">
        <h2 style={styles.heading}>Instructors</h2>
        <p className="text-muted text-sm" style={{ marginBottom: 24 }}>Teachers in your institution and their classes.</p>

        {loading && <div className="spinner" />}

        {!loading && teachers.length === 0 && (
          <div style={styles.empty}>
            <div style={{ fontSize: 60 }}>👩‍🏫</div>
            <h3>No instructors yet</h3>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {teachers.map((teacher) => (
            <div key={teacher.id} className="card" style={styles.teacherCard}>
              <strong style={{ fontSize: 16 }}>{teacher.name || teacher.email}</strong>
              {teacher.classesCreated.length === 0 ? (
                <p className="text-sm text-muted" style={{ marginTop: 8 }}>No classes yet.</p>
              ) : (
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {teacher.classesCreated.map((cls) => (
                    <div key={cls.id} style={styles.classRow}>
                      <span>{cls.name}</span>
                      <JoinButton cls={cls} onJoined={handleJoined} disabled={isViewOnly} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles = {
  heading: { fontSize: 24, fontWeight: 700, marginBottom: 4 },
  empty: { textAlign: 'center', padding: '80px 0', color: 'var(--mid)' },
  teacherCard: { padding: 16 },
  classRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)' },
};
