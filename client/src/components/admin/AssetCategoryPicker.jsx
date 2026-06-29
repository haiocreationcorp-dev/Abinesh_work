import { useState, useEffect } from 'react';
import { ASSET_CATEGORIES } from '../../constants/categories.js';

const RECENT_KEY = 'bc_asset_recent_categories';
const FAV_KEY = 'bc_asset_fav_categories';
const MAX_RECENT = 5;

function readList(key) {
  try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; }
}

function IconStar({ filled }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function CategoryChip({ category, active, favorited, onSelect, onToggleFavorite }) {
  return (
    <button
      type="button"
      className={`category-chip ${active ? 'category-chip-active' : ''}`}
      onClick={() => onSelect(category.id)}
    >
      <span>{category.icon}</span>
      {category.label}
      <span
        className="category-star"
        onClick={(e) => { e.stopPropagation(); onToggleFavorite(category.id); }}
        title={favorited ? 'Remove from favorites' : 'Add to favorites'}
      >
        <IconStar filled={favorited} />
      </span>
    </button>
  );
}

export default function AssetCategoryPicker({ value, onChange }) {
  const [recent, setRecent] = useState(() => readList(RECENT_KEY));
  const [favorites, setFavorites] = useState(() => readList(FAV_KEY));

  useEffect(() => { localStorage.setItem(RECENT_KEY, JSON.stringify(recent)); }, [recent]);
  useEffect(() => { localStorage.setItem(FAV_KEY, JSON.stringify(favorites)); }, [favorites]);

  const handleSelect = (id) => {
    onChange(id);
    setRecent((prev) => [id, ...prev.filter((c) => c !== id)].slice(0, MAX_RECENT));
  };

  const toggleFavorite = (id) => {
    setFavorites((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  };

  const byId = (id) => ASSET_CATEGORIES.find((c) => c.id === id);
  const favoriteCategories = favorites.map(byId).filter(Boolean);
  const recentCategories = recent.map(byId).filter(Boolean);

  return (
    <div style={styles.root}>
      {favoriteCategories.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionLabel}>Favorites</div>
          <div style={styles.chipRow}>
            {favoriteCategories.map((c) => (
              <CategoryChip key={c.id} category={c} active={c.id === value} favorited onSelect={handleSelect} onToggleFavorite={toggleFavorite} />
            ))}
          </div>
        </div>
      )}

      {recentCategories.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionLabel}>Recent</div>
          <div style={styles.chipRow}>
            {recentCategories.map((c) => (
              <CategoryChip key={c.id} category={c} active={c.id === value} favorited={favorites.includes(c.id)} onSelect={handleSelect} onToggleFavorite={toggleFavorite} />
            ))}
          </div>
        </div>
      )}

      <div style={styles.section}>
        <div style={styles.sectionLabel}>All Categories</div>
        <div style={styles.chipRow}>
          {ASSET_CATEGORIES.map((c) => (
            <CategoryChip key={c.id} category={c} active={c.id === value} favorited={favorites.includes(c.id)} onSelect={handleSelect} onToggleFavorite={toggleFavorite} />
          ))}
        </div>
      </div>
    </div>
  );
}

const styles = {
  root: { display: 'flex', flexDirection: 'column', gap: 14 },
  section: {},
  sectionLabel: { fontSize: 11, fontWeight: 700, color: 'var(--mid)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
  chipRow: { display: 'flex', flexWrap: 'wrap', gap: 8 },
};
