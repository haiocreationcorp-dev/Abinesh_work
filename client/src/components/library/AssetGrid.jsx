import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { LayoutGrid, List, ImageOff, UploadCloud } from 'lucide-react';
import { getAssets, deleteAsset, deleteAssets, renameAsset } from '../../api/assets.js';
import AssetCard from './AssetCard.jsx';
import Modal from '../ui/Modal.jsx';

// Bulk-deleting more than this many at once requires the safety password below —
// mirrors BULK_DELETE_PASSWORD_THRESHOLD in server/src/controllers/assetController.js.
const BULK_DELETE_PASSWORD_THRESHOLD = 9;
const PAGE_SIZE = 60;

function isToday(iso) {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function SkeletonCard() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="skeleton" style={{ aspectRatio: '1', borderRadius: 16 }} />
      <div className="skeleton" style={{ height: 11, width: '70%', borderRadius: 4 }} />
      <div className="skeleton" style={{ height: 9, width: '40%', borderRadius: 4 }} />
    </div>
  );
}

export default function AssetGrid({
  category, tags, search = '', partType, gender, view, poseType, eyeType, mouthType, costume,
  onSelect, adminMode = false, onUploadClick,
}) {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [confirmPasswordOpen, setConfirmPasswordOpen] = useState(false);
  const [bulkPassword, setBulkPassword] = useState('');
  const [bulkPasswordError, setBulkPasswordError] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [viewMode, setViewMode] = useState('grid');
  const [page, setPage] = useState(1);
  const selectAllRef = useRef(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    setSelected(new Set());
    getAssets({
      category,
      tags: tags || undefined,
      search: search || undefined,
      partType: partType || undefined,
      gender: gender || undefined,
      view: view || undefined,
      poseType: poseType || undefined,
      eyeType: eyeType || undefined,
      mouthType: mouthType || undefined,
      costume: costume || undefined,
    })
      .then((data) => { setAssets(data); })
      .catch((err) => {
        setError(err?.response?.data?.error || err?.message || 'Failed to load assets');
        setAssets([]);
      })
      .finally(() => setLoading(false));
  }, [category, tags, search, partType, gender, view, poseType, eyeType, mouthType, costume]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [category, tags, search, partType, gender, view, poseType, eyeType, mouthType, costume, sortBy]);

  // Keep the "select all" checkbox indeterminate state in sync
  useEffect(() => {
    if (!selectAllRef.current) return;
    selectAllRef.current.indeterminate = selected.size > 0 && selected.size < assets.length;
  }, [selected.size, assets.length]);

  const sortedAssets = useMemo(() => {
    const arr = [...assets];
    if (sortBy === 'newest') arr.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    else if (sortBy === 'oldest') arr.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    else if (sortBy === 'name') arr.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    return arr;
  }, [assets, sortBy]);

  const totalPages = Math.max(1, Math.ceil(sortedAssets.length / PAGE_SIZE));
  const pagedAssets = adminMode ? sortedAssets.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) : sortedAssets;

  const uploadedToday = useMemo(() => assets.filter((a) => isToday(a.createdAt)).length, [assets]);

  const handleDelete = async (id) => {
    if (!confirm('Delete this asset?')) return;
    await deleteAsset(id);
    setAssets((prev) => prev.filter((a) => a.id !== id));
    setSelected((prev) => { const next = new Set(prev); next.delete(id); return next; });
  };

  const handleRename = async (id, name) => {
    const updated = await renameAsset(id, name);
    setAssets((prev) => prev.map((a) => (a.id === id ? updated : a)));
  };

  const handleToggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSelectAll = (e) => {
    setSelected(e.target.checked ? new Set(sortedAssets.map((a) => a.id)) : new Set());
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    if (selected.size > BULK_DELETE_PASSWORD_THRESHOLD) {
      setBulkPassword('');
      setBulkPasswordError('');
      setConfirmPasswordOpen(true);
      return;
    }
    if (!confirm(`Delete ${selected.size} selected asset${selected.size !== 1 ? 's' : ''}? This cannot be undone.`)) return;
    setBulkDeleting(true);
    try {
      await deleteAssets(Array.from(selected));
      setAssets((prev) => prev.filter((a) => !selected.has(a.id)));
      setSelected(new Set());
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleConfirmBulkDeleteWithPassword = async (e) => {
    e.preventDefault();
    setBulkPasswordError('');
    setBulkDeleting(true);
    try {
      await deleteAssets(Array.from(selected), bulkPassword);
      setAssets((prev) => prev.filter((a) => !selected.has(a.id)));
      setSelected(new Set());
      setConfirmPasswordOpen(false);
    } catch (err) {
      setBulkPasswordError(err?.response?.data?.error || 'Incorrect password');
    } finally {
      setBulkDeleting(false);
    }
  };

  if (loading && assets.length === 0) {
    return (
      <div style={{ ...styles.grid, ...(!adminMode ? styles.gridCompact : {}) }}>
        {Array.from({ length: 12 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    );
  }
  if (error) return (
    <div style={styles.error}>
      <span>⚠ {error}</span>
      <button style={styles.retryBtn} onClick={load}>Retry</button>
    </div>
  );
  if (assets.length === 0) return (
    <div style={styles.empty}>
      <ImageOff size={40} color="var(--muted)" />
      <p style={styles.emptyTitle}>No assets found</p>
      <p style={styles.emptySub}>Try changing your filters or upload a new asset.</p>
      {adminMode && onUploadClick && (
        <button className="btn btn-primary btn-sm" onClick={onUploadClick} style={{ marginTop: 4 }}>
          <UploadCloud size={14} /> Upload Asset
        </button>
      )}
    </div>
  );

  const allChecked = sortedAssets.length > 0 && selected.size === sortedAssets.length;

  return (
    <div>
      {adminMode && (
        <div style={styles.toolbar}>
          <label style={styles.selectAllLabel}>
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={allChecked}
              onChange={handleSelectAll}
              style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--action-primary)' }}
            />
            <span style={styles.selectAllText}>
              {selected.size === 0
                ? `Showing ${sortedAssets.length} asset${sortedAssets.length !== 1 ? 's' : ''}`
                : `${selected.size} of ${sortedAssets.length} selected`}
            </span>
            {uploadedToday > 0 && <span style={styles.todayBadge}>{uploadedToday} uploaded today</span>}
          </label>

          <div style={styles.toolbarRight}>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={styles.sortSelect}>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="name">A–Z</option>
            </select>
            <div style={styles.viewToggle}>
              <button
                style={{ ...styles.viewToggleBtn, ...(viewMode === 'grid' ? styles.viewToggleBtnActive : {}) }}
                onClick={() => setViewMode('grid')}
                title="Grid view"
              ><LayoutGrid size={14} /></button>
              <button
                style={{ ...styles.viewToggleBtn, ...(viewMode === 'list' ? styles.viewToggleBtnActive : {}) }}
                onClick={() => setViewMode('list')}
                title="List view"
              ><List size={14} /></button>
            </div>
          </div>
        </div>
      )}

      <div style={{
        ...styles.grid,
        ...(!adminMode ? styles.gridCompact : {}),
        ...(adminMode && viewMode === 'list' ? styles.gridList : {}),
      }}>
        {pagedAssets.map((asset) => (
          <AssetCard
            key={asset.id}
            asset={asset}
            category={category}
            onSelect={onSelect}
            onDelete={adminMode ? handleDelete : undefined}
            onRename={adminMode ? handleRename : undefined}
            isSelected={selected.has(asset.id)}
            onToggleSelect={adminMode ? handleToggleSelect : undefined}
          />
        ))}
      </div>

      {adminMode && totalPages > 1 && (
        <div style={styles.pagination}>
          <button className="btn btn-sm btn-outline" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span style={styles.pageInfo}>Page {page} of {totalPages}</span>
          <button className="btn btn-sm btn-outline" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}

      {adminMode && selected.size > 0 && (
        <div style={styles.floatingBar}>
          <span style={styles.floatingBarText}>{selected.size} selected</span>
          <button
            style={{ ...styles.deleteSelectedBtn, ...(bulkDeleting ? styles.deleteSelectedBtnDisabled : {}) }}
            onClick={handleBulkDelete}
            disabled={bulkDeleting}
          >
            {bulkDeleting ? 'Deleting…' : 'Delete'}
          </button>
          <button className="btn btn-sm btn-ghost" onClick={() => setSelected(new Set())} style={{ color: '#fff' }}>Clear</button>
        </div>
      )}

      <Modal open={confirmPasswordOpen} onClose={() => setConfirmPasswordOpen(false)} title="Confirm bulk delete">
        <form onSubmit={handleConfirmBulkDeleteWithPassword}>
          <p className="text-sm text-muted" style={{ marginBottom: 14 }}>
            You're about to permanently delete <strong>{selected.size}</strong> assets — both the database
            records and the files on disk. This cannot be undone. Enter the safety password to confirm.
          </p>
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              autoFocus
              value={bulkPassword}
              onChange={(e) => setBulkPassword(e.target.value)}
            />
          </div>
          {bulkPasswordError && <p className="form-error">{bulkPasswordError}</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="button" className="btn btn-ghost w-full" onClick={() => setConfirmPasswordOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-danger w-full" disabled={bulkDeleting || !bulkPassword}>
              {bulkDeleting ? 'Deleting…' : `Delete ${selected.size}`}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

const styles = {
  toolbar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
    padding: '10px 2px', marginBottom: 14,
    borderBottom: '1px solid var(--border)',
  },
  selectAllLabel: {
    display: 'flex', alignItems: 'center', gap: 10,
    cursor: 'pointer', userSelect: 'none',
  },
  selectAllText: { fontSize: 13, color: 'var(--dark)', fontWeight: 600 },
  todayBadge: {
    fontSize: 11, fontWeight: 700, color: 'var(--success)',
    background: 'rgba(22,163,74,0.12)', padding: '2px 8px', borderRadius: 20,
  },
  toolbarRight: { display: 'flex', alignItems: 'center', gap: 8 },
  sortSelect: {
    height: 32, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border)',
    background: 'var(--surface)', color: 'var(--dark)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
  },
  viewToggle: {
    display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden',
  },
  viewToggleBtn: {
    width: 30, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--surface)', color: 'var(--mid)', border: 'none', cursor: 'pointer',
  },
  viewToggleBtnActive: { background: 'var(--nav-primary)', color: '#fff' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 14 },
  gridCompact: { gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 },
  gridList: { gridTemplateColumns: '1fr', gap: 8 },
  loading: { color: 'var(--mid)', fontSize: 12, padding: 8 },
  empty: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
    padding: '56px 12px', textAlign: 'center',
  },
  emptyTitle: { fontSize: 15, fontWeight: 700, color: 'var(--dark)', marginTop: 4 },
  emptySub: { fontSize: 12.5, color: 'var(--mid)' },
  error: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 12, color: 'var(--danger)', fontSize: 12, textAlign: 'center' },
  retryBtn: { background: 'var(--action-primary)', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 14px', fontSize: 12, cursor: 'pointer' },
  pagination: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 20 },
  pageInfo: { fontSize: 12.5, color: 'var(--mid)', fontWeight: 600 },
  floatingBar: {
    position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
    background: 'var(--dark)', color: '#fff', borderRadius: 999,
    padding: '10px 12px 10px 18px', display: 'flex', alignItems: 'center', gap: 12,
    boxShadow: 'var(--shadow-lg)', zIndex: 50,
  },
  floatingBarText: { fontSize: 13, fontWeight: 600 },
  deleteSelectedBtn: {
    background: 'var(--danger)', color: '#fff', border: 'none',
    borderRadius: 999, padding: '6px 16px', fontSize: 12.5,
    fontWeight: 600, cursor: 'pointer',
    transition: 'opacity 0.12s',
  },
  deleteSelectedBtnDisabled: { opacity: 0.6, cursor: 'not-allowed' },
};
