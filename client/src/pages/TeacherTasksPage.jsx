import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { createTask, listTeacherTasks, listClasses } from '../api/teacher.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function TeacherTasksPage() {
  const { isViewOnly } = useAuth();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ title: '', description: '', dueDate: '', classId: '' });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([listTeacherTasks(), listClasses()])
      .then(([tasks, classes]) => { setTasks(tasks); setClasses(classes); })
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.classId) return;
    setError('');
    setCreating(true);
    try {
      const task = await createTask({ ...form, title: form.title.trim() });
      const cls = classes.find((c) => c.id === form.classId);
      setTasks((prev) => [{ ...task, _count: { submissions: 0 }, class: cls ? { id: cls.id, name: cls.name } : null }, ...prev]);
      setForm({ title: '', description: '', dueDate: '', classId: '' });
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create task');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="page">
      <div className="container section">
        <h2 style={styles.heading}>Assign Task</h2>
        <p className="text-muted text-sm" style={{ marginBottom: 24 }}>
          Tasks are visible only to students approved in the class you pick below.
        </p>

        {!isViewOnly && !loading && classes.length === 0 && (
          <p className="text-muted" style={{ marginBottom: 24 }}>
            You need a class first. <Link to="/teacher/classes" style={{ color: 'var(--primary)' }}>Create one</Link>.
          </p>
        )}

        {!isViewOnly && classes.length > 0 && (
          <form onSubmit={handleCreate} className="card" style={styles.form}>
            <div className="form-group">
              <label>Class</label>
              <select required value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })}>
                <option value="" disabled>Select a class…</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Title</label>
              <input type="text" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Description (optional)</label>
              <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Due date (optional)</label>
              <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </div>
            {error && <p className="form-error">{error}</p>}
            <button className="btn btn-primary" type="submit" disabled={creating}>
              {creating ? 'Creating…' : '+ Assign Task'}
            </button>
          </form>
        )}

        {loading && <div className="spinner" />}

        {!loading && tasks.length === 0 && (
          <div style={styles.empty}>
            <div style={{ fontSize: 60 }}>📋</div>
            <h3>No tasks yet</h3>
            <p className="text-muted">Assign your first task above.</p>
          </div>
        )}

        <div style={styles.grid}>
          {tasks.map((task) => (
            <div key={task.id} className="card" style={styles.taskCard} onClick={() => navigate(`/teacher/tasks/${task.id}/submissions`)}>
              {task.class?.name && <span className="badge" style={{ marginBottom: 6 }}>{task.class.name}</span>}
              <strong style={{ fontSize: 15 }}>{task.title}</strong>
              {task.description && <p className="text-sm text-muted" style={{ margin: '6px 0' }}>{task.description}</p>}
              {task.dueDate && <p className="text-sm text-muted">Due {new Date(task.dueDate).toLocaleDateString()}</p>}
              <p className="text-sm text-muted">{task._count?.submissions ?? 0} submission(s)</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles = {
  heading: { fontSize: 24, fontWeight: 700, marginBottom: 4 },
  form: { display: 'flex', flexDirection: 'column', gap: 4, padding: 24, marginBottom: 28, maxWidth: 480 },
  empty: { textAlign: 'center', padding: '80px 0', color: 'var(--mid)' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 },
  taskCard: { cursor: 'pointer', padding: 16 },
};
