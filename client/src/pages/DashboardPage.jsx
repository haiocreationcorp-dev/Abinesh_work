import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { listComics, createComic, deleteComic } from '../api/comics.js';
import { getAdminStats } from '../api/assets.js';
import { useAuth } from '../context/AuthContext.jsx';
import { LineChart, DonutChart, BarChart, Sparkline } from '../components/dashboard/Charts.jsx';

// ── Icons (small inline SVGs, no icon library — consistent with the rest of the app) ──
function IconBuilding() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18" /><path d="M6 21V8l6-4 6 4v13" />
      <path d="M10 21v-6h4v6" /><path d="M9 11h.01" /><path d="M15 11h.01" /><path d="M9 15h.01" /><path d="M15 15h.01" />
    </svg>
  );
}
function IconUser() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}
function IconUsers() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3.5" /><path d="M2 20c0-3.3 3-6 7-6s7 2.7 7 6" />
      <path d="M16.5 5.2a3.5 3.5 0 0 1 0 6.6" /><path d="M22 20c0-2.6-2-4.8-4.7-5.7" />
    </svg>
  );
}
function IconBook() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}
function IconLayoutDashboard() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  );
}
function IconSettings() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
function IconBarChart() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" /><line x1="6" y1="20" x2="6" y2="16" />
    </svg>
  );
}
function IconFileText() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="16" y2="17" />
    </svg>
  );
}
function IconSparkle() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
    </svg>
  );
}
function IconDatabase() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 5v14c0 1.7-4 3-9 3s-9-1.3-9-3V5" /><path d="M21 12c0 1.7-4 3-9 3s-9-1.3-9-3" />
    </svg>
  );
}
function IconGraduationCap() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 10L12 5 2 10l10 5 10-5z" /><path d="M6 12v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5" />
    </svg>
  );
}
function IconChevron({ dir }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points={dir === 'left' ? '15 18 9 12 15 6' : '9 18 15 12 9 6'} />
    </svg>
  );
}

