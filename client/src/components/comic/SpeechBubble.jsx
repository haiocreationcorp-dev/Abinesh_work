import { useState, useEffect, useRef } from 'react';
import { useComic } from '../../context/ComicContext.jsx';
import { FONTS, SIZES, FONT_COLORS, BOX_COLORS, BORDER_COLORS, CustomSelect, AlignIcon } from './BubbleUiKit.jsx';

const ORANGE = '#F97316';

const BUBBLE_TYPES = [
  { id: 'speech',  label: 'Speech' },
  { id: 'thought', label: 'Thought' },
  { id: 'shout',   label: 'Shout' },
  { id: 'whisper', label: 'Whisper' },
];

// ── Narration position preview ────────────────────────────────────────────────
function NarrationPreview({ position }) {
  const W = 54, H = 46, R = 10, SW = 1.2, barThk = 13;
  const clipId = `nc-${position}`;
  let barX = 0, barY = 0, barW = W, barH = barThk;
  if (position === 'bottom') { barY = H - barThk; }
  if (position === 'right')  { barX = W - barThk; barW = barThk; barH = H; }
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <defs><clipPath id={clipId}><rect x={SW/2} y={SW/2} width={W-SW} height={H-SW} rx={R}/></clipPath></defs>
      {/* Peach fill */}
      <rect x={SW/2} y={SW/2} width={W-SW} height={H-SW} rx={R} fill="#FDBA74"/>
      {/* White narration bar clipped to rounded shape */}
      <rect x={barX} y={barY} width={barW} height={barH} fill="#fff" clipPath={`url(#${clipId})`}/>
      {/* Orange border drawn last so it sits on top */}
      <rect x={SW/2} y={SW/2} width={W-SW} height={H-SW} rx={R} fill="none" stroke={ORANGE} strokeWidth={SW}/>
    </svg>
  );
}

