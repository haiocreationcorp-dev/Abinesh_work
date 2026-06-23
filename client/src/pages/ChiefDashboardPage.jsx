import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { getBillingSummary, updateSystemCount, createBillingOrder, verifyBillingPayment, getPaymentHistory } from '../api/billing.js';

const inr = (paiseOrRupees, isPaise = false) =>
  `₹${(isPaise ? paiseOrRupees / 100 : paiseOrRupees).toLocaleString('en-IN')}`;

export default function ChiefDashboardPage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [payments, setPayments] = useState([]);
  const [systemCountInput, setSystemCountInput] = useState('');
  const [savingCount, setSavingCount] = useState(false);
  const [plan, setPlan] = useState('QUARTERLY');
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const [s, p] = await Promise.all([getBillingSummary(), getPaymentHistory()]);
    setSummary(s);
    setSystemCountInput(String(s.systemCount));
    setPayments(p);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const saveSystemCount = async () => {
    setSavingCount(true);
    setError('');
    try {
      const count = Number(systemCountInput) || 0;
      await updateSystemCount(count);
      await refresh();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not update system count');
    } finally {
      setSavingCount(false);
    }
  };

  const handlePay = async () => {
    setError('');
    if (!window.Razorpay) {
      setError('Payment widget failed to load. Check your connection and try again.');
      return;
    }
    setPaying(true);
    try {
      const { orderId, amount, currency, keyId } = await createBillingOrder(plan);
      const rzp = new window.Razorpay({
        key: keyId,
        amount,
        currency,
        order_id: orderId,
        name: 'BharathComic',
        description: `${plan} subscription — ${summary.systemCount} systems`,
        handler: async (response) => {
          try {
            await verifyBillingPayment({
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });
            await refresh();
          } catch (err) {
            setError(err.response?.data?.error || 'Payment verification failed');
          } finally {
            setPaying(false);
          }
        },
        modal: { ondismiss: () => setPaying(false) },
        prefill: { email: user?.email, name: user?.name },
        theme: { color: '#a78bfa' },
      });
      rzp.open();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not start payment');
      setPaying(false);
    }
  };

  if (!summary) return <div className="page"><div className="container section"><div className="spinner" /></div></div>;

  return (
    <div className="page">
      <div className="container section">
        <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 4 }}>{summary.institutionName} — Billing</h2>
        <p style={{ color: 'var(--mid)', marginBottom: 24 }}>Join code: <span className="badge">{summary.institutionCode}</span></p>

        <div style={styles.cardsRow}>
          <div className="card" style={styles.statCard}>
            <div style={styles.statLabel}>Status</div>
            <div style={styles.statValue}>
              <span className={`badge ${summary.active ? '' : 'badge-admin'}`}>
                {summary.suspended ? 'Suspended' : summary.active ? 'Active' : 'Expired'}
              </span>
            </div>
          </div>
          <div className="card" style={styles.statCard}>
            <div style={styles.statLabel}>Days Remaining</div>
            <div style={styles.statValue}>{summary.daysRemaining}</div>
          </div>
          <div className="card" style={styles.statCard}>
            <div style={styles.statLabel}>Next Payment Due</div>
            <div style={styles.statValue}>
              {summary.nextPaymentDueDate ? new Date(summary.nextPaymentDueDate).toLocaleDateString() : '—'}
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: 20, marginBottom: 24 }}>
          <h3 style={styles.sectionTitle}>Systems</h3>
          <p style={{ color: 'var(--mid)', fontSize: 14, marginBottom: 12 }}>
            Number of systems/computers licensed for this institution — billed at {inr(summary.pricePerSystemPerMonth)} per system per month.
          </p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input type="number" min="0" value={systemCountInput} onChange={(e) => setSystemCountInput(e.target.value)} style={{ width: 120 }} />
            <button className="btn btn-outline btn-sm" onClick={saveSystemCount} disabled={savingCount}>
              {savingCount ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        <div className="card" style={{ padding: 20, marginBottom: 24 }}>
          <h3 style={styles.sectionTitle}>Choose a Plan</h3>
          <div style={styles.planRow}>
            <button
              className={`btn ${plan === 'QUARTERLY' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setPlan('QUARTERLY')}
              style={styles.planBtn}
            >
              Quarterly<br /><strong>{inr(summary.quarterlyTotal)}</strong> / 3 months
            </button>
            <button
              className={`btn ${plan === 'YEARLY' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setPlan('YEARLY')}
              style={styles.planBtn}
            >
              Yearly (save ~17%)<br /><strong>{inr(summary.yearlyTotal)}</strong> / 12 months
            </button>
          </div>
          {error && <p className="form-error">{error}</p>}
          <button className="btn btn-primary" onClick={handlePay} disabled={paying} style={{ marginTop: 12 }}>
            {paying ? 'Processing…' : `Pay ${plan === 'YEARLY' ? inr(summary.yearlyTotal) : inr(summary.quarterlyTotal)} Now`}
          </button>
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <h3 style={{ ...styles.sectionTitle, padding: '16px 20px 0' }}>Payment History</h3>
          <table style={styles.table}>
            <thead>
              <tr style={styles.thead}>
                <th style={styles.th}>Date</th>
                <th style={styles.th}>Plan</th>
                <th style={styles.th}>Systems</th>
                <th style={styles.th}>Amount</th>
                <th style={styles.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 && (
                <tr style={styles.tr}><td style={styles.td} colSpan={5}>No payments yet.</td></tr>
              )}
              {payments.map((p) => (
                <tr key={p.id} style={styles.tr}>
                  <td style={styles.td}>{new Date(p.createdAt).toLocaleDateString()}</td>
                  <td style={styles.td}>{p.planType}</td>
                  <td style={styles.td}>{p.systemCount}</td>
                  <td style={styles.td}>{inr(p.amount, true)}</td>
                  <td style={styles.td}>
                    <span className={`badge ${p.status === 'PAID' ? '' : 'badge-admin'}`}>{p.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const styles = {
  cardsRow: { display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' },
  statCard: { padding: 20, flex: '1 1 180px' },
  statLabel: { fontSize: 13, color: 'var(--mid)', marginBottom: 6 },
  statValue: { fontSize: 22, fontWeight: 700 },
  sectionTitle: { fontSize: 18, fontWeight: 700, marginBottom: 8 },
  planRow: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  planBtn: { flex: '1 1 200px', padding: '14px 16px', lineHeight: 1.6 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  thead: { background: 'var(--primary-light)' },
  tr: { borderBottom: '1px solid var(--border)' },
  th: { padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 13 },
  td: { padding: '10px 14px' },
};
