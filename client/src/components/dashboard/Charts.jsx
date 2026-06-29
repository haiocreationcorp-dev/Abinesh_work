import { useEffect, useRef, useState } from 'react';

// Lightweight, dependency-free SVG charts — no charting library, consistent with the
// rest of the app's plain-CSS/inline-style approach.

export function LineChart({ data, valueKey, labelKey, color = 'var(--primary)' }) {
  const pathRef = useRef(null);
  const [drawn, setDrawn] = useState(false);
  const width = 300;
  const height = 120;
  const padBottom = 20;

  const max = Math.max(1, ...data.map((d) => d[valueKey]));
  const points = data.map((d, i) => {
    const x = data.length > 1 ? (i / (data.length - 1)) * width : width / 2;
    const y = (height - padBottom) - (d[valueKey] / max) * (height - padBottom);
    return { x, y, label: d[labelKey], value: d[valueKey] };
  });
  const pointsAttr = points.map((p) => `${p.x},${p.y}`).join(' ');

  useEffect(() => {
    if (pathRef.current) {
      const len = pathRef.current.getTotalLength();
      pathRef.current.style.strokeDasharray = `${len}`;
      pathRef.current.style.strokeDashoffset = `${len}`;
      requestAnimationFrame(() => setDrawn(true));
    }
  }, [pointsAttr]);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label={`${labelKey} line chart`}>
      <polyline
        ref={pathRef}
        points={pointsAttr}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ transition: drawn ? 'stroke-dashoffset 800ms ease' : 'none', strokeDashoffset: drawn ? 0 : undefined }}
      />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="3.5" fill={color}>
            <title>{p.label}: {p.value}</title>
          </circle>
          <text x={p.x} y={height - 4} fontSize="9" fill="var(--mid)" textAnchor="middle">{p.label}</text>
        </g>
      ))}
    </svg>
  );
}

// Small label-free, dot-free line — embedded in stat cards. Same dependency-free
// SVG approach as LineChart, just stripped down for a compact footprint.
export function Sparkline({ data, valueKey, color = '#fff' }) {
  const width = 100;
  const height = 36;
  const max = Math.max(1, ...data.map((d) => d[valueKey]));
  const min = Math.min(...data.map((d) => d[valueKey]));
  const range = Math.max(1, max - min);

  const points = data.map((d, i) => {
    const x = data.length > 1 ? (i / (data.length - 1)) * width : width / 2;
    const y = height - ((d[valueKey] - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height }} role="img" aria-hidden="true">
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
    </svg>
  );
}

export function DonutChart({ segments }) {
  const size = 140;
  const r = 52;
  const circumference = 2 * Math.PI * r;
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const [grown, setGrown] = useState(false);

  useEffect(() => { requestAnimationFrame(() => setGrown(true)); }, []);

  let offsetSoFar = 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <svg viewBox={`0 0 ${size} ${size}`} style={{ width: 160, height: 160 }} role="img" aria-label="User distribution donut chart">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth="16" />
        {total > 0 && segments.map((s, i) => {
          const pct = s.value / total;
          const dash = grown ? pct * circumference : 0;
          const seg = (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth="16"
              strokeDasharray={`${dash} ${circumference}`}
              strokeDashoffset={-offsetSoFar}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              style={{ transition: 'stroke-dasharray 800ms ease' }}
            >
              <title>{s.label}: {s.value}</title>
            </circle>
          );
          offsetSoFar += pct * circumference;
          return seg;
        })}
        <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central" fontSize="22" fontWeight="800" fill="var(--dark)">
          {total}
        </text>
      </svg>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
        {segments.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--mid)' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: s.color, display: 'inline-block' }} />
            {s.label} ({s.value})
          </div>
        ))}
      </div>
    </div>
  );
}

export function BarChart({ data, valueKey, labelKey, color = 'var(--secondary)' }) {
  const [grown, setGrown] = useState(false);
  const max = Math.max(1, ...data.map((d) => d[valueKey]));

  useEffect(() => { const t = setTimeout(() => setGrown(true), 50); return () => clearTimeout(t); }, []);

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 160, padding: '0 8px' }}>
      {data.map((d, i) => {
        const pct = (d[valueKey] / max) * 100;
        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--dark)', marginBottom: 4 }}>{d[valueKey]}</span>
            <div
              style={{
                width: '100%',
                maxWidth: 36,
                height: grown ? `${pct}%` : '0%',
                background: color,
                borderRadius: '6px 6px 0 0',
                transition: 'height 600ms ease',
              }}
              title={`${d[labelKey]}: ${d[valueKey]}`}
            />
            <span style={{ fontSize: 11, color: 'var(--mid)', marginTop: 6 }}>{d[labelKey]}</span>
          </div>
        );
      })}
    </div>
  );
}
