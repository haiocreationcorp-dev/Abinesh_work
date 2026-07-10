import { useState, useEffect } from 'react';
import { listInstructors, joinClass, joinClassByCode } from '../api/student.js';
import { useAuth } from '../context/AuthContext.jsx';

const THEMES = [
  { grad: 'linear-gradient(135deg,#7C3AED 0%,#A855F7 100%)', accent: '#7C3AED', soft: '#EDE9FE' },
  { grad: 'linear-gradient(135deg,#2563EB 0%,#60A5FA 100%)', accent: '#2563EB', soft: '#DBEAFE' },
  { grad: 'linear-gradient(135deg,#EA580C 0%,#FB923C 100%)', accent: '#EA580C', soft: '#FFEDD5' },
  { grad: 'linear-gradient(135deg,#16A34A 0%,#4ADE80 100%)', accent: '#16A34A', soft: '#DCFCE7' },
  { grad: 'linear-gradient(135deg,#DB2777 0%,#F472B6 100%)', accent: '#DB2777', soft: '#FCE7F3' },
  { grad: 'linear-gradient(135deg,#0891B2 0%,#22D3EE 100%)', accent: '#0891B2', soft: '#CFFAFE' },
];

function getTheme(id = '') {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0x7fffffff;
  return THEMES[h % THEMES.length];
}

function StatusBadge({ status }) {
  const map = {
    APPROVED: { bg: '#DCFCE7', color: '#16A34A', label: '✓ Enrolled' },
    PENDING:  { bg: '#FFF7ED', color: '#EA580C', label: '⏳ Pending Approval' },
    REJECTED: { bg: '#FEE2E2', color: '#DC2626', label: '✗ Rejected' },
  };
  const s = map[status] || map.PENDING;
  return (
    <span style={{ background: s.bg, color: s.color, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999 }}>
      {s.label}
    </span>
  );
}

function ClassCard({ cls, teacherName, teacherInitial, onJoined, isViewOnly }) {
  const theme = getTheme(cls.id);
  const [hovered, setHovered] = useState(false);
  const [joining, setJoining] = useState(false);
  const status = cls.enrollments?.[0]?.status;

  const handleJoin = async () => {
    if (joining) return;
    setJoining(true);
    try {
      const enrollment = await joinClass(cls.id);
      onJoined(cls.id, enrollment);
    } finally {
      setJoining(false);
    }
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: '#fff', borderRadius: 18, overflow: 'hidden',
        boxShadow: hovered ? '0 18px 45px rgba(0,0,0,0.13)' : '0 4px 20px rgba(0,0,0,0.07)',
        transform: hovered ? 'translateY(-4px)' : 'translateY(0)',
        transition: 'all 220ms ease', border: '1px solid #f0f0f5',
      }}
    >
      <div style={{ background: theme.grad, padding: '20px 20px 16px' }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 8 }}>{cls.name}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: 'rgba(255,255,255,0.25)', border: '2px solid rgba(255,255,255,0.4)',
            color: '#fff', fontSize: 12, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{teacherInitial}</div>
          <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: 500 }}>
            {teacherName}
          </span>
        </div>
      </div>
      <div style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <StatusBadge status={status} />
        {!isViewOnly && status !== 'APPROVED' && (
          <button
            onClick={handleJoin}
            disabled={joining || status === 'PENDING'}
            style={{
              padding: '7px 16px', borderRadius: 10, border: 'none',
              background: status === 'PENDING' ? '#f1f5f9' : theme.grad,
              color: status === 'PENDING' ? '#94a3b8' : '#fff',
              fontSize: 13, fontWeight: 600, cursor: status === 'PENDING' ? 'default' : 'pointer',
              transition: 'all 150ms ease',
            }}
          >
            {joining ? 'Requesting…' : status === 'REJECTED' ? 'Re-request' : 'Join Class'}
          </button>
        )}
      </div>
    </div>
  );
}

