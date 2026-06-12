const LAYOUTS = [
  { id: 'single', label: 'Single',         preview: [[1]] },
  { id: '2h',     label: '2 Side by Side', preview: [[0.5, 0.5]] },
  { id: '2v',     label: '2 Stacked',      preview: [[1], [1]] },
  { id: '4',      label: '4 Grid',         preview: [[0.5, 0.5], [0.5, 0.5]] },
];

export default function PanelLayoutPicker({ current, onChange }) {
  return (
    <div>
      <p style={styles.label}>Choose panel layout</p>
      <div style={styles.grid}>
        {LAYOUTS.map((layout) => (
          <button
            key={layout.id}
            style={{ ...styles.item, ...(current === layout.id ? styles.itemActive : {}) }}
            onClick={() => onChange(layout.id)}
            title={layout.label}
            onMouseEnter={(e) => {
              if (current !== layout.id) {
                e.currentTarget.style.borderColor = 'var(--t-accent)';
                e.currentTarget.style.background = 'var(--t-accent-light)';
              }
            }}
            onMouseLeave={(e) => {
              if (current !== layout.id) {
                e.currentTarget.style.borderColor = 'var(--t-border)';
                e.currentTarget.style.background = 'var(--t-bg3)';
              }
            }}
          >
            <LayoutPreview rows={layout.preview} active={current === layout.id} />
            <span style={{ ...styles.itemLabel, color: current === layout.id ? 'var(--t-accent)' : 'var(--t-text-muted)' }}>
              {layout.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function LayoutPreview({ rows, active }) {
  return (
    <svg width={70} height={48} style={{ display: 'block' }}>
      {rows.map((cols, rowIdx) => {
        const rowH = 48 / rows.length;
        let xOff = 0;
        return cols.map((w, colIdx) => {
          const cellW = w * 68;
          const rect = (
            <rect
              key={`${rowIdx}-${colIdx}`}
              x={xOff + 2}
              y={rowIdx * rowH + 2}
              width={cellW - 4}
              height={rowH - 4}
              rx={3}
              fill={active ? 'rgba(249,115,22,0.18)' : 'var(--t-accent-light)'}
              stroke={active ? '#F97316' : 'var(--t-accent)'}
              strokeWidth={1.5}
            />
          );
          xOff += cellW;
          return rect;
        });
      })}
    </svg>
  );
}

const styles = {
  label: {
    fontSize: 11, fontWeight: 700, color: 'var(--t-text-faint)',
    marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1,
  },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  item: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
    background: 'var(--t-bg3)', border: '2px solid var(--t-border)',
    borderRadius: 12, padding: '12px 6px', cursor: 'pointer',
    transition: 'border-color 0.15s, background 0.15s',
  },
  itemActive: {
    border: '2px solid var(--t-accent)',
    background: 'var(--t-accent-light)',
  },
  itemLabel: {
    fontSize: 10, textAlign: 'center', fontWeight: 700,
  },
};
