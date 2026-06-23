import { useState, useEffect } from 'react';
import { listStudentTasks, submitTask } from '../api/student.js';
import { listComics, getComic } from '../api/comics.js';
import { renderComicToPdfBlob } from '../utils/comicRenderer.js';
import { useAuth } from '../context/AuthContext.jsx';

function SubmitPicker({ task, onClose, onSubmitted }) {
  const [comics, setComics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    listComics().then(setComics).finally(() => setLoading(false));
  }, []);

  const handleSubmit = async () => {
    if (!selectedId) return;
    setError('');
    setSubmitting(true);
    try {
      const comic = await getComic(selectedId);
      const pdfBlob = await renderComicToPdfBlob(comic);
      const submission = await submitTask(task.id, selectedId, pdfBlob);
      onSubmitted(submission);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not submit — try again');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={styles.pickerOverlay} onClick={onClose}>
      <div className="card" style={styles.picker} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Submit "{task.title}"</h3>
        <p className="text-sm text-muted">Pick one of your comics — it'll be exported as a PDF and attached.</p>
        {loading && <div className="spinner" />}
        {!loading && comics.length === 0 && <p className="text-muted">You don't have any comics yet.</p>}
        <div style={styles.pickerList}>
          {comics.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedId(c.id)}
              style={{ ...styles.pickerItem, ...(selectedId === c.id ? styles.pickerItemActive : {}) }}
            >
              {c.title}
            </button>
          ))}
        </div>
        {error && <p className="form-error">{error}</p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={submitting}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={!selectedId || submitting}>
            {submitting ? 'Submitting…' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function StudentTasksPage() {
  const { isViewOnly } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pickerTask, setPickerTask] = useState(null);

  useEffect(() => {
    listStudentTasks().then(setTasks).finally(() => setLoading(false));
  }, []);

  const handleSubmitted = (submission) => {
    setTasks((prev) => prev.map((t) => (t.id === pickerTask.id ? { ...t, submissions: [submission] } : t)));
    setPickerTask(null);
  };

  return (
    <div className="page">
      <div className="container section">
        <h2 style={styles.heading}>My Assignments</h2>
        <p className="text-muted text-sm" style={{ marginBottom: 24 }}>Tasks assigned by your teachers.</p>

        {loading && <div className="spinner" />}

        {!loading && tasks.length === 0 && (
          <div style={styles.empty}>
            <div style={{ fontSize: 60 }}>📋</div>
            <h3>No assignments yet</h3>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {tasks.map((task) => {
            const submission = task.submissions?.[0];
            return (
              <div key={task.id} className="card" style={styles.taskCard}>
                {task.class?.name && <span className="badge" style={{ marginBottom: 6 }}>{task.class.name}</span>}
                <strong style={{ fontSize: 15 }}>{task.title}</strong>
                {task.description && <p className="text-sm text-muted" style={{ margin: '6px 0' }}>{task.description}</p>}
                {task.dueDate && <p className="text-sm text-muted">Due {new Date(task.dueDate).toLocaleDateString()}</p>}

                {submission ? (
                  <div style={{ marginTop: 8 }}>
                    {submission.gradedAt ? (
                      <>
                        <p style={{ fontWeight: 700, color: 'var(--primary)' }}>Graded: {submission.score ?? '—'} / 100</p>
                        {submission.feedback && <p className="text-sm text-muted">"{submission.feedback}"</p>}
                      </>
                    ) : (
                      <p className="text-sm text-muted">✅ Submitted {new Date(submission.submittedAt).toLocaleString()} — awaiting grade</p>
                    )}
                    {!isViewOnly && (
                      <button className="btn btn-outline btn-sm" style={{ marginTop: 8 }} onClick={() => setPickerTask(task)}>
                        Resubmit
                      </button>
                    )}
                  </div>
                ) : (
                  !isViewOnly && (
                    <button className="btn btn-primary btn-sm" style={{ marginTop: 8 }} onClick={() => setPickerTask(task)}>
                      Submit Assignment
                    </button>
                  )
                )}
              </div>
            );
          })}
        </div>

        {pickerTask && (
          <SubmitPicker task={pickerTask} onClose={() => setPickerTask(null)} onSubmitted={handleSubmitted} />
        )}
      </div>
    </div>
  );
}

const styles = {
  heading: { fontSize: 24, fontWeight: 700, marginBottom: 4 },
  empty: { textAlign: 'center', padding: '80px 0', color: 'var(--mid)' },
  taskCard: { padding: 16 },
  pickerOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  picker: { width: '100%', maxWidth: 420, padding: 24 },
  pickerList: { display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflowY: 'auto' },
  pickerItem: { textAlign: 'left', padding: '8px 12px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--light)', cursor: 'pointer' },
  pickerItemActive: { border: '1.5px solid var(--primary)', background: 'var(--primary-light)' },
};
