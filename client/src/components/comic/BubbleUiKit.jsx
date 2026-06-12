// Shared UI primitives for bubble/narration styling panels.
// Imported by both SpeechBubble.jsx and ComicEditor.jsx to avoid duplication.
import { useState, useEffect, useRef } from 'react';

const ORANGE = '#F97316';

// ── Constants ──────────────────────────────────────────────────────────────────
export const FONTS = [
  { value: "'Comic Sans MS', cursive",  label: 'Comic Sans' },
  { value: 'Bangers, cursive',          label: 'Bangers' },
  { value: "'Patrick Hand', cursive",   label: 'Patrick Hand' },
  { value: "'Kalam', cursive",          label: 'Kalam' },
  { value: "'Luckiest Guy', cursive",   label: 'Luckiest Guy' },
  { value: 'Arial, sans-serif',         label: 'Arial' },
  { value: "'Calibri', sans-serif",     label: 'Calibri' },
  { value: "'Times New Roman', serif",  label: 'Times New Roman' },
];
export const SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 42, 48];
export const FONT_COLORS = [
  { label: 'Black',  value: '#000000' },
  { label: 'White',  value: '#ffffff' },
  { label: 'Red',    value: '#DC2626' },
  { label: 'Blue',   value: '#2563EB' },
  { label: 'Green',  value: '#16a34a' },
  { label: 'Orange', value: '#F97316' },
];
export const BOX_COLORS = [
  { label: 'White',  value: '#ffffff' },
  { label: 'Yellow', value: '#FDE68A' },
  { label: 'Blue',   value: '#BFDBFE' },
  { label: 'Green',  value: '#BBF7D0' },
  { label: 'Pink',   value: '#FBCFE8' },
  { label: 'Orange', value: '#FED7AA' },
  { label: 'Red',    value: '#FECACA' },
];
export const BORDER_COLORS = [
  { label: 'None',   value: 'transparent' },
  { label: 'Black',  value: '#000000' },
  { label: 'White',  value: '#ffffff' },
  { label: 'Red',    value: '#DC2626' },
  { label: 'Blue',   value: '#2563EB' },
  { label: 'Green',  value: '#16a34a' },
  { label: 'Orange', value: '#F97316' },
];

// ── Chevron icon ───────────────────────────────────────────────────────────────
export function Chevron() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0 }}>
      <polyline points="2.5,4.5 6.5,8.5 10.5,4.5" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ── Custom select (preserves contentEditable focus via onMouseDown prevention) ─
export function CustomSelect({ value, onChange, options }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const label = options.find((o) => String(o.value ?? o) === String(value))?.label ?? String(value);

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={ref} style={{ flex: 1, position: 'relative' }}>
      <div
        onMouseDown={(e) => { e.preventDefault(); setOpen((v) => !v); }}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', border: '1.5px solid #e5e7eb', borderRadius: 12, background: '#fff', cursor: 'pointer', userSelect: 'none' }}
      >
        <span style={{ fontSize: 14, color: '#111827', flex: 1 }}>{label}</span>
        <Chevron />
      </div>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 3, zIndex: 300, background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.13)', maxHeight: 180, overflowY: 'auto' }}>
          {options.map((o) => {
            const v = o.value ?? o;
            const active = String(v) === String(value);
            return (
              <div
                key={v}
                onMouseDown={(e) => { e.preventDefault(); onChange(String(v)); setOpen(false); }}
                style={{ padding: '8px 14px', fontSize: 13, cursor: 'pointer', background: active ? '#FFF7ED' : 'transparent', color: active ? ORANGE : '#111827' }}
              >
                {o.label ?? v}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Color dropdown ─────────────────────────────────────────────────────────────
export function ColorDropdown({ label, colors, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const cur = colors.find((c) => c.value === value) || colors[0];

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={ref} style={{ flex: 1, minWidth: 0 }}>
      <p style={{ fontSize: 13, fontWeight: 600, color: '#111827', margin: '0 0 7px' }}>{label}</p>
      <div style={{ position: 'relative' }}>
        <div
          onMouseDown={(e) => { e.preventDefault(); setOpen((v) => !v); }}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', border: '1.5px solid #e5e7eb', borderRadius: 12, background: '#fff', cursor: 'pointer', userSelect: 'none' }}
        >
          <div style={{
            width: 22, height: 22, borderRadius: 5, flexShrink: 0, border: '1.5px solid #e5e7eb',
            background: cur.value === 'transparent'
              ? 'repeating-conic-gradient(#ccc 0% 25%,#fff 0% 50%) 0/8px 8px'
              : cur.value,
          }} />
          <span style={{ fontSize: 13, fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#111827' }}>{cur.label}</span>
          <Chevron />
        </div>
        {open && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 3, zIndex: 300, background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.13)', overflow: 'hidden' }}>
            {colors.map((c) => (
              <div
                key={c.value}
                onMouseDown={(e) => { e.preventDefault(); onChange(c.value); setOpen(false); }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', cursor: 'pointer', background: c.value === value ? '#FFF7ED' : 'transparent' }}
              >
                <div style={{
                  width: 18, height: 18, borderRadius: 4, flexShrink: 0, border: '1px solid #e5e7eb',
                  background: c.value === 'transparent'
                    ? 'repeating-conic-gradient(#ccc 0% 25%,#fff 0% 50%) 0/8px 8px'
                    : c.value,
                }} />
                <span style={{ fontSize: 13, color: c.value === value ? ORANGE : '#111827' }}>{c.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Color swatch (small styled square → triggers hidden input[type=color]) ─────
export function ColorSwatch({ label, value, onChange }) {
  const ref = useRef(null);
  const isTransparent = !value || value === 'transparent';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, cursor: 'pointer' }} onClick={() => ref.current?.click()}>
      <span style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap', userSelect: 'none' }}>{label}</span>
      <div style={{
        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
        border: '2px solid #e5e7eb',
        background: isTransparent
          ? 'repeating-conic-gradient(#d1d5db 0% 25%, #f9fafb 0% 50%) 0/10px 10px'
          : value,
        boxShadow: '0 1px 3px rgba(0,0,0,0.10), inset 0 0 0 1px rgba(255,255,255,0.4)',
        transition: 'border-color 0.15s, transform 0.1s',
        position: 'relative',
      }}>
        <input
          ref={ref}
          type="color"
          value={isTransparent ? '#ffffff' : value}
          onChange={(e) => onChange(e.target.value)}
          style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
        />
      </div>
    </div>
  );
}

// ── Alignment icon ─────────────────────────────────────────────────────────────
export function AlignIcon({ id }) {
  const rows = {
    left:    [[2,4,12,4],[2,8,9,8],[2,12,10,12]],
    center:  [[2,4,12,4],[4,8,10,8],[3,12,11,12]],
    right:   [[2,4,12,4],[5,8,12,8],[4,12,12,12]],
    justify: [[2,4,12,4],[2,8,12,8],[2,12,12,12]],
  }[id] || [];
  return (
    <svg width="15" height="15" viewBox="0 0 14 16">
      {rows.map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
      ))}
    </svg>
  );
}
