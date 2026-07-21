import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { forgotPassword, verifyResetOtp, resetPassword } from '../api/auth.js';

// Email-OTP recovery for Admin / Institution Chief / Teacher. Students recover through
// their teacher and never reach this page (the Student login tab shows a "contact your
// teacher" message instead of linking here).
export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState('email'); // email | otp | password | done
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [resetTicket, setResetTicket] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const submitEmail = async (e) => {
    e.preventDefault();
    setError(''); setInfo(''); setLoading(true);
    try {
      const { message } = await forgotPassword(email.trim());
      setInfo(message);
      setStep('otp');
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const submitOtp = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const { resetTicket } = await verifyResetOtp(email.trim(), otp.trim());
      setResetTicket(resetTicket);
      setStep('password');
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid or expired code.');
    } finally {
      setLoading(false);
    }
  };

  const submitPassword = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await resetPassword(resetTicket, password);
      setStep('done');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not reset password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.root}>
      <div className="card" style={styles.card}>
        <img src="/tool-icons/bharathcomic-wordmark.png" alt="BharathComic" style={styles.brandLogo} draggable={false} />
        <h2 style={styles.sub}>Reset your password</h2>

        {step === 'email' && (
          <form onSubmit={submitEmail} autoComplete="off">
            <p style={styles.hint}>Enter your account email. If it's eligible, we'll send a 6-digit code.</p>
            <div className="form-group">
              <label>Email</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
            </div>
            {error && <p className="form-error">{error}</p>}
            <button className="btn btn-primary w-full" type="submit" disabled={loading} style={{ marginTop: 8 }}>
              {loading ? 'Sending…' : 'Send code'}
            </button>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={submitOtp} autoComplete="off">
            {info && <p style={styles.info}>{info}</p>}
            <div className="form-group">
              <label>6-digit code</label>
              <input
                type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} required
                value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                style={{ letterSpacing: 6, textAlign: 'center', fontSize: 20 }}
                autoComplete="one-time-code"
              />
            </div>
            {error && <p className="form-error">{error}</p>}
            <button className="btn btn-primary w-full" type="submit" disabled={loading} style={{ marginTop: 8 }}>
              {loading ? 'Verifying…' : 'Verify code'}
            </button>
            <button type="button" onClick={() => { setStep('email'); setError(''); }} style={styles.backLink}>← Use a different email</button>
          </form>
        )}

        {step === 'password' && (
          <form onSubmit={submitPassword} autoComplete="off">
            <p style={styles.hint}>Choose a new password (min 8 characters, with an uppercase letter, a lowercase letter, and a number).</p>
            <div className="form-group">
              <label>New password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPass ? 'text' : 'password'} required autoComplete="new-password"
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  style={{ paddingRight: 40, width: '100%', boxSizing: 'border-box' }}
                />
                <button type="button" onClick={() => setShowPass((v) => !v)} style={styles.eyeBtn} tabIndex={-1} aria-label={showPass ? 'Hide password' : 'Show password'}>
                  {showPass ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
            {error && <p className="form-error">{error}</p>}
            <button className="btn btn-primary w-full" type="submit" disabled={loading} style={{ marginTop: 8 }}>
              {loading ? 'Saving…' : 'Set new password'}
            </button>
          </form>
        )}

        {step === 'done' && (
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 40, margin: '8px 0' }}>✅</p>
            <p style={styles.hint}>Your password has been updated.</p>
            <button className="btn btn-primary w-full" onClick={() => navigate('/login')} style={{ marginTop: 8 }}>
              Back to sign in
            </button>
          </div>
        )}

        {step !== 'done' && (
          <p style={styles.footer}>
            Remembered it? <Link to="/login" style={{ color: 'var(--primary)' }}>Sign in</Link>
          </p>
        )}
      </div>
    </div>
  );
}

const styles = {
  root: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--light)' },
  card: { width: '100%', maxWidth: 400, padding: 36 },
  brandLogo: { display: 'block', height: 70, width: 'auto', margin: '0 auto', objectFit: 'contain' },
  sub: { fontSize: 20, fontWeight: 600, margin: '8px 0 20px', textAlign: 'center' },
  hint: { fontSize: 13, color: 'var(--mid)', marginBottom: 16, lineHeight: 1.5 },
  info: { fontSize: 13, color: 'var(--dark)', background: 'var(--light)', border: '1.5px solid var(--border)', borderRadius: 10, padding: '10px 12px', marginBottom: 16, lineHeight: 1.5 },
  footer: { textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--mid)' },
  backLink: { display: 'block', margin: '16px auto 0', background: 'none', border: 'none', color: 'var(--mid)', fontSize: 13, cursor: 'pointer', textAlign: 'center', width: '100%' },
  eyeBtn: { position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: 0, lineHeight: 1 },
};
