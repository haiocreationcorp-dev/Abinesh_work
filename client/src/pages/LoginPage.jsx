import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { login } from '../api/auth.js';
import { useAuth } from '../context/AuthContext.jsx';

const ROLE_LABEL = { USER: 'an individual user', ADMIN: 'an administrator', TEACHER: 'a teacher', STUDENT: 'a student' };
const EXPECTED_ROLE = { teacher: 'TEACHER', student: 'STUDENT' };

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

export default function LoginPage() {
  const { saveSession } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState('choice'); // choice | institution-choice | teacher | student | individual
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const goBack = () => {
    setError('');
    if (step === 'institution-choice') setStep('choice');
    else if (step === 'teacher' || step === 'student') setStep('institution-choice');
    else setStep('choice');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { token, user } = await login(form);
      const expected = EXPECTED_ROLE[step];
      if (expected && user.role !== expected) {
        setError(`This account is registered as ${ROLE_LABEL[user.role] || user.role}. Please use the correct login option.`);
        return;
      }
      saveSession(token, user);
      navigate(user.mustChangePassword ? '/create-new-password' : '/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const formStep = step === 'teacher' || step === 'student' || step === 'individual';

  return (
    <div style={styles.root}>
      <div className="card" style={styles.card}>
        <img src="/tool-icons/bharathcomic-wordmark.png" alt="BharathComic" style={styles.brandLogo} draggable={false} />

        {step === 'choice' && (
          <>
            <h2 style={styles.sub}>Sign in</h2>
            <div style={styles.choiceList}>
              <ChoiceButton icon="🏫" title="Institution Login" hint="Teachers and students" onClick={() => setStep('institution-choice')} />
              <ChoiceButton icon="🙋" title="Individual Login" hint="Personal account" onClick={() => setStep('individual')} />
            </div>
          </>
        )}

        {step === 'institution-choice' && (
          <>
            <h2 style={styles.sub}>Institution Login</h2>
            <div style={styles.choiceList}>
              <ChoiceButton icon="👩‍🏫" title="Teacher Login" hint="For teaching staff" onClick={() => setStep('teacher')} />
              <ChoiceButton icon="🎓" title="Student Login" hint="For enrolled students" onClick={() => setStep('student')} />
            </div>
            <button type="button" onClick={goBack} style={styles.backLink}>← Back</button>
          </>
        )}

        {formStep && (
          <>
            <h2 style={styles.sub}>
              {step === 'teacher' ? 'Teacher Sign In' : step === 'student' ? 'Student Sign In' : 'Sign In'}
            </h2>
            <form onSubmit={handleSubmit} autoComplete="off">
              <div className="form-group">
                <label>Email</label>
                <input type="email" required autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPass ? 'text' : 'password'}
                    required
                    autoComplete="new-password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    style={{ paddingRight: 40, width: '100%', boxSizing: 'border-box' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    style={styles.eyeBtn}
                    tabIndex={-1}
                    aria-label={showPass ? 'Hide password' : 'Show password'}
                  >
                    {showPass ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                    )}
                  </button>
                </div>
              </div>
              {error && <p className="form-error">{error}</p>}
              <button className="btn btn-primary w-full" type="submit" disabled={loading} style={{ marginTop: 8 }}>
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>
            {/* Students recover through their teacher — no self-service email OTP for them */}
            {step === 'student' ? (
              <p style={styles.forgotNote}>Forgot your password? Please contact your class teacher.</p>
            ) : (
              <p style={styles.forgotWrap}>
                <Link to="/forgot-password" style={styles.forgotLink}>Forgot password?</Link>
              </p>
            )}
            <button type="button" onClick={goBack} style={styles.backLink}>← Back</button>
          </>
        )}

        <p style={styles.footer}>
          No account? <Link to="/register" style={{ color: 'var(--primary)' }}>Register</Link>
        </p>
      </div>
    </div>
  );
}

const styles = {
  root: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--light)' },
  card: { width: '100%', maxWidth: 400, padding: 36 },
  brandLogo: { display: 'block', height: 70, width: 'auto', margin: '0 auto', objectFit: 'contain' },
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
  forgotWrap: { textAlign: 'center', marginTop: 12 },
  forgotLink: { color: 'var(--primary)', fontSize: 13, textDecoration: 'none' },
  forgotNote: { textAlign: 'center', marginTop: 12, fontSize: 12.5, color: 'var(--mid)', lineHeight: 1.5 },
  eyeBtn: {
    position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
    background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: 0,
    lineHeight: 1, color: 'var(--mid)',
  },
};
