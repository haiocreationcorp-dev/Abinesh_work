import { useEffect, useRef, useState, useCallback } from 'react';
import { getAssets } from '../../api/assets.js';
import api from '../../api/client.js';

// ── Fix inline SVG fragment references broken by page URL ─────────────────────
// When SVG is injected as innerHTML, url(#id), xlink:href="#id", href="#id"
// are resolved relative to the page URL, not the SVG root.
// Prepending the full page URL makes the browser find the element correctly.
function fixSvgRefs(svgText) {
  const base = window.location.href.split('#')[0];
  return svgText
    .replace(/url\(#/g,            `url(${base}#`)
    .replace(/xlink:href="#/g,     `xlink:href="${base}#`)
    .replace(/(href\s*=\s*)"#/g,   `$1"${base}#`);
}

// ── Skeleton bones ────────────────────────────────────────────────────────────
const BONES = [
  { id: 'head',       label: 'Head' },
  { id: 'neck',       label: 'Neck' },
  { id: 'torso',      label: 'Torso' },
  { id: 'upperArmL',  label: 'Upper Arm L' },
  { id: 'lowerArmL',  label: 'Lower Arm L' },
  { id: 'handL',      label: 'Hand L' },
  { id: 'upperArmR',  label: 'Upper Arm R' },
  { id: 'lowerArmR',  label: 'Lower Arm R' },
  { id: 'handR',      label: 'Hand R' },
  { id: 'upperLegL',  label: 'Upper Leg L' },
  { id: 'lowerLegL',  label: 'Lower Leg L' },
  { id: 'footL',      label: 'Foot L' },
  { id: 'upperLegR',  label: 'Upper Leg R' },
  { id: 'lowerLegR',  label: 'Lower Leg R' },
  { id: 'footR',      label: 'Foot R' },
];

// ── Pose presets (bone rotations in degrees, unset bones reset to 0) ──────────
const POSE_PRESETS = [
  { id: 'standing',  label: 'Standing',      emoji: '🧍', rotations: {} },
  { id: 'sitting',   label: 'Sitting',        emoji: '🪑', rotations: { upperLegL: 85, lowerLegL: -80, upperLegR: 85, lowerLegR: -80 } },
  { id: 'walking',   label: 'Walking',        emoji: '🚶', rotations: { upperArmL: -30, upperArmR: 30, upperLegL: 25, upperLegR: -25, lowerLegL: -15, lowerLegR: 15 } },
  { id: 'running',   label: 'Running',        emoji: '🏃', rotations: { upperArmL: -50, upperArmR: 50, upperLegL: 40, upperLegR: -40, lowerLegL: -30, lowerLegR: 30 } },
  { id: 'jumping',   label: 'Jumping',        emoji: '⬆️', rotations: { upperArmL: -80, upperArmR: -80, upperLegL: 30, upperLegR: -30, lowerLegL: -40, lowerLegR: -40 } },
  { id: 'fighting',  label: 'Punch',          emoji: '👊', rotations: { upperArmR: -90, upperArmL: 30, lowerArmL: -45 } },
  { id: 'pointing',  label: 'Pointing',       emoji: '👉', rotations: { upperArmR: -70, lowerArmR: 20 } },
  { id: 'waving',    label: 'Waving',         emoji: '👋', rotations: { upperArmR: -80, lowerArmR: -30 } },
  { id: 'thinking',  label: 'Thinking',       emoji: '🤔', rotations: { upperArmR: 30, lowerArmR: -60, head: 10 } },
  { id: 'cheering',  label: 'Cheering',       emoji: '🙌', rotations: { upperArmL: -100, upperArmR: -100, lowerArmL: 20, lowerArmR: -20 } },
  { id: 'kneeling',  label: 'Kneeling',       emoji: '🧎', rotations: { upperLegR: 90, lowerLegR: -90, upperLegL: 60, lowerLegL: -30 } },
  { id: 'crossed',   label: 'Arms Crossed',   emoji: '🤐', rotations: { upperArmL: 40, lowerArmL: -80, upperArmR: -40, lowerArmR: 80 } },
  { id: 'akimbo',    label: 'Hands on Hips',  emoji: '🫰', rotations: { upperArmL: 60, lowerArmL: -60, upperArmR: -60, lowerArmR: 60 } },
  { id: 'dance',     label: 'Dancing',        emoji: '💃', rotations: { upperArmL: -60, upperArmR: 30, upperLegL: 20, lowerLegL: -40, head: -15 } },
  { id: 'sleeping',  label: 'Sleeping',       emoji: '😴', rotations: { head: 30, upperArmL: 20, upperArmR: -20, upperLegL: 15, upperLegR: -15, lowerLegL: -10 } },
];

// Auto-set hinge based on bone type — head hinges at bottom (neck), limbs at top (joint above)
function autoHinge(bone, bbox) {
  const { x, y, width, height } = bbox;
  const cx = x + width / 2;
  if (bone === 'head') return { hx: cx, hy: y + height };
  if (bone === 'torso') return { hx: cx, hy: y + height / 2 };
  return { hx: cx, hy: y };
}

// ── Element type metadata ─────────────────────────────────────────────────────
const TAG_META = {
  g:        { label: 'GROUP',   color: '#7C3AED', bg: '#f0ebff' },
  path:     { label: 'PATH',    color: '#F97316', bg: '#fff4eb' },
  rect:     { label: 'RECT',    color: '#2563EB', bg: '#eff6ff' },
  circle:   { label: 'CIRCLE',  color: '#16a34a', bg: '#f0fdf4' },
  ellipse:  { label: 'ELLIP',   color: '#0891B2', bg: '#ecfeff' },
  polygon:  { label: 'POLY',    color: '#DB2777', bg: '#fdf2f8' },
  polyline: { label: 'PLINE',   color: '#DB2777', bg: '#fdf2f8' },
  image:    { label: 'IMAGE',   color: '#9333EA', bg: '#faf5ff' },
  text:     { label: 'TEXT',    color: '#DC2626', bg: '#fef2f2' },
  line:     { label: 'LINE',    color: '#6B7280', bg: '#f9fafb' },
};
const tagMeta = (tag) => TAG_META[tag] || { label: tag.toUpperCase().slice(0, 5), color: '#6B7280', bg: '#f9fafb' };

// ── Coordinate helpers ────────────────────────────────────────────────────────
const toParentLocal = (el, clientX, clientY) => {
  const svgEl = el.ownerSVGElement;
  const pt = svgEl.createSVGPoint();
  pt.x = clientX; pt.y = clientY;
  const parent = el.parentElement;
  const ctm = (parent === svgEl ? svgEl : parent).getScreenCTM();
  return pt.matrixTransform(ctm.inverse());
};

const parentLocalToSvgViewport = (el, hx, hy) => {
  const svgEl = el.ownerSVGElement;
  const parent = el.parentElement;
  if (parent === svgEl) return { x: hx, y: hy };
  const pt = svgEl.createSVGPoint();
  pt.x = hx; pt.y = hy;
  const screenPt = pt.matrixTransform(parent.getScreenCTM());
  const svgPt = svgEl.createSVGPoint();
  svgPt.x = screenPt.x; svgPt.y = screenPt.y;
  return svgPt.matrixTransform(svgEl.getScreenCTM().inverse());
};

const getBBoxCenter = (el) => {
  try { const b = el.getBBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }
  catch { return { x: 0, y: 0 }; }
};

// ── Scan SVG for all addressable elements ─────────────────────────────────────
// Returns [{ id, tag, label }] — skips internal UI elements and non-visual containers
const SKIP_TAGS = new Set(['defs', 'style', 'script', 'title', 'desc', 'metadata', 'symbol', 'filter', 'clippath', 'mask', 'lineargradient', 'radialgradient', 'pattern']);

function scanSvgParts(svgEl) {
  const parts = [];
  const seen = new Set();
  svgEl.querySelectorAll('[id]').forEach((el) => {
    const id = el.id;
    if (!id || id.startsWith('_') || seen.has(id)) return;
    const tag = el.tagName.toLowerCase();
    if (SKIP_TAGS.has(tag)) return;
    // Skip elements with no renderable bbox (zero size)
    try { const b = el.getBBox(); if (b.width === 0 && b.height === 0 && tag !== 'g') return; } catch { return; }
    seen.add(id);
    const inkLabel = el.getAttribute('inkscape:label') || el.getAttribute('data-name') || null;
    parts.push({ id, tag, label: inkLabel || id });
  });
  return parts;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function PoseEditor() {
  const [characters, setCharacters] = useState([]);
  const containerRef = useRef(null);
  const svgRef = useRef(null);

  // All mutable pose/selection state in refs — closures stay fresh
  const posesRef = useRef({});
  const activePartRef = useRef(null);
  const svgPartsRef = useRef([]);   // mirrors svgParts for use inside callbacks
  const historyStackRef = useRef([]);
  const redoStackRef = useRef([]);
  const actionsRef = useRef({});

  const [posesUI, setPosesUI] = useState({});
  const [activePartUI, setActivePartUI] = useState(null);
  const [svgParts, setSvgParts] = useState([]);  // [{ id, tag, label }]
  const [partFilter, setPartFilter] = useState('');

  const [selectedAsset, setSelectedAsset] = useState(null);
  const [loadWarning, setLoadWarning] = useState('');
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [boneMap, setBoneMap] = useState({});       // { boneId → partId }
  const [skeletonOpen, setSkeletonOpen] = useState(false);
  const [savedPoses, setSavedPoses] = useState([]);
  const [poseLibOpen, setPoseLibOpen] = useState(false);
  const [jsonSaveName, setJsonSaveName] = useState('');
  const [jsonSaving, setJsonSaving] = useState(false);
  const [jsonSaveMsg, setJsonSaveMsg] = useState('');

  const loadSavedPoses = () => {
    api.get('/admin/poses').then((r) => setSavedPoses(r.data)).catch(() => {});
  };

  useEffect(() => { getAssets({ category: 'CHARACTER' }).then(setCharacters); loadSavedPoses(); }, []);

  useEffect(() => {
    const handler = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); actionsRef.current.undo?.(); }
      if (e.key === 'y') { e.preventDefault(); actionsRef.current.redo?.(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── Apply all stored transforms to SVG DOM ──────────────────────────────────
  const applyTransforms = () => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    svgPartsRef.current.forEach(({ id }) => {
      const el = svgEl.querySelector(`#${CSS.escape(id)}`);
      if (!el) return;
      const p = posesRef.current[id];
      const hasRotation = p && p.angle !== 0;
      const hasFlip = p && p.flipX;
      const hasTrans = p && ((p.tx ?? 0) !== 0 || (p.ty ?? 0) !== 0);
      if (!hasRotation && !hasFlip && !hasTrans) { el.removeAttribute('transform'); return; }
      const b = el.getBBox();
      const cx = b.x + b.width / 2;
      const txStr = hasTrans ? `translate(${p.tx} ${p.ty}) ` : '';
      if (hasRotation && hasFlip) {
        el.setAttribute('transform', `${txStr}rotate(${p.angle} ${p.hx} ${p.hy}) translate(${2 * cx} 0) scale(-1 1)`);
      } else if (hasRotation) {
        el.setAttribute('transform', `${txStr}rotate(${p.angle} ${p.hx} ${p.hy})`);
      } else if (hasFlip) {
        el.setAttribute('transform', `${txStr}translate(${2 * cx} 0) scale(-1 1)`);
      } else {
        el.setAttribute('transform', `translate(${p.tx} ${p.ty})`);
      }
    });
  };

  // ── Hinge indicator ─────────────────────────────────────────────────────────
  const drawIndicator = () => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    svgEl.querySelector('#_hinge_ui')?.remove();
    const partId = activePartRef.current;
    if (!partId) return;
    const partEl = svgEl.querySelector(`#${CSS.escape(partId)}`);
    if (!partEl) return;

    const p = posesRef.current[partId];
    const txOff = p?.tx ?? 0;
    const tyOff = p?.ty ?? 0;
    const localC = p ? { x: p.hx + txOff, y: p.hy + tyOff } : getBBoxCenter(partEl);
    const c = parentLocalToSvgViewport(partEl, localC.x, localC.y);

    const ns = 'http://www.w3.org/2000/svg';
    const g = document.createElementNS(ns, 'g');
    g.id = '_hinge_ui';

    try {
      const bb = partEl.getBBox();
      const corners = [
        parentLocalToSvgViewport(partEl, bb.x + txOff, bb.y + tyOff),
        parentLocalToSvgViewport(partEl, bb.x + bb.width + txOff, bb.y + tyOff),
        parentLocalToSvgViewport(partEl, bb.x + bb.width + txOff, bb.y + bb.height + tyOff),
        parentLocalToSvgViewport(partEl, bb.x + txOff, bb.y + bb.height + tyOff),
      ];
      const poly = document.createElementNS(ns, 'polygon');
      poly.setAttribute('points', corners.map((pt) => `${pt.x},${pt.y}`).join(' '));
      poly.setAttribute('fill', 'none');
      poly.setAttribute('stroke', '#6B35E8');
      poly.setAttribute('stroke-width', '1');
      poly.setAttribute('stroke-dasharray', '3,2');
      poly.setAttribute('pointer-events', 'none');
      g.appendChild(poly);
    } catch {}

    const mkLine = (x1, y1, x2, y2) => {
      const l = document.createElementNS(ns, 'line');
      l.setAttribute('x1', x1); l.setAttribute('y1', y1);
      l.setAttribute('x2', x2); l.setAttribute('y2', y2);
      l.setAttribute('stroke', '#FF6B35'); l.setAttribute('stroke-width', '1');
      l.setAttribute('pointer-events', 'none');
      return l;
    };
    g.appendChild(mkLine(c.x - 10, c.y, c.x + 10, c.y));
    g.appendChild(mkLine(c.x, c.y - 10, c.x, c.y + 10));

    // Orange hinge circle (pivot point)
    const circle = document.createElementNS(ns, 'circle');
    circle.setAttribute('cx', c.x); circle.setAttribute('cy', c.y);
    circle.setAttribute('r', '6');
    circle.setAttribute('fill', '#FF6B35');
    circle.setAttribute('stroke', '#fff'); circle.setAttribute('stroke-width', '1.5');
    circle.setAttribute('id', '_hinge_circle');
    circle.setAttribute('pointer-events', 'all');
    circle.style.cursor = 'move';
    circle.addEventListener('pointerdown', onHingeDrag);
    g.appendChild(circle);

    try {
      const bb = partEl.getBBox();

      // Green rotation handle at top-right — works for groups too
      const tr = parentLocalToSvgViewport(partEl, bb.x + bb.width + txOff, bb.y + tyOff);
      const rh = document.createElementNS(ns, 'circle');
      rh.setAttribute('cx', tr.x); rh.setAttribute('cy', tr.y);
      rh.setAttribute('r', '9');
      rh.setAttribute('fill', '#16a34a');
      rh.setAttribute('stroke', '#fff'); rh.setAttribute('stroke-width', '1.5');
      rh.setAttribute('id', '_rotate_handle');
      rh.setAttribute('pointer-events', 'all');
      rh.style.cursor = 'crosshair';
      rh.addEventListener('pointerdown', onRotateDrag);
      g.appendChild(rh);
      const rt = document.createElementNS(ns, 'text');
      rt.setAttribute('x', tr.x); rt.setAttribute('y', tr.y + 4);
      rt.setAttribute('text-anchor', 'middle');
      rt.setAttribute('font-size', '11');
      rt.setAttribute('fill', '#fff');
      rt.setAttribute('pointer-events', 'none');
      rt.textContent = '↻';
      g.appendChild(rt);

      // Blue move handle at top-left
      const tl = parentLocalToSvgViewport(partEl, bb.x + txOff, bb.y + tyOff);
      const mh = document.createElementNS(ns, 'circle');
      mh.setAttribute('cx', tl.x); mh.setAttribute('cy', tl.y);
      mh.setAttribute('r', '9');
      mh.setAttribute('fill', '#2563EB');
      mh.setAttribute('stroke', '#fff'); mh.setAttribute('stroke-width', '1.5');
      mh.setAttribute('id', '_move_handle');
      mh.setAttribute('pointer-events', 'all');
      mh.style.cursor = 'grab';
      mh.addEventListener('pointerdown', onMoveDrag);
      g.appendChild(mh);
      const mt = document.createElementNS(ns, 'text');
      mt.setAttribute('x', tl.x); mt.setAttribute('y', tl.y + 4);
      mt.setAttribute('text-anchor', 'middle');
      mt.setAttribute('font-size', '12');
      mt.setAttribute('fill', '#fff');
      mt.setAttribute('pointer-events', 'none');
      mt.textContent = '⤢';
      g.appendChild(mt);

      // Red delete handle at bottom-right
      const br = parentLocalToSvgViewport(partEl, bb.x + bb.width + txOff, bb.y + bb.height + tyOff);
      const dh = document.createElementNS(ns, 'circle');
      dh.setAttribute('cx', br.x); dh.setAttribute('cy', br.y);
      dh.setAttribute('r', '9');
      dh.setAttribute('fill', '#DC2626');
      dh.setAttribute('stroke', '#fff'); dh.setAttribute('stroke-width', '1.5');
      dh.setAttribute('id', '_delete_handle');
      dh.setAttribute('pointer-events', 'all');
      dh.style.cursor = 'pointer';
      dh.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); deletePart(); });
      g.appendChild(dh);
      const dt = document.createElementNS(ns, 'text');
      dt.setAttribute('x', br.x); dt.setAttribute('y', br.y + 4.5);
      dt.setAttribute('text-anchor', 'middle');
      dt.setAttribute('font-size', '13');
      dt.setAttribute('fill', '#fff');
      dt.setAttribute('pointer-events', 'none');
      dt.textContent = '✕';
      g.appendChild(dt);
    } catch {}

    svgEl.appendChild(g);
  };

  // ── Rotation handle drag (rotates the active part, works for groups too) ────
  const onRotateDrag = (e) => {
    e.stopPropagation(); e.preventDefault();
    const svgEl = svgRef.current;
    const partId = activePartRef.current;
    if (!svgEl || !partId) return;
    const partEl = svgEl.querySelector(`#${CSS.escape(partId)}`);
    if (!partEl) return;

    const existingPose = posesRef.current[partId];
    const pivot = existingPose ? { x: existingPose.hx, y: existingPose.hy } : getBBoxCenter(partEl);
    if (!existingPose) {
      posesRef.current = { ...posesRef.current, [partId]: { angle: 0, hx: pivot.x, hy: pivot.y, tx: 0, ty: 0 } };
    }

    const startLocal = toParentLocal(partEl, e.clientX, e.clientY);
    let lastAngle = Math.atan2(startLocal.y - pivot.y, startLocal.x - pivot.x) * (180 / Math.PI);
    let currentRot = posesRef.current[partId]?.angle ?? 0;
    let hasPushed = false;

    const onMove = (ev) => {
      if (!hasPushed) { pushHistory(); hasPushed = true; }
      const local = toParentLocal(partEl, ev.clientX, ev.clientY);
      const newAngle = Math.atan2(local.y - pivot.y, local.x - pivot.x) * (180 / Math.PI);
      let delta = newAngle - lastAngle;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      currentRot += delta;
      lastAngle = newAngle;
      posesRef.current = { ...posesRef.current, [partId]: { ...posesRef.current[partId], angle: Math.round(currentRot * 10) / 10 } };
      setPosesUI({ ...posesRef.current });
      applyTransforms();
    };
    const onUp = () => {
      drawIndicator();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // ── Move drag (translate element to new position) ───────────────────────────
  const onMoveDrag = (e) => {
    e.stopPropagation(); e.preventDefault();
    const svgEl = svgRef.current;
    const partId = activePartRef.current;
    if (!svgEl || !partId) return;
    const partEl = svgEl.querySelector(`#${CSS.escape(partId)}`);
    if (!partEl) return;

    if (!posesRef.current[partId]) {
      const center = getBBoxCenter(partEl);
      posesRef.current = { ...posesRef.current, [partId]: { angle: 0, hx: center.x, hy: center.y, tx: 0, ty: 0 } };
    }

    const startLocal = toParentLocal(partEl, e.clientX, e.clientY);
    const startTx = posesRef.current[partId]?.tx ?? 0;
    const startTy = posesRef.current[partId]?.ty ?? 0;
    let hasPushed = false;

    const onMove = (ev) => {
      if (!hasPushed) { pushHistory(); hasPushed = true; }
      const cur = toParentLocal(partEl, ev.clientX, ev.clientY);
      const newTx = startTx + (cur.x - startLocal.x);
      const newTy = startTy + (cur.y - startLocal.y);
      posesRef.current = { ...posesRef.current, [partId]: { ...posesRef.current[partId], tx: newTx, ty: newTy } };
      setPosesUI({ ...posesRef.current });
      applyTransforms();
      drawIndicator();
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // ── Hinge drag ──────────────────────────────────────────────────────────────
  const onHingeDrag = (e) => {
    e.stopPropagation(); e.preventDefault();
    const svgEl = svgRef.current;
    const partId = activePartRef.current;
    if (!svgEl || !partId) return;
    const partEl = svgEl.querySelector(`#${CSS.escape(partId)}`);
    if (!partEl) return;

    let hasPushed = false;
    const onMove = (ev) => {
      if (!hasPushed) { pushHistory(); hasPushed = true; }
      const local = toParentLocal(partEl, ev.clientX, ev.clientY);
      posesRef.current = { ...posesRef.current, [partId]: { ...(posesRef.current[partId] || { angle: 0 }), hx: local.x, hy: local.y } };
      setPosesUI({ ...posesRef.current });
      const vp = parentLocalToSvgViewport(partEl, local.x, local.y);
      const circ = svgEl.querySelector('#_hinge_circle');
      if (circ) { circ.setAttribute('cx', vp.x); circ.setAttribute('cy', vp.y); }
      const lines = svgEl.querySelectorAll('#_hinge_ui line');
      if (lines[0]) { lines[0].setAttribute('x1', vp.x-10); lines[0].setAttribute('x2', vp.x+10); lines[0].setAttribute('y1', vp.y); lines[0].setAttribute('y2', vp.y); }
      if (lines[1]) { lines[1].setAttribute('x1', vp.x); lines[1].setAttribute('x2', vp.x); lines[1].setAttribute('y1', vp.y-10); lines[1].setAttribute('y2', vp.y+10); }
    };
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // ── Part rotation drag ───────────────────────────────────────────────────────
  const onPartDrag = (e, partId) => {
    if (e.target.id === '_hinge_circle') return;
    e.stopPropagation();
    const svgEl = svgRef.current;
    if (!svgEl) return;

    activePartRef.current = partId;
    setActivePartUI(partId);

    const partEl = svgEl.querySelector(`#${CSS.escape(partId)}`);
    if (!partEl) return;
    const currentPose = posesRef.current[partId];
    const pivot = currentPose ? { x: currentPose.hx, y: currentPose.hy } : getBBoxCenter(partEl);
    if (!currentPose) posesRef.current = { ...posesRef.current, [partId]: { angle: 0, hx: pivot.x, hy: pivot.y, tx: 0, ty: 0 } };

    const startLocal = toParentLocal(partEl, e.clientX, e.clientY);
    let lastAngle = Math.atan2(startLocal.y - pivot.y, startLocal.x - pivot.x) * (180 / Math.PI);
    let currentRot = posesRef.current[partId]?.angle ?? 0;
    let hasPushed = false;

    const onMove = (ev) => {
      if (!hasPushed) { pushHistory(); hasPushed = true; }
      const local = toParentLocal(partEl, ev.clientX, ev.clientY);
      const newAngle = Math.atan2(local.y - pivot.y, local.x - pivot.x) * (180 / Math.PI);
      let delta = newAngle - lastAngle;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      currentRot += delta;
      lastAngle = newAngle;
      posesRef.current = { ...posesRef.current, [partId]: { ...posesRef.current[partId], angle: Math.round(currentRot * 10) / 10 } };
      setPosesUI({ ...posesRef.current });
      applyTransforms();
    };
    const onUp = () => { drawIndicator(); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    drawIndicator();
  };

  // ── Select part from sidebar list ────────────────────────────────────────────
  const selectPart = (partId) => {
    activePartRef.current = partId;
    setActivePartUI(partId);
    if (!posesRef.current[partId]) {
      const svgEl = svgRef.current;
      const el = svgEl?.querySelector(`#${CSS.escape(partId)}`);
      if (el) {
        const center = getBBoxCenter(el);
        posesRef.current = { ...posesRef.current, [partId]: { angle: 0, hx: center.x, hy: center.y, tx: 0, ty: 0 } };
        setPosesUI({ ...posesRef.current });
      }
    }
    drawIndicator();
  };

  // ── Delete element from SVG DOM ─────────────────────────────────────────────
  const deletePart = () => {
    const id = activePartRef.current;
    if (!id) return;
    pushHistory();
    const svgEl = svgRef.current;
    svgEl?.querySelector('#_hinge_ui')?.remove();
    svgEl?.querySelector(`#${CSS.escape(id)}`)?.remove();
    const { [id]: _removed, ...rest } = posesRef.current;
    posesRef.current = rest;
    setPosesUI({ ...rest });
    const newParts = svgPartsRef.current.filter((p) => p.id !== id);
    svgPartsRef.current = newParts;
    setSvgParts(newParts);
    activePartRef.current = null;
    setActivePartUI(null);
  };

  // ── Z-order ──────────────────────────────────────────────────────────────────
  const bringToFront = () => {
    const el = svgRef.current?.querySelector(`#${CSS.escape(activePartRef.current)}`);
    if (el) { pushHistory(); el.parentElement.appendChild(el); setSaveMsg(''); }
  };
  const sendToBack = () => {
    const el = svgRef.current?.querySelector(`#${CSS.escape(activePartRef.current)}`);
    if (el) { pushHistory(); el.parentElement.insertBefore(el, el.parentElement.firstChild); setSaveMsg(''); }
  };

  // ── Flip ────────────────────────────────────────────────────────────────────
  const flipPart = () => {
    const id = activePartRef.current;
    if (!id) return;
    pushHistory();
    const el = svgRef.current?.querySelector(`#${CSS.escape(id)}`);
    if (!el) return;
    const cur = posesRef.current[id];
    if (!cur) {
      const center = getBBoxCenter(el);
      posesRef.current = { ...posesRef.current, [id]: { angle: 0, hx: center.x, hy: center.y, tx: 0, ty: 0, flipX: true } };
    } else {
      posesRef.current = { ...posesRef.current, [id]: { ...cur, flipX: !cur.flipX } };
    }
    setPosesUI({ ...posesRef.current });
    applyTransforms();
    drawIndicator();
  };

  // ── Load SVG ─────────────────────────────────────────────────────────────────
  const loadSvg = useCallback(async (asset) => {
    setSelectedAsset(asset);
    posesRef.current = {};
    activePartRef.current = null;
    svgPartsRef.current = [];
    setPosesUI({});
    setActivePartUI(null);
    setSvgParts([]);
    setPartFilter('');
    setSaveName(`${asset.name} - Pose`);
    setSaveMsg('');
    setLoadWarning('');
    setBoneMap({});

    if (!asset.filePath.toLowerCase().endsWith('.svg')) {
      if (containerRef.current) containerRef.current.innerHTML = '';
      setLoadWarning(`"${asset.name}" is a ${asset.filePath.split('.').pop().toUpperCase()} file — Pose Editor only works with SVG files.`);
      return;
    }

    const res = await fetch(asset.filePath);
    let text = await res.text();
    if (!containerRef.current) return;
    containerRef.current.innerHTML = fixSvgRefs(text);

    const svgEl = containerRef.current.querySelector('svg');
    if (!svgEl) { setLoadWarning('Could not parse SVG.'); return; }

    svgRef.current = svgEl;
    svgEl.removeAttribute('width');
    svgEl.removeAttribute('height');
    svgEl.style.width = '100%';
    svgEl.style.height = '100%';

    // Scan all named elements
    const parts = scanSvgParts(svgEl);
    svgPartsRef.current = parts;
    setSvgParts(parts);

    if (parts.length === 0) {
      setLoadWarning('No elements with IDs found in this SVG. Add IDs to layers/groups in your design tool (Illustrator, Inkscape, Figma) and re-export.');
      return;
    }

    // Attach drag listeners to every found element
    parts.forEach(({ id }) => {
      const el = svgEl.querySelector(`#${CSS.escape(id)}`);
      if (!el) return;
      el.style.cursor = 'grab';
      el.addEventListener('pointerdown', (e) => onPartDrag(e, id));
    });

    // Click on blank SVG area → deselect
    svgEl.addEventListener('pointerdown', (e) => {
      if (e.target === svgEl) {
        activePartRef.current = null;
        setActivePartUI(null);
        drawIndicator();
      }
    });
  }, []);

  // ── Save ────────────────────────────────────────────────────────────────────
  const savePose = async () => {
    const svgEl = svgRef.current;
    if (!svgEl || !saveName.trim()) return;
    setSaving(true); setSaveMsg('');
    svgEl.querySelector('#_hinge_ui')?.remove();
    const svgContent = new XMLSerializer().serializeToString(svgEl);
    drawIndicator();
    try {
      const res = await api.post('/admin/assets/save-pose', { name: saveName.trim(), svgContent });
      setSaveMsg(`✓ Saved "${res.data.name}"`);
    } catch (err) {
      setSaveMsg('Failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setSaving(false);
    }
  };

  const resetPart = () => {
    const id = activePartRef.current;
    if (!id) return;
    const { [id]: _removed, ...rest } = posesRef.current;
    posesRef.current = rest;
    setPosesUI({ ...rest });
    applyTransforms();
    drawIndicator();
  };

  const resetAll = () => {
    posesRef.current = {};
    setPosesUI({});
    applyTransforms();
    drawIndicator();
  };

  // ── Apply a pose preset using the current boneMap ───────────────────────────
  const applyPreset = (preset) => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    pushHistory();
    // Reset all mapped bones to 0 first, then apply preset rotations
    const next = { ...posesRef.current };
    BONES.forEach(({ id: bone }) => {
      const partId = boneMap[bone];
      if (!partId) return;
      const partEl = svgEl.querySelector(`#${CSS.escape(partId)}`);
      if (!partEl) return;
      let hinge;
      try { hinge = autoHinge(bone, partEl.getBBox()); } catch { hinge = getBBoxCenter(partEl); }
      const angle = preset.rotations[bone] ?? 0;
      next[partId] = { ...(next[partId] || {}), angle, hx: hinge.hx, hy: hinge.hy, tx: next[partId]?.tx ?? 0, ty: next[partId]?.ty ?? 0 };
    });
    posesRef.current = next;
    setPosesUI({ ...next });
    applyTransforms();
    drawIndicator();
  };

  // ── JSON pose save / load ───────────────────────────────────────────────────
  const extractBoneRotations = () => {
    const result = {};
    BONES.forEach(({ id: bone }) => {
      const partId = boneMap[bone];
      if (!partId) return;
      const angle = posesRef.current[partId]?.angle;
      if (angle != null && angle !== 0) result[bone] = angle;
    });
    return result;
  };

  const saveJsonPose = async () => {
    if (!jsonSaveName.trim()) return;
    setJsonSaving(true); setJsonSaveMsg('');
    try {
      await api.post('/admin/poses', { name: jsonSaveName.trim(), rotations: extractBoneRotations() });
      setJsonSaveMsg('✓ Saved');
      setJsonSaveName('');
      loadSavedPoses();
    } catch (err) {
      setJsonSaveMsg('Failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setJsonSaving(false);
    }
  };

  const deleteJsonPose = async (id) => {
    try {
      await api.delete(`/admin/poses/${id}`);
      loadSavedPoses();
    } catch {}
  };

  // ── Undo / Redo ─────────────────────────────────────────────────────────────
  const captureSnapshot = () => {
    const svgEl = svgRef.current;
    if (!svgEl) return null;
    const hingeUi = svgEl.querySelector('#_hinge_ui');
    if (hingeUi) hingeUi.remove();
    const svgHTML = svgEl.outerHTML;
    drawIndicator();
    return {
      svgHTML,
      poses: JSON.parse(JSON.stringify(posesRef.current)),
      parts: [...svgPartsRef.current],
      activePartId: activePartRef.current,
    };
  };

  const pushHistory = () => {
    const snap = captureSnapshot();
    if (!snap) return;
    historyStackRef.current.push(snap);
    redoStackRef.current = [];
    if (historyStackRef.current.length > 50) historyStackRef.current.shift();
  };

  const restoreSnapshot = (snap) => {
    if (!containerRef.current || !snap) return;
    containerRef.current.innerHTML = fixSvgRefs(snap.svgHTML);
    const svgEl = containerRef.current.querySelector('svg');
    if (!svgEl) return;
    svgRef.current = svgEl;
    svgEl.style.width = '100%';
    svgEl.style.height = '100%';
    posesRef.current = snap.poses;
    svgPartsRef.current = snap.parts;
    setPosesUI({ ...snap.poses });
    setSvgParts(snap.parts);
    snap.parts.forEach(({ id }) => {
      const el = svgEl.querySelector(`#${CSS.escape(id)}`);
      if (!el) return;
      el.style.cursor = 'grab';
      el.addEventListener('pointerdown', (e) => onPartDrag(e, id));
    });
    svgEl.addEventListener('pointerdown', (e) => {
      if (e.target === svgEl) { activePartRef.current = null; setActivePartUI(null); drawIndicator(); }
    });
    const restoreId = snap.activePartId;
    if (restoreId && snap.parts.find((p) => p.id === restoreId)) {
      activePartRef.current = restoreId;
      setActivePartUI(restoreId);
    } else {
      activePartRef.current = null;
      setActivePartUI(null);
    }
    applyTransforms();
    drawIndicator();
  };

  const undoAction = () => {
    if (historyStackRef.current.length === 0) return;
    const current = captureSnapshot();
    if (current) redoStackRef.current.push(current);
    restoreSnapshot(historyStackRef.current.pop());
  };

  const redoAction = () => {
    if (redoStackRef.current.length === 0) return;
    const current = captureSnapshot();
    if (current) historyStackRef.current.push(current);
    restoreSnapshot(redoStackRef.current.pop());
  };

  actionsRef.current.undo = undoAction;
  actionsRef.current.redo = redoAction;

  const currentPose = activePartUI ? posesUI[activePartUI] : null;
  const activePart = svgParts.find((p) => p.id === activePartUI);

  // Filtered parts for sidebar list
  const filteredParts = partFilter
    ? svgParts.filter((p) => p.label.toLowerCase().includes(partFilter.toLowerCase()) || p.tag.toLowerCase().includes(partFilter.toLowerCase()))
    : svgParts;

  // Group counts for info strip
  const tagCounts = svgParts.reduce((acc, p) => { acc[p.tag] = (acc[p.tag] || 0) + 1; return acc; }, {});

  return (
    <div style={s.root}>

      {/* ── Left panel: parts list + controls ── */}
      <div style={s.leftPanel}>

        {/* Character picker */}
        <p style={s.sectionLabel}>Character</p>
        <select style={s.select} onChange={(e) => {
          const a = characters.find((c) => c.id === e.target.value);
          if (a) loadSvg(a);
        }}>
          <option value="">— choose —</option>
          {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        {/* Parts list */}
        {svgParts.length > 0 && <>
          <div style={s.divider} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <p style={{ ...s.sectionLabel, margin: 0 }}>SVG Elements <span style={s.badge}>{svgParts.length}</span></p>
          </div>

          {/* Tag type summary */}
          <div style={s.tagSummary}>
            {Object.entries(tagCounts).map(([tag, count]) => {
              const m = tagMeta(tag);
              return (
                <span key={tag} style={{ ...s.tagBadge, background: m.bg, color: m.color }}>
                  {m.label} ×{count}
                </span>
              );
            })}
          </div>

          {/* Filter input */}
          <input
            style={s.filterInput}
            placeholder="Filter by name or type…"
            value={partFilter}
            onChange={(e) => setPartFilter(e.target.value)}
          />

          {/* Scrollable parts list */}
          <div style={s.partsList}>
            {filteredParts.map(({ id, tag, label }) => {
              const m = tagMeta(tag);
              const isActive = activePartUI === id;
              const hasPose = !!posesUI[id];
              return (
                <button
                  key={id}
                  style={{ ...s.partRow, background: isActive ? '#f0ebff' : '#fff', borderColor: isActive ? '#7C3AED' : '#e5e7eb' }}
                  onClick={() => selectPart(id)}
                  title={`<${tag} id="${id}">`}
                >
                  <span style={{ ...s.tagPill, background: m.bg, color: m.color }}>{m.label}</span>
                  <span style={{ ...s.partLabel, fontWeight: isActive ? 700 : 500, color: isActive ? '#7C3AED' : '#111' }}>{label}</span>
                  {hasPose && <span style={s.poseDot} title="Has pose data" />}
                </button>
              );
            })}
            {filteredParts.length === 0 && <p style={s.emptyMsg}>No matches</p>}
          </div>
        </>}

        {/* Selected part controls */}
        {activePartUI && <>
          <div style={s.divider} />
          <p style={s.sectionLabel}>Selected: <span style={{ color: '#7C3AED' }}>{activePartUI}</span></p>

          <div style={s.infoBox}>
            <div style={{ display: 'flex', gap: 12, marginBottom: 4 }}>
              <span style={s.hint}>Angle <strong>{currentPose?.angle?.toFixed(1) ?? 0}°</strong></span>
              <span style={s.hint}>Hinge <strong>{currentPose ? `${currentPose.hx.toFixed(0)},${currentPose.hy.toFixed(0)}` : 'center'}</strong></span>
            </div>
            <input
              type="range" min="-180" max="180" step="0.5"
              value={currentPose?.angle ?? 0}
              onChange={(e) => {
                const angle = parseFloat(e.target.value);
                const id = activePartUI;
                const svgEl = svgRef.current;
                const partEl = svgEl?.querySelector(`#${CSS.escape(id)}`);
                if (!partEl) return;
                if (!posesRef.current[id]) {
                  const center = getBBoxCenter(partEl);
                  posesRef.current = { ...posesRef.current, [id]: { angle, hx: center.x, hy: center.y, tx: 0, ty: 0 } };
                } else {
                  posesRef.current = { ...posesRef.current, [id]: { ...posesRef.current[id], angle } };
                }
                setPosesUI({ ...posesRef.current });
                applyTransforms();
                drawIndicator();
              }}
              style={{ width: '100%', accentColor: '#7C3AED', marginBottom: 8 }}
            />
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ ...s.hint, flexShrink: 0 }}>Position</span>
              {['tx', 'ty'].map((axis) => (
                <label key={axis} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#6B7280' }}>
                  {axis === 'tx' ? 'X' : 'Y'}
                  <input
                    type="number" step="1"
                    value={Math.round(currentPose?.[axis] ?? 0)}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      const id = activePartUI;
                      const svgEl = svgRef.current;
                      const partEl = svgEl?.querySelector(`#${CSS.escape(id)}`);
                      if (!partEl) return;
                      if (!posesRef.current[id]) {
                        const center = getBBoxCenter(partEl);
                        posesRef.current = { ...posesRef.current, [id]: { angle: 0, hx: center.x, hy: center.y, tx: 0, ty: 0, [axis]: val } };
                      } else {
                        posesRef.current = { ...posesRef.current, [id]: { ...posesRef.current[id], [axis]: val } };
                      }
                      setPosesUI({ ...posesRef.current });
                      applyTransforms();
                      drawIndicator();
                    }}
                    style={{ width: 56, padding: '3px 5px', borderRadius: 5, border: '1.5px solid #d1d5db', fontSize: 12, textAlign: 'center' }}
                  />
                </label>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <button style={s.smallBtn} onClick={flipPart}
              title="Mirror horizontally">
              ↔ Flip {posesUI[activePartUI]?.flipX ? '(on)' : '(off)'}
            </button>
            <button style={s.smallBtn} onClick={bringToFront}>↑ Front</button>
            <button style={s.smallBtn} onClick={sendToBack}>↓ Back</button>
            <button style={{ ...s.smallBtn, color: '#DC2626' }} onClick={resetPart}>↺ Reset</button>
            <button style={{ ...s.smallBtn, color: '#fff', background: '#DC2626', borderColor: '#DC2626' }} onClick={deletePart}>🗑 Delete</button>
          </div>
        </>}

        {selectedAsset && svgParts.length > 0 && <>
          <div style={s.divider} />
          <button
            style={{ ...s.smallBtn, width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            onClick={() => setSkeletonOpen((v) => !v)}
          >
            <span>🦴 Skeleton Setup</span>
            <span style={{ fontSize: 10, color: '#6B7280' }}>{skeletonOpen ? '▲ hide' : '▼ show'}</span>
          </button>
          {skeletonOpen && (
            <div style={{ background: '#f8f9ff', borderRadius: 8, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <p style={{ ...s.sectionLabel, margin: '0 0 4px' }}>Map parts → bones</p>
              {BONES.map(({ id: bone, label }) => (
                <div key={bone} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, color: '#374151', width: 90, flexShrink: 0 }}>{label}</span>
                  <select
                    style={{ flex: 1, fontSize: 11, padding: '3px 5px', borderRadius: 5, border: '1.5px solid #e5e7eb', background: boneMap[bone] ? '#f0fdf4' : '#fff' }}
                    value={boneMap[bone] || ''}
                    onChange={(e) => setBoneMap((prev) => ({ ...prev, [bone]: e.target.value || undefined }))}
                  >
                    <option value="">— none —</option>
                    {svgParts.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </div>
              ))}
              <p style={{ fontSize: 10, color: '#9CA3AF', marginTop: 4 }}>
                {Object.values(boneMap).filter(Boolean).length} / {BONES.length} bones mapped
              </p>
            </div>
          )}
        </>}

        {selectedAsset && svgParts.length > 0 && Object.values(boneMap).some(Boolean) && <>
          <div style={s.divider} />
          <p style={s.sectionLabel}>💾 Save Pose (JSON)</p>
          <input style={s.input} value={jsonSaveName} onChange={(e) => setJsonSaveName(e.target.value)} placeholder="Pose name…" />
          <button style={s.saveBtn} onClick={saveJsonPose} disabled={jsonSaving || !jsonSaveName.trim()}>
            {jsonSaving ? 'Saving…' : 'Save Current Pose'}
          </button>
          {jsonSaveMsg && <p style={s.msg}>{jsonSaveMsg}</p>}
        </>}

        {savedPoses.length > 0 && selectedAsset && <>
          <div style={s.divider} />
          <button
            style={{ ...s.smallBtn, width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            onClick={() => setPoseLibOpen((v) => !v)}
          >
            <span>📚 Pose Library <span style={s.badge}>{savedPoses.length}</span></span>
            <span style={{ fontSize: 10, color: '#6B7280' }}>{poseLibOpen ? '▲ hide' : '▼ show'}</span>
          </button>
          {poseLibOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
              {savedPoses.map((pose) => (
                <div key={pose.id} style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#f8f9ff', borderRadius: 7, padding: '5px 8px' }}>
                  <span style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={pose.name}>{pose.name}</span>
                  <button
                    style={{ ...s.smallBtn, padding: '3px 8px', fontSize: 11, background: Object.values(boneMap).some(Boolean) ? '#7C3AED' : '#e5e7eb', color: Object.values(boneMap).some(Boolean) ? '#fff' : '#9CA3AF', borderColor: Object.values(boneMap).some(Boolean) ? '#7C3AED' : '#e5e7eb' }}
                    onClick={() => applyPreset({ rotations: pose.rotations })}
                    disabled={!Object.values(boneMap).some(Boolean)}
                    title={Object.values(boneMap).some(Boolean) ? 'Apply this pose' : 'Map bones first'}
                  >Apply</button>
                  <button
                    style={{ ...s.smallBtn, padding: '3px 8px', fontSize: 11, color: '#DC2626', borderColor: '#fca5a5' }}
                    onClick={() => deleteJsonPose(pose.id)}
                    title="Delete pose"
                  >✕</button>
                </div>
              ))}
            </div>
          )}
        </>}

        {selectedAsset && <>
          <div style={s.divider} />
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={s.smallBtn} onClick={undoAction} title="Undo (Ctrl+Z)">↩ Undo</button>
            <button style={s.smallBtn} onClick={redoAction} title="Redo (Ctrl+Y)">↪ Redo</button>
          </div>
          <button style={{ ...s.smallBtn, alignSelf: 'flex-start' }} onClick={resetAll}>↺ Reset All Poses</button>

          <div style={s.divider} />
          <p style={s.sectionLabel}>Save Pose</p>
          <input style={s.input} value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="Pose name…" />
          <button style={s.saveBtn} onClick={savePose} disabled={saving || !saveName.trim()}>
            {saving ? 'Saving…' : 'Save as New Asset'}
          </button>
          {saveMsg && <p style={s.msg}>{saveMsg}</p>}
        </>}

        {/* How-to */}
        {!selectedAsset && (
          <div style={{ ...s.howto, marginTop: 12 }}>
            <strong>How to use</strong>
            <ol style={{ paddingLeft: 16, marginTop: 6, lineHeight: 2, fontSize: 12 }}>
              <li>Select an SVG character above</li>
              <li>All named elements (groups, paths, etc.) appear in the list</li>
              <li>Click a part in the list <em>or</em> directly on the canvas</li>
              <li>Drag the <span style={{ color: '#FF6B35' }}>● orange dot</span> to set the joint pivot</li>
              <li>Drag the <span style={{ color: '#16a34a' }}>● green ↻ dot</span> (top-right) to rotate — works on groups</li>
              <li>Drag the <span style={{ color: '#2563EB' }}>● blue ⤢ dot</span> (top-left) to move/reposition</li>
              <li>Click the <span style={{ color: '#DC2626' }}>● red ✕ dot</span> (bottom-right) to delete the element</li>
              <li>Or use the angle slider / X·Y number inputs in the controls panel</li>
              <li>Use Flip / Front / Back as needed</li>
              <li>Name and Save when done</li>
            </ol>
          </div>
        )}
      </div>

      {/* ── Canvas ── */}
      <div style={s.canvasCol}>
        {/* Pose presets strip */}
        {selectedAsset && Object.values(boneMap).some(Boolean) && (
          <div style={s.presetsStrip}>
            <span style={{ ...s.sectionLabel, flexShrink: 0, alignSelf: 'center' }}>Poses</span>
            <div style={s.presetsScroll}>
              {POSE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  style={s.presetBtn}
                  onClick={() => applyPreset(preset)}
                  title={preset.label}
                >
                  <span style={{ fontSize: 18 }}>{preset.emoji}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: '#374151', marginTop: 2 }}>{preset.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {selectedAsset && !Object.values(boneMap).some(Boolean) && svgParts.length > 0 && (
          <div style={s.poseHint}>
            🦴 Open <strong>Skeleton Setup</strong> in the left panel to map bones, then pose presets appear here.
          </div>
        )}

        {loadWarning && (
          <div style={s.warningBox}>
            <strong>⚠ Cannot load</strong>
            <p style={{ margin: '6px 0 0', fontSize: 12, lineHeight: 1.6 }}>{loadWarning}</p>
          </div>
        )}
        <div style={s.canvas}>
          {!selectedAsset && <p style={s.placeholder}>← Select a character to start posing</p>}
          <div ref={containerRef} style={s.svgWrap} />
        </div>
      </div>
    </div>
  );
}

const s = {
  root: { display: 'flex', gap: 20, alignItems: 'flex-start' },

  leftPanel: { width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 },

  sectionLabel: { fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1 },
  badge: { display: 'inline-block', background: '#7C3AED', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 10, marginLeft: 6, fontWeight: 700 },

  select: { width: '100%', padding: '7px 10px', borderRadius: 6, border: '1.5px solid var(--border)', fontSize: 13, background: '#fff' },
  input:  { width: '100%', padding: '7px 10px', borderRadius: 6, border: '1.5px solid var(--border)', fontSize: 13, background: '#fff', boxSizing: 'border-box' },

  filterInput: { width: '100%', padding: '6px 10px', borderRadius: 6, border: '1.5px solid #e5e7eb', fontSize: 12, background: '#f9fafb', outline: 'none', boxSizing: 'border-box' },

  tagSummary: { display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 },
  tagBadge:   { fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10 },

  partsList: { maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3, border: '1px solid #e5e7eb', borderRadius: 8, padding: 6, background: '#fafafa' },
  partRow:   { display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', border: '1.5px solid #e5e7eb', borderRadius: 7, cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'all 0.12s' },
  tagPill:   { fontSize: 9, fontWeight: 800, padding: '2px 5px', borderRadius: 6, flexShrink: 0, letterSpacing: 0.3 },
  partLabel: { fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 },
  poseDot:   { width: 7, height: 7, borderRadius: '50%', background: '#F97316', flexShrink: 0 },
  emptyMsg:  { fontSize: 12, color: '#9CA3AF', textAlign: 'center', padding: 8 },

  infoBox: { background: '#f5f3ff', borderRadius: 8, padding: '8px 12px' },
  hint: { fontSize: 12, color: '#6B7280', lineHeight: 1.8 },

  smallBtn: { background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 6, padding: '5px 10px', fontSize: 12, cursor: 'pointer', fontWeight: 500 },
  saveBtn:  { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginTop: 4, width: '100%' },
  msg:      { fontSize: 12, color: '#16a34a', marginTop: 4 },
  divider:  { borderTop: '1px solid #e5e7eb', margin: '6px 0' },
  howto:    { background: '#f8f9ff', borderRadius: 8, padding: '12px 14px', fontSize: 12, color: '#6B7280' },

  canvasCol:   { flex: 1, display: 'flex', flexDirection: 'column', gap: 10 },
  presetsStrip: { display: 'flex', alignItems: 'flex-start', gap: 10, background: '#f8f9ff', borderRadius: 10, padding: '8px 12px', border: '1.5px solid #e5e7eb' },
  presetsScroll: { display: 'flex', gap: 6, overflowX: 'auto', flex: 1, paddingBottom: 4 },
  presetBtn: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '6px 10px', borderRadius: 8, border: '1.5px solid #e5e7eb', background: '#fff', cursor: 'pointer', flexShrink: 0, minWidth: 56, transition: 'all 0.12s' },
  poseHint: { background: '#fffbeb', border: '1.5px solid #fbbf24', borderRadius: 8, padding: '8px 14px', fontSize: 12, color: '#92400e' },
  warningBox:  { background: '#fff3cd', border: '1.5px solid #f59e0b', borderRadius: 10, padding: '12px 16px', color: '#92400e' },
  canvas:      { flex: 1, minHeight: 620, background: '#e8e8e8', borderRadius: 12, border: '2px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' },
  svgWrap:     { width: '100%', height: 620 },
  placeholder: { color: '#9CA3AF', fontSize: 14, position: 'absolute', textAlign: 'center' },
};
