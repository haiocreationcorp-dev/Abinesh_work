import { useState, useEffect, useMemo } from 'react';
import { createClass, listClasses, deleteClass, updateEnrollment, toggleClassAI, listTeacherTasks } from '../api/teacher.js';
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

function Avatar({ label, bg, size = 36 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: bg || '#7C3AED',
      color: '#fff', fontSize: size * 0.38, fontWeight: 700, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center', userSelect: 'none',
    }}>
      {(label || '?').charAt(0).toUpperCase()}
    </div>
  );
}

// ── Class List Row ─────────────────────────────────────────────────────────────
function ClassRow({ cls, taskCount, onClick }) {
  const theme = getTheme(cls.id);
  const [hov, setHov] = useState(false);
  const approved = cls.enrollments.filter(e => e.status === 'APPROVED').length;
  const pending  = cls.enrollments.filter(e => e.status === 'PENDING').length;

  return (
    <tr
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ cursor: 'pointer', background: hov ? '#F8FAFC' : 'transparent', transition: 'background 120ms ease' }}
    >
      <td style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Avatar label={cls.name} bg={theme.accent} size={36} />
          <div>
            <div style={{ fontWeight: 700, color: '#1e293b', fontSize: 14 }}>{cls.name}</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>
              Created {new Date(cls.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
          </div>
        </div>
      </td>
      <td style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', color: '#475569', fontSize: 14 }}>
        {approved} student{approved !== 1 ? 's' : ''}
      </td>
      <td style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', color: '#475569', fontSize: 14 }}>
        {taskCount} task{taskCount !== 1 ? 's' : ''}
      </td>
      <td style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9' }}>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: cls.aiEnabled ? '#DCFCE7' : '#FEE2E2', color: cls.aiEnabled ? '#16A34A' : '#DC2626' }}>
          {cls.aiEnabled ? 'Enabled' : 'Disabled'}
        </span>
      </td>
      <td style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9' }}>
        {pending > 0 ? (
          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: '#FFF7ED', color: '#EA580C' }}>
            ⚠️ {pending} pending
          </span>
        ) : (
          <span style={{ fontSize: 13, color: '#cbd5e1' }}>—</span>
        )}
      </td>
      <td style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', textAlign: 'right' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: theme.accent, display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
          Open →
        </span>
      </td>
    </tr>
  );
}

