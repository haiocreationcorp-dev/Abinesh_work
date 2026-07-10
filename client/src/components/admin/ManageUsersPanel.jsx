import { useState, useEffect, useMemo } from 'react';
import { getAdminUsers, disableUser, deleteUser } from '../../api/assets.js';
import { useToast } from '../../context/ToastContext.jsx';
import Modal from '../ui/Modal.jsx';

const ROLE_META = {
  ADMIN: { label: 'Admin', color: 'var(--danger)', bg: '#fee2e2' },
  TEACHER: { label: 'Teacher', color: '#2563eb', bg: '#dbeafe' },
  STUDENT: { label: 'Student', color: 'var(--success)', bg: '#dcfce7' },
  INSTITUTION_CHIEF: { label: 'Institution Chief', color: 'var(--primary)', bg: 'var(--primary-light)' },
  USER: { label: 'Individual', color: 'var(--mid)', bg: 'var(--light)' },
};
const PAGE_SIZE_OPTIONS = [10, 25, 50];

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
function IconX() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
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

function RoleBadge({ role }) {
  const meta = ROLE_META[role] || ROLE_META.USER;
  return <span style={{ ...styles.badge, color: meta.color, background: meta.bg }}>{meta.label}</span>;
}

function StatusBadge({ disabled }) {
  return (
    <span style={styles.statusWrap}>
      <span style={{ ...styles.statusDot, background: disabled ? 'var(--danger)' : 'var(--success)' }} />
      {disabled ? 'Disabled' : 'Active'}
    </span>
  );
}

