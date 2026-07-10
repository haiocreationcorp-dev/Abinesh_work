import { useState, useEffect, useMemo } from 'react';
import {
  listInstitutions, createInstitution, renewInstitution, updateInstitution, suspendInstitution,
  deleteInstitution, createInstitutionChief, updateInstitutionSystemCount,
} from '../../api/assets.js';
import { useToast } from '../../context/ToastContext.jsx';
import Modal from '../ui/Modal.jsx';

const TYPE_LABEL = { SCHOOL: 'School', COLLEGE: 'College' };
const STATUS_META = {
  active: { label: 'Active', color: 'var(--success)', bg: '#dcfce7' },
  expiring: { label: 'Expiring Soon', color: '#F59E0B', bg: '#fef3c7' },
  expired: { label: 'Expired', color: 'var(--danger)', bg: '#fee2e2' },
  suspended: { label: 'Suspended', color: 'var(--mid)', bg: 'var(--light)' },
};
const EXPIRING_SOON_DAYS = 14;
const PAGE_SIZE_OPTIONS = [10, 25, 50];

function getStatus(inst) {
  if (inst.suspended) return 'suspended';
  const expiresAt = inst.subscriptionExpiresAt ? new Date(inst.subscriptionExpiresAt) : null;
  if (!expiresAt || expiresAt <= new Date()) return 'expired';
  const daysLeft = Math.ceil((expiresAt - new Date()) / 86400000);
  return daysLeft <= EXPIRING_SOON_DAYS ? 'expiring' : 'active';
}

function subscriptionInfo(inst) {
  const start = inst.subscriptionStartedAt ? new Date(inst.subscriptionStartedAt) : null;
  const end = inst.subscriptionExpiresAt ? new Date(inst.subscriptionExpiresAt) : null;
  if (!start || !end) return { pct: 0, daysRemaining: null, start: null, end: null };
  const now = new Date();
  const total = end - start;
  const pct = total > 0 ? Math.min(100, Math.max(0, ((now - start) / total) * 100)) : 100;
  return { pct, daysRemaining: Math.ceil((end - now) / 86400000), start, end };
}

function IconSearch() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
function IconMoreVertical() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="12" cy="19" r="1.2" />
    </svg>
  );
}
function IconAlertTriangle() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}
function IconChevron({ dir }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points={dir === 'left' ? '15 18 9 12 15 6' : '9 18 15 12 9 6'} />
    </svg>
  );
}
function IconCopy() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}
function IconUsers() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3.5" /><path d="M2 20c0-3.3 3-6 7-6s7 2.7 7 6" /><path d="M16.5 5.2a3.5 3.5 0 0 1 0 6.6" /><path d="M22 20c0-2.6-2-4.8-4.7-5.7" />
    </svg>
  );
}
function IconCpu() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" />
      <line x1="9" y1="1" x2="9" y2="4" /><line x1="15" y1="1" x2="15" y2="4" /><line x1="9" y1="20" x2="9" y2="23" /><line x1="15" y1="20" x2="15" y2="23" />
      <line x1="20" y1="9" x2="23" y2="9" /><line x1="20" y1="15" x2="23" y2="15" /><line x1="1" y1="9" x2="4" y2="9" /><line x1="1" y1="15" x2="4" y2="15" />
    </svg>
  );
}
function IconBuilding() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18" /><path d="M6 21V8l6-4 6 4v13" /><path d="M10 21v-6h4v6" />
    </svg>
  );
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status];
  return <span style={{ ...styles.badge, color: meta.color, background: meta.bg }}>{meta.label}</span>;
}

function InstIcon({ size = 34 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <IconBuilding />
    </div>
  );
}