function useCountUp(target, duration = 600) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let start; let raf;
    const step = (ts) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      setValue(Math.round(progress * target));
      if (progress < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function TrendBadge({ trend }) {
  if (!trend) return null;
  if (trend.isNew) return <span style={styles.trendBadgeUp}>▲ New</span>;
  if (trend.pct === 0) return <span style={styles.trendBadgeFlat}>— 0%</span>;
  const up = trend.pct > 0;
  return <span style={up ? styles.trendBadgeUp : styles.trendBadgeDown}>{up ? '▲' : '▼'} {Math.abs(trend.pct)}%</span>;
}

function StatCard({ icon, label, value, trend, description, gradient, sparklineData, sparklineKey }) {
  const count = useCountUp(value);
  const [hover, setHover] = useState(false);
  return (
    <div
      style={{ ...styles.statCard, background: gradient, transform: hover ? 'translateY(-4px)' : 'translateY(0)', boxShadow: hover ? '0 16px 32px rgba(0,0,0,0.18)' : '0 8px 24px rgba(0,0,0,0.08)' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={styles.statCardTop}>
        <div style={styles.statIconWrap}>{icon}</div>
        <TrendBadge trend={trend} />
      </div>
      <div style={styles.statValueLg}>{count}</div>
      <div style={styles.statLabelLg}>{label}</div>
      <div style={styles.statDesc}>{description}</div>
      {sparklineData && (
        <div style={styles.statSparkline}>
          <Sparkline data={sparklineData} valueKey={sparklineKey} color="rgba(255,255,255,0.85)" />
        </div>
      )}
    </div>
  );
}

function SidebarItem({ icon, label, active, collapsed, onClick, comingSoon }) {
  return (
    <button
      style={{
        ...styles.sidebarItem,
        ...(active ? styles.sidebarItemActive : {}),
        ...(comingSoon ? styles.sidebarItemDisabled : {}),
        justifyContent: collapsed ? 'center' : 'flex-start',
      }}
      onClick={comingSoon ? undefined : onClick}
      disabled={comingSoon}
      aria-disabled={comingSoon || undefined}
      title={comingSoon ? `${label} — coming soon` : (collapsed ? label : undefined)}
    >
      <span style={styles.sidebarIcon}>{icon}</span>
      {!collapsed && <span style={styles.sidebarLabel}>{label}</span>}
      {!collapsed && comingSoon && <span style={styles.soonBadge}>Soon</span>}
    </button>
  );
}

function EmptyState({ text }) {
  return (
    <div style={styles.emptyStatePanel}>
      <div style={{ fontSize: 28 }}>🗒️</div>
      <p className="text-muted text-sm" style={{ marginTop: 8 }}>{text}</p>
    </div>
  );
}

function AnalyticsCard({ title, icon, children }) {
  return (
    <div className="card" style={styles.analyticsCard}>
      <div style={styles.analyticsHeader}>
        <span style={styles.analyticsIconWrap}>{icon}</span>
        <span style={styles.analyticsTitle}>{title}</span>
      </div>
      {children}
    </div>
  );
}

export default function DashboardPage() {
  const { user, isAdmin, isViewOnly } = useAuth();
  const navigate = useNavigate();
  const [comics, setComics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState('dashboard'); // admin-only switch; defaults to the stats view
  // Starts collapsed on phone/tablet-width screens so the sidebar doesn't open as a
  // full-bleed overlay on first load — see .dash-sidebar in index.css for the
  // mobile fixed-overlay behavior this pairs with.
  const [collapsed, setCollapsed] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 768);
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState('');

  useEffect(() => {
    listComics().then(setComics).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    setStatsError('');
    getAdminStats().then(setStats).catch((err) => setStatsError(err.response?.data?.error || 'Could not load dashboard stats'));
  }, [isAdmin]);

  const handleCreate = async () => {
    const comic = await createComic({ title: 'Untitled Comic' });
    navigate(`/editor/${comic.id}`);
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!confirm('Delete this comic?')) return;
    await deleteComic(id);
    setComics((prev) => prev.filter((c) => c.id !== id));
  };

  const comicSection = (
    <div className="container section">
      <div style={styles.header}>
        <div>
          <h2 style={styles.greeting}>Hello, {user?.name || user?.email} 👋</h2>
          <p className="text-muted text-sm">
            {isViewOnly ? '🔒 View only — your institution\'s subscription has expired' : 'Your comic strips'}
          </p>
        </div>
        {!isViewOnly && <button className="btn btn-primary" onClick={handleCreate}>+ New Comic</button>}
      </div>

      {loading && <div className="spinner" />}

      {!loading && comics.length === 0 && (
        <div style={styles.empty}>
          <div style={{ fontSize: 60 }}>📖</div>
          <h3>No comics yet</h3>
          <p className="text-muted">Click "New Comic" to start your first strip</p>
        </div>
      )}

      <div style={styles.grid}>
        {comics.map((comic) => (
          <div
            key={comic.id}
            className="card"
            style={styles.comicCard}
            onClick={() => navigate(`/editor/${comic.id}`)}
          >
            <div style={styles.comicThumb}>
              <span style={{ fontSize: 40 }}>🎨</span>
            </div>
            <div style={styles.comicInfo}>
              <strong style={{ fontSize: 15 }}>{comic.title}</strong>
              <p className="text-sm text-muted">{comic.panels?.length ?? 0} panel(s)</p>
              <p className="text-sm text-muted">{new Date(comic.updatedAt).toLocaleDateString()}</p>
            </div>
            {!isViewOnly && (
              <button
                className="btn btn-danger btn-sm"
                style={{ margin: '0 12px 12px auto', display: 'block' }}
                onClick={(e) => handleDelete(comic.id, e)}
              >
                Delete
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  if (!isAdmin) {
    return <div className="page">{comicSection}</div>;
  }

  // Re-derives the same this-month-vs-last-month % logic the server uses for the other
  // trends, from the same real monthly.newUsers data already fetched — not fabricated.
  const totalTrend = (() => {
    if (!stats || stats.monthly.length < 2) return null;
    const last = stats.monthly[stats.monthly.length - 1].newUsers;
    const prev = stats.monthly[stats.monthly.length - 2].newUsers;
    if (prev === 0) return last > 0 ? { pct: null, isNew: true } : { pct: 0, isNew: false };
    return { pct: Math.round(((last - prev) / prev) * 100), isNew: false };
  })();

  return (
    <div className="page" style={{ display: 'flex', alignItems: 'flex-start' }}>
      <div
        className={`dash-sidebar-overlay ${!collapsed ? 'dash-sidebar-overlay-active' : ''}`}
        onClick={() => setCollapsed(true)}
      />
      <aside className={`dash-sidebar ${!collapsed ? 'dash-sidebar-open' : ''}`} style={{ ...styles.sidebar, width: collapsed ? 64 : 260 }}>
        <button
          style={styles.collapseBtn}
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <IconChevron dir={collapsed ? 'right' : 'left'} />
        </button>

        <nav style={styles.sidebarNav}>
          <SidebarItem icon={<IconLayoutDashboard />} label="Dashboard" active={section === 'dashboard'} collapsed={collapsed} onClick={() => setSection('dashboard')} />
          <SidebarItem icon={<IconBook />} label="Comic" active={section === 'comic'} collapsed={collapsed} onClick={() => setSection('comic')} />
          <SidebarItem icon={<IconSettings />} label="Settings" collapsed={collapsed} onClick={() => navigate('/admin')} />

          <div style={styles.sidebarDivider} />

          <SidebarItem icon={<IconBarChart />} label="Analytics" collapsed={collapsed} comingSoon />
          <SidebarItem icon={<IconFileText />} label="Reports" collapsed={collapsed} comingSoon />
          <SidebarItem icon={<IconSparkle />} label="AI Assistant" collapsed={collapsed} comingSoon />
        </nav>
      </aside>

      <div style={{ flex: 1, minWidth: 0 }}>
        {section === 'comic' ? comicSection : (
          <div className="container section">
            <div style={styles.welcomeRow}>
              <div>
                <h2 style={styles.welcomeTitle}>👋 {getGreeting()}, {user?.name || 'Admin'}</h2>
                <p className="text-muted text-sm">Welcome back to BharathComic. Here's what's happening today.</p>
              </div>
              <div style={styles.todayDate}>
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </div>
            </div>

            {!stats && !statsError && <div className="spinner" />}
            {statsError && (
              <div style={styles.empty}>
                <p className="form-error">{statsError}</p>
                <button className="btn btn-outline btn-sm" style={{ marginTop: 8 }} onClick={() => window.location.reload()}>Retry</button>
              </div>
            )}

            {stats && (
              <>
                <div className="dash-stats-grid dash-stats-grid-5">
                  <StatCard
                    icon={<IconUsers />} label="Total Users" value={stats.institutionUsers + stats.individualUsers} trend={totalTrend}
                    description="All users on the platform" gradient="linear-gradient(135deg, #EF4444 0%, #DC2626 100%)"
                    sparklineData={stats.monthly} sparklineKey="cumulativeUsers"
                  />
                  <StatCard
                    icon={<IconBuilding />} label="Institutions" value={stats.totalInstitutions} trend={stats.trends.totalInstitutions}
                    description="Schools & colleges onboarded" gradient="linear-gradient(135deg, #F97316 0%, #EA580C 100%)"
                    sparklineData={stats.monthly} sparklineKey="cumulativeInstitutions"
                  />
                  <StatCard
                    icon={<IconUser />} label="Students" value={stats.students} trend={stats.trends.students}
                    description="Enrolled across all institutions" gradient="linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)"
                    sparklineData={stats.monthly} sparklineKey="cumulativeStudents"
                  />
                  <StatCard
                    icon={<IconGraduationCap />} label="Teachers" value={stats.teachers} trend={stats.trends.teachers}
                    description="Active across all institutions" gradient="linear-gradient(135deg, #22C55E 0%, #16A34A 100%)"
                    sparklineData={stats.monthly} sparklineKey="cumulativeTeachers"
                  />
                  <StatCard
                    icon={<IconBook />} label="Total Comics" value={stats.totalComics} trend={stats.trends.totalComics}
                    description="Created across the platform" gradient="linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)"
                    sparklineData={stats.monthly} sparklineKey="cumulativeComics"
                  />
                </div>

                <div className="dash-charts-row">
                  <div className="card" style={styles.chartCard}>
                    <h3 style={styles.panelTitle}>User Growth</h3>
                    <LineChart data={stats.monthly} valueKey="cumulativeUsers" labelKey="label" />
                  </div>
                  <div className="card" style={styles.chartCard}>
                    <h3 style={styles.panelTitle}>User Distribution</h3>
                    <DonutChart segments={[
                      { value: stats.students, color: '#8B5CF6', label: 'Students' },
                      { value: stats.teachers, color: '#22C55E', label: 'Teachers' },
                      { value: stats.chiefs, color: '#F97316', label: 'Institution Chiefs' },
                      { value: stats.admins, color: '#EF4444', label: 'Admins' },
                    ]} />
                  </div>
                </div>

                <div className="card" style={{ ...styles.panelCard, marginBottom: 24 }}>
                  <h3 style={styles.panelTitle}>Monthly Registrations</h3>
                  <BarChart data={stats.monthly} valueKey="newUsers" labelKey="label" />
                </div>

                <div className="dash-two-col">
                  <div className="card" style={styles.panelCard}>
                    <h3 style={styles.panelTitle}>Quick Actions</h3>
                    <div style={styles.quickActionsGrid}>
                      <button className="btn btn-primary" onClick={handleCreate}>+ Add Comic</button>
                      <button className="btn btn-outline" onClick={() => navigate('/admin?tab=10')}>+ Add Institution</button>
                      <button className="btn btn-outline" disabled title="Coming soon">+ Invite User</button>
                      <button className="btn btn-outline" disabled title="Coming soon">Generate Report</button>
                    </div>
                  </div>
                  <div className="card" style={styles.panelCard}>
                    <h3 style={styles.panelTitle}>Recent Activity</h3>
                    <EmptyState text="No data available yet. Data will appear as users begin using the platform." />
                  </div>
                </div>

                <h3 style={styles.sectionLabel}>Analytics</h3>
                <div className="dash-analytics-grid">
                  <AnalyticsCard title="Most Active Institution" icon={<IconBuilding />}>
                    {stats.mostActiveInstitution ? (
                      <>
                        <div style={styles.analyticsValue}>{stats.mostActiveInstitution.name}</div>
                        <p className="text-sm text-muted">{stats.mostActiveInstitution.userCount} users · {stats.mostActiveInstitution.type === 'COLLEGE' ? 'College' : 'School'}</p>
                      </>
                    ) : <p className="text-sm text-muted">No data available yet.</p>}
                  </AnalyticsCard>
                  <AnalyticsCard title="Top Comic" icon={<IconBook />}>
                    <p className="text-sm text-muted">No data available yet.</p>
                  </AnalyticsCard>
                  <AnalyticsCard title="AI Requests Today" icon={<IconSparkle />}>
                    <p className="text-sm text-muted">No data available yet.</p>
                  </AnalyticsCard>
                  <AnalyticsCard title="Storage Usage" icon={<IconDatabase />}>
                    <p className="text-sm text-muted">No data available yet.</p>
                  </AnalyticsCard>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid var(--border)' },
  greeting: { fontSize: 18, fontWeight: 700, marginBottom: 2 },
  empty: { textAlign: 'center', padding: '80px 0', color: 'var(--mid)' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 20 },
  comicCard: { cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s' },
  comicThumb: { height: 140, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  comicInfo: { padding: '12px 12px 8px', display: 'flex', flexDirection: 'column', gap: 3 },

  sidebar: {
    flex: '0 0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    background: 'var(--surface)',
    borderRight: '1px solid var(--border)',
    padding: '16px',
    minHeight: 'calc(100vh - 72px)',
    transition: 'width 220ms ease',
  },
  collapseBtn: {
    alignSelf: 'flex-end',
    width: 28, height: 28, borderRadius: 'var(--radius-sm)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'var(--mid)', background: 'transparent', marginBottom: 8,
  },
  sidebarNav: { display: 'flex', flexDirection: 'column', gap: 8 },
  sidebarItem: {
    display: 'flex', alignItems: 'center', gap: 12, width: '100%',
    height: 48, padding: '0 16px', borderRadius: 12,
    background: 'transparent', color: 'var(--mid)', fontSize: 14, fontWeight: 600,
    transition: 'background 0.18s ease, color 0.18s ease',
  },
  sidebarItemActive: { background: 'var(--primary-light)', color: 'var(--primary)' },
  sidebarItemDisabled: { color: 'var(--border)', cursor: 'not-allowed' },
  sidebarIcon: { display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  sidebarLabel: { flex: 1, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  soonBadge: { fontSize: 10, fontWeight: 700, color: 'var(--mid)', background: 'var(--light)', borderRadius: 99, padding: '2px 7px' },
  sidebarDivider: { height: 1, background: 'var(--border)', margin: '16px 0 12px' },

  welcomeRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12, paddingRight: 8 },
  welcomeTitle: { fontSize: 24, fontWeight: 600, marginBottom: 8 },
  todayDate: { fontSize: 14, color: 'var(--mid)', fontWeight: 600, whiteSpace: 'nowrap' },

  statCard: { borderRadius: 16, padding: 24, color: '#fff', transition: 'transform 200ms ease, box-shadow 200ms ease' },
  statCardTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  statIconWrap: { width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  statValueLg: { fontSize: 28, fontWeight: 800, marginBottom: 8 },
  statLabelLg: { fontSize: 13, fontWeight: 600, marginBottom: 6 },
  statDesc: { fontSize: 11, opacity: 0.85, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  statSparkline: { marginTop: 12 },
  trendBadgeUp: { fontSize: 12, fontWeight: 700, color: '#bbf7d0', background: 'rgba(255,255,255,0.15)', borderRadius: 99, padding: '3px 8px' },
  trendBadgeDown: { fontSize: 12, fontWeight: 700, color: '#fecaca', background: 'rgba(255,255,255,0.15)', borderRadius: 99, padding: '3px 8px' },
  trendBadgeFlat: { fontSize: 12, fontWeight: 700, color: '#fff', opacity: 0.8, background: 'rgba(255,255,255,0.15)', borderRadius: 99, padding: '3px 8px' },
  trendBadgeNew: { fontSize: 12, fontWeight: 700, color: '#fff', background: 'rgba(255,255,255,0.25)', borderRadius: 99, padding: '3px 8px' },

  chartCard: { padding: 24, borderRadius: 16, boxShadow: '0 8px 24px rgba(0,0,0,0.08)' },
  panelCard: { padding: 24, borderRadius: 16, boxShadow: '0 8px 24px rgba(0,0,0,0.08)' },
  panelTitle: { fontSize: 16, fontWeight: 600, marginBottom: 20 },
  sectionLabel: { fontSize: 18, fontWeight: 700, margin: '8px 0 16px' },

  quickActionsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  emptyStatePanel: { textAlign: 'center', padding: '24px 0', color: 'var(--mid)' },

  analyticsCard: { padding: 20 },
  analyticsHeader: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 },
  analyticsIconWrap: { width: 32, height: 32, borderRadius: '50%', background: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  analyticsTitle: { fontSize: 13, fontWeight: 700, color: 'var(--mid)' },
  analyticsValue: { fontSize: 16, fontWeight: 700, marginBottom: 2 },
};
