import { useState, useEffect } from 'react';
import AssetUploadForm from '../components/admin/AssetUploadForm.jsx';
import FolderUploadForm from '../components/admin/FolderUploadForm.jsx';
import LightingAdjuster from '../components/admin/LightingAdjuster.jsx';
import FaceBuilder from '../components/admin/FaceBuilder.jsx';
import PoseBuilder from '../components/admin/PoseBuilder.jsx';
import ExpressionBuilder from '../components/admin/ExpressionBuilder.jsx';
import CharacterPresetBuilder from '../components/admin/CharacterPresetBuilder.jsx';
import PaletteNormalizer from '../components/admin/PaletteNormalizer.jsx';
import EyeNormalizer from '../components/admin/EyeNormalizer.jsx';
import AssetGrid from '../components/library/AssetGrid.jsx';
import { getAdminUsers, updateUserRole, triggerBackup } from '../api/assets.js';
import { CATEGORY_IDS, FACE_PART_TYPES, GENDERS, VIEWS, POSE_TYPES, EYE_TYPES, MOUTH_TYPES } from '../constants/categories.js';

const TABS = ['Upload Asset', 'Folder Upload', 'F_B Edit', 'Expressions', 'Character Presets', 'Palette Normalizer', 'Eye Normalizer', 'Lighting Adjuster', 'Browse Assets', 'Manage Users'];