function Avatar({ user, size = 34 }) {
  const initial = (user.name || user.email || 'U')[0].toUpperCase();
  const dim = { width: size, height: size, borderRadius: '50%', flexShrink: 0 };
  if (user.avatarPath) return <img src={user.avatarPath} alt="" style={{ ...dim, objectFit: 'cover' }} />;
  return (
    <div style={{ ...dim, background: 'var(--primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4, fontWeight: 700 }}>
      {initial}
    </div>
  );
}

export default function ManageUsersPanel() {
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [instFilter, setInstFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('joined-desc');
  const [selected, setSelected] = useState(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [drawerUser, setDrawerUser] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [confirmInput, setConfirmInput] = useState('');
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    getAdminUsers().then(setUsers).finally(() => setLoading(false));
  }, []);

  useEffect(() => { setPage(1); }, [search, roleFilter, instFilter, statusFilter, pageSize]);

  const institutions = useMemo(() => {
    const set = new Set(users.filter((u) => u.institution?.name).map((u) => u.institution.name));
    return [...set].sort();
  }, [users]);

  const filtered = useMemo(() => users.filter((u) => {
    if (roleFilter && u.role !== roleFilter) return false;
    if (instFilter && u.institution?.name !== instFilter) return false;
    if (statusFilter === 'active' && u.disabled) return false;
    if (statusFilter === 'disabled' && !u.disabled) return false;
    if (search) {
      const hay = `${u.name || ''} ${u.email} ${u.institution?.name || ''}`.toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  }), [users, roleFilter, instFilter, statusFilter, search]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      if (sortBy === 'name-asc') return (a.name || a.email).localeCompare(b.name || b.email);
      if (sortBy === 'name-desc') return (b.name || b.email).localeCompare(a.name || a.email);
      if (sortBy === 'joined-asc') return new Date(a.createdAt) - new Date(b.createdAt);
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
    return arr;
  }, [filtered, sortBy]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const clampedPage = Math.min(page, totalPages);
  const pageItems = sorted.slice((clampedPage - 1) * pageSize, clampedPage * pageSize);

  const stats = useMemo(() => ({
    total: users.length,
    admins: users.filter((u) => u.role === 'ADMIN').length,
    teachers: users.filter((u) => u.role === 'TEACHER').length,
    students: users.filter((u) => u.role === 'STUDENT').length,
  }), [users]);

  const hasFilters = !!(search || roleFilter || instFilter || statusFilter);
  const clearFilters = () => { setSearch(''); setRoleFilter(''); setInstFilter(''); setStatusFilter(''); };

  const toggleSelect = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const pageIds = pageItems.map((u) => u.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const toggleSelectAllOnPage = () => setSelected((prev) => {
    const next = new Set(prev);
    if (allPageSelected) pageIds.forEach((id) => next.delete(id));
    else pageIds.forEach((id) => next.add(id));
    return next;
  });

  const handleToggleDisabled = async (user) => {
    setBusyId(user.id);
    setOpenMenuId(null);
    try {
      const updated = await disableUser(user.id, !user.disabled);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? { ...u, disabled: updated.disabled } : u)));
      toast.success(`${user.name || user.email} ${updated.disabled ? 'disabled' : 're-enabled'}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not update status');
    } finally {
      setBusyId(null);
    }
  };

  const handleBulkDisable = async (disabled) => {
    const ids = [...selected];
    for (const id of ids) {
      try { await disableUser(id, disabled); } catch (_) { /* continue with the rest */ }
    }
    setUsers((prev) => prev.map((u) => (ids.includes(u.id) ? { ...u, disabled } : u)));
    toast.success(`Updated ${ids.length} user(s)`);
    setSelected(new Set());
  };

  const handleExportSelected = () => {
    const rows = users.filter((u) => selected.has(u.id));
    const header = ['Name', 'Email', 'Role', 'Institution', 'Status', 'Joined'];
    const lines = rows.map((u) => [
      u.name || '', u.email, ROLE_META[u.role]?.label || u.role, u.institution?.name || '',
      u.disabled ? 'Disabled' : 'Active', new Date(u.createdAt).toLocaleDateString(),
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'users-export.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const openDeleteConfirm = (targetUsers) => {
    setConfirmTarget(targetUsers);
    setConfirmInput('');
    setOpenMenuId(null);
  };

  const isBulkDelete = confirmTarget && confirmTarget.length > 1;
  const confirmPhrase = confirmTarget ? (isBulkDelete ? 'DELETE' : confirmTarget[0].email) : '';
  const confirmValid = confirmInput.trim() === confirmPhrase;
  const aggregateCounts = useMemo(() => {
    if (!confirmTarget) return null;
    return confirmTarget.reduce((acc, u) => ({
      comics: acc.comics + (u._count?.comics || 0),
      submissions: acc.submissions + (u._count?.submissions || 0),
      tasksCreated: acc.tasksCreated + (u._count?.tasksCreated || 0),
      classesCreated: acc.classesCreated + (u._count?.classesCreated || 0),
      enrollments: acc.enrollments + (u._count?.enrollments || 0),
    }), { comics: 0, submissions: 0, tasksCreated: 0, classesCreated: 0, enrollments: 0 });
  }, [confirmTarget]);

  const handleConfirmDelete = async () => {
    const ids = confirmTarget.map((u) => u.id);
    for (const id of ids) {
      try { await deleteUser(id); } catch (err) { toast.error(err.response?.data?.error || 'Could not delete user'); }
    }
    setUsers((prev) => prev.filter((u) => !ids.includes(u.id)));
    setSelected((prev) => { const next = new Set(prev); ids.forEach((id) => next.delete(id)); return next; });
    toast.success(`Deleted ${ids.length} user(s)`);
    setConfirmTarget(null);
    setDrawerUser(null);
  };

  return (
    <div>
      {/* Header */}
      <div style={styles.headerRow}>
        <div>
          <h2 style={styles.pageTitle}>Manage Users</h2>
          <p className="text-muted text-sm">Manage institution users, assign roles, and control permissions.</p>
        </div>
        <button className="btn btn-primary" disabled title="Coming soon">+ Invite User</button>
      </div>

      {/* Stats */}
      <div className="dash-stats-grid" style={{ marginBottom: 20 }}>
        <div className="card" style={styles.statCard}>
          <div style={styles.statLabel}>Total Users</div>
          <div style={styles.statValue}>{stats.total}</div>
        </div>
        <div className="card" style={styles.statCard}>
          <div style={styles.statLabel}>Administrators</div>
          <div style={styles.statValue}>{stats.admins}</div>
        </div>
        <div className="card" style={styles.statCard}>
          <div style={styles.statLabel}>Teachers</div>
          <div style={styles.statValue}>{stats.teachers}</div>
        </div>
        <div className="card" style={styles.statCard}>
          <div style={styles.statLabel}>Students</div>
          <div style={styles.statValue}>{stats.students}</div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={styles.toolbar}>
        <div style={styles.searchWrap}>
          <IconSearch />
          <input
            style={styles.searchInput}
            placeholder="Search name, email, institution…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select style={styles.filterSelect} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="">All Roles</option>
          {Object.entries(ROLE_META).map(([id, meta]) => <option key={id} value={id}>{meta.label}</option>)}
        </select>
        <select style={styles.filterSelect} value={instFilter} onChange={(e) => setInstFilter(e.target.value)}>
          <option value="">All Institutions</option>
          {institutions.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <select style={styles.filterSelect} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="disabled">Disabled</option>
        </select>
        <select style={styles.filterSelect} value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="joined-desc">Newest first</option>
          <option value="joined-asc">Oldest first</option>
          <option value="name-asc">Name A–Z</option>
          <option value="name-desc">Name Z–A</option>
        </select>
        <button className="btn btn-outline btn-sm" disabled title="Coming soon">+ Add User</button>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div style={styles.bulkBar}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>{selected.size} selected</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline btn-sm" onClick={handleExportSelected}>Export</button>
            <button className="btn btn-outline btn-sm" onClick={() => handleBulkDisable(true)}>Disable</button>
            <button className="btn btn-outline btn-sm" onClick={() => handleBulkDisable(false)}>Enable</button>
            <button className="btn btn-outline btn-sm" disabled title="Coming soon">Change Role</button>
            <button className="btn btn-danger btn-sm" onClick={() => openDeleteConfirm(users.filter((u) => selected.has(u.id)))}>Delete</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>Clear</button>
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="card" style={{ padding: 20 }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 44, marginBottom: 10 }} />
          ))}
        </div>
      )}

      {/* Empty states */}
      {!loading && users.length === 0 && (
        <div className="card" style={styles.emptyState}>
          <div style={{ fontSize: 32 }}>🗒️</div>
          <h3>No users found.</h3>
        </div>
      )}
      {!loading && users.length > 0 && sorted.length === 0 && (
        <div className="card" style={styles.emptyState}>
          <div style={{ fontSize: 32 }}>🔍</div>
          <h3>No users match your filters.</h3>
          <button className="btn btn-outline btn-sm" style={{ marginTop: 10 }} onClick={clearFilters}>Clear filters</button>
        </div>
      )}

      {/* Table (desktop) */}
      {!loading && pageItems.length > 0 && (
        <div className="users-table-wrap card" style={{ padding: 0, maxHeight: 520, overflowY: 'auto' }}>
          <table style={styles.table}>
            <thead>
              <tr style={styles.thead}>
                <th style={styles.thCheck}><input type="checkbox" checked={allPageSelected} onChange={toggleSelectAllOnPage} /></th>
                <th style={styles.th}>User</th>
                <th style={styles.th}>Role</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Institution</th>
                <th style={styles.th}>Joined</th>
                <th style={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((u) => (
                <tr key={u.id} style={styles.tr} onClick={() => setDrawerUser(u)}>
                  <td style={styles.tdCheck} onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggleSelect(u.id)} />
                  </td>
                  <td style={styles.td}>
                    <div style={styles.userCell}>
                      <Avatar user={u} />
                      <div>
                        <div style={{ fontWeight: 600 }}>{u.name || '—'}</div>
                        <div className="text-sm text-muted">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td style={styles.td}><RoleBadge role={u.role} /></td>
                  <td style={styles.td}><StatusBadge disabled={u.disabled} /></td>
                  <td style={styles.td}>{u.institution?.name || '—'}</td>
                  <td style={styles.td}>{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td style={styles.td} onClick={(e) => e.stopPropagation()}>
                    <div style={styles.menuWrap}>
                      {openMenuId === u.id && <div style={styles.menuOverlay} onClick={() => setOpenMenuId(null)} />}
                      <button style={styles.menuTrigger} onClick={() => setOpenMenuId((id) => (id === u.id ? null : u.id))} aria-label="Row actions">
                        <IconMoreVertical />
                      </button>
                      {openMenuId === u.id && (
                        <div style={styles.menuDropdown}>
                          <button style={styles.menuItem} onClick={() => { setDrawerUser(u); setOpenMenuId(null); }}>View Profile</button>
                          <button style={styles.menuItemDisabled} disabled title="Coming soon">Change Role</button>
                          <button style={styles.menuItemDisabled} disabled title="Coming soon">Reset Password</button>
                          <button style={styles.menuItem} onClick={() => handleToggleDisabled(u)} disabled={busyId === u.id}>
                            {u.disabled ? 'Enable User' : 'Suspend User'}
                          </button>
                          <button style={{ ...styles.menuItem, color: 'var(--danger)' }} onClick={() => openDeleteConfirm([u])}>Delete User</button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Cards (mobile) */}
      {!loading && pageItems.length > 0 && (
        <div className="users-card-list">
          {pageItems.map((u) => (
            <div key={u.id} className="card" style={styles.mobileCard} onClick={() => setDrawerUser(u)}>
              <div style={styles.userCell}>
                <Avatar user={u} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{u.name || '—'}</div>
                  <div className="text-sm text-muted">{u.email}</div>
                </div>
                <input type="checkbox" checked={selected.has(u.id)} onChange={(e) => { e.stopPropagation(); toggleSelect(u.id); }} onClick={(e) => e.stopPropagation()} />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <RoleBadge role={u.role} />
                <StatusBadge disabled={u.disabled} />
              </div>
              <div className="text-sm text-muted" style={{ marginTop: 8 }}>{u.institution?.name || '—'} · {new Date(u.createdAt).toLocaleDateString()}</div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && sorted.length > 0 && (
        <div style={styles.paginationRow}>
          <span className="text-sm text-muted">
            Showing {(clampedPage - 1) * pageSize + 1}–{Math.min(clampedPage * pageSize, sorted.length)} of {sorted.length} users
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
      {drawerUser && (
        <>
          <div style={styles.drawerOverlay} onClick={() => setDrawerUser(null)} />
          <div style={styles.drawer}>
            <button style={styles.drawerClose} onClick={() => setDrawerUser(null)} aria-label="Close"><IconX /></button>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <Avatar user={drawerUser} size={72} />
              <h3 style={{ marginTop: 12 }}>{drawerUser.name || '—'}</h3>
              <p className="text-sm text-muted">{drawerUser.email}</p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 8 }}>
                <RoleBadge role={drawerUser.role} />
                <StatusBadge disabled={drawerUser.disabled} />
              </div>
            </div>
            <div style={styles.drawerSection}>
              <div style={styles.drawerLabel}>Institution</div>
              <div>{drawerUser.institution?.name || '—'}</div>
            </div>
            <div style={styles.drawerSection}>
              <div style={styles.drawerLabel}>Joined</div>
              <div>{new Date(drawerUser.createdAt).toLocaleDateString()}</div>
            </div>
            {['Recent Activity', 'Last Login', 'Permissions', 'Audit Log'].map((label) => (
              <div key={label} style={styles.drawerSection}>
                <div style={styles.drawerLabel}>{label}</div>
                <p className="text-sm text-muted">No data available yet.</p>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button className="btn btn-outline btn-sm w-full" onClick={() => handleToggleDisabled(drawerUser)} disabled={busyId === drawerUser.id}>
                {drawerUser.disabled ? 'Enable User' : 'Suspend User'}
              </button>
              <button className="btn btn-danger btn-sm w-full" onClick={() => openDeleteConfirm([drawerUser])}>Delete</button>
            </div>
          </div>
        </>
      )}

      {/* Delete confirmation modal */}
      <Modal open={!!confirmTarget} onClose={() => setConfirmTarget(null)}>
        {confirmTarget && (
          <>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ color: 'var(--danger)' }}><IconAlertTriangle /></span>
              <div>
                <h3 style={{ marginBottom: 4 }}>
                  Delete {isBulkDelete ? `${confirmTarget.length} users` : confirmTarget[0].name || confirmTarget[0].email}?
                </h3>
                <p className="text-sm text-muted">This action is permanent and cannot be undone.</p>
              </div>
            </div>

            <div style={styles.confirmCounts}>
              <p style={{ fontWeight: 600, marginBottom: 6, fontSize: 13 }}>This will permanently delete:</p>
              <ul style={{ paddingLeft: 18, fontSize: 13, color: 'var(--mid)', lineHeight: 1.7 }}>
                <li>{aggregateCounts.comics} comic(s)</li>
                <li>{aggregateCounts.submissions} submission(s)</li>
                {aggregateCounts.classesCreated > 0 && (
                  <li style={{ color: 'var(--danger)', fontWeight: 600 }}>
                    {aggregateCounts.classesCreated} class(es) they created — including other students' enrollments and submissions tied to those classes
                  </li>
                )}
                {aggregateCounts.tasksCreated > 0 && (
                  <li style={{ color: 'var(--danger)', fontWeight: 600 }}>
                    {aggregateCounts.tasksCreated} task(s) they created — including other students' submissions to those tasks
                  </li>
                )}
                <li>{aggregateCounts.enrollments} class enrollment(s)</li>
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
  tr: { borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 120ms ease' },
  td: { padding: '12px 14px' },
  tdCheck: { padding: '12px 14px', width: 36 },
  userCell: { display: 'flex', alignItems: 'center', gap: 10 },
  badge: { display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700 },
  statusWrap: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 },
  statusDot: { width: 7, height: 7, borderRadius: '50%' },
  menuWrap: { position: 'relative' },
  menuOverlay: { position: 'fixed', inset: 0, zIndex: 49 },
  menuTrigger: { width: 30, height: 30, borderRadius: 'var(--radius-sm)', color: 'var(--mid)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 50 },
  menuDropdown: {
    position: 'absolute', right: 0, top: 34, background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-lg)', padding: 6, width: 180, zIndex: 50,
    display: 'flex', flexDirection: 'column', gap: 2,
  },
  menuItem: { width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'transparent', color: 'var(--dark)', fontSize: 13, fontWeight: 600 },
  menuItemDisabled: { width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'transparent', color: 'var(--border)', fontSize: 13, fontWeight: 600, cursor: 'not-allowed' },
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
