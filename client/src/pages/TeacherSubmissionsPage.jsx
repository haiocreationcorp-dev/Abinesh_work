import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { listTaskSubmissions, gradeSubmission } from '../api/teacher.js';
import { useAuth } from '../context/AuthContext.jsx';

function GradeForm({ submission, onSaved, disabled }) {
  const [score, setScore] = useState(submission.score ?? '');
  const [feedback, setFeedback] = useState(submission.feedback ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setError('');
    setSaving(true);
    try {
      const updated = await gradeSubmission(submission.id, {
        score: score === '' ? null : Number(score),
        feedback,
      });
      onSaved(updated);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save grade');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={styles.gradeForm}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <input
          type="number" min={0} max={100} placeholder="Score"
          value={score} onChange={(e) => setScore(e.target.value)}
          disabled={disabled}
          style={{ width: 80 }}
        />
        <span className="text-sm text-muted">/ 100</span>
      </div>
      <textarea
        rows={2} placeholder="Feedback"
        value={feedback} onChange={(e) => setFeedback(e.target.value)}
        disabled={disabled}
      />
      {error && <p className="form-error">{error}</p>}
      <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={disabled || saving}>
        {saving ? 'Saving…' : 'Save Grade'}
      </button>
    </div>
  );
}

export default function TeacherSubmissionsPage() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const { isViewOnly } = useAuth();
  const [task, setTask] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    listTaskSubmissions(taskId)
      .then(({ task, submissions }) => { setTask(task); setSubmissions(submissions); })
      .catch((err) => setError(err.response?.data?.error || 'Could not load submissions'))
      .finally(() => setLoading(false));
  }, [taskId]);

  const handleGraded = (updated) => {
    setSubmissions((prev) => prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)));
  };

  return (
    <div className="page">
      <div className="container section">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/teacher/tasks')} style={{ marginBottom: 16 }}>
          ← Back to Tasks
        </button>

        {loading && <div className="spinner" />}
        {error && <p className="form-error">{error}</p>}

        {!loading && task && (
          <>
            <h2 style={styles.heading}>{task.title}</h2>
            {task.description && <p className="text-muted" style={{ marginBottom: 24 }}>{task.description}</p>}

            {submissions.length === 0 && <p className="text-muted">No submissions yet.</p>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {submissions.map((s) => (
                <div key={s.id} className="card" style={styles.submissionCard}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <strong>{s.student?.name || s.student?.email}</strong>
                      <p className="text-sm text-muted">Submitted {new Date(s.submittedAt).toLocaleString()}</p>
                      {s.gradedAt && <p className="text-sm text-muted">Score: {s.score ?? '—'} / 100</p>}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <a className="btn btn-outline btn-sm" href={s.pdfPath} target="_blank" rel="noreferrer">View PDF</a>
                      <Link className="btn btn-outline btn-sm" to={`/teacher/view/${s.studentId}/${s.comicId}`}>View Comic</Link>
                    </div>
                  </div>
                  <GradeForm submission={s} onSaved={handleGraded} disabled={isViewOnly} />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  heading: { fontSize: 24, fontWeight: 700, marginBottom: 4 },
  submissionCard: { padding: 16 },
  gradeForm: { marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 420 },
};
