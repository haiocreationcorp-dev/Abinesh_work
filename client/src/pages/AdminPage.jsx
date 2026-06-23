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
import {
  getAdminUsers, updateUserRole, listInstitutions, createInstitution, renewInstitution, updateInstitution, suspendInstitution,
  createInstitutionChief, updateInstitutionSystemCount,
} from '../api/assets.js';
import { CATEGORY_IDS } from '../constants/categories.js';

const TABS = ['Upload Asset', 'Folder Upload', 'F_B Edit', 'Expressions', 'Character Presets', 'Palette Normalizer', 'Eye Normalizer', 'Lighting Adjuster', 'Browse Assets', 'Manage Users', 'Institutions'];

export default function AdminPage() {
  const [tab, setTab] = useState(0);
  const [users, setUsers] = useState([]);
  const [category, setCategory] = useState('FACE_PART');
  const [fbMode, setFbMode] = useState('face');
  const [institutions, setInstitutions] = useState([]);
  const [newInstitutionName, setNewInstitutionName] = useState('');
  const [newInstitutionType, setNewInstitutionType] = useState('SCHOOL');
  const [creatingInstitution, setCreatingInstitution] = useState(false);
  const [justCreatedCode, setJustCreatedCode] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', type: 'SCHOOL', subscriptionStartedAt: '', subscriptionExpiresAt: '', systemCount: 0 });
  const [chiefFormId, setChiefFormId] = useState(null);
  const [chiefForm, setChiefForm] = useState({ name: '', email: '', password: '' });
  const [chiefError, setChiefError] = useState('');
  const [justCreatedChief, setJustCreatedChief] = useState(null);

  useEffect(() => {
    if (tab === 9) getAdminUsers().then(setUsers);
    if (tab === 10) listInstitutions().then(setInstitutions);
  }, [tab]);

  const handleRoleToggle = async (user) => {
    const newRole = user.role === 'ADMIN' ? 'USER' : 'ADMIN';
    const updated = await updateUserRole(user.id, newRole);
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
  };

  const handleCreateInstitution = async (e) => {
    e.preventDefault();
    if (!newInstitutionName.trim()) return;
    setCreatingInstitution(true);
    try {
      const created = await createInstitution(newInstitutionName.trim(), newInstitutionType);
      setInstitutions((prev) => [{ ...created, _count: { users: 0 } }, ...prev]);
      setJustCreatedCode(created.code);
      setNewInstitutionName('');
    } finally {
      setCreatingInstitution(false);
    }
  };

  const handleRenew = async (id) => {
    const updated = await renewInstitution(id);
    setInstitutions((prev) => prev.map((i) => (i.id === updated.id ? { ...i, subscriptionExpiresAt: updated.subscriptionExpiresAt } : i)));
  };

  const handleSuspendToggle = async (inst) => {
    const updated = await suspendInstitution(inst.id, !inst.suspended);
    setInstitutions((prev) => prev.map((i) => (i.id === updated.id ? { ...i, suspended: updated.suspended } : i)));
  };

  const toDateInput = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

  const startEdit = (inst) => {
    setEditingId(inst.id);
    setEditForm({
      name: inst.name,
      type: inst.type,
      subscriptionStartedAt: toDateInput(inst.subscriptionStartedAt),
      subscriptionExpiresAt: toDateInput(inst.subscriptionExpiresAt),
      systemCount: inst.systemCount ?? 0,
    });
  };

  const saveEdit = async () => {
    const { systemCount, ...rest } = editForm;
    const [updated] = await Promise.all([
      updateInstitution(editingId, rest),
      updateInstitutionSystemCount(editingId, Number(systemCount) || 0),
    ]);
    setInstitutions((prev) => prev.map((i) => (i.id === updated.id ? { ...i, ...updated, systemCount: Number(systemCount) || 0 } : i)));
    setEditingId(null);
  };

  const startChiefForm = (inst) => {
    setChiefFormId(inst.id);
    setChiefForm({ name: '', email: '', password: '' });
    setChiefError('');
  };

  const handleCreateChief = async (institutionId) => {
    setChiefError('');
    try {
      const chief = await createInstitutionChief(institutionId, chiefForm);
      setJustCreatedChief({ institutionId, email: chief.email });
      setChiefFormId(null);
    } catch (err) {
      setChiefError(err.response?.data?.error || 'Could not create chief login');
    }
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
                    <th style={styles.th}>Institution</th>
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
                      <td style={styles.td}>{u.institution?.name || '—'}</td>
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

          {tab === 10 && (
            <div>
              <form onSubmit={handleCreateInstitution} style={styles.institutionForm}>
                <input
                  type="text"
                  placeholder="Institution name (e.g. Springfield High School)"
                  value={newInstitutionName}
                  onChange={(e) => setNewInstitutionName(e.target.value)}
                  style={{ flex: 1 }}
                />
                <select value={newInstitutionType} onChange={(e) => setNewInstitutionType(e.target.value)}>
                  <option value="SCHOOL">School</option>
                  <option value="COLLEGE">College</option>
                </select>
                <button className="btn btn-primary" type="submit" disabled={creatingInstitution}>
                  {creatingInstitution ? 'Creating…' : '+ Create Institution'}
                </button>
              </form>

              {justCreatedCode && (
                <div style={styles.codeCallout}>
                  Created! Share this join code with teachers and students: <strong>{justCreatedCode}</strong>
                </div>
              )}

              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table style={styles.table}>
                  <thead>
                    <tr style={styles.thead}>
                      <th style={styles.th}>Name</th>
                      <th style={styles.th}>Type</th>
                      <th style={styles.th}>Join Code</th>
                      <th style={styles.th}>Members</th>
                      <th style={styles.th}>Systems</th>
                      <th style={styles.th}>Start Date</th>
                      <th style={styles.th}>End Date</th>
                      <th style={styles.th}>Status</th>
                      <th style={styles.th}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {institutions.map((inst) => {
                      if (editingId === inst.id) {
                        return (
                          <tr key={inst.id} style={styles.tr}>
                            <td style={styles.td} colSpan={9}>
                              <div style={styles.editRow}>
                                <input type="text" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder="Name" />
                                <select value={editForm.type} onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}>
                                  <option value="SCHOOL">School</option>
                                  <option value="COLLEGE">College</option>
                                </select>
                                <input type="number" min="0" value={editForm.systemCount} onChange={(e) => setEditForm({ ...editForm, systemCount: e.target.value })} placeholder="Systems" style={{ width: 90 }} />
                                <input type="date" value={editForm.subscriptionStartedAt} onChange={(e) => setEditForm({ ...editForm, subscriptionStartedAt: e.target.value })} />
                                <input type="date" value={editForm.subscriptionExpiresAt} onChange={(e) => setEditForm({ ...editForm, subscriptionExpiresAt: e.target.value })} />
                                <button className="btn btn-primary btn-sm" onClick={saveEdit}>Save</button>
                                <button className="btn btn-ghost btn-sm" onClick={() => setEditingId(null)}>Cancel</button>
                              </div>
                            </td>
                          </tr>
                        );
                      }
                      if (chiefFormId === inst.id) {
                        return (
                          <tr key={inst.id} style={styles.tr}>
                            <td style={styles.td} colSpan={9}>
                              <div style={styles.editRow}>
                                <input type="text" value={chiefForm.name} onChange={(e) => setChiefForm({ ...chiefForm, name: e.target.value })} placeholder="Chief name" />
                                <input type="email" value={chiefForm.email} onChange={(e) => setChiefForm({ ...chiefForm, email: e.target.value })} placeholder="Chief email" />
                                <input type="password" value={chiefForm.password} onChange={(e) => setChiefForm({ ...chiefForm, password: e.target.value })} placeholder="Password" />
                                <button className="btn btn-primary btn-sm" onClick={() => handleCreateChief(inst.id)}>Create</button>
                                <button className="btn btn-ghost btn-sm" onClick={() => setChiefFormId(null)}>Cancel</button>
                                {chiefError && <p className="form-error" style={{ margin: 0 }}>{chiefError}</p>}
                              </div>
                            </td>
                          </tr>
                        );
                      }
                      const expiresAt = inst.subscriptionExpiresAt ? new Date(inst.subscriptionExpiresAt) : null;
                      const startedAt = inst.subscriptionStartedAt ? new Date(inst.subscriptionStartedAt) : null;
                      const active = !inst.suspended && expiresAt && expiresAt > new Date();
                      return (
                        <tr key={inst.id} style={styles.tr}>
                          <td style={styles.td}>{inst.name}</td>
                          <td style={styles.td}>{inst.type === 'COLLEGE' ? 'College' : 'School'}</td>
                          <td style={styles.td}><span className="badge">{inst.code}</span></td>
                          <td style={styles.td}>{inst._count?.users ?? 0}</td>
                          <td style={styles.td}>{inst.systemCount ?? 0}</td>
                          <td style={styles.td}>{startedAt ? startedAt.toLocaleDateString() : '—'}</td>
                          <td style={styles.td}>{expiresAt ? expiresAt.toLocaleDateString() : '—'}</td>
                          <td style={styles.td}>
                            <span className={`badge ${active ? '' : 'badge-admin'}`}>
                              {inst.suspended ? 'Suspended' : active ? 'Active' : 'Expired'}
                            </span>
                          </td>
                          <td style={styles.td}>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              <button className="btn btn-outline btn-sm" onClick={() => handleRenew(inst.id)}>Renew +3mo</button>
                              <button className="btn btn-outline btn-sm" onClick={() => handleSuspendToggle(inst)}>
                                {inst.suspended ? 'Reactivate' : 'Suspend'}
                              </button>
                              <button className="btn btn-outline btn-sm" onClick={() => startEdit(inst)}>Edit</button>
                              <button className="btn btn-outline btn-sm" onClick={() => startChiefForm(inst)}>Create Chief</button>
                            </div>
                            {justCreatedChief?.institutionId === inst.id && (
                              <div style={styles.codeCallout}>
                                Chief login created: <strong>{justCreatedChief.email}</strong>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
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
  institutionForm: { display: 'flex', gap: 10, marginBottom: 16 },
  codeCallout: { background: 'var(--primary-light)', color: 'var(--primary)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 14 },
  editRow: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
};
