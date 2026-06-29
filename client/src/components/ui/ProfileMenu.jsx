import { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { updateProfile, uploadAvatar } from '../../api/auth.js';

function IconCamera() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function IconPencil() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconX() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export default function ProfileMenu() {
  const { user, logout, updateUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(user?.name || '');
  const [savingName, setSavingName] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [error, setError] = useState('');
  const [avatarFailed, setAvatarFailed] = useState(false);

  if (!user) return null;

  const initial = (user.name || user.email || 'A')[0].toUpperCase();
  const showAvatarImg = user.avatarPath && !avatarFailed;

  const toggleOpen = () => {
    setOpen((o) => {
      if (!o) { setEditingName(false); setNameDraft(user.name || ''); setError(''); }
      return !o;
    });
  };

  const handleSaveName = async () => {
    setSavingName(true);
    setError('');
    try {
      const updated = await updateProfile({ name: nameDraft });
      updateUser(updated);
      setEditingName(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not update name');
    } finally {
      setSavingName(false);
    }
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingAvatar(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const updated = await uploadAvatar(formData);
      updateUser(updated);
      setAvatarFailed(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not upload photo');
    } finally {
      setUploadingAvatar(false);
    }
  };

  return (
    <div style={styles.wrap}>
      {open && <div style={styles.overlay} onClick={() => setOpen(false)} />}

      <button style={styles.trigger} onClick={toggleOpen} title={user.email}>
        {showAvatarImg ? <img src={user.avatarPath} alt="" style={styles.triggerImg} onError={() => setAvatarFailed(true)} /> : initial}
      </button>

      {open && (
        <div style={styles.menu}>
          <div style={styles.email}>{user.email}</div>

          <div style={styles.avatarWrap}>
            {showAvatarImg ? (
              <img src={user.avatarPath} alt="" style={styles.avatarLg} onError={() => setAvatarFailed(true)} />
            ) : (
              <div style={styles.avatarLgFallback}>{initial}</div>
            )}
            <label style={styles.cameraBadge} title="Change photo">
              <IconCamera />
              <input type="file" accept="image/*" onChange={handleAvatarChange} disabled={uploadingAvatar} style={{ display: 'none' }} />
            </label>
          </div>
          {uploadingAvatar && <p style={styles.hint}>Uploading…</p>}

          {!editingName ? (
            <div style={styles.greetingRow}>
              <span style={styles.greeting}>Hi, {user.name || 'there'}!</span>
              <button style={styles.iconBtn} onClick={() => setEditingName(true)} title="Edit name">
                <IconPencil />
              </button>
            </div>
          ) : (
            <div style={styles.editRow}>
              <input
                type="text"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                placeholder="Your name"
                style={styles.nameInput}
                autoFocus
              />
              <button style={{ ...styles.iconBtn, color: 'var(--success)' }} onClick={handleSaveName} disabled={savingName} title="Save">
                <IconCheck />
              </button>
              <button style={styles.iconBtn} onClick={() => setEditingName(false)} title="Cancel">
                <IconX />
              </button>
            </div>
          )}
          {error && <p className="form-error" style={{ margin: '6px 0 0', textAlign: 'center' }}>{error}</p>}

          <div style={styles.divider} />

          <button className="btn btn-outline btn-sm w-full" onClick={logout}>
            Logout
          </button>
        </div>
      )}
    </div>
  );
}

const styles = {
  wrap: { position: 'relative' },
  overlay: { position: 'fixed', inset: 0, zIndex: 99 },
  trigger: {
    width: 38,
    height: 38,
    borderRadius: '50%',
    background: 'var(--primary)',
    color: '#fff',
    fontSize: 15,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    zIndex: 100,
  },
  triggerImg: { width: '100%', height: '100%', objectFit: 'cover' },
  menu: {
    position: 'absolute',
    right: 0,
    top: 48,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    boxShadow: 'var(--shadow-lg)',
    padding: '20px 18px',
    width: 250,
    zIndex: 100,
    textAlign: 'center',
  },
  email: { fontSize: 13, color: 'var(--mid)', marginBottom: 14, wordBreak: 'break-all' },
  avatarWrap: { position: 'relative', width: 72, height: 72, margin: '0 auto' },
  avatarLg: { width: 72, height: 72, borderRadius: '50%', objectFit: 'cover' },
  avatarLgFallback: {
    width: 72, height: 72, borderRadius: '50%', background: 'var(--primary)', color: '#fff',
    fontSize: 28, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 26,
    height: 26,
    borderRadius: '50%',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    color: 'var(--primary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
  },
  hint: { fontSize: 11, color: 'var(--mid)', marginTop: 6 },
  greetingRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14 },
  greeting: { fontSize: 16, fontWeight: 700, color: 'var(--dark)' },
  iconBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mid)', padding: 4 },
  editRow: { display: 'flex', alignItems: 'center', gap: 4, marginTop: 14 },
  nameInput: { flex: 1, fontSize: 13 },
  divider: { height: 1, background: 'var(--border)', margin: '16px 0 12px' },
};
