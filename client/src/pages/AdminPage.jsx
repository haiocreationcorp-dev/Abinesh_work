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
import { getAdminUsers, updateUserRole } from '../api/assets.js';
import { CATEGORY_IDS } from '../constants/categories.js';

const TABS = ['Upload Asset', 'Folder Upload', 'F_B Edit', 'Expressions', 'Character Presets', 'Palette Normalizer', 'Eye Normalizer', 'Lighting Adjuster', 'Browse Assets', 'Manage Users'];

export default function AdminPage() {
  const [tab, setTab] = useState(0);
  const [users, setUsers] = useState([]);
  const [category, setCategory] = useState('FACE_PART');
  const [fbMode, setFbMode] = useState('face');

  useEffect(() => {
    if (tab === 9) getAdminUsers().then(setUsers);
  }, [tab]);

  const handleRoleToggle = async (user) => {
    const newRole = user.role === 'ADMIN' ? 'USER' : 'ADMIN';
    const updated = await updateUserRole(user.id, newRole);
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
  };

  return (
    <div className="page">
      <div className="container section">
        <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 24 }}>Admin Panel</h2>

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
                  <button key={c} className={`btn btn-sm ${category === c ? 'btn-primary' : 'btn-outline'}`} onClick={() => setCategory(c)}>
                    {c}
                  </button>
                ))}
              </div>
              <AssetGrid category={category} adminMode />
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
  categoryRow: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  thead: { background: 'var(--primary-light)' },
  tr: { borderBottom: '1px solid var(--border)' },
  th: { padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 13 },
  td: { padding: '10px 14px' },
};
