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
  const [editingAcademic, setEditingAcademic] = useState(false);
  const [academicDraft, setAcademicDraft] = useState({
    gradeLevel: user?.gradeLevel || '',
    section: user?.section || '',
    rollNo: user?.rollNo || '',
    department: user?.department || '',
    year: user?.year || '',
    gender: user?.gender || '',
  });
  const [savingAcademic, setSavingAcademic] = useState(false);

  if (!user) return null;
  const isStudent = user.role === 'STUDENT';
  const isSchool = user.institutionType === 'SCHOOL';

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

  const handleSaveAcademic = async () => {
    setSavingAcademic(true); setError('');
    try {
      const updated = await updateProfile(academicDraft);
      updateUser(updated);
      setEditingAcademic(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not update');
    } finally {
      setSavingAcademic(false);
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

          {isStudent && (
            <>
              <div style={styles.divider} />
              <div style={{ textAlign: 'left' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--mid)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Academic Info</span>
                  <button style={{ ...styles.iconBtn, fontSize: 11 }} onClick={() => { setEditingAcademic(e => !e); setAcademicDraft({ gradeLevel: user.gradeLevel||'', section: user.section||'', rollNo: user.rollNo||'', department: user.department||'', year: user.year||'', gender: user.gender||'' }); }}>
                    {editingAcademic ? <IconX /> : <IconPencil />}
                  </button>
                </div>
                {!editingAcademic ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {user.rollNo && <div style={styles.infoRow}><span>Roll No</span><strong>{user.rollNo}</strong></div>}
                    {user.gradeLevel && <div style={styles.infoRow}><span>Grade</span><strong>{user.gradeLevel}</strong></div>}
                    {user.section && <div style={styles.infoRow}><span>Section</span><strong>{user.section}</strong></div>}
                    {user.department && <div style={styles.infoRow}><span>Dept</span><strong>{user.department}</strong></div>}
                    {user.year && <div style={styles.infoRow}><span>Year</span><strong>{user.year}</strong></div>}
                    {user.gender && <div style={styles.infoRow}><span>Gender</span><strong>{{ MALE: isSchool ? 'Boy' : 'Male', FEMALE: isSchool ? 'Girl' : 'Female', OTHER: 'Other' }[user.gender]}</strong></div>}
                    {!user.rollNo && !user.gradeLevel && !user.section && !user.department && !user.year && !user.gender && (
                      <p style={{ fontSize: 12, color: 'var(--mid)', margin: 0 }}>No academic info set — click ✏️ to add</p>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <input style={styles.nameInput} placeholder="Roll / Register No" value={academicDraft.rollNo} onChange={e => setAcademicDraft(d => ({ ...d, rollNo: e.target.value }))} />
                    {isSchool ? (
                      <>
                        <input style={styles.nameInput} placeholder="Grade / Class (e.g. 10th)" value={academicDraft.gradeLevel} onChange={e => setAcademicDraft(d => ({ ...d, gradeLevel: e.target.value }))} />
                        <input style={styles.nameInput} placeholder="Section (e.g. A)" value={academicDraft.section} onChange={e => setAcademicDraft(d => ({ ...d, section: e.target.value }))} />
                      </>
                    ) : (
                      <>
                        <input style={styles.nameInput} placeholder="Department (e.g. Computer Science)" value={academicDraft.department} onChange={e => setAcademicDraft(d => ({ ...d, department: e.target.value }))} />
                        <input style={styles.nameInput} placeholder="Year (e.g. 2nd Year)" value={academicDraft.year} onChange={e => setAcademicDraft(d => ({ ...d, year: e.target.value }))} />
                      </>
                    )}
                    <select style={{ ...styles.nameInput, color: 'var(--dark)' }} value={academicDraft.gender} onChange={e => setAcademicDraft(d => ({ ...d, gender: e.target.value }))}>
                      <option value="">Gender (optional)</option>
                      <option value="MALE">{isSchool ? 'Boy' : 'Male'}</option>
                      <option value="FEMALE">{isSchool ? 'Girl' : 'Female'}</option>
                      <option value="OTHER">Other</option>
                    </select>
                    <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                      <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={handleSaveAcademic} disabled={savingAcademic}>{savingAcademic ? 'Saving…' : 'Save'}</button>
                      <button className="btn btn-outline btn-sm" onClick={() => setEditingAcademic(false)}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          <div style={styles.divider} />

          <button className="btn btn-danger btn-sm w-full" style={{ justifyContent: 'center' }} onClick={logout}>
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
    width: 42,
    height: 42,
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.15)',
    border: '1px solid rgba(255,255,255,0.25)',
    color: '#fff',
    fontSize: 15,
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    cursor: 'pointer',
    transition: 'background 200ms ease',
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
  iconBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'var(--surface)', background: 'var(--dark)',
    width: 24, height: 24, borderRadius: '50%', padding: 0, flexShrink: 0,
  },
  editRow: { display: 'flex', alignItems: 'center', gap: 4, marginTop: 14 },
  nameInput: { flex: 1, fontSize: 13, width: '100%', boxSizing: 'border-box' },
  infoRow: { display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--mid)', padding: '2px 0' },
  divider: { height: 1, background: 'var(--border)', margin: '16px 0 12px' },
};