// ── Bubble SVG previews ───────────────────────────────────────────────────────
function BubbleSvg({ type }) {
  const W = 60, H = 54, fill = '#fff', stroke = '#1a1a1a';
  const shoutPts = () => {
    const cx = W / 2, cy = H * 0.44, pts = [];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2, r = i % 2 === 0 ? W / 2 - 3 : W / 2 - 13;
      pts.push(`${cx + r * Math.cos(a)},${cy + r * Math.sin(a) * 0.72}`);
    }
    return pts.join(' ');
  };
  if (type === 'speech') return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <rect x={2} y={1} width={W-4} height={H*.76} rx={9} fill={fill} stroke={stroke} strokeWidth={2.2}/>
      <polygon points={`${W*.26},${H*.76} ${W*.37},${H*.97} ${W*.5},${H*.76}`} fill={fill} stroke={stroke} strokeWidth={2.2}/>
    </svg>
  );
  if (type === 'thought') return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <ellipse cx={W/2} cy={H*.38} rx={W/2-5} ry={H*.33} fill={fill} stroke={stroke} strokeWidth={2.2}/>
      <circle cx={W*.35} cy={H*.79} r={4.5} fill={fill} stroke={stroke} strokeWidth={2}/>
      <circle cx={W*.26} cy={H*.92} r={3} fill={fill} stroke={stroke} strokeWidth={1.8}/>
    </svg>
  );
  if (type === 'shout') return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <polygon points={shoutPts()} fill={fill} stroke={stroke} strokeWidth={2.2}/>
    </svg>
  );
  if (type === 'whisper') return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <ellipse cx={W/2} cy={H*.44} rx={W/2-5} ry={H*.38} fill={fill} stroke={stroke} strokeWidth={2} strokeDasharray="6,3.5"/>
    </svg>
  );
  return null;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SpeechBubbleEditor({ panelIndex, onlyNarration = false, hideBubbles = false }) {
  const { state, dispatch } = useComic();
  const [font,        setFont]        = useState("'Comic Sans MS', cursive");
  const [fontSize,    setFontSize]    = useState(20);
  const [bold,        setBold]        = useState(false);
  const [italic,      setItalic]      = useState(false);
  const [align,       setAlign]       = useState('left');
  const [fontColor,   setFontColor]   = useState('#000000');
  const [boxColor,     setBoxColor]     = useState('#F9E07A');
  const [borderColor,  setBorderColor]  = useState('#000000');
  const [borderWidth,  setBorderWidth]  = useState(3);
  const [bubbleType,        setBubbleType]        = useState('speech');
  const [narrationPosition, setNarrationPosition] = useState('top');

  const getStyle = () => ({
    fontFamily: font, fontSize,
    textColor: fontColor, fillColor: boxColor, strokeColor: borderColor,
    // fontWeight, fontStyle, textAlign are applied per-selection via execCommand
  });

  const addNarration = (pos) => {
    const p = pos ?? narrationPosition;
    const existing = (state.panels[panelIndex]?.data?.narrationBoxes || []);
    if (existing.some((b) => b.position === p)) return; // one box per position max
    const isVertical = p === 'left' || p === 'right';
    dispatch({ type: 'ADD_NARRATION_BOX', panelIndex, position: p, style: { ...getStyle(), height: 40, width: isVertical ? 175 : 60 } });
  };

  // If a narration box in this panel is selected, clicking a position card moves it
  const selectedNarration = (state.activeSelection?.kind === 'NARRATION' && state.activeSelection?.panelIndex === panelIndex)
    ? (state.panels[panelIndex]?.data?.narrationBoxes || []).find((b) => b.instanceId === state.activeSelection.instanceId)
    : null;

  // Keep a ref so the style-update effect always sees the latest selection
  const selectedNarrationRef = useRef(selectedNarration);
  selectedNarrationRef.current = selectedNarration;

  // When a different narration box is selected → sync sidebar controls to its style
  useEffect(() => {
    if (!selectedNarration?.style) return;
    const s = selectedNarration.style;
    if (s.fontFamily)  setFont(s.fontFamily);
    if (s.fontSize)    setFontSize(Number(s.fontSize));
    if (s.textColor)   setFontColor(s.textColor);
    if (s.fillColor)    setBoxColor(s.fillColor);
    if (s.strokeColor)  setBorderColor(s.strokeColor);
    if (s.borderWidth)  setBorderWidth(Number(s.borderWidth));
    // bold, italic, align are per-selection (stored in HTML) — not synced here
  }, [selectedNarration?.instanceId]); // eslint-disable-line

  // Box color / border color → update whole-box style only (font/size/textColor are per-selection via execCommand)
  useEffect(() => {
    const nb = selectedNarrationRef.current;
    if (!nb) return;
    dispatch({
      type: 'UPDATE_NARRATION_BOX',
      panelIndex,
      instanceId: nb.instanceId,
      updates: { style: { ...(nb.style || {}), fillColor: boxColor, strokeColor: borderColor, borderWidth } },
    });
  }, [boxColor, borderColor, borderWidth]); // eslint-disable-line

  const handlePositionCard = (pos) => {
    setNarrationPosition(pos);
    if (selectedNarration) {
      const isVertical = pos === 'left' || pos === 'right';
      const wasVertical = selectedNarration.position === 'left' || selectedNarration.position === 'right';
      const updates = { position: pos };
      if (isVertical && !wasVertical) updates.style = { ...(selectedNarration.style || {}), width: 175 };
      dispatch({ type: 'UPDATE_NARRATION_BOX', panelIndex, instanceId: selectedNarration.instanceId, updates });
    } else {
      addNarration(pos);
    }
  };

  const addBubble = () => {
    dispatch({ type: 'ADD_SPEECH_BUBBLE', panelIndex });
    setTimeout(() => {
      const last = state.panels[panelIndex]?.data?.speechBubbles?.at(-1);
      if (last) dispatch({ type: 'UPDATE_BUBBLE', panelIndex, instanceId: last.instanceId, updates: { type: bubbleType, style: getStyle() } });
    }, 0);
  };

  if (onlyNarration) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={ORANGE} strokeWidth="2.3" strokeLinecap="round">
            <line x1="3" y1="6"  x2="21" y2="6"/>
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
          <p style={s.sectionTitle}>Narration box</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
          {[{ id: 'top', label: 'Top' }, { id: 'bottom', label: 'Bottom' }, { id: 'right', label: 'Right' }].map(({ id, label }) => {
            const isActive = selectedNarration?.position === id;
            return (
              <button key={id} onMouseDown={(e) => e.preventDefault()} onClick={() => handlePositionCard(id)} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                padding: '10px 6px 10px',
                border: isActive ? `2px solid ${ORANGE}` : '0.5px solid #E5E7EB',
                borderRadius: 16, cursor: 'pointer',
                background: isActive ? '#FFF7ED' : '#F9FAFB',
              }}>
                <NarrationPreview position={id} />
                <span style={{ fontSize: 12, fontWeight: 700, color: isActive ? ORANGE : '#334155' }}>{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '2px 0 8px' }}>

      {/* ── Font + Size ── */}
      <div>
        <div style={{ display: 'flex', gap: 14, marginBottom: 5 }}>
          <span style={{ ...s.capLabel, flex: 1 }}>Font</span>
          <span style={{ ...s.capLabel, width: 100 }}>Size</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <CustomSelect value={font} onChange={(v) => {
            document.execCommand('styleWithCSS', false, true);
            document.execCommand('fontName', false, v);
            setFont(v);
          }} options={FONTS} />
          <div style={{ width: 100, flexShrink: 0 }}>
            <CustomSelect value={fontSize} onChange={(v) => {
              const px = Number(v);
              document.execCommand('styleWithCSS', false, false);
              document.execCommand('fontSize', false, '7');
              const el = document.activeElement;
              if (el?.isContentEditable) {
                el.querySelectorAll('font[size="7"]').forEach((f) => {
                  const span = document.createElement('span');
                  span.style.fontSize = px + 'px';
                  while (f.firstChild) span.appendChild(f.firstChild);
                  f.replaceWith(span);
                });
                el.dispatchEvent(new InputEvent('input', { bubbles: true }));
              }
              setFontSize(px);
            }} options={SIZES.map((n) => ({ value: n, label: String(n) }))} />
          </div>
        </div>
      </div>

      {/* ── Colors + Thickness card ── */}
      <div style={{ background: '#f9fafb', borderRadius: 14, padding: '10px 12px', border: '1.5px solid #f0f0f0', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Font + Fill rows */}
        {[
          { label: 'Font', colors: FONT_COLORS, value: fontColor, onChange: (v) => { document.execCommand('styleWithCSS', false, true); document.execCommand('foreColor', false, v); setFontColor(v); } },
          { label: 'Fill', colors: BOX_COLORS, value: boxColor, onChange: setBoxColor },
        ].map(({ label, colors, value, onChange }) => (
          <div key={label}>
            <span style={{ ...s.capLabel, display: 'block', marginBottom: 5 }}>{label}</span>
            <div style={{ display: 'flex', gap: 5 }}>
              {colors.map((c) => (
                <div key={c.value} title={c.label} onClick={() => onChange(c.value)} style={{
                  width: 24, height: 24, borderRadius: 7, cursor: 'pointer', flexShrink: 0,
                  background: c.value === 'transparent'
                    ? 'repeating-conic-gradient(#d1d5db 0% 25%, #f9fafb 0% 50%) 0/10px 10px'
                    : c.value,
                  border: value === c.value ? '2.5px solid #F97316' : '1.5px solid #d1d5db',
                  boxShadow: value === c.value ? '0 0 0 2px rgba(249,115,22,0.18)' : '0 1px 2px rgba(0,0,0,0.07)',
                  transition: 'border-color 0.1s, box-shadow 0.1s',
                }} />
              ))}
            </div>
          </div>
        ))}

        {/* Border row + Width select */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
            <span style={s.capLabel}>Border</span>
            <span style={s.capLabel}>Width</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', gap: 5, flex: 1 }}>
              {BORDER_COLORS.map((c) => (
                <div key={c.value} title={c.label} onClick={() => setBorderColor(c.value)} style={{
                  width: 24, height: 24, borderRadius: 7, cursor: 'pointer', flexShrink: 0,
                  background: c.value === 'transparent'
                    ? 'repeating-conic-gradient(#d1d5db 0% 25%, #f9fafb 0% 50%) 0/10px 10px'
                    : c.value,
                  border: borderColor === c.value ? '2.5px solid #F97316' : '1.5px solid #d1d5db',
                  boxShadow: borderColor === c.value ? '0 0 0 2px rgba(249,115,22,0.18)' : '0 1px 2px rgba(0,0,0,0.07)',
                  transition: 'border-color 0.1s, box-shadow 0.1s',
                }} />
              ))}
            </div>
            <select value={borderWidth} onChange={(e) => setBorderWidth(Number(e.target.value))}
              style={{ height: 34, width: 58, padding: '0 4px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 12, fontWeight: 700, color: '#111827', background: '#fff', cursor: 'pointer', textAlign: 'center', flexShrink: 0 }}>
              {[1,2,3,4,5,6,7,8,9,10].map((n) => <option key={n} value={n}>{n}px</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ── Formatting toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button onMouseDown={(e) => e.preventDefault()} onClick={() => { document.execCommand('bold'); setBold((v) => !v); }}
          style={{ ...s.fmtBtn, borderColor: bold ? ORANGE : '#e5e7eb', color: bold ? ORANGE : '#374151' }}>
          <b style={{ fontSize: 15, lineHeight: 1 }}>B</b>
        </button>
        <button onMouseDown={(e) => e.preventDefault()} onClick={() => { document.execCommand('italic'); setItalic((v) => !v); }}
          style={{ ...s.fmtBtn, borderColor: italic ? ORANGE : '#e5e7eb', color: italic ? ORANGE : '#374151' }}>
          <em style={{ fontSize: 15, fontStyle: 'italic', lineHeight: 1 }}>I</em>
        </button>
        <div style={{ width: 1, height: 22, background: '#e5e7eb', margin: '0 2px', flexShrink: 0 }} />
        {['left', 'center', 'right', 'justify'].map((a) => (
          <button key={a} onMouseDown={(e) => e.preventDefault()} onClick={() => {
            const cmds = { left: 'justifyLeft', center: 'justifyCenter', right: 'justifyRight', justify: 'justifyFull' };
            document.execCommand(cmds[a]);
            setAlign(a);
          }} style={{ ...s.fmtBtn, borderColor: align === a ? ORANGE : '#e5e7eb', color: align === a ? ORANGE : '#374151' }}>
            <AlignIcon id={a} />
          </button>
        ))}
      </div>

      <div style={s.divider} />

      {/* ── Positions ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={ORANGE} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <line x1="12" y1="3" x2="12" y2="21"/>
            <line x1="3" y1="12" x2="21" y2="12"/>
          </svg>
          <p style={{ ...s.sectionTitle, fontSize: 14 }}>Positions</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
          {[{ id: 'top', label: 'Top' }, { id: 'bottom', label: 'Bottom' }, { id: 'right', label: 'Right' }].map(({ id, label }) => {
            const isActive = selectedNarration?.position === id;
            return (
              <button key={id} onMouseDown={(e) => e.preventDefault()} onClick={() => handlePositionCard(id)} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                padding: '8px 4px',
                border: isActive ? `2px solid ${ORANGE}` : '1px solid #E5E7EB',
                borderRadius: 12, cursor: 'pointer',
                background: isActive ? '#FFF7ED' : '#F9FAFB',
              }}>
                <NarrationPreview position={id} />
                <span style={{ fontSize: 11, fontWeight: 700, color: isActive ? ORANGE : '#334155' }}>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Bubbles ── */}
      {!hideBubbles && (
        <>
          <div style={s.divider} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={ORANGE} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              <p style={s.sectionTitle}>Bubbles</p>
            </div>
            <p style={s.sectionDesc}>Add speech or thought bubbles.</p>

            <div style={s.bubbleGrid}>
              {BUBBLE_TYPES.map((bt) => {
                const sel = bubbleType === bt.id;
                return (
                  <button key={bt.id} onMouseDown={(e) => e.preventDefault()} onClick={() => setBubbleType(bt.id)} style={{
                    ...s.bubbleCard, borderColor: sel ? ORANGE : '#e5e7eb',
                  }}>
                    <BubbleSvg type={bt.id} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: sel ? ORANGE : '#374151', marginTop: 5 }}>{bt.label}</span>
                  </button>
                );
              })}
            </div>

            <button style={s.addBubbleBtn} onMouseDown={(e) => e.preventDefault()} onClick={addBubble}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={ORANGE} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                <line x1="12" y1="8" x2="12" y2="14"/><line x1="9" y1="11" x2="15" y2="11"/>
              </svg>
              Add bubble
            </button>
          </div>
        </>
      )}

    </div>
  );
}

const s = {
  capLabel:     { fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em' },
  fieldLabel:   { fontSize: 13, fontWeight: 600, color: '#111827' },
  colorLabel:   { fontSize: 13, fontWeight: 600, color: '#111827', margin: '0 0 7px' },
  selectBox:    { display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', border: '1.5px solid #e5e7eb', borderRadius: 12, background: '#fff', cursor: 'pointer' },
  colorBox:     { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', border: '1.5px solid #e5e7eb', borderRadius: 12, background: '#fff', cursor: 'pointer' },
  fmtBtn:       { width: 36, height: 36, borderRadius: 8, border: '1.5px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.12s', flexShrink: 0, padding: 0 },
  divider:      { borderTop: '1.5px solid #f0f0f0', margin: '2px 0' },
  notationIcon: { width: 36, height: 36, borderRadius: 9, border: `2px solid ${ORANGE}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  sectionTitle: { fontSize: 16, fontWeight: 700, color: '#111827', margin: 0 },
  sectionDesc:  { fontSize: 12, color: '#9CA3AF', margin: '0 0 14px' },
  addBubbleBtn: { width: '100%', padding: '13px', background: '#fff', color: ORANGE, border: `2px solid ${ORANGE}`, borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12 },
  bubbleGrid:   { display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, marginBottom: 4 },
  bubbleCard:   { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 4px 8px', border: '2px solid #e5e7eb', borderRadius: 12, cursor: 'pointer', background: '#fff', transition: 'border-color 0.12s' },
};