// ── Class Detail View ──────────────────────────────────────────────────────────
function ClassDetail({ cls, taskCount, isViewOnly, onBack, onEnrollment, onToggleAI, onDelete }) {
  const theme = getTheme(cls.id);
  const approved = cls.enrollments.filter(e => e.status === 'APPROVED');
  const pending  = cls.enrollments.filter(e => e.status === 'PENDING');
  const rejected = cls.enrollments.filter(e => e.status === 'REJECTED');
  const boys  = approved.filter(e => e.student.gender === 'MALE').length;
  const girls = approved.filter(e => e.student.gender === 'FEMALE').length;
  const avatarColors = ['#7C3AED','#2563EB','#EA580C','#16A34A','#DB2777','#0891B2'];
  const [copied, setCopied] = useState(false);

  const handleCopyCode = () => {
    if (!cls.code) return;
    navigator.clipboard.writeText(cls.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Back */}
      <button
        onClick={onBack}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7C3AED', fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20, padding: 0 }}
      >
        ← Back to My Classroom
      </button>

      {/* Class header */}
      <div style={{ background: theme.grad, borderRadius: 20, padding: '28px 32px', marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h2 style={{ color: '#fff', fontSize: 28, fontWeight: 800, margin: '0 0 8px' }}>{cls.name}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14 }}>
              Created {new Date(cls.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </div>
            {cls.code && (
              <button
                onClick={handleCopyCode}
                title="Copy join code"
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.15)',
                  color: '#fff', fontSize: 13, fontWeight: 700, letterSpacing: 0.5, cursor: 'pointer',
                }}
              >
                {copied ? '✓ Copied' : `Code: ${cls.code}`}
              </button>
            )}
          </div>
        </div>
        {!isViewOnly && (
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => onToggleAI(cls.id)}
              style={{ padding: '8px 16px', borderRadius: 10, border: '2px solid rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.15)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
            >
              {cls.aiEnabled ? '🤖 AI On' : '🚫 AI Off'}
            </button>
            <button
              onClick={() => onDelete(cls.id)}
              style={{ padding: '8px 16px', borderRadius: 10, border: '2px solid rgba(255,100,100,0.5)', background: 'rgba(255,100,100,0.2)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
            >
              🗑 Delete Class
            </button>
          </div>
        )}
      </div>

      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 16, marginBottom: 28 }}>
        {[
          { icon: '👥', label: 'Total Students', value: approved.length, bg: '#EDE9FE', color: '#7C3AED' },
          { icon: '👦', label: 'Boys',            value: boys,            bg: '#DBEAFE', color: '#2563EB' },
          { icon: '👧', label: 'Girls',           value: girls,           bg: '#FCE7F3', color: '#DB2777' },
          { icon: '⏳', label: 'Pending',         value: pending.length,  bg: '#FFF7ED', color: '#EA580C' },
          { icon: '📝', label: 'Tasks',            value: taskCount,       bg: '#DCFCE7', color: '#16A34A' },
          { icon: '🤖', label: 'AI Status',        value: cls.aiEnabled ? 'On' : 'Off', bg: cls.aiEnabled ? '#DCFCE7' : '#FEE2E2', color: cls.aiEnabled ? '#16A34A' : '#DC2626' },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, borderRadius: 14, padding: '16px 20px' }}>
            <div style={{ fontSize: 22, marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Pending requests */}
      {pending.length > 0 && (
        <div style={{ background: '#FFF7ED', borderRadius: 16, padding: '20px 24px', marginBottom: 20, border: '1px solid #FED7AA' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#EA580C', margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
            ⚠️ Pending Requests ({pending.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pending.map((e, i) => (
              <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Avatar label={e.student.name || e.student.email} bg={avatarColors[i % avatarColors.length]} size={32} />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{e.student.name || '—'}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>{e.student.email}</div>
                  </div>
                </div>
                {!isViewOnly && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => onEnrollment(cls.id, e.id, 'APPROVED')} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: '#22C55E', color: '#fff', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>✓ Approve</button>
                    <button onClick={() => onEnrollment(cls.id, e.id, 'REJECTED')} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>✗ Reject</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Student roster */}
      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e1b4b', margin: 0 }}>
            Student Roster — {approved.length} enrolled
          </h3>
        </div>

        {approved.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🎓</div>
            <p style={{ fontSize: 15 }}>No enrolled students yet. Approve requests to see them here.</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                {['#','Name','Email','Roll No','Grade / Section','Dept / Year',''].map(h => (
                  <th key={h || 'actions'} style={{ padding: '11px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {approved.map((e, i) => (
                <tr key={e.id} style={{ borderBottom: i < approved.length - 1 ? '1px solid #f1f5f9' : 'none' }}
                  onMouseEnter={ev => ev.currentTarget.style.background = '#F8FAFC'}
                  onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '12px 16px', color: '#94a3b8', fontWeight: 600 }}>{i + 1}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Avatar label={e.student.name || e.student.email} bg={avatarColors[i % avatarColors.length]} size={30} />
                      <span style={{ fontWeight: 600, color: '#1e293b' }}>{e.student.name || '—'}</span>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#64748b' }}>{e.student.email}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ background: '#EDE9FE', color: '#7C3AED', fontWeight: 700, fontSize: 13, padding: '3px 10px', borderRadius: 8 }}>
                      {e.student.rollNo || '—'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#475569' }}>
                    {e.student.gradeLevel
                      ? `${e.student.gradeLevel}${e.student.section ? ' – ' + e.student.section : ''}`
                      : '—'}
                  </td>
                  <td style={{ padding: '12px 16px', color: '#475569' }}>
                    {e.student.department
                      ? `${e.student.department}${e.student.year ? ', ' + e.student.year : ''}`
                      : '—'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {!isViewOnly && (
                      <button
                        onClick={() => {
                          if (!confirm(`Remove ${e.student.name || e.student.email} from this class? They'll need to be manually re-approved to rejoin, even with the class code.`)) return;
                          onEnrollment(cls.id, e.id, 'REJECTED');
                        }}
                        style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid #fecaca', background: '#fff', color: '#DC2626', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}
                      >
                        Kick
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Rejected students */}
        {rejected.length > 0 && (
          <div style={{ borderTop: '1px solid #f1f5f9', padding: '12px 24px', background: '#FEF2F2' }}>
            <span style={{ fontSize: 12, color: '#DC2626', fontWeight: 600 }}>
              ✗ {rejected.length} rejected: {rejected.map(e => e.student.name || e.student.email).join(', ')}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Create Modal ───────────────────────────────────────────────────────────────
function CreateModal({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setError(''); setCreating(true);
    try {
      const cls = await createClass(name.trim());
      onCreated({ ...cls, enrollments: [] });
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create class');
    } finally { setCreating(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 20, padding: 32, width: '100%', maxWidth: 420, boxShadow: '0 24px 60px rgba(0,0,0,0.18)' }} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e1b4b', marginBottom: 6 }}>Create New Class</h2>
        <p style={{ fontSize: 14, color: '#64748b', marginBottom: 20 }}>Set up a classroom for your students</p>
        <form onSubmit={handleSubmit}>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Class Name</label>
          <input
            autoFocus type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Grade 10-A"
            style={{ width: '100%', padding: '11px 14px', borderRadius: 12, border: '1.5px solid #e2e8f0', fontSize: 15, boxSizing: 'border-box', outline: 'none' }}
            onFocus={e => e.target.style.borderColor = '#7C3AED'}
            onBlur={e => e.target.style.borderColor = '#e2e8f0'}
          />
          {error && <p style={{ color: '#EF4444', fontSize: 13, marginTop: 8 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22 }}>
            <button type="button" onClick={onClose} style={{ padding: '10px 20px', borderRadius: 12, border: '1.5px solid #e2e8f0', background: '#fff', color: '#475569', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
            <button type="submit" disabled={creating || !name.trim()} style={{ padding: '10px 24px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#7C3AED,#A855F7)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: !name.trim() ? 0.6 : 1 }}>
              {creating ? 'Creating…' : '+ Create Class'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function TeacherClassesPage() {
  const { isViewOnly } = useAuth();
  const [classes, setClasses]     = useState([]);
  const [tasks, setTasks]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected]   = useState(null); // class id for detail view
  const [error, setError]         = useState('');

  useEffect(() => {
    Promise.all([listClasses(), listTeacherTasks()])
      .then(([cls, tsk]) => { setClasses(cls); setTasks(tsk); })
      .finally(() => setLoading(false));
  }, []);

  const taskCountByClass = useMemo(() => {
    const map = {};
    tasks.forEach(t => { if (t.classId) map[t.classId] = (map[t.classId] || 0) + 1; });
    return map;
  }, [tasks]);

  const filtered = useMemo(() =>
    classes.filter(c => c.name.toLowerCase().includes(search.toLowerCase())), [classes, search]);

  const selectedCls = selected ? classes.find(c => c.id === selected) : null;

  const handleDelete = async (id) => {
    if (!confirm('Delete this class? Its tasks and submissions will also be deleted.')) return;
    await deleteClass(id);
    setClasses(prev => prev.filter(c => c.id !== id));
    setSelected(null);
  };

  const handleEnrollment = async (classId, enrollmentId, status) => {
    const updated = await updateEnrollment(classId, enrollmentId, status);
    setClasses(prev => prev.map(c =>
      c.id !== classId ? c
        : { ...c, enrollments: c.enrollments.map(e => e.id === updated.id ? { ...e, status: updated.status } : e) }
    ));
  };

  const handleToggleAI = async (classId) => {
    try {
      const updated = await toggleClassAI(classId);
      setClasses(prev => prev.map(c => c.id === classId ? { ...c, aiEnabled: updated.aiEnabled } : c));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update AI setting');
    }
  };

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="page" style={{ minHeight: '100vh', background: '#F8FAFC' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 32px 60px' }}>

        {/* ── Detail view ── */}
        {selectedCls ? (
          <ClassDetail
            cls={selectedCls}
            taskCount={taskCountByClass[selectedCls.id] || 0}
            isViewOnly={isViewOnly}
            onBack={() => setSelected(null)}
            onEnrollment={handleEnrollment}
            onToggleAI={handleToggleAI}
            onDelete={handleDelete}
          />
        ) : (
          <>
            {/* ── Header ── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
              <div>
                <h1 style={{ fontSize: 30, fontWeight: 800, color: '#1e1b4b', margin: 0 }}>My Classroom</h1>
                <p style={{ color: '#64748b', fontSize: 13, marginTop: 6, marginBottom: 0 }}>
                  Click any class to view students and manage your classroom.
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 8 }}>{today}</div>
                {!isViewOnly && (
                  <button onClick={() => setShowCreate(true)} style={{ padding: '10px 22px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#7C3AED,#A855F7)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', boxShadow: '0 4px 14px rgba(124,58,237,0.35)' }}>
                    ➕ Create Class
                  </button>
                )}
              </div>
            </div>

            {/* ── Toolbar: search + count ── */}
            {classes.length > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', width: 320 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)' }}>
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  <input
                    type="text" placeholder="Search classes…" value={search} onChange={e => setSearch(e.target.value)}
                    style={{ width: '100%', height: 40, paddingLeft: 38, paddingRight: 14, borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 14, background: '#fff', boxSizing: 'border-box', outline: 'none' }}
                  />
                </div>
                <span style={{ fontSize: 13, color: '#94a3b8' }}>
                  {filtered.length} class{filtered.length !== 1 ? 'es' : ''}
                </span>
              </div>
            )}

            {error && <p style={{ color: '#EF4444', fontSize: 14, marginBottom: 16, background: '#FEF2F2', padding: '10px 14px', borderRadius: 10 }}>{error}</p>}

            {/* ── Loading skeleton ── */}
            {loading && (
              <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {[1,2,3].map(i => (
                      <tr key={i}>
                        <td style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#e2e8f0' }} />
                            <div style={{ width: 140, height: 14, borderRadius: 4, background: '#e2e8f0' }} />
                          </div>
                        </td>
                        <td style={{ padding: '16px', borderBottom: '1px solid #f1f5f9' }}><div style={{ width: 60, height: 14, borderRadius: 4, background: '#e2e8f0' }} /></td>
                        <td style={{ padding: '16px', borderBottom: '1px solid #f1f5f9' }}><div style={{ width: 50, height: 14, borderRadius: 4, background: '#e2e8f0' }} /></td>
                        <td style={{ padding: '16px', borderBottom: '1px solid #f1f5f9' }}><div style={{ width: 60, height: 20, borderRadius: 999, background: '#e2e8f0' }} /></td>
                        <td style={{ padding: '16px', borderBottom: '1px solid #f1f5f9' }}><div style={{ width: 40, height: 14, borderRadius: 4, background: '#e2e8f0' }} /></td>
                        <td style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }} />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── Empty state ── */}
            {!loading && filtered.length === 0 && (
              <div style={{ textAlign: 'center', padding: '80px 0' }}>
                <div style={{ fontSize: 72, marginBottom: 16 }}>🏫</div>
                <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1e1b4b', marginBottom: 8 }}>
                  {search ? 'No classes match your search' : 'No Classes Yet'}
                </h2>
                <p style={{ color: '#64748b', fontSize: 15, marginBottom: 24 }}>
                  {search ? 'Try a different keyword.' : 'Create your first class to get started.'}
                </p>
                {!search && !isViewOnly && (
                  <button onClick={() => setShowCreate(true)} style={{ padding: '12px 28px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#7C3AED,#A855F7)', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
                    ➕ Create First Class
                  </button>
                )}
              </div>
            )}

            {/* ── Class list ── */}
            {!loading && filtered.length > 0 && (
              <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC' }}>
                      {['Class', 'Students', 'Tasks', 'AI', 'Pending', ''].map(h => (
                        <th key={h || 'action'} style={{
                          padding: h === 'Class' || h === '' ? '12px 20px' : '12px 16px', textAlign: 'left',
                          fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase',
                          letterSpacing: 0.4, borderBottom: '1px solid #e2e8f0',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(cls => (
                      <ClassRow
                        key={cls.id}
                        cls={cls}
                        taskCount={taskCountByClass[cls.id] || 0}
                        onClick={() => setSelected(cls.id)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {showCreate && !isViewOnly && (
        <CreateModal onClose={() => setShowCreate(false)} onCreated={cls => setClasses(prev => [cls, ...prev])} />
      )}
    </div>
  );
}
