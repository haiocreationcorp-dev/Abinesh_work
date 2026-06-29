import { useEffect, useState, useCallback, useRef } from 'react';
import { getAssets, deleteAsset, deleteAssets, renameAsset } from '../../api/assets.js';
import AssetCard from './AssetCard.jsx';
import Modal from '../ui/Modal.jsx';

// Bulk-deleting more than this many at once requires the safety password below —
// mirrors BULK_DELETE_PASSWORD_THRESHOLD in server/src/controllers/assetController.js.
const BULK_DELETE_PASSWORD_THRESHOLD = 9;

export default function AssetGrid({ category, tags, search = '', partType, gender, view, poseType, eyeType, mouthType, onSelect, adminMode = false }) {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [confirmPasswordOpen, setConfirmPasswordOpen] = useState(false);
  const [bulkPassword, setBulkPassword] = useState('');
  const [bulkPasswordError, setBulkPasswordError] = useState('');
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
    })
      .then((data) => { setAssets(data); })
      .catch((err) => {
        setError(err?.response?.data?.error || err?.message || 'Failed to load assets');
        setAssets([]);
      })
      .finally(() => setLoading(false));
  }, [category, tags, search, partType, gender, view, poseType, eyeType, mouthType]);

  useEffect(() => { load(); }, [load]);

  // Keep the "select all" checkbox indeterminate state in sync
  useEffect(() => {
    if (!selectAllRef.current) return;
    selectAllRef.current.indeterminate = selected.size > 0 && selected.size < assets.length;
  }, [selected.size, assets.length]);

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
    setSelected(e.target.checked ? new Set(assets.map((a) => a.id)) : new Set());
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

  if (loading && assets.length === 0) return <div style={styles.loading}>Loading…</div>;
  if (error) return (
    <div style={styles.error}>
      <span>⚠ {error}</span>
      <button style={styles.retryBtn} onClick={load}>Retry</button>
    </div>
  );
  if (assets.length === 0) return <div style={styles.empty}>No {category.toLowerCase()}s found</div>;

  const allChecked = assets.length > 0 && selected.size === assets.length;

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
              style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#F97316' }}
            />
            <span style={styles.selectAllText}>
              {selected.size === 0
                ? `Select all (${assets.length})`
                : `${selected.size} of ${assets.length} selected`}
            </span>
          </label>

          {selected.size > 0 && (
            <button
              style={{ ...styles.deleteSelectedBtn, ...(bulkDeleting ? styles.deleteSelectedBtnDisabled : {}) }}
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
            >
              {bulkDeleting ? 'Deleting…' : `Delete ${selected.size} selected`}
            </button>
          )}
        </div>
      )}

      <div style={styles.grid}>
        {assets.map((asset) => (
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
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '8px 2px', marginBottom: 10,
    borderBottom: '1px solid var(--border)',
  },
  selectAllLabel: {
    display: 'flex', alignItems: 'center', gap: 7,
    cursor: 'pointer', userSelect: 'none', flex: 1,
  },
  selectAllText: { fontSize: 13, color: 'var(--text)', fontWeight: 500 },
  deleteSelectedBtn: {
    background: '#ef4444', color: '#fff', border: 'none',
    borderRadius: 7, padding: '6px 16px', fontSize: 13,
    fontWeight: 600, cursor: 'pointer',
    transition: 'opacity 0.12s',
  },
  deleteSelectedBtnDisabled: { opacity: 0.6, cursor: 'not-allowed' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 },
  loading: { color: '#64748b', fontSize: 12, padding: 8 },
  empty: { color: '#64748b', fontSize: 12, padding: 8, textAlign: 'center' },
  error: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 12, color: '#ef4444', fontSize: 12, textAlign: 'center' },
  retryBtn: { background: '#6B35E8', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 14px', fontSize: 12, cursor: 'pointer' },
};
