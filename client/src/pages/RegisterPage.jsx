import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { register, lookupInstitution } from '../api/auth.js';
import { useAuth } from '../context/AuthContext.jsx';

function ChoiceButton({ icon, title, hint, onClick }) {
  return (
    <button type="button" onClick={onClick} style={styles.choiceBtn}>
      <span style={styles.choiceIcon}>{icon}</span>
      <span style={styles.choiceText}>
        <span style={styles.choiceTitle}>{title}</span>
        <span style={styles.choiceHint}>{hint}</span>
      </span>
    </button>
  );
}

export default function RegisterPage() {
  const { saveSession } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState('choice'); // choice | institution-choice | teacher | student | individual
  const [form, setForm] = useState({
    name: '', email: '', password: '', institutionCode: '',
    gradeLevel: '', section: '', rollNo: '', department: '', year: '',
  });
  const [institutionType, setInstitutionType] = useState(null); // 'SCHOOL' | 'COLLEGE' | null (not yet resolved)
  const [codeChecking, setCodeChecking] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCodeChange = (value) => {
    setForm({ ...form, institutionCode: value });
    setInstitutionType(null); // stale until re-checked on blur
  };

  const handleCodeBlur = async () => {
    if (step !== 'student' || !form.institutionCode.trim()) return;
    setCodeChecking(true);
    setError('');
    try {
      const { type } = await lookupInstitution(form.institutionCode.trim());
      setInstitutionType(type);
    } catch {
      setInstitutionType(null);
      setError('Invalid institution code');
    } finally {
      setCodeChecking(false);
    }
  };

  const goBack = () => {
    setError('');
    if (step === 'institution-choice') setStep('choice');
    else if (step === 'teacher' || step === 'student') setStep('institution-choice');
    else setStep('choice');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password.length < 6) { setError('Password must be at least 6 characters'); return; }
    const isInstitution = step === 'teacher' || step === 'student';
    if (isInstitution && !form.institutionCode.trim()) { setError('Institution code is required'); return; }
    if (step === 'student' && !institutionType) { setError('Enter a valid institution code first'); return; }
    setLoading(true);
    try {
      const payload = isInstitution
        ? { ...form, loginType: 'institution', role: step === 'teacher' ? 'TEACHER' : 'STUDENT' }
        : { name: form.name, email: form.email, password: form.password, loginType: 'individual' };
      const { token, user } = await register(payload);
      saveSession(token, user);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const formStep = step === 'teacher' || step === 'student' || step === 'individual';
  const isInstitution = step === 'teacher' || step === 'student';

  return (
    <div style={styles.root}>
      <div className="card" style={styles.card}>
        <h1 style={styles.title}>BharathComic</h1>

        {step === 'choice' && (
          <>
            <h2 style={styles.sub}>Create account</h2>
            <div style={styles.choiceList}>
              <ChoiceButton icon="🏫" title="Institution Account" hint="Teacher or student" onClick={() => setStep('institution-choice')} />
              <ChoiceButton icon="🙋" title="Individual Account" hint="Personal account" onClick={() => setStep('individual')} />
            </div>
          </>
        )}

        {step === 'institution-choice' && (
          <>
            <h2 style={styles.sub}>Institution Account</h2>
            <div style={styles.choiceList}>
              <ChoiceButton icon="👩‍🏫" title="Teacher" hint="Register as teaching staff" onClick={() => setStep('teacher')} />
              <ChoiceButton icon="🎓" title="Student" hint="Register as an enrolled student" onClick={() => setStep('student')} />
            </div>
            <button type="button" onClick={goBack} style={styles.backLink}>← Back</button>
          </>
        )}

        {formStep && (
          <>
            <h2 style={styles.sub}>
              {step === 'teacher' ? 'Teacher Registration' : step === 'student' ? 'Student Registration' : 'Create account'}
            </h2>
            <form onSubmit={handleSubmit} autoComplete="off">
              <div className="form-group">
                <label>Name (optional)</label>
                <input type="text" autoComplete="off" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input type="email" required autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input type="password" required autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Min. 6 characters" />
              </div>
              {isInstitution && (
                <div className="form-group">
                  <label>Institution Code</label>
                  <input
                    type="text"
                    required
                    autoComplete="off"
                    value={form.institutionCode}
                    onChange={(e) => handleCodeChange(e.target.value)}
                    onBlur={handleCodeBlur}
                    placeholder="e.g. AB3X-7KQM"
                    style={{ textTransform: 'uppercase' }}
                  />
                  {step === 'student' && codeChecking && <p className="text-sm text-muted">Checking…</p>}
                </div>
              )}

              {step === 'student' && institutionType === 'SCHOOL' && (
                <>
                  <div className="form-group">
                    <label>Class / Grade</label>
                    <input type="text" required autoComplete="off" value={form.gradeLevel} onChange={(e) => setForm({ ...form, gradeLevel: e.target.value })} placeholder="e.g. 10th" />
                  </div>
                  <div className="form-group">
                    <label>Section</label>
                    <input type="text" required autoComplete="off" value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} placeholder="e.g. A" />
                  </div>
                  <div className="form-group">
                    <label>Roll No</label>
                    <input type="text" required autoComplete="off" value={form.rollNo} onChange={(e) => setForm({ ...form, rollNo: e.target.value })} />
                  </div>
                </>
              )}

              {step === 'student' && institutionType === 'COLLEGE' && (
                <>
                  <div className="form-group">
                    <label>Department</label>
                    <input type="text" required autoComplete="off" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="e.g. Computer Science" />
                  </div>
                  <div className="form-group">
                    <label>Year</label>
                    <input type="text" required autoComplete="off" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} placeholder="e.g. 2nd Year" />
                  </div>
                  <div className="form-group">
                    <label>Roll No</label>
                    <input type="text" required autoComplete="off" value={form.rollNo} onChange={(e) => setForm({ ...form, rollNo: e.target.value })} />
                  </div>
                </>
              )}

              {error && <p className="form-error">{error}</p>}
              <button className="btn btn-primary w-full" type="submit" disabled={loading} style={{ marginTop: 8 }}>
                {loading ? 'Creating…' : 'Create Account'}
              </button>
            </form>
            <button type="button" onClick={goBack} style={styles.backLink}>← Back</button>
          </>
        )}

        <p style={styles.footer}>
          Already have an account? <Link to="/login" style={{ color: 'var(--primary)' }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}

const styles = {
  root: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--light)' },
  card: { width: '100%', maxWidth: 400, padding: 36 },
  title: { fontFamily: 'Bangers, cursive', fontSize: 32, color: 'var(--primary)', textAlign: 'center', letterSpacing: 1 },
  sub: { fontSize: 20, fontWeight: 600, margin: '8px 0 24px', textAlign: 'center' },
  footer: { textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--mid)' },

  choiceList: { display: 'flex', flexDirection: 'column', gap: 12 },
  choiceBtn: {
    display: 'flex', alignItems: 'center', gap: 14, width: '100%',
    background: 'var(--light)', border: '1.5px solid var(--border)', borderRadius: 12,
    padding: '14px 16px', cursor: 'pointer', textAlign: 'left',
  },
  choiceIcon: { fontSize: 28, flexShrink: 0 },
  choiceText: { display: 'flex', flexDirection: 'column', gap: 2 },
  choiceTitle: { fontSize: 15, fontWeight: 700, color: 'var(--dark)' },
  choiceHint: { fontSize: 12, color: 'var(--mid)' },
  backLink: {
    display: 'block', margin: '16px auto 0', background: 'none', border: 'none',
    color: 'var(--mid)', fontSize: 13, cursor: 'pointer', textAlign: 'center', width: '100%',
  },
};