export default function InstitutionsPanel() {
  const toast = useToast();
  const [institutions, setInstitutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('name-asc');
  const [selected, setSelected] = useState(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [drawerInst, setDrawerInst] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [confirmInput, setConfirmInput] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('SCHOOL');
  const [creating, setCreating] = useState(false);
  const [justCreatedCode, setJustCreatedCode] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', type: 'SCHOOL', subscriptionStartedAt: '', subscriptionExpiresAt: '', systemCount: 0 });
  const [chiefTarget, setChiefTarget] = useState(null);
  const [chiefForm, setChiefForm] = useState({ name: '', email: '', password: '' });
  const [chiefError, setChiefError] = useState('');

  useEffect(() => {
    listInstitutions().then(setInstitutions).finally(() => setLoading(false));
  }, []);

  useEffect(() => { setPage(1); }, [search, typeFilter, statusFilter, pageSize]);

  const filtered = useMemo(() => institutions.filter((i) => {
    if (typeFilter && i.type !== typeFilter) return false;
    if (statusFilter && getStatus(i) !== statusFilter) return false;
    if (search) {
      const hay = `${i.name} ${i.code} ${i.chief?.name || ''} ${i.chief?.email || ''}`.toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  }), [institutions, typeFilter, statusFilter, search]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      if (sortBy === 'name-desc') return b.name.localeCompare(a.name);
      if (sortBy === 'start-desc') return new Date(b.subscriptionStartedAt || 0) - new Date(a.subscriptionStartedAt || 0);
      if (sortBy === 'end-asc') return new Date(a.subscriptionExpiresAt || 0) - new Date(b.subscriptionExpiresAt || 0);
      return a.name.localeCompare(b.name);
    });
    return arr;
  }, [filtered, sortBy]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const clampedPage = Math.min(page, totalPages);
  const pageItems = sorted.slice((clampedPage - 1) * pageSize, clampedPage * pageSize);

  const stats = useMemo(() => ({
    total: institutions.length,
    schools: institutions.filter((i) => i.type === 'SCHOOL').length,
    colleges: institutions.filter((i) => i.type === 'COLLEGE').length,
    activeSubs: institutions.filter((i) => getStatus(i) === 'active').length,
  }), [institutions]);

  const clearFilters = () => { setSearch(''); setTypeFilter(''); setStatusFilter(''); };

  const toggleSelect = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const pageIds = pageItems.map((i) => i.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const toggleSelectAllOnPage = () => setSelected((prev) => {
    const next = new Set(prev);
    if (allPageSelected) pageIds.forEach((id) => next.delete(id));
    else pageIds.forEach((id) => next.add(id));
    return next;
  });

  const refreshOne = (updated) => setInstitutions((prev) => prev.map((i) => (i.id === updated.id ? { ...i, ...updated } : i)));

  const handleRenewOne = async (inst) => {
    setBusyId(inst.id);
    setOpenMenuId(null);
    try {
      const updated = await renewInstitution(inst.id);
      refreshOne(updated);
      toast.success(`${inst.name} renewed +3 months`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not renew');
    } finally {
      setBusyId(null);
    }
  };

  const handleSuspendToggleOne = async (inst) => {
    setBusyId(inst.id);
    setOpenMenuId(null);
    try {
      const updated = await suspendInstitution(inst.id, !inst.suspended);
      refreshOne(updated);
      toast.success(`${inst.name} ${updated.suspended ? 'suspended' : 'reactivated'}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not update');
    } finally {
      setBusyId(null);
    }
  };

  const handleBulkRenew = async () => {
    const ids = [...selected];
    for (const id of ids) { try { refreshOne(await renewInstitution(id)); } catch (_) { /* continue */ } }
    toast.success(`Renewed ${ids.length} institution(s)`);
  };

  const handleBulkSuspend = async (suspended) => {
    const ids = [...selected];
    for (const id of ids) { try { refreshOne(await suspendInstitution(id, suspended)); } catch (_) { /* continue */ } }
    toast.success(`Updated ${ids.length} institution(s)`);
  };

  const handleExportSelected = () => {
    const rows = institutions.filter((i) => selected.has(i.id));
    const header = ['Name', 'Type', 'Join Code', 'Members', 'Systems', 'Status', 'Start Date', 'End Date'];
    const lines = rows.map((i) => [
      i.name, TYPE_LABEL[i.type], i.code, i._count?.users ?? 0, i.systemCount ?? 0, STATUS_META[getStatus(i)].label,
      i.subscriptionStartedAt ? new Date(i.subscriptionStartedAt).toLocaleDateString() : '',
      i.subscriptionExpiresAt ? new Date(i.subscriptionExpiresAt).toLocaleDateString() : '',
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'institutions-export.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyCode = (code) => {
    navigator.clipboard.writeText(code).then(() => toast.success('Join code copied'));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const created = await createInstitution(newName.trim(), newType);
      setInstitutions((prev) => [{ ...created, _count: { users: 0, classes: 0, tasks: 0, payments: 0 }, chief: null }, ...prev]);
      setJustCreatedCode(created.code);
      setNewName('');
      setCreateOpen(false);
      toast.success(`"${created.name}" created`);
    } finally {
      setCreating(false);
    }
  };

  const toDateInput = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

  const openEdit = (inst) => {
    setEditTarget(inst);
    setEditForm({
      name: inst.name, type: inst.type,
      subscriptionStartedAt: toDateInput(inst.subscriptionStartedAt),
      subscriptionExpiresAt: toDateInput(inst.subscriptionExpiresAt),
      systemCount: inst.systemCount ?? 0,
    });
    setOpenMenuId(null);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    const { systemCount, ...rest } = editForm;
    const [updated] = await Promise.all([
      updateInstitution(editTarget.id, rest),
      updateInstitutionSystemCount(editTarget.id, Number(systemCount) || 0),
    ]);
    setInstitutions((prev) => prev.map((i) => (i.id === updated.id ? { ...i, ...updated, systemCount: Number(systemCount) || 0 } : i)));
    toast.success(`${updated.name} updated`);
    setEditTarget(null);
  };

  const openChiefForm = (inst) => {
    setChiefTarget(inst);
    setChiefForm({ name: '', email: '', password: '' });
    setChiefError('');
    setOpenMenuId(null);
  };

  const handleCreateChiefSubmit = async (e) => {
    e.preventDefault();
    setChiefError('');
    try {
      const chief = await createInstitutionChief(chiefTarget.id, chiefForm);
      setInstitutions((prev) => prev.map((i) => (i.id === chiefTarget.id ? { ...i, chief: { name: chief.name, email: chief.email } } : i)));
      toast.success(`Chief login created for ${chiefTarget.name}`);
      setChiefTarget(null);
    } catch (err) {
      setChiefError(err.response?.data?.error || 'Could not create chief login');
    }
  };

  const openDeleteConfirm = (targets) => {
    setConfirmTarget(targets);
    setConfirmInput('');
    setOpenMenuId(null);
  };

  const isBulkDelete = confirmTarget && confirmTarget.length > 1;
  const confirmPhrase = confirmTarget ? (isBulkDelete ? 'DELETE' : confirmTarget[0].name) : '';
  const confirmValid = confirmInput.trim() === confirmPhrase;
  const aggregateCounts = useMemo(() => {
    if (!confirmTarget) return null;
    return confirmTarget.reduce((acc, i) => ({
      users: acc.users + (i._count?.users || 0),
      classes: acc.classes + (i._count?.classes || 0),
      tasks: acc.tasks + (i._count?.tasks || 0),
      payments: acc.payments + (i._count?.payments || 0),
    }), { users: 0, classes: 0, tasks: 0, payments: 0 });
  }, [confirmTarget]);

  const handleConfirmDelete = async () => {
    const ids = confirmTarget.map((i) => i.id);
    for (const id of ids) {
      try { await deleteInstitution(id); } catch (err) { toast.error(err.response?.data?.error || 'Could not delete institution'); }
    }
    setInstitutions((prev) => prev.filter((i) => !ids.includes(i.id)));
    setSelected((prev) => { const next = new Set(prev); ids.forEach((id) => next.delete(id)); return next; });
    toast.success(`Deleted ${ids.length} institution(s)`);
    setConfirmTarget(null);
    setDrawerInst(null);
  };

  return (
    <div>
      <div style={styles.headerRow}>
        <div>
          <h2 style={styles.pageTitle}>Institutions</h2>
          <p className="text-muted text-sm">Manage schools, colleges, organizations and their subscriptions.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>+ Create Institution</button>
      </div>

      {justCreatedCode && (
        <div style={styles.codeCallout}>
          <span>Share this join code with teachers and students: <strong>{justCreatedCode}</strong></span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline btn-sm" onClick={() => handleCopyCode(justCreatedCode)}>Copy</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setJustCreatedCode(null)}>Dismiss</button>
          </div>
        </div>
      )}

      <div className="dash-stats-grid" style={{ marginBottom: 20 }}>
        <div className="card" style={styles.statCard}>
          <div style={styles.statLabel}>Total Institutions</div>
          <div style={styles.statValue}>{stats.total}</div>
        </div>
        <div className="card" style={styles.statCard}>
          <div style={styles.statLabel}>Schools</div>
          <div style={styles.statValue}>{stats.schools}</div>
        </div>
        <div className="card" style={styles.statCard}>
          <div style={styles.statLabel}>Colleges</div>
          <div style={styles.statValue}>{stats.colleges}</div>
        </div>
        <div className="card" style={styles.statCard}>
          <div style={styles.statLabel}>Active Subscriptions</div>
          <div style={styles.statValue}>{stats.activeSubs}</div>
        </div>
      </div>

      <div style={styles.toolbar}>
        <div style={styles.searchWrap}>
          <IconSearch />
          <input
            style={styles.searchInput}
            placeholder="Search name, join code, chief…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select style={styles.filterSelect} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">All Types</option>
          <option value="SCHOOL">School</option>
          <option value="COLLEGE">College</option>
        </select>
        <select style={styles.filterSelect} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          {Object.entries(STATUS_META).map(([id, meta]) => <option key={id} value={id}>{meta.label}</option>)}
        </select>
        <select style={styles.filterSelect} value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="name-asc">Name A–Z</option>
          <option value="name-desc">Name Z–A</option>
          <option value="start-desc">Newest start date</option>
          <option value="end-asc">Soonest expiry</option>
        </select>
      </div>

      {selected.size > 0 && (
        <div style={styles.bulkBar}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>{selected.size} selected</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline btn-sm" onClick={handleExportSelected}>Export</button>
            <button className="btn btn-outline btn-sm" onClick={handleBulkRenew}>Renew +3mo</button>
            <button className="btn btn-outline btn-sm" onClick={() => handleBulkSuspend(true)}>Suspend</button>
            <button className="btn btn-outline btn-sm" onClick={() => handleBulkSuspend(false)}>Reactivate</button>
            <button className="btn btn-danger btn-sm" onClick={() => openDeleteConfirm(institutions.filter((i) => selected.has(i.id)))}>Delete</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>Clear</button>
          </div>
        </div>
      )}

      {loading && (
        <div className="card" style={{ padding: 20 }}>
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton" style={{ height: 50, marginBottom: 10 }} />)}
        </div>
      )}

      {!loading && institutions.length === 0 && (
        <div className="card" style={styles.emptyState}>
          <div style={{ fontSize: 32 }}>🏫</div>
          <h3>No institutions found.</h3>
          <button className="btn btn-primary btn-sm" style={{ marginTop: 10 }} onClick={() => setCreateOpen(true)}>Create First Institution</button>
        </div>
      )}
      {!loading && institutions.length > 0 && sorted.length === 0 && (
        <div className="card" style={styles.emptyState}>
          <div style={{ fontSize: 32 }}>🔍</div>
          <h3>No institutions match your filters.</h3>
          <button className="btn btn-outline btn-sm" style={{ marginTop: 10 }} onClick={clearFilters}>Clear filters</button>
        </div>
      )}

      {!loading && pageItems.length > 0 && (
        <div className="users-table-wrap card" style={{ padding: 0, maxHeight: 560, overflowY: 'auto' }}>
          <table style={styles.table}>
            <thead>
              <tr style={styles.thead}>
                <th style={styles.thCheck}><input type="checkbox" checked={allPageSelected} onChange={toggleSelectAllOnPage} /></th>
                <th style={styles.th}>Institution</th>
                <th style={styles.th}>Join Code</th>
                <th style={styles.th}>Members</th>
                <th style={styles.th}>Systems</th>
                <th style={styles.th}>Subscription</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((inst) => {
                const sub = subscriptionInfo(inst);
                const status = getStatus(inst);
                return (
                  <tr key={inst.id} style={styles.tr} onClick={() => setDrawerInst(inst)}>
                    <td style={styles.tdCheck} onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(inst.id)} onChange={() => toggleSelect(inst.id)} />
                    </td>
                    <td style={styles.td}>
                      <div style={styles.instCell}>
                        <InstIcon />
                        <div>
                          <div style={{ fontWeight: 600 }}>{inst.name}</div>
                          <div className="text-sm text-muted">{TYPE_LABEL[inst.type]}</div>
                        </div>
                      </div>
                    </td>
                    <td style={styles.td} onClick={(e) => e.stopPropagation()}>
                      <span style={styles.codeBadge}>
                        {inst.code}
                        <button style={styles.copyBtn} onClick={() => handleCopyCode(inst.code)} aria-label="Copy join code"><IconCopy /></button>
                      </span>
                    </td>
                    <td style={styles.td}><span style={styles.iconText}><IconUsers /> {inst._count?.users ?? 0}</span></td>
                    <td style={styles.td}><span style={styles.iconText}><IconCpu /> {inst.systemCount ?? 0} systems</span></td>
                    <td style={styles.td}>
                      {sub.end ? (
                        <div style={{ minWidth: 130 }}>
                          <div className="text-sm">{sub.start.toLocaleDateString()} → {sub.end.toLocaleDateString()}</div>
                          <div style={styles.progressTrack}><div style={{ ...styles.progressFill, width: `${sub.pct}%`, background: STATUS_META[status].color }} /></div>
                          <div className="text-sm text-muted">{sub.daysRemaining >= 0 ? `${sub.daysRemaining} days remaining` : `Expired ${-sub.daysRemaining} days ago`}</div>
                        </div>
                      ) : <span className="text-sm text-muted">—</span>}
                    </td>
                    <td style={styles.td}><StatusBadge status={status} /></td>
                    <td style={styles.td} onClick={(e) => e.stopPropagation()}>
                      <div style={styles.menuWrap}>
                        {openMenuId === inst.id && <div style={styles.menuOverlay} onClick={() => setOpenMenuId(null)} />}
                        <button style={styles.menuTrigger} onClick={() => setOpenMenuId((id) => (id === inst.id ? null : inst.id))} aria-label="Row actions">
                          <IconMoreVertical />
                        </button>
                        {openMenuId === inst.id && (
                          <div style={styles.menuDropdown}>
                            <button style={styles.menuItem} onClick={() => { setDrawerInst(inst); setOpenMenuId(null); }}>View Details</button>
                            <button style={styles.menuItem} onClick={() => openEdit(inst)}>Edit Institution</button>
                            <button style={styles.menuItem} onClick={() => handleRenewOne(inst)} disabled={busyId === inst.id}>Renew Subscription</button>
                            <button style={styles.menuItem} onClick={() => handleSuspendToggleOne(inst)} disabled={busyId === inst.id}>
                              {inst.suspended ? 'Reactivate' : 'Suspend'}
                            </button>
                            <button style={styles.menuItem} onClick={() => openChiefForm(inst)} disabled={!!inst.chief} title={inst.chief ? 'Already has a chief login' : undefined}>
                              Create Institution Chief
                            </button>
                            <button style={{ ...styles.menuItem, color: 'var(--danger)' }} onClick={() => openDeleteConfirm([inst])}>Delete</button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && pageItems.length > 0 && (
        <div className="users-card-list">
          {pageItems.map((inst) => {
            const status = getStatus(inst);
            return (
              <div key={inst.id} className="card" style={styles.mobileCard} onClick={() => setDrawerInst(inst)}>
                <div style={styles.instCell}>
                  <InstIcon />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{inst.name}</div>
                    <div className="text-sm text-muted">{TYPE_LABEL[inst.type]}</div>
                  </div>
                  <input type="checkbox" checked={selected.has(inst.id)} onChange={(e) => { e.stopPropagation(); toggleSelect(inst.id); }} onClick={(e) => e.stopPropagation()} />
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <StatusBadge status={status} />
                  <span style={styles.iconText}><IconUsers /> {inst._count?.users ?? 0}</span>
                  <span style={styles.iconText}><IconCpu /> {inst.systemCount ?? 0} systems</span>
                </div>
                <div className="text-sm text-muted" style={{ marginTop: 8 }}>Join code: {inst.code}</div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && sorted.length > 0 && (
        <div style={styles.paginationRow}>
          <span className="text-sm text-muted">
            Showing {(clampedPage - 1) * pageSize + 1}–{Math.min(clampedPage * pageSize, sorted.length)} of {sorted.length} institutions
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <select style={styles.filterSelect} value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
              {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n} / page</option>)}
            </select>
            <button style={styles.pageBtn} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={clampedPage <= 1}><IconChevron dir="left" /></button>
            <span className="text-sm">{clampedPage} / {totalPages}</span>
            <button style={styles.pageBtn} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={clampedPage >= totalPages}><IconChevron dir="right" /></button>
          </div>
        </div>
      )}

      {/* Detail drawer */}
      {drawerInst && (() => {
        const sub = subscriptionInfo(drawerInst);
        const status = getStatus(drawerInst);
        return (
          <>
            <div style={styles.drawerOverlay} onClick={() => setDrawerInst(null)} />
            <div style={styles.drawer}>
              <button style={styles.drawerClose} onClick={() => setDrawerInst(null)} aria-label="Close">✕</button>
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <InstIcon size={56} />
                <h3 style={{ marginTop: 12 }}>{drawerInst.name}</h3>
                <p className="text-sm text-muted">{TYPE_LABEL[drawerInst.type]}</p>
                <div style={{ marginTop: 8 }}><StatusBadge status={status} /></div>
              </div>
              <div style={styles.drawerSection}>
                <div style={styles.drawerLabel}>Join Code</div>
                <span style={styles.codeBadge}>
                  {drawerInst.code}
                  <button style={styles.copyBtn} onClick={() => handleCopyCode(drawerInst.code)} aria-label="Copy join code"><IconCopy /></button>
                </span>
              </div>
              <div style={styles.drawerSection}>
                <div style={styles.drawerLabel}>Subscription</div>
                {sub.end ? (
                  <div>{sub.start.toLocaleDateString()} → {sub.end.toLocaleDateString()} ({sub.daysRemaining >= 0 ? `${sub.daysRemaining} days remaining` : `expired ${-sub.daysRemaining} days ago`})</div>
                ) : <p className="text-sm text-muted">No subscription set.</p>}
              </div>
              <div style={styles.drawerSection}>
                <div style={styles.drawerLabel}>Institution Chief</div>
                {drawerInst.chief ? (
                  <div>{drawerInst.chief.name} <span className="text-sm text-muted">({drawerInst.chief.email})</span></div>
                ) : <p className="text-sm text-muted">No chief assigned yet.</p>}
              </div>
              <div style={styles.drawerSection}>
                <div style={styles.drawerLabel}>Members</div>
                <div>{drawerInst._count?.users ?? 0}</div>
              </div>
              <div style={styles.drawerSection}>
                <div style={styles.drawerLabel}>Systems Licensed</div>
                <div>{drawerInst.systemCount ?? 0}</div>
              </div>
              <div style={styles.drawerSection}>
                <div style={styles.drawerLabel}>Audit Log</div>
                <p className="text-sm text-muted">No data available yet.</p>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
                <button className="btn btn-outline btn-sm" onClick={() => handleRenewOne(drawerInst)} disabled={busyId === drawerInst.id}>Renew +3mo</button>
                <button className="btn btn-outline btn-sm" onClick={() => handleSuspendToggleOne(drawerInst)} disabled={busyId === drawerInst.id}>
                  {drawerInst.suspended ? 'Reactivate' : 'Suspend'}
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => openDeleteConfirm([drawerInst])}>Delete</button>
              </div>
            </div>
          </>
        );
      })()}

      {/* Create Institution modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Institution">
        <form onSubmit={handleCreate}>
          <div className="form-group">
            <label>Institution Name</label>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Springfield High School" autoFocus />
          </div>
          <div className="form-group">
            <label>Type</label>
            <select value={newType} onChange={(e) => setNewType(e.target.value)}>
              <option value="SCHOOL">School</option>
              <option value="COLLEGE">College</option>
            </select>
          </div>
          <button className="btn btn-primary w-full" type="submit" disabled={creating}>{creating ? 'Creating…' : 'Create Institution'}</button>
        </form>
      </Modal>

      {/* Edit Institution modal */}
      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="Edit Institution">
        <form onSubmit={handleSaveEdit}>
          <div className="form-group">
            <label>Name</label>
            <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Type</label>
            <select value={editForm.type} onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}>
              <option value="SCHOOL">School</option>
              <option value="COLLEGE">College</option>
            </select>
          </div>
          <div className="form-group">
            <label>Systems Licensed</label>
            <input type="number" min="0" value={editForm.systemCount} onChange={(e) => setEditForm({ ...editForm, systemCount: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Subscription Start</label>
            <input type="date" value={editForm.subscriptionStartedAt} onChange={(e) => setEditForm({ ...editForm, subscriptionStartedAt: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Subscription End</label>
            <input type="date" value={editForm.subscriptionExpiresAt} onChange={(e) => setEditForm({ ...editForm, subscriptionExpiresAt: e.target.value })} />
          </div>
          <button className="btn btn-primary w-full" type="submit">Save Changes</button>
        </form>
      </Modal>

      {/* Create Chief modal */}
      <Modal open={!!chiefTarget} onClose={() => setChiefTarget(null)} title={`Create Chief Login${chiefTarget ? ` — ${chiefTarget.name}` : ''}`}>
        <form onSubmit={handleCreateChiefSubmit}>
          <div className="form-group">
            <label>Name</label>
            <input value={chiefForm.name} onChange={(e) => setChiefForm({ ...chiefForm, name: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={chiefForm.email} onChange={(e) => setChiefForm({ ...chiefForm, email: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input type="password" value={chiefForm.password} onChange={(e) => setChiefForm({ ...chiefForm, password: e.target.value })} required />
          </div>
          {chiefError && <p className="form-error">{chiefError}</p>}
          <button className="btn btn-primary w-full" type="submit">Create</button>
        </form>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal open={!!confirmTarget} onClose={() => setConfirmTarget(null)}>
        {confirmTarget && (
          <>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ color: 'var(--danger)' }}><IconAlertTriangle /></span>
              <div>
                <h3 style={{ marginBottom: 4 }}>
                  Delete {isBulkDelete ? `${confirmTarget.length} institutions` : confirmTarget[0].name}?
                </h3>
                <p className="text-sm text-muted">This action is permanent and cannot be undone.</p>
              </div>
            </div>

            <div style={styles.confirmCounts}>
              <p style={{ fontWeight: 600, marginBottom: 6, fontSize: 13 }}>This will permanently delete:</p>
              <ul style={{ paddingLeft: 18, fontSize: 13, color: 'var(--mid)', lineHeight: 1.7 }}>
                <li>{aggregateCounts.classes} class(es)</li>
                <li>{aggregateCounts.tasks} task(s)</li>
                <li>{aggregateCounts.payments} payment record(s)</li>
                {aggregateCounts.users > 0 && (
                  <li>{aggregateCounts.users} user(s) will be disconnected — their accounts and comics are kept</li>
                )}
              </ul>
            </div>

            <div className="form-group" style={{ marginTop: 12 }}>
              <label>Type {isBulkDelete ? '"DELETE"' : `"${confirmPhrase}"`} to confirm</label>
              <input value={confirmInput} onChange={(e) => setConfirmInput(e.target.value)} autoFocus />
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn btn-ghost w-full" onClick={() => setConfirmTarget(null)}>Cancel</button>
              <button className="btn btn-danger w-full" disabled={!confirmValid} onClick={handleConfirmDelete}>Delete</button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

const styles = {
  headerRow: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' },
  pageTitle: { fontSize: 22, fontWeight: 800, marginBottom: 2 },
  codeCallout: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap',
    background: 'var(--primary-light)', color: 'var(--primary)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', marginBottom: 16, fontSize: 14,
  },
  statCard: { padding: 20 },
  statLabel: { fontSize: 13, color: 'var(--mid)', marginBottom: 6 },
  statValue: { fontSize: 28, fontWeight: 800 },
  toolbar: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' },
  searchWrap: {
    display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 220px',
    background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)',
    padding: '8px 12px', color: 'var(--mid)',
  },
  searchInput: { border: 'none', background: 'transparent', width: '100%', fontSize: 14, color: 'var(--dark)' },
  filterSelect: { padding: '8px 10px', fontSize: 13 },
  bulkBar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
    background: 'var(--primary-light)', border: '1px solid var(--primary)', borderRadius: 'var(--radius-sm)',
    padding: '10px 16px', marginBottom: 14,
  },
  emptyState: { textAlign: 'center', padding: '60px 20px', color: 'var(--mid)' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  thead: { background: 'var(--primary-light)' },
  thCheck: { padding: '10px 14px', width: 36, position: 'sticky', top: 0, background: 'var(--primary-light)', zIndex: 2 },
  th: { padding: '10px 14px', textAlign: 'left', fontWeight: 700, fontSize: 12, color: 'var(--mid)', textTransform: 'uppercase', letterSpacing: 0.4, position: 'sticky', top: 0, background: 'var(--primary-light)', zIndex: 2 },
  tr: { borderBottom: '1px solid var(--border)', cursor: 'pointer' },
  td: { padding: '12px 14px' },
  tdCheck: { padding: '12px 14px', width: 36 },
  instCell: { display: 'flex', alignItems: 'center', gap: 10 },
  badge: { display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700 },
  codeBadge: {
    display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'monospace', fontSize: 13,
    background: 'var(--primary-light)', color: 'var(--primary)', borderRadius: 99, padding: '4px 10px',
  },
  copyBtn: { display: 'flex', alignItems: 'center', color: 'inherit', opacity: 0.7 },
  iconText: { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--mid)' },
  progressTrack: { height: 4, borderRadius: 99, background: 'var(--border)', margin: '4px 0', overflow: 'hidden' },
  progressFill: { height: '100%', transition: 'width 300ms ease' },
  menuWrap: { position: 'relative' },
  menuOverlay: { position: 'fixed', inset: 0, zIndex: 49 },
  menuTrigger: { width: 30, height: 30, borderRadius: 'var(--radius-sm)', color: 'var(--mid)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 50 },
  menuDropdown: {
    position: 'absolute', right: 0, top: 34, background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-lg)', padding: 6, width: 200, zIndex: 50,
    display: 'flex', flexDirection: 'column', gap: 2,
  },
  menuItem: { width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'transparent', color: 'var(--dark)', fontSize: 13, fontWeight: 600 },
  mobileCard: { padding: 16, marginBottom: 0, cursor: 'pointer' },
  paginationRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  pageBtn: { width: 30, height: 30, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mid)' },
  drawerOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', justifyContent: 'flex-end' },
  drawer: {
    position: 'fixed', top: 0, right: 0, bottom: 0, width: 360, maxWidth: '90vw', background: 'var(--surface)',
    boxShadow: 'var(--shadow-lg)', padding: 24, overflowY: 'auto', zIndex: 201,
  },
  drawerClose: { position: 'absolute', top: 16, right: 16, color: 'var(--mid)' },
  drawerSection: { padding: '12px 0', borderTop: '1px solid var(--border)' },
  drawerLabel: { fontSize: 11, fontWeight: 700, color: 'var(--mid)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  confirmCounts: { background: 'var(--light)', borderRadius: 'var(--radius-sm)', padding: 14, marginTop: 14 },
};
