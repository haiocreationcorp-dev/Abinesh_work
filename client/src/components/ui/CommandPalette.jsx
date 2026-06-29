import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';

function buildCommands({ isAdmin, isTeacher, isStudent, isChief }) {
  const commands = [{ label: 'Dashboard', path: '/dashboard' }];
  if (isAdmin) {
    commands.push(
      { label: 'Configure', path: '/admin' },
      { label: 'Configure — Upload Asset', path: '/admin?tab=0' },
      { label: 'Configure — Folder Upload', path: '/admin?tab=1' },
      { label: 'Configure — F_B Edit', path: '/admin?tab=2' },
      { label: 'Configure — Expressions', path: '/admin?tab=3' },
      { label: 'Configure — Character Presets', path: '/admin?tab=4' },
      { label: 'Configure — Palette Normalizer', path: '/admin?tab=5' },
      { label: 'Configure — Eye Normalizer', path: '/admin?tab=6' },
      { label: 'Configure — Lighting Adjuster', path: '/admin?tab=7' },
      { label: 'Configure — Browse Assets', path: '/admin?tab=8' },
      { label: 'Configure — Manage Users', path: '/admin?tab=9' },
      { label: 'Configure — Institutions', path: '/admin?tab=10' },
    );
  }
  if (isChief) commands.push({ label: 'Billing', path: '/chief/billing' });
  if (isTeacher) {
    commands.push(
      { label: 'My Students', path: '/teacher/students' },
      { label: 'My Classes', path: '/teacher/classes' },
      { label: 'Assign Task', path: '/teacher/tasks' },
    );
  }
  if (isStudent) {
    commands.push(
      { label: 'Instructors', path: '/student/instructors' },
      { label: 'My Assignments', path: '/student/tasks' },
    );
  }
  return commands;
}

export default function CommandPalette() {
  const { user, isAdmin, isTeacher, isStudent, isChief } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      const t = setTimeout(() => inputRef.current?.focus(), 10);
      return () => clearTimeout(t);
    }
  }, [open]);

  const commands = useMemo(() => buildCommands({ isAdmin, isTeacher, isStudent, isChief }), [isAdmin, isTeacher, isStudent, isChief]);
  const filtered = commands.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()));

  if (!user || !open) return null;

  const go = (path) => {
    navigate(path);
    setOpen(false);
  };

  return (
    <div className="cmdk-overlay" onClick={() => setOpen(false)}>
      <div className="cmdk-modal" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="cmdk-input"
          placeholder="Type a command or search…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Command palette search"
        />
        <div className="cmdk-list">
          {filtered.length === 0 && <div className="cmdk-empty">No matching commands.</div>}
          {filtered.map((c) => (
            <button key={c.path} className="cmdk-item" onClick={() => go(c.path)}>
              {c.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