// One row of "All" + option chips for a single-select filter — used for the
// Browse Assets sub-category filters (Part Type, Gender, View, Pose Type).
function FilterChipRow({ value, onChange, options }) {
  return (
    <div style={styles.categoryRow}>
      <button className={`btn btn-sm ${value === '' ? 'btn-primary' : 'btn-outline'}`} onClick={() => onChange('')}>
        All
      </button>
      {options.map((o) => (
        <button key={o.id} className={`btn btn-sm ${value === o.id ? 'btn-primary' : 'btn-outline'}`} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function AdminPage() {
  const [tab, setTab] = useState(0);
  const [users, setUsers] = useState([]);
  const [category, setCategory] = useState('FACE_PART');
  const [partType, setPartType] = useState('');
  const [gender, setGender] = useState('');
  const [view, setView] = useState('');
  const [poseType, setPoseType] = useState('');
  const [eyeType, setEyeType] = useState('');
  const [mouthType, setMouthType] = useState('');
  const [fbMode, setFbMode] = useState('face');
  const [backupStatus, setBackupStatus] = useState('idle'); // idle | running | done | error
  const [backupMsg, setBackupMsg] = useState('');

  useEffect(() => {
    if (tab === 9) getAdminUsers().then(setUsers);
  }, [tab]);

  const handleRoleToggle = async (user) => {
    const newRole = user.role === 'ADMIN' ? 'USER' : 'ADMIN';
    const updated = await updateUserRole(user.id, newRole);
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
  };

  const handleBackup = async () => {
    setBackupStatus('running');
    setBackupMsg('');
    try {
      const result = await triggerBackup();
      if (result.ok) {
        setBackupStatus('done');
        setBackupMsg('Backup complete');
      } else {
        setBackupStatus('error');
        setBackupMsg(result.dbResult?.output || result.dataResult?.output || result.filesResult?.output || result.envResult?.output || 'Backup failed');
      }
    } catch (err) {
      setBackupStatus('error');
      setBackupMsg(err.response?.data?.error || 'Backup failed');
    }
    setTimeout(() => setBackupStatus('idle'), 4000);
  };

  return (
    <div className="page">
      <div className="container section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <h2 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>Admin Panel</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {backupMsg && <span style={{ fontSize: 12, color: backupStatus === 'error' ? '#DC2626' : '#16A34A' }}>{backupMsg}</span>}
            <button
              onClick={handleBackup}
              disabled={backupStatus === 'running'}
              title="Back up the database now (pg_dump + JSON export)"
              style={styles.backupBtn(backupStatus === 'running')}
            >
              💾 {backupStatus === 'running' ? 'Backing up…' : 'Backup Now'}
            </button>
          </div>
        </div>

        <div style={styles.tabs}>
          {TABS.map((t, i) => (
            <button key={t} className={`btn ${tab === i ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab(i)}>
              {t}
            </button>
          ))}
        </div>

        <div style={{ marginTop: 24 }}>
          {tab === 0 && <AssetUploadForm />}

          {tab === 1 && <FolderUploadForm />}

          {tab === 2 && (
            <div>
              <div style={{ ...styles.tabs, marginBottom: 16 }}>
                <button className={`btn ${fbMode === 'face' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFbMode('face')}>
                  Face
                </button>
                <button className={`btn ${fbMode === 'pose' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFbMode('pose')}>
                  Pose
                </button>
              </div>
              {fbMode === 'face' ? <FaceBuilder /> : <PoseBuilder />}
            </div>
          )}

          {tab === 3 && <ExpressionBuilder />}

          {tab === 4 && <CharacterPresetBuilder />}

          {tab === 5 && <PaletteNormalizer />}

          {tab === 6 && <EyeNormalizer />}

          {tab === 7 && <LightingAdjuster />}

          {tab === 8 && (
            <div>
              <div style={styles.categoryRow}>
                {CATEGORY_IDS.map((c) => (
                  <button
                    key={c}
                    className={`btn btn-sm ${category === c ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => { setCategory(c); setPartType(''); setGender(''); setView(''); setPoseType(''); setEyeType(''); setMouthType(''); }}
                  >
                    {c}
                  </button>
                ))}
              </div>
              {category === 'FACE_PART' && (
                <>
                  <FilterChipRow value={partType} onChange={(v) => { setPartType(v); if (v !== 'EYES') setEyeType(''); if (v !== 'MOUTH') setMouthType(''); }} options={FACE_PART_TYPES} />
                  <FilterChipRow value={gender} onChange={setGender} options={GENDERS} />
                  <FilterChipRow value={view} onChange={setView} options={VIEWS} />
                  {partType === 'EYES' && (
                    <FilterChipRow value={eyeType} onChange={setEyeType} options={EYE_TYPES} />
                  )}
                  {partType === 'MOUTH' && (
                    <FilterChipRow value={mouthType} onChange={setMouthType} options={MOUTH_TYPES} />
                  )}
                </>
              )}
              {category === 'FACE_TEMPLATE' && (
                <FilterChipRow value={view} onChange={setView} options={VIEWS} />
              )}
              {category === 'BODY_POSE' && (
                <>
                  <FilterChipRow value={poseType} onChange={setPoseType} options={POSE_TYPES} />
                  <FilterChipRow value={view} onChange={setView} options={VIEWS} />
                </>
              )}
              <AssetGrid
                category={category}
                partType={category === 'FACE_PART' ? partType : ''}
                gender={category === 'FACE_PART' ? gender : ''}
                view={['FACE_PART', 'FACE_TEMPLATE', 'BODY_POSE'].includes(category) ? view : ''}
                poseType={category === 'BODY_POSE' ? poseType : ''}
                eyeType={category === 'FACE_PART' && partType === 'EYES' ? eyeType : ''}
                mouthType={category === 'FACE_PART' && partType === 'MOUTH' ? mouthType : ''}
                adminMode
              />
            </div>
          )}

          {tab === 9 && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table style={styles.table}>
                <thead>
                  <tr style={styles.thead}>
                    <th style={styles.th}>Email</th>
                    <th style={styles.th}>Name</th>
                    <th style={styles.th}>Role</th>
                    <th style={styles.th}>Joined</th>
                    <th style={styles.th}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} style={styles.tr}>
                      <td style={styles.td}>{u.email}</td>
                      <td style={styles.td}>{u.name || '—'}</td>
                      <td style={styles.td}><span className={`badge ${u.role === 'ADMIN' ? 'badge-admin' : ''}`}>{u.role}</span></td>
                      <td style={styles.td}>{new Date(u.createdAt).toLocaleDateString()}</td>
                      <td style={styles.td}>
                        <button className="btn btn-outline btn-sm" onClick={() => handleRoleToggle(u)}>
                          Make {u.role === 'ADMIN' ? 'User' : 'Admin'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  tabs: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  backupBtn: (disabled) => ({
    background: disabled ? '#FCA5A5' : '#DC2626', color: '#fff', border: 'none',
    borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6,
  }),
  categoryRow: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  thead: { background: 'var(--primary-light)' },
  tr: { borderBottom: '1px solid var(--border)' },
  th: { padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 13 },
  td: { padding: '10px 14px' },
};
