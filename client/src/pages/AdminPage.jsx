import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import ProfileMenu from '../components/ui/ProfileMenu.jsx';
import { useUITheme } from '../context/UIThemeContext.jsx';
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
import ManageUsersPanel from '../components/admin/ManageUsersPanel.jsx';
import InstitutionsPanel from '../components/admin/InstitutionsPanel.jsx';
import AdminNavDrawer from '../components/admin/AdminNavDrawer.jsx';
import { ASSET_CATEGORIES, FACE_PART_TYPES, GENDERS, VIEWS, POSE_TYPES, EYE_TYPES, MOUTH_TYPES } from '../constants/categories.js';
import { getBackgroundSubcategories } from '../api/assets.js';
import { Search, UploadCloud } from 'lucide-react';

function IconSun() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
    </svg>
  );
}

function IconMoon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function IconBell() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function tabIcon(name) {
  const paths = {
    upload: <><path d="M16 16l-4-4-4 4" /><path d="M12 12v9" /><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" /></>,
    folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />,
    face: <><circle cx="12" cy="12" r="9" /><path d="M9 10h.01M15 10h.01M8.5 15a4 4 0 0 0 7 0" /></>,
    smile: <><circle cx="12" cy="12" r="9" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></>,
    users: <><circle cx="9" cy="8" r="3.5" /><path d="M2 20c0-3.3 3-6 7-6s7 2.7 7 6" /><path d="M16.5 5.2a3.5 3.5 0 0 1 0 6.6" /><path d="M22 20c0-2.6-2-4.8-4.7-5.7" /></>,
    palette: <><path d="M12 2a10 10 0 1 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.4-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.3A4.2 4.2 0 0 0 21.5 11 9.96 9.96 0 0 0 12 2z" /><circle cx="7.5" cy="10.5" r="1.2" /><circle cx="11" cy="6.5" r="1.2" /><circle cx="15.5" cy="8" r="1.2" /></>,
    eye: <><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" /><circle cx="12" cy="12" r="3" /></>,
    bulb: <><path d="M9 18h6M10 22h4" /><path d="M12 2a6 6 0 0 0-4 10.5c.6.5 1 1.3 1 2.1V16h6v-1.4c0-.8.4-1.6 1-2.1A6 6 0 0 0 12 2z" /></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></>,
    building: <><path d="M3 21h18" /><path d="M6 21V8l6-4 6 4v13" /><path d="M10 21v-6h4v6" /></>,
  };
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

// Index 0-8 = Content tools, 9-10 = Administration tools — kept as one flat list so the
// existing tab===N checks throughout this file don't need to change, just grouped
// visually via CONTENT_TABS/ADMINISTRATION_TABS below.
const TABS = [
  'Asset Library', 'Bulk Import', 'Face & Body Editor', 'Expression Library', 'Character Templates',
  'Color Palette Manager', 'Eye Alignment Tool', 'Lighting Studio', 'Asset Explorer',
  'User Management', 'Organization Management',
];
const TAB_ICON_NAMES = ['upload', 'folder', 'face', 'smile', 'users', 'palette', 'eye', 'bulb', 'grid', 'users', 'building'];
const CONTENT_TABS = TABS.slice(0, 9).map((label, i) => ({ label, index: i, icon: tabIcon(TAB_ICON_NAMES[i]) }));
const ADMINISTRATION_TABS = TABS.slice(9).map((label, i) => ({ label, index: i + 9, icon: tabIcon(TAB_ICON_NAMES[i + 9]) }));
const NAV_GROUPS = {
  content: { title: 'Content', items: CONTENT_TABS },
  admin: { title: 'Administration', items: ADMINISTRATION_TABS },
};

// One-line description shown under each tab's title in the shared PageHeader below —
// index matches TABS. Tabs 9/10 (User/Organization Management) build their own headers
// inside ManageUsersPanel/InstitutionsPanel, so they're not listed here.
const TAB_SUBTITLES = [
  'Upload a single asset with full metadata control.',
  'Upload multiple assets at once from a folder, with automatic costume and pose detection.',
  'Build and align face templates and body poses.',
  'Create reusable eye + mouth expression pairs for characters.',
  'Manage saved character presets.',
  'Normalize skin tones and remove backgrounds for uploaded art.',
  'Fine-tune eye masks and skin-tone normalization for FACE_PART eye assets.',
  'Adjust lighting presets used across the comic editor.',
  'Manage all image assets, templates, poses, backgrounds and visual resources.',
];

// Consistent large page header used at the top of every Content/Administration tab
// (except 9/10, which build their own) — title + one-line subtitle, optional right-side action.
function PageHeader({ title, subtitle, action }) {
  return (
    <div style={styles.explorerHeader}>
      <div>
        <h2 style={styles.explorerTitle}>{title}</h2>
        {subtitle && <p style={styles.explorerSubtitle}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// Plain labeled dropdown for a single-select filter — used for all the Asset Explorer's
// sub-category filters (Part Type, Gender, View, Pose Type, Eye Type, Mouth Type).
function FilterDropdown({ label, value, onChange, options }) {
  return (
    <div style={styles.filterField}>
      <span style={styles.dropdownLabel}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={styles.dropdownSelect}>
        <option value="">All</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </div>
  );
}

export default function AdminPage() {
  const { mode, toggle } = useUITheme();
  const [searchParams] = useSearchParams();
  const [navOpen, setNavOpen] = useState(null); // 'content' | 'admin' | null
  const [notifOpen, setNotifOpen] = useState(false);
  const initialTab = Number(searchParams.get('tab'));
  const [tab, setTab] = useState(Number.isInteger(initialTab) && initialTab >= 0 && initialTab < TABS.length ? initialTab : 0);
  const [category, setCategory] = useState('FACE_PART');
  const [partType, setPartType] = useState('');
  const [gender, setGender] = useState('');
  const [view, setView] = useState('');
  const [poseType, setPoseType] = useState('');
  const [eyeType, setEyeType] = useState('');
  const [mouthType, setMouthType] = useState('');
  const [costumeFilter, setCostumeFilter] = useState('');
  const [bgSubFilter, setBgSubFilter] = useState('');
  const [bgSubcats, setBgSubcats] = useState([]);
  const [assetSearch, setAssetSearch] = useState('');
  const [fbMode, setFbMode] = useState('face');

  // Background subcategory folders, for the Asset Explorer's Backgrounds filter.
  useEffect(() => {
    if (bgSubcats.length === 0) getBackgroundSubcategories().then(setBgSubcats).catch(() => {});
  }, [bgSubcats.length]);

  const toggleNav = (key) => setNavOpen((cur) => (cur === key ? null : key));
  const activeGroup = navOpen ? NAV_GROUPS[navOpen] : NAV_GROUPS.content;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--light)' }}>
      <header style={styles.topbar}>
        <div style={styles.leftGroup}>
          <span className="admin-label" style={styles.adminLabel}>Admin Panel</span>
          <button style={{ ...styles.navBtn, ...(navOpen === 'content' ? styles.navBtnActive : {}) }} onClick={() => toggleNav('content')}>
            Content <span style={styles.chevron}>▾</span>
          </button>
          <button style={{ ...styles.navBtn, ...(navOpen === 'admin' ? styles.navBtnActive : {}) }} onClick={() => toggleNav('admin')}>
            Administration <span style={styles.chevron}>▾</span>
          </button>
        </div>

        <Link to="/dashboard" style={styles.brandCenter}>BharathComic</Link>

        <div style={styles.rightGroup}>
          <div className="admin-search" style={styles.searchWrap} title="Coming soon">
            <IconSearch />
            <input style={styles.searchInput} placeholder="Search comics, users, institutions…" disabled />
          </div>

          <div style={styles.iconWrap}>
            {notifOpen && <div style={styles.overlay} onClick={() => setNotifOpen(false)} />}
            <button style={styles.iconBtn} onClick={() => setNotifOpen((o) => !o)} aria-label="Notifications" title="Notifications">
              <IconBell />
            </button>
            {notifOpen && (
              <div style={styles.notifMenu}>
                <div style={styles.notifTitle}>Notifications</div>
                <p className="text-muted text-sm" style={{ textAlign: 'center', padding: '12px 0' }}>No notifications yet.</p>
              </div>
            )}
          </div>

          <button style={styles.iconBtn} onClick={toggle} aria-label="Toggle dark mode" title="Toggle dark mode">
            {mode === 'dark' ? <IconSun /> : <IconMoon />}
          </button>
          <ProfileMenu />
        </div>
      </header>

      <AdminNavDrawer
        open={!!navOpen}
        title={activeGroup.title}
        items={activeGroup.items}
        activeIndex={tab}
        onSelect={(index) => { setTab(index); setNavOpen(null); }}
        onClose={() => setNavOpen(null)}
      />

      <main style={styles.content}>
          <div style={styles.contentInner}>
          {tab !== 0 && tab !== 1 && tab !== 3 && tab !== 4 && tab !== 6 && tab !== 9 && tab !== 10 && (
            <PageHeader
              title={TABS[tab]}
              subtitle={TAB_SUBTITLES[tab]}
              action={tab === 8 ? (
                <button className="btn btn-primary" onClick={() => setTab(0)}>
                  <UploadCloud size={15} /> Upload Asset
                </button>
              ) : tab === 2 ? (
                <div style={styles.tabs}>
                  <button className={`btn ${fbMode === 'face' ? 'btn-nav-active' : 'btn-ghost'}`} onClick={() => setFbMode('face')}>
                    Face
                  </button>
                  <button className={`btn ${fbMode === 'pose' ? 'btn-nav-active' : 'btn-ghost'}`} onClick={() => setFbMode('pose')}>
                    Pose
                  </button>
                </div>
              ) : null}
            />
          )}
          {tab === 0 && <AssetUploadForm />}

          {tab === 1 && <FolderUploadForm />}

          {tab === 2 && (fbMode === 'face' ? <FaceBuilder /> : <PoseBuilder />)}

          {tab === 3 && <ExpressionBuilder />}

          {tab === 4 && <CharacterPresetBuilder />}

          {tab === 5 && <PaletteNormalizer />}

          {tab === 6 && <EyeNormalizer />}

          {tab === 7 && <LightingAdjuster />}

          {tab === 8 && (
            <div>
              <div style={styles.searchWrapLarge}>
                <Search size={16} color="var(--mid)" />
                <input
                  style={styles.searchInputLarge}
                  placeholder="Search assets by name…"
                  value={assetSearch}
                  onChange={(e) => setAssetSearch(e.target.value)}
                />
              </div>

              <div style={styles.categoryRowEven}>
                {ASSET_CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    className={`chip ${category === c.id ? 'chip-active' : ''}`}
                    style={styles.categoryChipEven}
                    onClick={() => { setCategory(c.id); setPartType(''); setGender(''); setView(''); setPoseType(''); setEyeType(''); setMouthType(''); setCostumeFilter(''); setBgSubFilter(''); }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              {category === 'FACE_PART' && (
                <div style={styles.filterBar}>
                  <FilterDropdown label="Part Type" value={partType} onChange={(v) => { setPartType(v); if (v !== 'EYES') setEyeType(''); if (v !== 'MOUTH') setMouthType(''); }} options={FACE_PART_TYPES} />
                  <FilterDropdown label="Gender" value={gender} onChange={setGender} options={GENDERS} />
                  <FilterDropdown label="View" value={view} onChange={setView} options={VIEWS} />
                  {partType === 'EYES' && (
                    <FilterDropdown label="Eye Type" value={eyeType} onChange={setEyeType} options={EYE_TYPES} />
                  )}
                  {partType === 'MOUTH' && (
                    <FilterDropdown label="Mouth Type" value={mouthType} onChange={setMouthType} options={MOUTH_TYPES} />
                  )}
                </div>
              )}
              {category === 'FACE_TEMPLATE' && (
                <div style={styles.filterBar}>
                  <FilterDropdown label="View" value={view} onChange={setView} options={VIEWS} />
                </div>
              )}
              {category === 'BACKGROUND' && bgSubcats.length > 0 && (
                <div style={styles.filterBar}>
                  <FilterDropdown
                    label="Subcategory"
                    value={bgSubFilter}
                    onChange={setBgSubFilter}
                    options={bgSubcats.map((s) => ({ id: s.slug, label: s.label }))}
                  />
                </div>
              )}
              {category === 'BODY_POSE' && (
                <div style={styles.filterBar}>
                  <div className="form-group" style={{ maxWidth: 160, marginBottom: 0 }}>
                    <label style={styles.dropdownLabel}>Costume</label>
                    <input
                      value={costumeFilter}
                      onChange={(e) => setCostumeFilter(e.target.value)}
                      placeholder="e.g. C1"
                    />
                  </div>
                  <FilterDropdown label="Pose Type" value={poseType} onChange={setPoseType} options={POSE_TYPES} />
                  <FilterDropdown label="View" value={view} onChange={setView} options={VIEWS} />
                </div>
              )}
              <AssetGrid
                category={category}
                search={assetSearch}
                tags={category === 'BACKGROUND' ? bgSubFilter : undefined}
                partType={category === 'FACE_PART' ? partType : ''}
                gender={category === 'FACE_PART' ? gender : ''}
                view={['FACE_PART', 'FACE_TEMPLATE', 'BODY_POSE'].includes(category) ? view : ''}
                poseType={category === 'BODY_POSE' ? poseType : ''}
                eyeType={category === 'FACE_PART' && partType === 'EYES' ? eyeType : ''}
                mouthType={category === 'FACE_PART' && partType === 'MOUTH' ? mouthType : ''}
                costume={category === 'BODY_POSE' ? costumeFilter : ''}
                adminMode
                onUploadClick={() => setTab(0)}
              />
            </div>
          )}

          {tab === 9 && <ManageUsersPanel />}

          {tab === 10 && <InstitutionsPanel />}
          </div>
        </main>
    </div>
  );
}

const styles = {
  topbar: {
    position: 'sticky',
    top: 0,
    zIndex: 90,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    rowGap: 10,
    background: 'var(--header-gradient)',
    padding: '14px 24px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
  },
  leftGroup: { display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' },
  adminLabel: { fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.85)' },
  navBtn: {
    display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
    borderRadius: 12, background: 'rgba(255,255,255,0.15)', color: '#fff',
    fontSize: 14, fontWeight: 700, transition: 'background 0.18s ease, color 0.18s ease',
  },
  navBtnActive: { background: '#fff', color: 'var(--nav-primary)' },
  chevron: { fontSize: 10 },
  brandCenter: { fontFamily: 'var(--font-display)', fontSize: 26, color: '#fff', letterSpacing: 0.5 },
  rightGroup: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  searchWrap: {
    display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.15)',
    borderRadius: 'var(--radius-sm)', padding: '7px 12px', color: 'rgba(255,255,255,0.85)', width: 200,
  },
  searchInput: { background: 'transparent', border: 'none', color: '#fff', fontSize: 13, width: '100%', padding: 0 },
  iconWrap: { position: 'relative' },
  overlay: { position: 'fixed', inset: 0, zIndex: 89 },
  iconBtn: {
    width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.15)',
    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
    position: 'relative', zIndex: 90,
  },
  notifMenu: {
    position: 'absolute', right: 0, top: 46, background: 'var(--surface)',
    border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-lg)',
    padding: 14, width: 240, zIndex: 90,
  },
  notifTitle: { fontSize: 13, fontWeight: 700, color: 'var(--dark)' },
  content: { padding: '32px 40px' },
  contentInner: { maxWidth: 1400, margin: '0 auto' },
  tabs: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  categoryRow: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  categoryRowEven: { display: 'flex', gap: 10, marginBottom: 20 },
  categoryChipEven: { flex: 1, justifyContent: 'center', textAlign: 'center' },
  explorerHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 16, marginBottom: 18, flexWrap: 'wrap',
  },
  explorerTitle: { fontSize: 22, fontWeight: 800, color: 'var(--dark)', marginBottom: 2 },
  explorerSubtitle: { fontSize: 13, color: 'var(--mid)', maxWidth: 520, lineHeight: 1.5 },
  searchWrapLarge: {
    display: 'flex', alignItems: 'center', gap: 8,
    width: '100%', maxWidth: 400, padding: '10px 14px',
    borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)',
    marginBottom: 20,
  },
  searchInputLarge: {
    border: 'none', outline: 'none', flex: 1, fontSize: 13.5,
    background: 'transparent', color: 'var(--dark)',
  },
  filterBar: { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 16, marginBottom: 20 },
  filterField: { display: 'flex', flexDirection: 'column', gap: 5 },
  dropdownLabel: { fontSize: 11.5, fontWeight: 700, color: 'var(--mid)', textTransform: 'uppercase', letterSpacing: 0.3 },
  dropdownSelect: {
    height: 34, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border)',
    background: 'var(--surface)', color: 'var(--dark)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
    minWidth: 140,
  },
};