function JoinByCode({ onJoined, isViewOnly }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { type: 'success'|'error', text }

  if (isViewOnly) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const enrollment = await joinClassByCode(code.trim());
      setMsg({
        type: 'success',
        text: enrollment.status === 'APPROVED'
          ? `Joined "${enrollment.className}"!`
          : `Request sent for "${enrollment.className}" — waiting on teacher approval.`,
      });
      setCode('');
      onJoined();
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Invalid code' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ background: '#fff', borderRadius: 14, padding: '16px 20px', marginBottom: 24, border: '1px solid #e2e8f0', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>Have a class code?</span>
      <input
        type="text" value={code} onChange={e => setCode(e.target.value.toUpperCase())}
        placeholder="e.g. AB3X-7KQM"
        style={{ padding: '9px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 14, width: 160, boxSizing: 'border-box', outline: 'none', letterSpacing: 0.5 }}
      />
      <button
        type="submit" disabled={!code.trim() || busy}
        style={{ padding: '9px 18px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#7C3AED,#A855F7)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: !code.trim() ? 0.6 : 1 }}
      >
        {busy ? 'Joining…' : 'Join'}
      </button>
      {msg && (
        <span style={{ fontSize: 13, fontWeight: 600, color: msg.type === 'success' ? '#16A34A' : '#DC2626' }}>
          {msg.text}
        </span>
      )}
    </form>
  );
}

export default function StudentInstructorsPage() {
  const { user, isViewOnly } = useAuth();
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listInstructors().then(setTeachers).finally(() => setLoading(false));
  }, []);

  const handleJoined = (classId, enrollment) => {
    setTeachers(prev => prev.map(t => ({
      ...t,
      classesCreated: t.classesCreated.map(c => c.id === classId ? { ...c, enrollments: [enrollment] } : c),
    })));
  };

  const enrolledCount = teachers.reduce((n, t) =>
    n + t.classesCreated.filter(c => c.enrollments?.[0]?.status === 'APPROVED').length, 0);
  const pendingCount = teachers.reduce((n, t) =>
    n + t.classesCreated.filter(c => c.enrollments?.[0]?.status === 'PENDING').length, 0);

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="page" style={{ minHeight: '100vh', background: '#F8FAFC' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 32px 60px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32, flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 30, fontWeight: 800, color: '#1e1b4b', margin: 0 }}>My Classroom</h1>
            <p style={{ color: '#64748b', fontSize: 15, marginTop: 6, marginBottom: 0 }}>
              Your enrolled classes and teachers — all in one place.
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
            <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>{today}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              {enrolledCount > 0 && <span style={{ background: '#DCFCE7', color: '#16A34A', fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 999 }}>✓ {enrolledCount} Enrolled</span>}
              {pendingCount > 0 && <span style={{ background: '#FFF7ED', color: '#EA580C', fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 999 }}>⏳ {pendingCount} Pending</span>}
            </div>
          </div>
        </div>

        {/* Student info strip */}
        {user?.rollNo && (
          <div style={{ background: '#fff', borderRadius: 14, padding: '14px 20px', marginBottom: 24, border: '1px solid #e2e8f0', display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ fontSize: 13, color: '#64748b' }}>
              <span style={{ fontWeight: 600, color: '#1e293b' }}>Roll No:</span> {user.rollNo}
            </div>
            {user.gradeLevel && <div style={{ fontSize: 13, color: '#64748b' }}>
              <span style={{ fontWeight: 600, color: '#1e293b' }}>Grade:</span> {user.gradeLevel}
            </div>}
            {user.section && <div style={{ fontSize: 13, color: '#64748b' }}>
              <span style={{ fontWeight: 600, color: '#1e293b' }}>Section:</span> {user.section}
            </div>}
            {user.department && <div style={{ fontSize: 13, color: '#64748b' }}>
              <span style={{ fontWeight: 600, color: '#1e293b' }}>Department:</span> {user.department}
            </div>}
            {user.year && <div style={{ fontSize: 13, color: '#64748b' }}>
              <span style={{ fontWeight: 600, color: '#1e293b' }}>Year:</span> {user.year}
            </div>}
          </div>
        )}

        <JoinByCode onJoined={() => listInstructors().then(setTeachers)} isViewOnly={isViewOnly} />

        {loading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 16 }}>
            {[1,2,3].map(i => (
              <div key={i} style={{ borderRadius: 18, overflow: 'hidden', background: '#fff', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
                <div style={{ height: 90, background: '#e2e8f0' }} />
                <div style={{ padding: 16, height: 40 }} />
              </div>
            ))}
          </div>
        )}

        {!loading && teachers.length === 0 && (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <div style={{ fontSize: 72, marginBottom: 16 }}>🏫</div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1e1b4b', marginBottom: 8 }}>No Classes Yet</h2>
            <p style={{ color: '#64748b', fontSize: 15 }}>
              Ask your teacher for the class name and request to join from here.
            </p>
          </div>
        )}

        {!loading && teachers.map(teacher => (
          teacher.classesCreated.length > 0 && (
            <div key={teacher.id} style={{ marginBottom: 32 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%',
                  background: 'linear-gradient(135deg,#7C3AED,#A855F7)',
                  color: '#fff', fontSize: 16, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  {(teacher.name || teacher.email).charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#1e1b4b' }}>
                    {teacher.name || teacher.email}
                  </div>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>
                    {teacher.classesCreated.length} class{teacher.classesCreated.length !== 1 ? 'es' : ''}
                  </div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 16 }}>
                {teacher.classesCreated.map(cls => (
                  <ClassCard
                    key={cls.id}
                    cls={cls}
                    teacherName={teacher.name || teacher.email}
                    teacherInitial={(teacher.name || teacher.email).charAt(0).toUpperCase()}
                    onJoined={handleJoined}
                    isViewOnly={isViewOnly}
                  />
                ))}
              </div>
            </div>
          )
        ))}
      </div>
    </div>
  );
}
