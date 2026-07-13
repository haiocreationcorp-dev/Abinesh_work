import { useRef, useState, useEffect, useMemo, Fragment } from 'react';
import { useComic } from '../../context/ComicContext.jsx';
import { useDrag } from '../../context/DragContext.jsx';
import CharacterRig from './CharacterRig.jsx';
import FaceRig from './FaceRig.jsx';
import DressRig from './DressRig.jsx';
import CharacterPresetRig from './CharacterPresetRig.jsx';
import { useLightingOverlays, hexToRgb } from '../../lighting/lightingEngine.js';
import { recolorSkin } from '../../utils/recolorImage.js';
import { correctText } from '../../utils/spellCheck.js';
import AIQuickMenu from './AIQuickMenu.jsx';

const BG_MODE_CSS = {
  warm:      'sepia(0.25) saturate(1.5) brightness(1.05) hue-rotate(-10deg)',
  cool:      'hue-rotate(195deg) saturate(0.85) brightness(1.0)',
  golden:    'sepia(0.45) saturate(1.6) brightness(1.1) hue-rotate(-15deg)',
  vintage:   'sepia(0.55) contrast(0.85) brightness(0.9) saturate(0.7)',
  noir:      'grayscale(1) contrast(1.2) brightness(0.9)',
  vivid:     'saturate(2.0) contrast(1.1)',
  faded:     'saturate(0.45) brightness(1.15) contrast(0.75)',
  dramatic:  'contrast(1.5) brightness(0.82) saturate(1.3)',
  dreamy:    'brightness(1.1) saturate(1.35) blur(0.6px) hue-rotate(15deg)',
  cyberpunk: 'hue-rotate(265deg) saturate(2.2) contrast(1.2) brightness(0.95)',
  horror:    'hue-rotate(345deg) saturate(0.6) contrast(1.45) brightness(0.65)',
};

const KIND_KEY = {
  CHARACTER: 'characters',
  FACE: 'faces',
  CHARACTER_PRESET: 'characterPresets',
  PROP: 'props',
  EFFECT: 'effects',
  COSTUME: 'costumes',
  SOUND: 'sounds',
  BUBBLE: 'speechBubbles',
};

const BASE_W = 120;
const BASE_H = 200;

// Shared min/max for any character/prop/effect scale-zoom (wheel, corner-drag, or
// pinch) — lowered from the old 10x ceiling, then halved again per the user's request.
const SCALE_MIN = 0.15;
const SCALE_MAX = 3;

// Renders a placed character, applying the exact-pixel skin color swap (if any) to a
// flat CharacterRig image; DressRig handles its own per-part skin recoloring internally.
function RenderedCharacter({ char, onDressSize }) {
  const [recoloredFilePath, setRecoloredFilePath] = useState(null);

  useEffect(() => {
    if (char.dressMode || !char.skinPreset) { setRecoloredFilePath(null); return; }
    let active = true;
    recolorSkin(char.filePath, char.skinPreset).then((url) => { if (active) setRecoloredFilePath(url); });
    return () => { active = false; };
  }, [char.filePath, char.skinPreset, char.dressMode]);

  if (char.dressMode && char.layoutPath) {
    return <DressRig character={char} onSize={onDressSize} />;
  }
  return <CharacterRig character={recoloredFilePath ? { ...char, filePath: recoloredFilePath } : char} />;
}

// ── SVG bubble cache ─────────────────────────────────────────────────────────
const svgCache = {};

function hexLum(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return r * 0.299 + g * 0.587 + b * 0.114;
}
function isGray(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return Math.max(r, g, b) - Math.min(r, g, b) < 35;
}

// Same content-bounds tightening as the live bubble's viewBox effect below, but operating on a
// detached SVG string (off-DOM) — used by the canvas exporter so rasterized bubbles match the editor.
export function tightenSvgViewBoxString(svgString, flipX) {
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-99999px';
  container.style.top = '0';
  container.style.visibility = 'hidden';
  container.innerHTML = svgString;
  document.body.appendChild(container);
  try {
    const svgEl = container.querySelector('svg');
    if (!svgEl) return svgString;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    svgEl.querySelectorAll('path, rect, circle, ellipse, polygon, polyline').forEach((el) => {
      if (el.getAttribute('display') === 'none') return;
      if (el.getAttribute('fill') === 'none') return;
      if (el.style && el.style.fill === 'none') return;
      try {
        const bb = el.getBBox();
        if (bb.width === 0 && bb.height === 0) return;
        minX = Math.min(minX, bb.x); minY = Math.min(minY, bb.y);
        maxX = Math.max(maxX, bb.x + bb.width); maxY = Math.max(maxY, bb.y + bb.height);
      } catch (_) {}
    });
    if (minX !== Infinity) {
      const pad = 3;
      let vbX, vbW;
      if (flipX) {
        const origVbParts = svgEl.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number) || [];
        const origVbMinX = origVbParts[0] ?? 0;
        const origVbW    = origVbParts[2] ?? 210;
        const tx = 2 * origVbMinX + origVbW;
        vbX = tx - maxX - pad;
        vbW = (maxX - minX) + pad * 2;
      } else {
        vbX = minX - pad;
        vbW = maxX - minX + pad * 2;
      }
      svgEl.setAttribute('viewBox', `${vbX} ${minY - pad} ${vbW} ${maxY - minY + pad * 2}`);
    }
    return svgEl.outerHTML;
  } finally {
    document.body.removeChild(container);
  }
}

export function processBubbleSvg(raw, fillColor, strokeColor, showShadow, flipX, strokeWidth) {
  let s = raw;

  // Extract hex colors from BOTH fill="COLOR" attribute AND style="...fill:COLOR..." (Inkscape)
  const allFills = [...new Set([
    ...[...s.matchAll(/\bfill="(#[0-9a-fA-F]{6})"/gi)].map((m) => m[1].toLowerCase()),
    ...[...s.matchAll(/\bfill:\s*(#[0-9a-fA-F]{6})/gi)].map((m) => m[1].toLowerCase()),
  ])];

  const bodyFills = allFills.filter((c) => !isGray(c) && hexLum(c) > 20);
  const outlineFill = allFills.reduce((prev, curr) => hexLum(curr) < hexLum(prev) ? curr : prev, '#ffffff');
  // Exclude outlineFill so a dark brownish outline isn't misidentified as shadow
  const shadowFills = allFills.filter((c) => isGray(c) && hexLum(c) < 220 && hexLum(c) > 20 && c !== outlineFill);

  // Global color replacement works for both fill="COLOR" and style="...fill:COLOR..."
  for (const c of bodyFills) {
    s = s.replace(new RegExp(c, 'gi'), fillColor);
  }
  if (outlineFill !== '#ffffff') {
    s = s.replace(new RegExp(outlineFill, 'gi'), strokeColor);
  }

  if (!showShadow) {
    // PRIMARY: Inkscape SVGs — element tagged inkscape:label="bubble-shadow"
    // [^>]* matches newlines (it's "not >", not ".") so multi-line tags work
    s = s.replace(
      /(<[a-z][a-z0-9]*\b[^>]*\binkscape:label=["']bubble-shadow["'][^>]*\/?>)/gi,
      (match) => {
        let m = match;
        // style="...fill:#COLOR..." → style="...fill:none..."
        m = m.replace(/(\bstyle="[^"]*)(\bfill:\s*#[0-9a-fA-F]{6})/gi, '$1fill:none');
        // fill="#COLOR" attribute → fill="none"
        m = m.replace(/\bfill="#[0-9a-fA-F]{6}"/gi, 'fill="none"');
        return m;
      }
    );

    // FALLBACK: ChatGPT-format SVGs without inkscape:label
    for (const c of shadowFills) {
      s = s.replace(new RegExp(`fill="${c}"`, 'gi'), `fill="none"`);
      s = s.replace(new RegExp(`fill='${c}'`, 'gi'), `fill='none'`);
      s = s.replace(new RegExp(`fill:\\s*${c}`, 'gi'), `fill:none`);
    }
  }

  // Apply custom stroke width if provided
  if (strokeWidth && strokeWidth !== 2) {
    s = s.replace(/stroke-width="[\d.]+"/g, `stroke-width="${strokeWidth}"`);
    s = s.replace(/stroke-width:\s*[\d.]+/g, `stroke-width:${strokeWidth}`);
  }

  // Make SVG fill its container
  s = s.replace(/<svg([^>]*)>/i, (m, attrs) => {
    let a = attrs.replace(/\s+width="[^"]*"/gi, '').replace(/\s+height="[^"]*"/gi, '');
    if (!a.includes('preserveAspectRatio')) a += ' preserveAspectRatio="none"';
    return `<svg${a} width="100%" height="100%">`;
  });

  // Bake the horizontal flip into the SVG string as a <g transform> — zero CSS transforms,
  // so Edge cannot possibly bleed the flip into sibling HTML element text rendering.
  if (flipX) {
    const vbMatch = s.match(/viewBox=["']([^"']+)["']/i);
    if (vbMatch) {
      const parts = vbMatch[1].trim().split(/[\s,]+/).map(Number);
      if (parts.length >= 4 && isFinite(parts[0]) && isFinite(parts[2])) {
        const tx = 2 * parts[0] + parts[2];
        s = s.replace(/(<svg[^>]*>)/i, `$1<g transform="translate(${tx},0) scale(-1,1)">`);
        s = s.replace(/<\/svg>/i, `</g></svg>`);
        console.log('[BubbleFlip] applied g-transform tx=', tx);
      }
    }
  }

  return s;
}

function BubblePlacedItem({ bubble, panelIndex, canvasRef, canvasW, isSelected, onSelect, dispatch, onOpenAI }) {
  const [rawSvg, setRawSvg] = useState(svgCache[bubble.filePath] || null);
  const svgContainerRef = useRef(null);
  const outerRef = useRef(null);
  const textRef = useRef(null);
  const lastSavedText = useRef(null);

  useEffect(() => {
    if (svgCache[bubble.filePath]) { setRawSvg(svgCache[bubble.filePath]); return; }
    fetch(bubble.filePath)
      .then((r) => r.text())
      .then((t) => { svgCache[bubble.filePath] = t; setRawSvg(t); })
      .catch(() => {});
  }, [bubble.filePath]);

  const processedSvg = useMemo(() => {
    if (!rawSvg) return null;
    return processBubbleSvg(rawSvg, bubble.fillColor || '#F5C518', bubble.strokeColor || '#000000', bubble.showShadow !== false, bubble.flipX || false, bubble.strokeWidth);
  }, [rawSvg, bubble.fillColor, bubble.strokeColor, bubble.showShadow, bubble.flipX, bubble.strokeWidth]);

  // Focus outer div when selected; blur contentEditable when deselected so cursor stops blinking
  useEffect(() => {
    if (isSelected) {
      outerRef.current?.focus();
    } else {
      textRef.current?.blur();
    }
  }, [isSelected]);

  // Seed innerHTML when this bubble becomes selected (contentEditable mounts) or text changes externally (undo/redo).
  useEffect(() => {
    if (!isSelected) return;
    const el = textRef.current;
    if (!el) return;
    el.innerHTML = bubble.text || '';
    lastSavedText.current = bubble.text || '';
  }, [isSelected]); // eslint-disable-line

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    if (lastSavedText.current === null || bubble.text !== lastSavedText.current) {
      el.innerHTML = bubble.text || '';
      lastSavedText.current = bubble.text || '';
      const needed = Math.ceil(el.scrollHeight / 0.75) + 16;
      if (needed > (bubble.height || 150)) {
        dispatch({ type: 'UPDATE_PANEL_BUBBLE', panelIndex, instanceId: bubble.instanceId, updates: { height: needed } });
      }
    }
  }, [bubble.text]); // eslint-disable-line

  // Tighten SVG viewBox to content bounds. Flip is already baked into processedSvg as a
  // <g transform="translate(tx,0) scale(-1,1)"> — getBBox() returns pre-flip coords,
  // so when flipped we must convert them to post-flip positions before setting the viewBox.
  useEffect(() => {
    if (!svgContainerRef.current || !processedSvg) return;
    const flipX = bubble.flipX || false;
    requestAnimationFrame(() => {
      const svgEl = svgContainerRef.current?.querySelector('svg');
      if (!svgEl) return;
      svgEl.style.transform = '';
      svgEl.style.transformOrigin = '';
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      svgEl.querySelectorAll('path, rect, circle, ellipse, polygon, polyline').forEach((el) => {
        if (el.getAttribute('display') === 'none') return;
        if (el.getAttribute('fill') === 'none') return;
        if (el.style && el.style.fill === 'none') return;
        try {
          const bb = el.getBBox();
          if (bb.width === 0 && bb.height === 0) return;
          minX = Math.min(minX, bb.x); minY = Math.min(minY, bb.y);
          maxX = Math.max(maxX, bb.x + bb.width); maxY = Math.max(maxY, bb.y + bb.height);
        } catch (_) {}
      });
      if (minX !== Infinity) {
        const pad = 3;
        let vbX, vbW;
        if (flipX) {
          // getBBox returns pre-flip coords. The flip transform is translate(tx,0) scale(-1,1)
          // where tx = 2*vbMinX + origVbW, mapping x → tx - x.
          // Read the original viewBox (still present at this point) to recover tx.
          const origVbParts = svgEl.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number) || [];
          const origVbMinX = origVbParts[0] ?? 0;
          const origVbW    = origVbParts[2] ?? 210;
          const tx = 2 * origVbMinX + origVbW;
          // Post-flip: rendered_minX = tx - maxX, rendered_maxX = tx - minX
          vbX = tx - maxX - pad;
          vbW = (maxX - minX) + pad * 2;
        } else {
          vbX = minX - pad;
          vbW = maxX - minX + pad * 2;
        }
        svgEl.setAttribute('viewBox', `${vbX} ${minY - pad} ${vbW} ${maxY - minY + pad * 2}`);
      }
    });
  }, [processedSvg]); // eslint-disable-line

  const w = bubble.width || 220;
  const h = bubble.height || 150;
  const x = bubble.position?.x || 0;
  const y = bubble.position?.y || 0;
  const rotation = bubble.rotation || 0;

  const startMoveDrag = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    onSelect();
    dispatch({ type: 'PUSH_HISTORY' });
    const rect = canvasRef.current.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY;
    const ix = x, iy = y;
    const onMove = (ev) => {
      const scale = canvasW / rect.width;
      const dx = (ev.clientX - sx) * scale;
      const dy = (ev.clientY - sy) * scale;
      dispatch({ type: 'UPDATE_PANEL_BUBBLE', panelIndex, instanceId: bubble.instanceId, updates: { position: { x: Math.round(ix + dx), y: Math.round(iy + dy) } } });
    };
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const startResize = (e, corner) => {
    e.preventDefault();
    e.stopPropagation();
    dispatch({ type: 'PUSH_HISTORY' });
    const rect = canvasRef.current.getBoundingClientRect();
    const scale = canvasW / rect.width;
    const sx = e.clientX, sy = e.clientY;
    const ix = x, iy = y, iw = w, ih = h;
    const MIN = 60;
    const onMove = (ev) => {
      const dx = (ev.clientX - sx) * scale, dy = (ev.clientY - sy) * scale;
      let nx = ix, ny = iy, nw = iw, nh = ih;
      if (corner.includes('e')) nw = Math.max(MIN, iw + dx);
      if (corner.includes('w')) { nw = Math.max(MIN, iw - dx); nx = ix + (iw - nw); }
      if (corner.includes('s')) nh = Math.max(MIN, ih + dy);
      if (corner.includes('n')) { nh = Math.max(MIN, ih - dy); ny = iy + (ih - nh); }
      dispatch({ type: 'UPDATE_PANEL_BUBBLE', panelIndex, instanceId: bubble.instanceId, updates: { position: { x: Math.round(nx), y: Math.round(ny) }, width: Math.round(nw), height: Math.round(nh) } });
    };
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const startRotate = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dispatch({ type: 'PUSH_HISTORY' });
    const bRect = outerRef.current.getBoundingClientRect();
    const cx = bRect.left + bRect.width / 2;
    const cy = bRect.top + bRect.height / 2;
    let lastAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);
    let currentRot = rotation;
    const onMove = (ev) => {
      const newAngle = Math.atan2(ev.clientY - cy, ev.clientX - cx) * (180 / Math.PI);
      let delta = newAngle - lastAngle;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      currentRot += delta;
      lastAngle = newAngle;
      dispatch({ type: 'UPDATE_PANEL_BUBBLE', panelIndex, instanceId: bubble.instanceId, updates: { rotation: Math.round(currentRot) } });
    };
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const HW = 11;
  const handles = [
    // corners
    { id: 'nw', l: -HW / 2,           t: -HW / 2,           c: 'nwse-resize' },
    { id: 'ne', l: w - HW / 2,        t: -HW / 2,           c: 'nesw-resize' },
    { id: 'sw', l: -HW / 2,           t: h - HW / 2,        c: 'nesw-resize' },
    { id: 'se', l: w - HW / 2,        t: h - HW / 2,        c: 'nwse-resize' },
    // edges
    { id: 'n',  l: w / 2 - HW / 2,   t: -HW / 2,           c: 'n-resize' },
    { id: 's',  l: w / 2 - HW / 2,   t: h - HW / 2,        c: 's-resize' },
    { id: 'w',  l: -HW / 2,           t: h / 2 - HW / 2,   c: 'w-resize' },
    { id: 'e',  l: w - HW / 2,        t: h / 2 - HW / 2,   c: 'e-resize' },
  ];

  return (
    <div
      ref={outerRef}
      tabIndex={-1}
      style={{ position: 'absolute', left: x, top: y, width: w, height: h, zIndex: isSelected ? 10 : 5,
        transform: `rotate(${rotation}deg)`,
        opacity: bubble.opacity ?? 1,
        cursor: 'grab', outline: 'none' }}
      onPointerDown={startMoveDrag}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      onWheel={(e) => {
        if (!isSelected) return;
        e.preventDefault();
        e.stopPropagation();
        const factor = e.deltaY < 0 ? 1.1 : 0.9;
        dispatch({ type: 'UPDATE_PANEL_BUBBLE', panelIndex, instanceId: bubble.instanceId, updates: {
          width: Math.max(60, Math.round(w * factor)),
          height: Math.max(40, Math.round(h * factor)),
        }});
      }}
    >
      {/* SVG layer — flip is baked into the SVG element style, no CSS transform on container */}
      {processedSvg ? (
        <div ref={svgContainerRef} dangerouslySetInnerHTML={{ __html: processedSvg }}
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
      ) : (
        <div style={{ position: 'absolute', inset: 0, background: '#F5C518', border: '3px solid #000', borderRadius: 12 }} />
      )}

      {/* Text layer — editable when selected, read-only div otherwise (html2canvas captures the div) */}
      <div
        // Inscribed within the bubble's oval body (not its bounding box) — a rectangle
        // centered in an ellipse that fills the old 80%x75% box must shrink by ~1/√2 on
        // each axis to stay inside the curve instead of poking out past it at the corners.
        style={{ position: 'absolute', top: '17%', left: '22%', width: '56%', height: '53%', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: isSelected ? 'auto' : 'none', overflow: 'hidden' }}
        onPointerDown={(e) => { if (isSelected) e.stopPropagation(); }}
        onClick={(e) => { if (isSelected) { e.stopPropagation(); textRef.current?.focus(); } }}
      >
        {isSelected ? (
          <div
            ref={textRef}
            contentEditable suppressContentEditableWarning
            style={{
              width: '100%',
              textAlign: bubble.textStyle?.textAlign || 'center',
              outline: 'none', cursor: 'text', wordBreak: 'break-word',
              lineHeight: 1.3, pointerEvents: 'auto',
              direction: 'ltr', writingMode: 'horizontal-tb', unicodeBidi: 'normal',
              fontSize: bubble.textStyle?.fontSize || 16,
              fontFamily: bubble.textStyle?.fontFamily || "'Comic Sans MS', cursive",
              color: bubble.textStyle?.color || '#000000',
              fontWeight: bubble.textStyle?.bold ? 'bold' : 'normal',
              fontStyle: bubble.textStyle?.italic ? 'italic' : 'normal',
              textDecoration: bubble.textStyle?.underline ? 'underline' : 'none',
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onInput={(e) => {
              const el = e.currentTarget;
              const html = el.innerHTML;
              lastSavedText.current = html;
              const updates = { text: html };
              const neededH = Math.ceil(el.scrollHeight / 0.75) + 16;
              if (neededH > h) updates.height = neededH;
              if (el.scrollWidth > el.offsetWidth) {
                const neededW = Math.ceil(el.scrollWidth / 0.80) + 16;
                if (neededW > w) updates.width = neededW;
              }
              dispatch({ type: 'UPDATE_PANEL_BUBBLE', panelIndex, instanceId: bubble.instanceId, updates });
            }}
            onBlur={(e) => {
              const el = e.currentTarget;
              const plain = el.innerText;
              correctText(plain).then(({ changed, corrected }) => {
                if (!changed) return;
                el.innerHTML = corrected.replace(/\n/g, '<br>');
                lastSavedText.current = el.innerHTML;
                dispatch({ type: 'UPDATE_PANEL_BUBBLE', panelIndex, instanceId: bubble.instanceId, updates: { text: el.innerHTML } });
              });
            }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              textAlign: bubble.textStyle?.textAlign || 'center',
              wordBreak: 'break-word', lineHeight: 1.3, pointerEvents: 'none',
              direction: 'ltr', writingMode: 'horizontal-tb', unicodeBidi: 'normal',
              fontSize: bubble.textStyle?.fontSize || 16,
              fontFamily: bubble.textStyle?.fontFamily || "'Comic Sans MS', cursive",
              color: bubble.textStyle?.color || '#000000',
              fontWeight: bubble.textStyle?.bold ? 'bold' : 'normal',
              fontStyle: bubble.textStyle?.italic ? 'italic' : 'normal',
              textDecoration: bubble.textStyle?.underline ? 'underline' : 'none',
            }}
            dangerouslySetInnerHTML={{ __html: bubble.text || '' }}
          />
        )}
      </div>

      {isSelected && (
        <>
          <div style={{ position: 'absolute', inset: 0, border: '2px solid #7C3AED', borderRadius: 4, pointerEvents: 'none', zIndex: 3 }} />
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); dispatch({ type: 'UPDATE_PANEL_BUBBLE', panelIndex, instanceId: bubble.instanceId, updates: { showShadow: !bubble.showShadow } }); }}
            title={bubble.showShadow !== false ? 'Remove shadow' : 'Add shadow'}
            style={{
              position: 'absolute', top: 4, right: 4,
              background: bubble.showShadow !== false ? '#7C3AED' : '#fff',
              color: bubble.showShadow !== false ? '#fff' : '#7C3AED',
              border: '2px solid #7C3AED', borderRadius: 6, width: 26, height: 26,
              fontSize: 11, cursor: 'pointer', zIndex: 15, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >{bubble.showShadow !== false ? '▪' : '▫'}</button>
          <button
            onPointerDown={startRotate}
            title="Drag to rotate"
            style={{
              position: 'absolute', top: 34, right: 4,
              background: '#7C3AED', color: '#fff',
              border: '2.5px solid #fff', borderRadius: '50%',
              width: 26, height: 26, fontSize: 14, cursor: 'grab', zIndex: 15,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(124,58,237,0.45)',
            }}
          >↻</button>
          {handles.map(({ id, l, t, c }) => (
            <div key={id} onPointerDown={(e) => startResize(e, id)}
              style={{ position: 'absolute', left: l, top: t, width: HW, height: HW, background: '#7C3AED', border: '2px solid #fff', borderRadius: '50%', cursor: c, zIndex: 15 }} />
          ))}
          <AIQuickMenu
            style={{ bottom: 4, right: 4 }}
            onOpenAI={onOpenAI}
          />
        </>
      )}
    </div>
  );
}

export default function Panel({ panel, panelIndex, canvasW = 800, canvasH = 450, isActive = true, onActivate, previewMode = false, readOnly = false, onOpenAI }) {
  const { dispatch, state: comicState } = useComic();
  const { dragging, startDrag: startDragOverlay, moveOverlay, endDrag: endDragOverlay } = useDrag();
  const lightingOverlays = useLightingOverlays();
  const canvasRef = useRef(null);
  // Pinch-to-zoom bookkeeping: which pointers are currently down on which item, and
  // how to cancel a single-finger drag in progress if a second finger lands mid-drag.
  const activePointersRef = useRef(new Map()); // instanceId -> Map(pointerId -> {x, y})
  const dragCleanupRef = useRef(new Map()); // instanceId -> cleanup fn for the in-progress single-pointer drag
  const [selected, setSelected] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [draggingOut, setDraggingOut] = useState(null); // instanceId hidden while cross-panel dragging
  const [dressRigSizes, setDressRigSizes] = useState({});
  const data = panel.data || {};

  const CANVAS_W = canvasW;
  const CANVAS_H = canvasH;

  // Refs so the stable keyboard handler always sees the latest values
  const selectedRef = useRef(null);
  const panelRef = useRef(panel);
  const panelIndexRef = useRef(panelIndex);
  const dispatchRef = useRef(dispatch);
  const setSelectedRef = useRef(setSelected);
  const isActiveRef = useRef(isActive);
  const comicStateRef = useRef(comicState);

  // Sync local selected + push to context so toolbar can read it
  const selectItem = (sel) => {
    setSelected(sel);
    if (sel) {
      // Atomically activate this panel + set selection in one reducer step
      dispatch({ type: 'SELECT_ITEM_IN_PANEL', panelIndex, kind: sel.kind, instanceId: sel.instanceId });
    } else {
      dispatch({ type: 'SET_ACTIVE_SELECTION', selection: null });
    }
  };
  // Keep ref current so the stable keyboard handler always calls the latest version
  setSelectedRef.current = selectItem;

  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => { panelRef.current = panel; }, [panel]);
  useEffect(() => { panelIndexRef.current = panelIndex; }, [panelIndex]);
  useEffect(() => { dispatchRef.current = dispatch; }, [dispatch]);
  useEffect(() => { isActiveRef.current = isActive; }, [isActive]);
  useEffect(() => { comicStateRef.current = comicState; }, [comicState]);

  useEffect(() => {
    const handleKey = (e) => {
      if (!isActiveRef.current) return; // only the active panel handles keys
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
      const d = dispatchRef.current;
      const setSel = setSelectedRef.current;
      const sel = selectedRef.current;
      const pi = panelIndexRef.current;
      const pd = panelRef.current?.data;
      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        d({ type: 'UNDO' });
      } else if (ctrl && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        e.preventDefault();
        d({ type: 'REDO' });
      } else if (ctrl && e.key.toLowerCase() === 'c') {
        if (!sel || !pd) return;
        const kindKey = KIND_KEY[sel.kind];
        const item = (pd[kindKey] || []).find((x) => x.instanceId === sel.instanceId);
        if (item) d({ type: 'COPY_ITEM', kindKey, item });
      } else if (ctrl && e.key.toLowerCase() === 'x') {
        if (!sel || !pd) return;
        e.preventDefault();
        const kindKey = KIND_KEY[sel.kind];
        const item = (pd[kindKey] || []).find((x) => x.instanceId === sel.instanceId);
        if (!item) return;
        d({ type: 'COPY_ITEM', kindKey, item });
        switch (sel.kind) {
          case 'CHARACTER': d({ type: 'REMOVE_CHARACTER', panelIndex: pi, instanceId: sel.instanceId }); break;
          case 'PROP': case 'EFFECT': case 'COSTUME': case 'SOUND':
            d({ type: 'REMOVE_PLACED_ITEM', panelIndex: pi, instanceId: sel.instanceId, kind: sel.kind.toLowerCase() + 's' }); break;
          case 'BUBBLE': d({ type: 'REMOVE_BUBBLE', panelIndex: pi, instanceId: sel.instanceId }); break;
          case 'PLACED_BUBBLE': d({ type: 'REMOVE_PANEL_BUBBLE', panelIndex: pi, instanceId: sel.instanceId }); break;
          default: break;
        }
        setSel(null);
      } else if (ctrl && e.key.toLowerCase() === 'v') {
        if (!comicStateRef.current?.clipboard) return;
        d({ type: 'PASTE_ITEM', panelIndex: pi });
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!sel) return;
        e.preventDefault();
        switch (sel.kind) {
          case 'CHARACTER':
            d({ type: 'REMOVE_CHARACTER', panelIndex: pi, instanceId: sel.instanceId });
            break;
          case 'FACE':
            d({ type: 'REMOVE_FACE', panelIndex: pi, instanceId: sel.instanceId });
            break;
          case 'CHARACTER_PRESET':
            d({ type: 'REMOVE_CHARACTER_PRESET', panelIndex: pi, instanceId: sel.instanceId });
            break;
          case 'PROP':
          case 'EFFECT':
          case 'COSTUME':
          case 'SOUND':
            d({ type: 'REMOVE_PLACED_ITEM', panelIndex: pi, instanceId: sel.instanceId, kind: sel.kind.toLowerCase() + 's' });
            break;
          case 'BUBBLE':
            d({ type: 'REMOVE_BUBBLE', panelIndex: pi, instanceId: sel.instanceId });
            break;
          case 'PLACED_BUBBLE':
            d({ type: 'REMOVE_PANEL_BUBBLE', panelIndex: pi, instanceId: sel.instanceId });
            break;
          case 'NARRATION':
            d({ type: 'REMOVE_NARRATION_BOX', panelIndex: pi, instanceId: sel.instanceId });
            break;
          default: break;
        }
        setSel(null);
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // Deselect all items when the export captures the canvas
  useEffect(() => {
    const onDeselectAll = () => setSelectedRef.current(null);
    document.addEventListener('comic-deselect-all', onDeselectAll);
    return () => document.removeEventListener('comic-deselect-all', onDeselectAll);
  }, []);

  const deselect = (e) => {
    if (e.target !== canvasRef.current) return;
    if (comicState.activeSelection?.cropping) return; // never deselect while in crop mode
    selectItem(null);
  };

  // Drag character/item to reposition — supports cross-panel move
  const dispatchScale = (kind, instanceId, scale, preview = true) => {
    if (kind === 'CHARACTER') dispatch({ type: 'UPDATE_CHARACTER', panelIndex, instanceId, updates: { scale }, preview });
    else if (kind === 'FACE') dispatch({ type: 'UPDATE_FACE', panelIndex, instanceId, updates: { scale }, preview });
    else if (kind === 'CHARACTER_PRESET') dispatch({ type: 'UPDATE_CHARACTER_PRESET', panelIndex, instanceId, updates: { scale }, preview });
    else dispatch({ type: 'UPDATE_PLACED_ITEM', panelIndex, instanceId, kind: kind.toLowerCase() + 's', updates: { scale }, preview });
  };

  // Drag character/item to reposition — supports cross-panel move. `currentScale`
  // is optional (only kinds that have a scale — character/preset/prop/effect — pass
  // it); when a second finger lands on the same item while the first is still down,
  // this cancels the in-progress single-finger drag and switches to two-finger
  // pinch-to-zoom instead, scaling from whatever size the item was at that moment.
  const startDrag = (e, kind, instanceId, currentPos, previewUrl, currentScale) => {
    e.preventDefault();

    if (currentScale !== undefined) {
      if (!activePointersRef.current.has(instanceId)) activePointersRef.current.set(instanceId, new Map());
      const pointers = activePointersRef.current.get(instanceId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.size >= 2) {
        dragCleanupRef.current.get(instanceId)?.();
        dragCleanupRef.current.delete(instanceId);

        dispatch({ type: 'PUSH_HISTORY' });
        const startScaleVal = currentScale;
        const dist = () => {
          const [a, b] = [...pointers.values()];
          return Math.hypot(a.x - b.x, a.y - b.y);
        };
        const startDist = dist();
        const onPinchMove = (ev) => {
          if (!pointers.has(ev.pointerId)) return;
          pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
          if (pointers.size < 2 || !startDist) return;
          const ns = Math.max(SCALE_MIN, Math.min(SCALE_MAX, startScaleVal * (dist() / startDist)));
          dispatchScale(kind, instanceId, Math.round(ns * 100) / 100);
        };
        const onPinchEnd = (ev) => {
          pointers.delete(ev.pointerId);
          // Keep listening until BOTH fingers are confirmed up — they virtually never
          // lift at the exact same instant, so tearing down as soon as the first one
          // lifts would miss the second finger's own up/cancel event, leaving it stuck
          // in `pointers` forever and corrupting every single-finger drag after this.
          if (pointers.size === 0) {
            window.removeEventListener('pointermove', onPinchMove);
            window.removeEventListener('pointerup', onPinchEnd);
            window.removeEventListener('pointercancel', onPinchEnd);
            activePointersRef.current.delete(instanceId);
          }
        };
        window.addEventListener('pointermove', onPinchMove);
        window.addEventListener('pointerup', onPinchEnd);
        window.addEventListener('pointercancel', onPinchEnd);
        return;
      }
    }

    dispatch({ type: 'PUSH_HISTORY' }); // save pre-drag state for undo
    const originalPos = { ...currentPos };
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const offsetX = e.clientX - canvasRect.left - currentPos.x;
    const offsetY = e.clientY - canvasRect.top - currentPos.y;
    let dragOutside = false;

    const dispatchPos = (pos, preview = true) => {
      if (kind === 'CHARACTER') dispatch({ type: 'UPDATE_CHARACTER', panelIndex, instanceId, updates: { position: pos }, preview });
      else if (kind === 'FACE') dispatch({ type: 'UPDATE_FACE', panelIndex, instanceId, updates: { position: pos }, preview });
      else if (kind === 'CHARACTER_PRESET') dispatch({ type: 'UPDATE_CHARACTER_PRESET', panelIndex, instanceId, updates: { position: pos }, preview });
      else if (kind === 'BUBBLE') dispatch({ type: 'UPDATE_BUBBLE', panelIndex, instanceId, updates: { position: pos }, preview });
      else dispatch({ type: 'UPDATE_PLACED_ITEM', panelIndex, instanceId, kind: kind.toLowerCase() + 's', updates: { position: pos }, preview });
    };

    const onMove = (ev) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      // Cross-panel drag only fires when mouse is >120px outside the canvas.
      // Inside that zone the item moves freely — overflow:hidden clips it naturally
      // at the canvas edge, so the image never "vanishes", it just slides out of view.
      const CROSS_THRESHOLD = 120;
      const farOutside = ev.clientX < rect.left - CROSS_THRESHOLD || ev.clientX > rect.right + CROSS_THRESHOLD
                      || ev.clientY < rect.top  - CROSS_THRESHOLD || ev.clientY > rect.bottom + CROSS_THRESHOLD;

      if (!farOutside) {
        if (dragOutside) {
          dragOutside = false;
          setDraggingOut(null);
          endDragOverlay();
        }
        // Free movement — no clamping within the canvas+buffer zone
        const x = ev.clientX - rect.left - offsetX;
        const y = ev.clientY - rect.top  - offsetY;
        dispatchPos({ x, y }); // preview — no history push
      } else {
        if (!dragOutside) {
          dragOutside = true;
          setDraggingOut(instanceId); // hide item in source panel
          if (previewUrl) startDragOverlay({ imageUrl: previewUrl });
        }
        if (previewUrl) moveOverlay(ev.clientX, ev.clientY);
      }
    };

    const onUp = (ev) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      dragCleanupRef.current.delete(instanceId);
      if (currentScale !== undefined) {
        const pointers = activePointersRef.current.get(instanceId);
        pointers?.delete(ev.pointerId);
        if (!pointers || pointers.size === 0) activePointersRef.current.delete(instanceId);
      }
      setDraggingOut(null);

      if (!dragOutside) return;
      endDragOverlay();

      // Find target panel canvas under cursor
      const els = document.elementsFromPoint(ev.clientX, ev.clientY);
      const targetEl = els.find(
        (el) => el.dataset?.panelIndex !== undefined && parseInt(el.dataset.panelIndex) !== panelIndex,
      );

      if (!targetEl) {
        // Dropped on empty space — restore to original position (preview: history already saved)
        dispatchPos(originalPos);
        return;
      }

      const toPanelIndex = parseInt(targetEl.dataset.panelIndex);
      const targetCanvasW = parseFloat(targetEl.dataset.canvasW) || CANVAS_W;
      const targetCanvasH = parseFloat(targetEl.dataset.canvasH) || CANVAS_H;
      const targetRect = targetEl.getBoundingClientRect();
      const scaleX = targetCanvasW / targetRect.width;
      const scaleY = targetCanvasH / targetRect.height;
      const x = Math.max(0, Math.min(targetCanvasW - BASE_W, (ev.clientX - targetRect.left) * scaleX - BASE_W / 2));
      const y = Math.max(0, Math.min(targetCanvasH - BASE_H, (ev.clientY - targetRect.top) * scaleY - BASE_H / 2));

      dispatch({
        type: 'MOVE_ITEM_TO_PANEL',
        preview: true, // history already saved via PUSH_HISTORY at drag start
        fromPanelIndex: panelIndex,
        toPanelIndex,
        kindKey: KIND_KEY[kind] || kind.toLowerCase() + 's',
        instanceId,
        position: { x: Math.round(x), y: Math.round(y) },
      });
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    if (currentScale !== undefined) {
      dragCleanupRef.current.set(instanceId, () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
      });
    }
  };

  // Custom drag-and-drop via assetDrop event (replaces HTML5 drag API)
  useEffect(() => {
    const handleAssetDrop = (e) => {
      const { asset, category, clientX, clientY } = e.detail;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return;
      setIsDragOver(false);
      const x = Math.max(0, Math.min(CANVAS_W - BASE_W, clientX - rect.left - BASE_W / 2));
      const y = Math.max(0, Math.min(CANVAS_H - BASE_H, clientY - rect.top - BASE_H / 2));
      const position = { x: Math.round(x), y: Math.round(y) };
      if (category === 'BACKGROUND') {
        dispatch({ type: 'SET_BACKGROUND', panelIndex, background: { assetId: asset.id, filePath: asset.filePath } });
      } else if (category === 'CHARACTER') {
        dispatch({ type: 'ADD_CHARACTER_TO_PANEL', panelIndex, asset, position });
      } else if (category === 'BUBBLE') {
        dispatch({ type: 'ADD_PANEL_BUBBLE', panelIndex, asset, position });
      } else {
        dispatch({ type: 'ADD_PROP_TO_PANEL', panelIndex, asset, position, kind: category.toLowerCase() + 's' });
      }
      dispatch({ type: 'SET_ACTIVE_PANEL', index: panelIndex });
    };
    document.addEventListener('assetDrop', handleAssetDrop);
    return () => document.removeEventListener('assetDrop', handleAssetDrop);
  }, [panelIndex, dispatch, CANVAS_W, CANVAS_H]);

  const bgStyle = data.background ? {} : { background: 'var(--t-panel-empty)' };

  const renderNarrationBox = (nb) => (
    <NarrationBoxOverlay
      key={nb.instanceId}
      box={nb}
      isSelected={selected?.instanceId === nb.instanceId}
      onSelect={() => selectItem({ kind: 'NARRATION', instanceId: nb.instanceId })}
      onChange={(updates) => dispatch({ type: 'UPDATE_NARRATION_BOX', panelIndex, instanceId: nb.instanceId, updates })}
      onRemove={() => dispatch({ type: 'REMOVE_NARRATION_BOX', panelIndex, instanceId: nb.instanceId })}
      onOpenAI={onOpenAI}
    />
  );

  const narrationBoxes = data.narrationBoxes || [];

  return (
    <div
      style={{
        ...styles.wrapper,
        borderRadius: 12,
        border: previewMode ? 'none' : '2px dashed var(--t-panel-border)',
        overflow: 'hidden',
        userSelect: 'none',
        outline: !previewMode && isDragOver ? '3px dashed var(--t-accent)' : undefined,
        display: 'flex',
        flexDirection: 'column',
        width: CANVAS_W,
        height: CANVAS_H,
      }}
      onPointerDown={() => onActivate?.()}
    >
      {/* Outer row: left (full height) | center column | right (full height) */}
      <div style={{ display: 'flex', flexDirection: 'row', flex: 1, minHeight: 0 }}>
        {narrationBoxes.filter((nb) => nb.position === 'left').map(renderNarrationBox)}

        {/* Center column: top | canvas | bottom */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          {narrationBoxes.filter((nb) => nb.position === 'top').map(renderNarrationBox)}

          <div
            ref={canvasRef}
          style={{
            position: 'relative',
            width: '100%',
            ...bgStyle,
            flex: '1 1 0',
            minHeight: 0,
            touchAction: 'none',
          }}
          data-panel-index={panelIndex}
          data-canvas-w={CANVAS_W}
          data-canvas-h={CANVAS_H}
          onClick={deselect}
          onMouseEnter={() => dragging && setIsDragOver(true)}
          onMouseLeave={() => setIsDragOver(false)}
        >
          {/* Background layer — separate div so opacity and filter only affect the background image */}
          {data.background && (
            <div style={{
              position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
              backgroundImage: `url(${data.background.filePath})`,
              backgroundSize: 'cover', backgroundPosition: 'center',
              opacity: data.background.opacity ?? 1,
              ...(data.backgroundMode && BG_MODE_CSS[data.backgroundMode]
                ? { filter: BG_MODE_CSS[data.backgroundMode] }
                : {}),
            }} />
          )}

          {/* Lighting overlay — one-click tinted wash over the whole panel (art stays untouched) */}
          {data.lightingOverlay && lightingOverlays[data.lightingOverlay] && (() => {
            const preset = lightingOverlays[data.lightingOverlay];
            return (
              <Fragment>
                {preset.layers.map((layer, idx) => (
                  <div key={idx} style={{
                    position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 11,
                    background: layer.background,
                    mixBlendMode: layer.mixBlendMode,
                    backdropFilter: layer.backdropFilter,
                  }} />
                ))}
                {preset.flash && (
                  <div className="lighting-flash" style={{
                    position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 11,
                    background: '#fff', mixBlendMode: 'screen',
                  }} />
                )}
              </Fragment>
            );
          })()}

          {!data.background && !previewMode && (
            <div data-export-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              <div style={styles.decorDots} />
              <div style={styles.decorBlob} />
              <div style={styles.noBgHint}>
                <div style={styles.noBgIcon}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </div>
              </div>
            </div>
          )}

          {/* Characters */}
          {(data.characters || []).map((char) => {
            if (draggingOut === char.instanceId) return null;
            const isCharSelected = selected?.instanceId === char.instanceId;
            const isCropping = isCharSelected && comicState.activeSelection?.cropping === true;
            const cropStyle = char.crop && (char.crop.top || char.crop.right || char.crop.bottom || char.crop.left)
              ? `inset(${char.crop.top || 0}px ${char.crop.right || 0}px ${char.crop.bottom || 0}px ${char.crop.left || 0}px)`
              : undefined;
            const dressSize = char.dressMode && char.layoutPath ? (dressRigSizes[char.instanceId] || null) : null;
            const charW = dressSize?.w ?? BASE_W;
            const charH = dressSize?.h ?? BASE_H;
            return (
              <Fragment key={char.instanceId}>
                {/* Character visual only — no handles inside the scaled div */}
                <div
                  style={{
                    ...styles.placed,
                    left: char.position.x,
                    top: char.position.y,
                    width: BASE_W,
                    height: BASE_H,
                    transform: `rotate(${char.rotation || 0}deg) scaleX(${char.flipX ? -1 : 1}) scale(${char.scale || 1})`,
                    transformOrigin: 'center center',
                    cursor: isCropping ? 'default' : 'grab',
                    zIndex: isCharSelected ? 10 : 1,
                    opacity: char.opacity ?? 1,
                  }}
                  onPointerDown={(e) => {
                    if (isCropping) {
                      startDrag(e, 'CHARACTER', char.instanceId, char.position, char.filePath);
                      return;
                    }
                    selectItem({ kind: 'CHARACTER', instanceId: char.instanceId });
                    startDrag(e, 'CHARACTER', char.instanceId, char.position, char.filePath, char.scale || 1);
                  }}
                  onWheel={(e) => {
                    if (!isCharSelected) return;
                    e.preventDefault();
                    e.stopPropagation();
                    const current = char.scale || 1;
                    const factor = e.deltaY < 0 ? 1.1 : 0.9;
                    const ns = Math.max(SCALE_MIN, Math.min(SCALE_MAX, current * factor));
                    dispatch({ type: 'UPDATE_CHARACTER', preview: true, panelIndex, instanceId: char.instanceId, updates: { scale: Math.round(ns * 100) / 100 } });
                  }}
                >
                  <div style={{
                    width: BASE_W, height: BASE_H, clipPath: cropStyle, position: 'relative',
                    ...(char.dressMode && char.layoutPath
                      ? { display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }
                      : {}),
                  }}>
                    <RenderedCharacter
                      char={char}
                      onDressSize={(w, h) => setDressRigSizes((prev) => ({ ...prev, [char.instanceId]: { w, h } }))}
                    />
                    {/* Flat-character overlays — skipped for DressRig (it applies per-part internally) */}
                    {!char.dressMode && char.hairOverlay && (() => {
                      const rgb = hexToRgb(char.hairOverlay.color);
                      return rgb && (
                        <div style={{
                          position: 'absolute', left: 0, top: 0, width: BASE_W, height: BASE_H,
                          background: `rgba(${rgb.r},${rgb.g},${rgb.b},${(char.hairOverlay.opacity ?? 50) / 100})`,
                          mixBlendMode: char.hairOverlay.blendMode || 'multiply', pointerEvents: 'none',
                          WebkitMaskImage: `url(${char.filePath})`, maskImage: `url(${char.filePath})`,
                          WebkitMaskSize: '100% 100%', maskSize: '100% 100%',
                          WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
                          WebkitMaskPosition: 'center', maskPosition: 'center',
                        }} />
                      );
                    })()}
                  </div>
                </div>

                {/* Done button — floats below character in crop mode */}
                {isCropping && (
                  <button
                    onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); dispatch({ type: 'TOGGLE_CROP_MODE' }); }}
                    style={{
                      position: 'absolute',
                      left: char.position.x + BASE_W / 2 - 36,
                      top: char.position.y + BASE_H / 2 * (1 + (char.scale || 1)) + 10,
                      zIndex: 20,
                      background: '#F97316',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 16,
                      padding: '5px 16px',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      pointerEvents: 'auto',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Done
                  </button>
                )}

                {/* Handles overlay — same rotation+flip as character but NO scale.
                    Origin anchored at character center so handles stay pixel-perfect at any scale. */}
                {isCharSelected && (
                  <div style={{
                    position: 'absolute',
                    left: char.position.x + BASE_W / 2,
                    top: char.position.y + BASE_H / 2,
                    width: 0, height: 0,
                    transform: `rotate(${char.rotation || 0}deg) scaleX(${char.flipX ? -1 : 1})`,
                    transformOrigin: '0 0',
                    overflow: 'visible',
                    zIndex: 12,
                    pointerEvents: 'none',
                  }}>
                    {!isCropping && (
                      <TransformHandles
                        char={char}
                        panelIndex={panelIndex}
                        dispatch={dispatch}
                        canvasRef={canvasRef}
                        canvasW={CANVAS_W}
                        onDeselect={() => selectItem(null)}
                        charW={charW}
                        charH={charH}
                      />
                    )}
                    {isCropping && (
                      <CropHandles
                        crop={char.crop || { top: 0, right: 0, bottom: 0, left: 0 }}
                        w={BASE_W}
                        h={BASE_H}
                        scale={char.scale || 1}
                        flipX={char.flipX || false}
                        canvasRef={canvasRef}
                        canvasW={CANVAS_W}
                        onCropChange={(nc, pushHistory = false) => {
                          if (pushHistory) { dispatch({ type: 'PUSH_HISTORY' }); return; }
                          dispatch({ type: 'UPDATE_CHARACTER', preview: true, panelIndex, instanceId: char.instanceId, updates: { crop: nc } });
                        }}
                      />
                    )}
                  </div>
                )}
              </Fragment>
            );
          })}

          {/* Faces */}
          {(data.faces || []).map((face) => {
            if (draggingOut === face.instanceId) return null;
            const isFaceSelected = selected?.instanceId === face.instanceId;
            return (
              <Fragment key={face.instanceId}>
                <div
                  style={{
                    ...styles.placed,
                    left: face.position.x,
                    top: face.position.y,
                    width: BASE_W,
                    height: BASE_H,
                    transform: `rotate(${face.rotation || 0}deg) scaleX(${face.flipX ? -1 : 1}) scale(${face.scale || 1})`,
                    transformOrigin: 'center center',
                    cursor: 'grab',
                    zIndex: isFaceSelected ? 10 : 1,
                  }}
                  onPointerDown={(e) => {
                    selectItem({ kind: 'FACE', instanceId: face.instanceId });
                    startDrag(e, 'FACE', face.instanceId, face.position, undefined, face.scale || 1);
                  }}
                  onWheel={(e) => {
                    if (!isFaceSelected) return;
                    e.preventDefault();
                    e.stopPropagation();
                    const current = face.scale || 1;
                    const factor = e.deltaY < 0 ? 1.1 : 0.9;
                    const ns = Math.max(SCALE_MIN, Math.min(SCALE_MAX, current * factor));
                    dispatch({ type: 'UPDATE_FACE', preview: true, panelIndex, instanceId: face.instanceId, updates: { scale: Math.round(ns * 100) / 100 } });
                  }}
                >
                  <FaceRig face={face} />
                </div>

                {isFaceSelected && (
                  <div style={{
                    position: 'absolute',
                    left: face.position.x + BASE_W / 2,
                    top: face.position.y + BASE_H / 2,
                    width: 0, height: 0,
                    transform: `rotate(${face.rotation || 0}deg) scaleX(${face.flipX ? -1 : 1})`,
                    transformOrigin: '0 0',
                    overflow: 'visible',
                    zIndex: 12,
                    pointerEvents: 'none',
                  }}>
                    <FaceTransformHandles
                      face={face}
                      panelIndex={panelIndex}
                      dispatch={dispatch}
                      canvasRef={canvasRef}
                      canvasW={CANVAS_W}
                    />
                  </div>
                )}
              </Fragment>
            );
          })}

          {/* Character Presets (a CharacterPreset + BODY_POSE pairing) */}
          {(data.characterPresets || []).map((cp) => {
            if (draggingOut === cp.instanceId) return null;
            const isCpSelected = selected?.instanceId === cp.instanceId;
            const isCpCropping = isCpSelected && comicState.activeSelection?.cropping === true;
            const cpCropStyle = cp.crop && (cp.crop.top || cp.crop.right || cp.crop.bottom || cp.crop.left)
              ? `inset(${cp.crop.top || 0}px ${cp.crop.right || 0}px ${cp.crop.bottom || 0}px ${cp.crop.left || 0}px)`
              : undefined;
            return (
              <Fragment key={cp.instanceId}>
                <div
                  style={{
                    ...styles.placed,
                    left: cp.position.x,
                    top: cp.position.y,
                    width: BASE_W,
                    height: BASE_H,
                    transform: `rotate(${cp.rotation || 0}deg) scaleX(${cp.flipX ? -1 : 1}) scale(${cp.scale || 1})`,
                    transformOrigin: 'center center',
                    cursor: isCpCropping ? 'default' : 'grab',
                    zIndex: isCpSelected ? 10 : 1,
                    clipPath: cpCropStyle,
                  }}
                  onPointerDown={(e) => {
                    if (isCpCropping) {
                      startDrag(e, 'CHARACTER_PRESET', cp.instanceId, cp.position, undefined);
                      return;
                    }
                    selectItem({ kind: 'CHARACTER_PRESET', instanceId: cp.instanceId });
                    startDrag(e, 'CHARACTER_PRESET', cp.instanceId, cp.position, undefined, cp.scale || 1);
                  }}
                  onWheel={(e) => {
                    if (!isCpSelected) return;
                    e.preventDefault();
                    e.stopPropagation();
                    const current = cp.scale || 1;
                    const factor = e.deltaY < 0 ? 1.1 : 0.9;
                    const ns = Math.max(SCALE_MIN, Math.min(SCALE_MAX, current * factor));
                    dispatch({ type: 'UPDATE_CHARACTER_PRESET', preview: true, panelIndex, instanceId: cp.instanceId, updates: { scale: Math.round(ns * 100) / 100 } });
                  }}
                >
                  <CharacterPresetRig instance={cp} />
                </div>

                {/* Done button — floats below preset in crop mode */}
                {isCpCropping && (
                  <button
                    onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); dispatch({ type: 'TOGGLE_CROP_MODE' }); }}
                    style={{
                      position: 'absolute',
                      left: cp.position.x + BASE_W / 2 - 36,
                      top: cp.position.y + BASE_H / 2 * (1 + (cp.scale || 1)) + 10,
                      zIndex: 20,
                      background: '#F97316',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 16,
                      padding: '5px 16px',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      pointerEvents: 'auto',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Done
                  </button>
                )}

                {isCpSelected && (
                  <div style={{
                    position: 'absolute',
                    left: cp.position.x + BASE_W / 2,
                    top: cp.position.y + BASE_H / 2,
                    width: 0, height: 0,
                    transform: `rotate(${cp.rotation || 0}deg) scaleX(${cp.flipX ? -1 : 1})`,
                    transformOrigin: '0 0',
                    overflow: 'visible',
                    zIndex: 12,
                    pointerEvents: 'none',
                  }}>
                    {!isCpCropping && (
                      <FaceTransformHandles
                        face={cp}
                        panelIndex={panelIndex}
                        dispatch={dispatch}
                        canvasRef={canvasRef}
                        canvasW={CANVAS_W}
                        actionType="UPDATE_CHARACTER_PRESET"
                      />
                    )}
                    {isCpCropping && (
                      <CropHandles
                        crop={cp.crop || { top: 0, right: 0, bottom: 0, left: 0 }}
                        w={BASE_W}
                        h={BASE_H}
                        scale={cp.scale || 1}
                        flipX={cp.flipX || false}
                        canvasRef={canvasRef}
                        canvasW={CANVAS_W}
                        onCropChange={(nc, pushHistory = false) => {
                          if (pushHistory) { dispatch({ type: 'PUSH_HISTORY' }); return; }
                          dispatch({ type: 'UPDATE_CHARACTER_PRESET', preview: true, panelIndex, instanceId: cp.instanceId, updates: { crop: nc } });
                        }}
                      />
                    )}
                  </div>
                )}
              </Fragment>
            );
          })}

          {/* Props */}
          {(data.props || []).filter((item) => item.instanceId !== draggingOut).map((item) => (
            <PlacedItem key={item.instanceId} item={item} kind="PROP" panelIndex={panelIndex}
              isSelected={selected?.instanceId === item.instanceId}
              onSelect={() => selectItem({ kind: 'PROP', instanceId: item.instanceId })}
              onDragStart={(e) => startDrag(e, 'PROP', item.instanceId, item.position, item.filePath, item.scale || 1)}
              onRemove={() => dispatch({ type: 'REMOVE_PLACED_ITEM', panelIndex, instanceId: item.instanceId, kind: 'props' })}
              dispatch={dispatch} canvasRef={canvasRef} canvasW={CANVAS_W}
            />
          ))}

          {/* Effects */}
          {(data.effects || []).filter((item) => item.instanceId !== draggingOut).map((item) => (
            <PlacedItem key={item.instanceId} item={item} kind="EFFECT" panelIndex={panelIndex}
              isSelected={selected?.instanceId === item.instanceId}
              onSelect={() => selectItem({ kind: 'EFFECT', instanceId: item.instanceId })}
              onDragStart={(e) => startDrag(e, 'EFFECT', item.instanceId, item.position, item.filePath, item.scale || 1)}
              onRemove={() => dispatch({ type: 'REMOVE_PLACED_ITEM', panelIndex, instanceId: item.instanceId, kind: 'effects' })}
              dispatch={dispatch} canvasRef={canvasRef} canvasW={CANVAS_W}
            />
          ))}

          {/* Sounds (visual sound-effect graphics — same controls as Effects) */}
          {(data.sounds || []).filter((item) => item.instanceId !== draggingOut).map((item) => (
            <PlacedItem key={item.instanceId} item={item} kind="SOUND" panelIndex={panelIndex}
              isSelected={selected?.instanceId === item.instanceId}
              onSelect={() => selectItem({ kind: 'SOUND', instanceId: item.instanceId })}
              onDragStart={(e) => startDrag(e, 'SOUND', item.instanceId, item.position, item.filePath, item.scale || 1)}
              onRemove={() => dispatch({ type: 'REMOVE_PLACED_ITEM', panelIndex, instanceId: item.instanceId, kind: 'sounds' })}
              dispatch={dispatch} canvasRef={canvasRef} canvasW={CANVAS_W}
            />
          ))}

          {/* Costumes */}
          {(data.costumes || []).filter((item) => item.instanceId !== draggingOut).map((item) => (
            <PlacedItem key={item.instanceId} item={item} kind="COSTUME" panelIndex={panelIndex}
              isSelected={selected?.instanceId === item.instanceId}
              onSelect={() => selectItem({ kind: 'COSTUME', instanceId: item.instanceId })}
              onDragStart={(e) => startDrag(e, 'COSTUME', item.instanceId, item.position, item.filePath, item.scale || 1)}
              onRemove={() => dispatch({ type: 'REMOVE_PLACED_ITEM', panelIndex, instanceId: item.instanceId, kind: 'costumes' })}
              dispatch={dispatch} canvasRef={canvasRef} canvasW={CANVAS_W}
            />
          ))}

          {/* Speech Bubbles (legacy code-drawn) */}
          {(data.speechBubbles || []).filter((b) => b.instanceId !== draggingOut).map((bubble) => (
            <BubbleOverlay
              key={bubble.instanceId}
              bubble={bubble}
              isSelected={selected?.instanceId === bubble.instanceId}
              onSelect={() => selectItem({ kind: 'BUBBLE', instanceId: bubble.instanceId })}
              onDragStart={(e) => startDrag(e, 'BUBBLE', bubble.instanceId, bubble.position)}
              onChange={(updates) => dispatch({ type: 'UPDATE_BUBBLE', panelIndex, instanceId: bubble.instanceId, updates })}
              onRemove={() => dispatch({ type: 'REMOVE_BUBBLE', panelIndex, instanceId: bubble.instanceId })}
              onOpenAI={onOpenAI}
            />
          ))}

          {/* Placed SVG bubbles */}
          {(data.bubbles || []).map((bubble) => (
            <BubblePlacedItem
              key={bubble.instanceId}
              bubble={bubble}
              panelIndex={panelIndex}
              canvasRef={canvasRef}
              canvasW={CANVAS_W}
              isSelected={selected?.instanceId === bubble.instanceId}
              onSelect={() => selectItem({ kind: 'PLACED_BUBBLE', instanceId: bubble.instanceId })}
              dispatch={dispatch}
              onOpenAI={onOpenAI}
            />
          ))}
          </div>{/* closes canvas */}

          {/* Bottom narration — inside center column, below canvas */}
          {narrationBoxes.filter((nb) => nb.position === 'bottom').map(renderNarrationBox)}
        </div>{/* closes center column */}

        {/* Right narration — spans full height, outside center column */}
        {narrationBoxes.filter((nb) => nb.position === 'right').map(renderNarrationBox)}
      </div>{/* closes outer row */}

      {/* Read-only lock — a single inert overlay covering the whole panel (canvas + all
          narration boxes) blocks every drag/click/edit interaction without touching each
          item's individual handlers (used when an institution's subscription has expired;
          comics stay fully viewable, not editable). */}
      {readOnly && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 999, cursor: 'not-allowed' }} />
      )}
    </div>
  );
}

// ── Crop handles ────────────────────────────────────────────────────────────────
const CROP_COLOR = '#F97316';

// Coordinate system: same overlay space as TransformHandles
// Origin at character center, rotated with char, NOT scaled — natural CSS pixels.
function CropHandles({ crop, w, h, scale, flipX, canvasRef, canvasW, onCropChange }) {
  const s = scale;
  const { top = 0, right = 0, bottom = 0, left = 0 } = crop;

  // Crop edges in overlay space
  const x0 = (-w / 2 + left)  * s,  x1 = ( w / 2 - right)  * s;
  const y0 = (-h / 2 + top)   * s,  y1 = ( h / 2 - bottom) * s;
  const cw = x1 - x0, ch = y1 - y0;

  const startDrag = (e, edges) => {
    e.preventDefault();
    e.stopPropagation();
    onCropChange(crop, true); // PUSH_HISTORY before crop drag
    const sx = e.clientX, sy = e.clientY;
    const init = { top, right, bottom, left };
    const onMove = (ev) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const ratio = (rect.width / canvasW) * s; // screen px → character local px
      // When character is flipped, the overlay x-axis is inverted — negate dx so handles follow the mouse
      const dx = (ev.clientX - sx) / ratio * (flipX ? -1 : 1);
      const dy = (ev.clientY - sy) / ratio;
      const nc = { ...init };
      if (edges.includes('left'))   nc.left   = Math.max(0, Math.min(w - init.right, init.left + dx));
      if (edges.includes('right'))  nc.right  = Math.max(0, Math.min(w - init.left, init.right - dx));
      if (edges.includes('top'))    nc.top    = Math.max(0, Math.min(h - init.bottom, init.top + dy));
      if (edges.includes('bottom')) nc.bottom = Math.max(0, Math.min(h - init.top, init.bottom - dy));
      onCropChange(nc); // preview — no history push
    };
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const HW = 10, hh = 5; // natural 10px handles

  const handles = [
    { e: ['top','left'],     c: 'nwse-resize', t: y0-hh,       l: x0-hh },
    { e: ['top'],            c: 'n-resize',    t: y0-hh,       l: (x0+x1)/2-hh },
    { e: ['top','right'],    c: 'nesw-resize', t: y0-hh,       l: x1-hh },
    { e: ['right'],          c: 'e-resize',    t: (y0+y1)/2-hh, l: x1-hh },
    { e: ['bottom','right'], c: 'nwse-resize', t: y1-hh,       l: x1-hh },
    { e: ['bottom'],         c: 's-resize',    t: y1-hh,       l: (x0+x1)/2-hh },
    { e: ['bottom','left'],  c: 'nesw-resize', t: y1-hh,       l: x0-hh },
    { e: ['left'],           c: 'w-resize',    t: (y0+y1)/2-hh, l: x0-hh },
  ];

  return (
    <>
      {/* Crop boundary — always 2px */}
      <div style={{ position:'absolute', top:y0, left:x0, width:cw, height:ch, border:`2px solid ${CROP_COLOR}`, pointerEvents:'none' }} />

      {/* Handles — always 10px */}
      {handles.map((hnd, i) => (
        <div key={i} onPointerDown={(e) => startDrag(e, hnd.e)}
          style={{
            position:'absolute', top:hnd.t, left:hnd.l,
            width:HW, height:HW,
            background:'#fff', border:`2px solid ${CROP_COLOR}`,
            borderRadius:'50%', cursor:hnd.c, pointerEvents:'auto',
          }}
        />
      ))}
    </>
  );
}

// ── Visual transform handles — Tejas-style: purple border, circular handles, rotation at right-middle ──
const SEL_COLOR = '#7C3AED';

// Coordinate system: origin at character CENTER, rotated+flipped with character, NOT scaled.
// Character local coord (lx, ly) → overlay coord: ((lx - BASE_W/2)*s, (ly - BASE_H/2)*s)
// All sizes are natural CSS pixels — no sub-pixel scaling issues at any character scale.
function TransformHandles({ char, panelIndex, dispatch, canvasRef, canvasW, onDeselect, charW = BASE_W, charH = BASE_H }) {
  const s = char.scale || 1;
  const cl = char.crop?.left || 0, cr = char.crop?.right || 0;
  const ct = char.crop?.top || 0, cb = char.crop?.bottom || 0;

  // Visible (cropped) area bounds in overlay space
  const visL = (-charW / 2 + cl) * s;
  const visR = ( charW / 2 - cr) * s;
  const visT = (-charH / 2 + ct) * s;
  const visB = ( charH / 2 - cb) * s;
  const visMX = (visL + visR) / 2;
  const visMY = (visT + visB) / 2;

  // Border outer edge — 2px margin around visible area
  const bL = visL - 2, bR = visR + 2, bT = visT - 2, bB = visB + 2;
  const HW = 12, hh = 6; // natural 12px handles, 6px half

  const getCenterInScreen = () => {
    const rect = canvasRef.current.getBoundingClientRect();
    const ratio = rect.width / canvasW;
    return {
      cx: rect.left + (char.position.x + BASE_W / 2) * ratio,
      cy: rect.top  + (char.position.y + BASE_H / 2) * ratio,
    };
  };

  const startRotate = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dispatch({ type: 'PUSH_HISTORY' });
    const { cx, cy } = getCenterInScreen();
    let lastAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);
    let currentRot = char.rotation || 0;
    const onMove = (ev) => {
      const newAngle = Math.atan2(ev.clientY - cy, ev.clientX - cx) * (180 / Math.PI);
      let delta = newAngle - lastAngle;
      if (delta >  180) delta -= 360;
      if (delta < -180) delta += 360;
      currentRot += delta;
      lastAngle = newAngle;
      dispatch({ type: 'UPDATE_CHARACTER', preview: true, panelIndex, instanceId: char.instanceId, updates: { rotation: Math.round(currentRot) } });
    };
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const startScale = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dispatch({ type: 'PUSH_HISTORY' });
    const { cx, cy } = getCenterInScreen();
    const startDist = Math.hypot(e.clientX - cx, e.clientY - cy);
    const startScaleVal = char.scale || 1;
    const onMove = (ev) => {
      const dist = Math.hypot(ev.clientX - cx, ev.clientY - cy);
      if (!startDist) return;
      const ns = Math.max(SCALE_MIN, Math.min(SCALE_MAX, startScaleVal * (dist / startDist)));
      dispatch({ type: 'UPDATE_CHARACTER', preview: true, panelIndex, instanceId: char.instanceId, updates: { scale: Math.round(ns * 100) / 100 } });
    };
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const scaleHandles = [
    { top: bT - hh, left: bL  - hh, cursor: 'nwse-resize' },
    { top: bT - hh, left: visMX - hh, cursor: 'n-resize' },
    { top: bT - hh, left: bR  - hh, cursor: 'nesw-resize' },
    { top: visMY - hh, left: bL - hh, cursor: 'w-resize' },
    { top: bB - hh, left: bL  - hh, cursor: 'nesw-resize' },
    { top: bB - hh, left: visMX - hh, cursor: 's-resize' },
    { top: bB - hh, left: bR  - hh, cursor: 'nwse-resize' },
  ];

  return (
    <>
      {/* Selection border — always 2px, always correct size at any character scale */}
      <div style={{
        position: 'absolute',
        top: bT, left: bL, width: bR - bL, height: bB - bT,
        border: `2px solid ${SEL_COLOR}`, borderRadius: 8, pointerEvents: 'none',
      }} />

      {/* Connecting line from right edge of border to rotation knob */}
      <div style={{
        position: 'absolute', top: visMY, left: bR,
        width: 26, height: 2,
        background: SEL_COLOR, transform: 'translateY(-50%)', pointerEvents: 'none',
      }} />

      {/* Circular scale handles — always 12px */}
      {scaleHandles.map((pos, i) => (
        <div
          key={i}
          onPointerDown={startScale}
          style={{
            position: 'absolute', ...pos,
            width: HW, height: HW,
            background: '#fff', border: `2px solid ${SEL_COLOR}`,
            borderRadius: '50%', cursor: pos.cursor, pointerEvents: 'auto',
          }}
        />
      ))}

      {/* Rotation knob — always 26px */}
      <div
        onPointerDown={startRotate}
        style={{
          position: 'absolute',
          top: visMY, left: bR + 26,
          transform: 'translateY(-50%)',
          width: 26, height: 26, background: SEL_COLOR, border: '2.5px solid #fff',
          borderRadius: '50%', cursor: 'grab',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 14, userSelect: 'none',
          boxShadow: `0 2px 8px rgba(124,58,237,0.45)`,
          pointerEvents: 'auto',
        }}
        title="Drag to rotate"
      >↻</div>
    </>
  );
}

// ── Transform handles for FACE items — same visual language as TransformHandles, no crop ──
function FaceTransformHandles({ face, panelIndex, dispatch, canvasRef, canvasW, actionType = 'UPDATE_FACE' }) {
  const s = face.scale || 1;

  const visL = (-BASE_W / 2) * s;
  const visR = ( BASE_W / 2) * s;
  const visT = (-BASE_H / 2) * s;
  const visB = ( BASE_H / 2) * s;
  const visMX = (visL + visR) / 2;
  const visMY = (visT + visB) / 2;

  const bL = visL - 2, bR = visR + 2, bT = visT - 2, bB = visB + 2;
  const HW = 12, hh = 6;

  const getCenterInScreen = () => {
    const rect = canvasRef.current.getBoundingClientRect();
    const ratio = rect.width / canvasW;
    return {
      cx: rect.left + (face.position.x + BASE_W / 2) * ratio,
      cy: rect.top  + (face.position.y + BASE_H / 2) * ratio,
    };
  };

  const startRotate = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dispatch({ type: 'PUSH_HISTORY' });
    const { cx, cy } = getCenterInScreen();
    let lastAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);
    let currentRot = face.rotation || 0;
    const onMove = (ev) => {
      const newAngle = Math.atan2(ev.clientY - cy, ev.clientX - cx) * (180 / Math.PI);
      let delta = newAngle - lastAngle;
      if (delta >  180) delta -= 360;
      if (delta < -180) delta += 360;
      currentRot += delta;
      lastAngle = newAngle;
      dispatch({ type: actionType, preview: true, panelIndex, instanceId: face.instanceId, updates: { rotation: Math.round(currentRot) } });
    };
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const startScale = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dispatch({ type: 'PUSH_HISTORY' });
    const { cx, cy } = getCenterInScreen();
    const startDist = Math.hypot(e.clientX - cx, e.clientY - cy);
    const startScaleVal = face.scale || 1;
    const onMove = (ev) => {
      const dist = Math.hypot(ev.clientX - cx, ev.clientY - cy);
      if (!startDist) return;
      const ns = Math.max(SCALE_MIN, Math.min(SCALE_MAX, startScaleVal * (dist / startDist)));
      dispatch({ type: actionType, preview: true, panelIndex, instanceId: face.instanceId, updates: { scale: Math.round(ns * 100) / 100 } });
    };
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const scaleHandles = [
    { top: bT - hh, left: bL  - hh, cursor: 'nwse-resize' },
    { top: bT - hh, left: visMX - hh, cursor: 'n-resize' },
    { top: bT - hh, left: bR  - hh, cursor: 'nesw-resize' },
    { top: visMY - hh, left: bL - hh, cursor: 'w-resize' },
    { top: bB - hh, left: bL  - hh, cursor: 'nesw-resize' },
    { top: bB - hh, left: visMX - hh, cursor: 's-resize' },
    { top: bB - hh, left: bR  - hh, cursor: 'nwse-resize' },
  ];

  return (
    <>
      <div style={{
        position: 'absolute',
        top: bT, left: bL, width: bR - bL, height: bB - bT,
        border: `2px solid ${SEL_COLOR}`, borderRadius: 8, pointerEvents: 'none',
      }} />

      <div style={{
        position: 'absolute', top: visMY, left: bR,
        width: 26, height: 2,
        background: SEL_COLOR, transform: 'translateY(-50%)', pointerEvents: 'none',
      }} />

      {scaleHandles.map((pos, i) => (
        <div
          key={i}
          onPointerDown={startScale}
          style={{
            position: 'absolute', ...pos,
            width: HW, height: HW,
            background: '#fff', border: `2px solid ${SEL_COLOR}`,
            borderRadius: '50%', cursor: pos.cursor, pointerEvents: 'auto',
          }}
        />
      ))}

      <div
        onPointerDown={startRotate}
        style={{
          position: 'absolute',
          top: visMY, left: bR + 26,
          transform: 'translateY(-50%)',
          width: 26, height: 26, background: SEL_COLOR, border: '2.5px solid #fff',
          borderRadius: '50%', cursor: 'grab',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 14, userSelect: 'none',
          boxShadow: `0 2px 8px rgba(124,58,237,0.45)`,
          pointerEvents: 'auto',
        }}
        title="Drag to rotate"
      >↻</div>
    </>
  );
}

// Detect tight non-transparent bounds of an image using an offscreen canvas.
// Returns null on CORS/SVG errors or fully opaque images (no trim needed).
function findTrimRect(img) {
  try {
    const nw = img.naturalWidth, nh = img.naturalHeight;
    if (nw < 1 || nh < 1) return null;
    const limit = 512;
    const sc = Math.min(1, limit / nw, limit / nh);
    const cw = Math.ceil(nw * sc), ch = Math.ceil(nh * sc);
    const canvas = document.createElement('canvas');
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, cw, ch);
    const { data } = ctx.getImageData(0, 0, cw, ch);
    let x0 = cw, y0 = ch, x1 = -1, y1 = -1;
    for (let y = 0; y < ch; y++)
      for (let x = 0; x < cw; x++)
        if (data[(y * cw + x) * 4 + 3] > 5) {
          if (x < x0) x0 = x; if (y < y0) y0 = y;
          if (x > x1) x1 = x; if (y > y1) y1 = y;
        }
    if (x1 < 0) return null;
    return { minX: x0 / sc, minY: y0 / sc, maxX: (x1 + 1) / sc, maxY: (y1 + 1) / sc, nw, nh };
  } catch { return null; }
}

// ── Generic placed item (props / effects / costumes) ──────────────────────────
function PlacedItem({ item, isSelected, onSelect, onDragStart, onRemove, dispatch, kind, panelIndex, canvasRef, canvasW }) {
  const [trim, setTrim] = useState(null);

  const handleImgLoad = (e) => {
    const rect = findTrimRect(e.target);
    if (rect) setTrim(rect);
  };

  // Compute box dimensions and image offset from trim rect
  let boxW, boxH, imgStyle;
  if (trim) {
    const cw = trim.maxX - trim.minX, ch = trim.maxY - trim.minY;
    const rs = Math.min(1, 400 / cw, 400 / ch);
    boxW = Math.round(cw * rs);
    boxH = Math.round(ch * rs);
    imgStyle = {
      display: 'block', maxWidth: 'none', maxHeight: 'none',
      width: Math.round(trim.nw * rs), height: Math.round(trim.nh * rs),
      marginLeft: Math.round(-trim.minX * rs), marginTop: Math.round(-trim.minY * rs),
    };
  } else {
    boxW = null; boxH = null;
    imgStyle = { display: 'block', maxWidth: 400, maxHeight: 400 };
  }

  return (
    <Fragment>
      <div
        style={{
          ...styles.placed,
          left: item.position.x, top: item.position.y,
          transform: `scale(${item.scale || 1}) rotate(${item.rotation || 0}deg)`,
          transformOrigin: 'top left', cursor: 'grab',
          zIndex: isSelected ? 10 : 1,
          opacity: item.opacity ?? 1,
          lineHeight: 0,
          overflow: trim ? 'hidden' : undefined,
          ...(boxW != null ? { width: boxW, height: boxH } : {}),
        }}
        onPointerDown={(e) => { onSelect(); onDragStart(e); }}
        onWheel={(e) => {
          if (!isSelected) return;
          e.preventDefault();
          e.stopPropagation();
          const current = item.scale || 1;
          const factor = e.deltaY < 0 ? 1.1 : 0.9;
          const ns = Math.max(0.1, Math.min(SCALE_MAX, current * factor));
          dispatch({ type: 'UPDATE_PLACED_ITEM', preview: true, panelIndex, instanceId: item.instanceId, kind: kind.toLowerCase() + 's', updates: { scale: Math.round(ns * 100) / 100 } });
        }}
      >
        <img src={item.filePath} alt={item.name} onLoad={handleImgLoad} style={imgStyle} />
      </div>
      {isSelected && (
        <PlacedItemHandles
          item={item}
          kind={kind}
          panelIndex={panelIndex}
          dispatch={dispatch}
          canvasRef={canvasRef}
          canvasW={canvasW}
          onRemove={onRemove}
          natW={boxW || 400}
          natH={boxH || 400}
        />
      )}
    </Fragment>
  );
}

// ── Transform handles for placed items (props / effects / costumes) ────────────
const PLACED_SEL = '#FF6B35';

function PlacedItemHandles({ item, kind, panelIndex, dispatch, canvasRef, canvasW, onRemove, natW, natH }) {
  const scale = item.scale || 1;
  const rotation = item.rotation || 0;
  const sw = natW * scale;
  const sh = natH * scale;
  const HW = 10, hh = 5;

  const getOriginInScreen = () => {
    const rect = canvasRef.current.getBoundingClientRect();
    const ratio = rect.width / canvasW;
    return { ox: rect.left + item.position.x * ratio, oy: rect.top + item.position.y * ratio, ratio };
  };

  const startScale = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dispatch({ type: 'PUSH_HISTORY' });
    const { ox, oy } = getOriginInScreen();
    const startDist = Math.hypot(e.clientX - ox, e.clientY - oy);
    const startScaleVal = scale;
    const onMove = (ev) => {
      const dist = Math.hypot(ev.clientX - ox, ev.clientY - oy);
      if (!startDist) return;
      const ns = Math.max(0.1, Math.min(SCALE_MAX, startScaleVal * (dist / startDist)));
      dispatch({ type: 'UPDATE_PLACED_ITEM', preview: true, panelIndex, instanceId: item.instanceId, kind: kind.toLowerCase() + 's', updates: { scale: Math.round(ns * 100) / 100 } });
    };
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const startRotate = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dispatch({ type: 'PUSH_HISTORY' });
    const { ox, oy } = getOriginInScreen();
    let lastAngle = Math.atan2(e.clientY - oy, e.clientX - ox) * (180 / Math.PI);
    let currentRot = rotation;
    const onMove = (ev) => {
      const newAngle = Math.atan2(ev.clientY - oy, ev.clientX - ox) * (180 / Math.PI);
      let delta = newAngle - lastAngle;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      currentRot += delta;
      lastAngle = newAngle;
      dispatch({ type: 'UPDATE_PLACED_ITEM', preview: true, panelIndex, instanceId: item.instanceId, kind: kind.toLowerCase() + 's', updates: { rotation: Math.round(currentRot) } });
    };
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const scaleHandles = [
    { top: -hh,      left: -hh,       cursor: 'nwse-resize' },
    { top: -hh,      left: sw/2 - hh, cursor: 'n-resize' },
    { top: -hh,      left: sw - hh,   cursor: 'nesw-resize' },
    { top: sh/2 - hh, left: sw - hh,  cursor: 'e-resize' },
    { top: sh - hh,  left: sw - hh,   cursor: 'nwse-resize' },
    { top: sh - hh,  left: sw/2 - hh, cursor: 's-resize' },
    { top: sh - hh,  left: -hh,       cursor: 'nesw-resize' },
    { top: sh/2 - hh, left: -hh,      cursor: 'w-resize' },
  ];

  return (
    <div style={{
      position: 'absolute',
      left: item.position.x, top: item.position.y,
      width: 0, height: 0,
      transform: `rotate(${rotation}deg)`,
      transformOrigin: '0 0',
      overflow: 'visible',
      zIndex: 12,
      pointerEvents: 'none',
    }}>
      {/* Selection border */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: sw, height: sh, border: `2px solid ${PLACED_SEL}`, pointerEvents: 'none' }} />

      {/* Remove button */}
      <button
        style={{ position: 'absolute', top: -10, left: sw - 10, width: 20, height: 20, background: PLACED_SEL, color: '#fff', border: 'none', borderRadius: '50%', cursor: 'pointer', fontSize: 14, lineHeight: 1, zIndex: 13, pointerEvents: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        onPointerDown={(e) => { e.stopPropagation(); onRemove(); }}
      >×</button>

      {/* Scale handles */}
      {scaleHandles.map((pos, i) => (
        <div key={i} onPointerDown={startScale}
          style={{ position: 'absolute', ...pos, width: HW, height: HW, background: '#fff', border: `2px solid ${PLACED_SEL}`, borderRadius: '50%', cursor: pos.cursor, pointerEvents: 'auto' }}
        />
      ))}

      {/* Line to rotation knob */}
      <div style={{ position: 'absolute', top: sh / 2 - 1, left: sw, width: 26, height: 2, background: PLACED_SEL, pointerEvents: 'none' }} />

      {/* Rotation knob */}
      <div onPointerDown={startRotate}
        style={{
          position: 'absolute', top: sh / 2 - 13, left: sw + 13,
          width: 26, height: 26, background: PLACED_SEL, border: '2.5px solid #fff',
          borderRadius: '50%', cursor: 'grab',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 14, userSelect: 'none',
          boxShadow: '0 2px 8px rgba(255,107,53,0.45)',
          pointerEvents: 'auto',
        }}
        title="Drag to rotate"
      >↻</div>
    </div>
  );
}

// ── Narration box overlay ─────────────────────────────────────────────────────
function NarrationBoxOverlay({ box, isSelected, onSelect, onChange, onRemove, onOpenAI }) {
  const { text, position, style: ns = {} } = box;
  const isVertical = position === 'left' || position === 'right';
  const fontSize = ns.fontSize || 13;
  const thickness = isVertical ? (ns.width || 175) : Math.ceil(fontSize * 1.3) + 4;
  const editRef = useRef(null);
  const lastSaved = useRef(null);

  // When isSelected becomes true the contentEditable div is newly inserted — seed innerHTML & focus
  useEffect(() => {
    if (!isSelected) return;
    const el = editRef.current;
    if (!el) return;
    el.innerHTML = text || '';
    lastSaved.current = text;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
  }, [isSelected]); // eslint-disable-line

  // Sync innerHTML when text changes from outside (undo/redo) while editing
  useEffect(() => {
    if (!isSelected) return;
    const el = editRef.current;
    if (!el || text === lastSaved.current) return;
    el.innerHTML = text || '';
    lastSaved.current = text;
  }, [text, isSelected]); // eslint-disable-line

  const handleInput = (e) => {
    const html = e.currentTarget.innerHTML;
    lastSaved.current = html;
    onChange({ text: html });
  };

  const handleBlur = (e) => {
    const el = e.currentTarget;
    const plain = el.innerText;
    correctText(plain).then(({ changed, corrected }) => {
      if (!changed) return;
      el.innerHTML = corrected.replace(/\n/g, '<br>');
      lastSaved.current = el.innerHTML;
      onChange({ text: el.innerHTML });
    });
  };

  // Drag left edge of right-positioned box to resize width
  const startResizeLeft = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = ns.width || 60;
    const onMove = (ev) => {
      const delta = startX - ev.clientX;
      const newWidth = Math.max(40, Math.min(300, startWidth + delta));
      onChange({ style: { ...ns, width: Math.round(newWidth) } });
    };
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // Drag right edge of left-positioned box to resize width
  const startResizeRight = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = ns.width || 60;
    const onMove = (ev) => {
      const delta = ev.clientX - startX;
      const newWidth = Math.max(40, Math.min(300, startWidth + delta));
      onChange({ style: { ...ns, width: Math.round(newWidth) } });
    };
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const baseTextStyle = {
    fontFamily: ns.fontFamily || 'Comic Neue, cursive',
    fontSize: ns.fontSize || 13,
    color: ns.textColor || '#ffffff',
    lineHeight: 0.95,
    width: '100%',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  };

  return (
    <div
      style={{
        position: 'relative',
        flexShrink: 0,
        zIndex: 20,
        ...(isVertical
          ? { width: thickness, alignSelf: 'stretch' }
          : { width: '100%', minHeight: 32 }
        ),
        background: ns.fillColor || '#F9E07A',
        border: `${ns.borderWidth ?? 3}px solid ${ns.strokeColor || '#000000'}`,
        outline: isSelected ? '2px solid #a855f7' : 'none',
        cursor: 'pointer',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start',
        padding: isVertical ? '8px 6px' : '4px 10px',
        boxSizing: 'border-box',
      }}
      onPointerDown={(e) => { e.stopPropagation(); onSelect(); }}
    >
      {isSelected ? (
        <div
          ref={editRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onBlur={handleBlur}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          style={{ ...baseTextStyle, outline: 'none', minHeight: '1em' }}
        />
      ) : (
        <div
          style={{ ...baseTextStyle, pointerEvents: 'none' }}
          dangerouslySetInnerHTML={{ __html: text || '' }}
        />
      )}

      {/* Left-edge resize handle for right-positioned box */}
      {isSelected && position === 'right' && (
        <div
          onPointerDown={startResizeLeft}
          style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 6, cursor: 'ew-resize', background: '#a855f7', opacity: 0.7, zIndex: 1 }}
        />
      )}

      {/* Right-edge resize handle for left-positioned box */}
      {isSelected && position === 'left' && (
        <div
          onPointerDown={startResizeRight}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 6, cursor: 'ew-resize', background: '#a855f7', opacity: 0.7, zIndex: 1 }}
        />
      )}

      {isSelected && (
        <button
          style={{ position: 'absolute', top: 2, right: 4, background: '#a855f7', color: '#fff', border: 'none', borderRadius: '50%', width: 18, height: 18, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
        >×</button>
      )}

      {isSelected && (
        <AIQuickMenu
          style={{ top: '100%', right: 4, marginTop: 4 }}
          onOpenAI={onOpenAI}
        />
      )}
    </div>
  );
}

// ── Speech bubble overlay ─────────────────────────────────────────────────────
function BubbleOverlay({ bubble, isSelected, onSelect, onDragStart, onChange, onRemove, onOpenAI }) {
  const { type, text, position, width, height, style: bs } = bubble;

  const handleBlur = (e) => {
    const value = e.currentTarget.value;
    correctText(value).then(({ changed, corrected }) => {
      if (changed) onChange({ text: corrected });
    });
  };

  return (
    <div
      style={{ ...styles.placed, left: position.x, top: position.y, width, cursor: 'grab', outline: isSelected ? '2px solid #22c55e' : 'none' }}
      onPointerDown={(e) => { onSelect(); onDragStart(e); }}
    >
      <BubbleShape type={type} width={width} height={height} style={bs} />
      {isSelected ? (
        <textarea
          style={styles.bubbleTextEdit}
          value={text}
          onChange={(e) => onChange({ text: e.target.value })}
          onBlur={handleBlur}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        />
      ) : (
        <div style={{ ...styles.bubbleText, fontFamily: bs.fontFamily, fontSize: bs.fontSize }}>{text}</div>
      )}
      {isSelected && <button style={{ ...styles.removeItem, background: '#22c55e' }} onClick={onRemove}>×</button>}
      {isSelected && (
        <AIQuickMenu
          style={{ bottom: -10, right: -10 }}
          onOpenAI={onOpenAI}
        />
      )}
    </div>
  );
}

function BubbleShape({ type, width, height, style: bs }) {
  const fill = bs?.fillColor || '#fff';
  const stroke = bs?.strokeColor || '#000';
  if (type === 'thought') {
    return (
      <svg width={width} height={height} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}>
        <ellipse cx={width / 2} cy={height * 0.42} rx={width / 2 - 4} ry={height * 0.4} fill={fill} stroke={stroke} strokeWidth={2} />
        <circle cx={width * 0.35} cy={height * 0.88} r={7} fill={fill} stroke={stroke} strokeWidth={2} />
        <circle cx={width * 0.28} cy={height * 0.97} r={4} fill={fill} stroke={stroke} strokeWidth={2} />
      </svg>
    );
  }
  if (type === 'shout') {
    const pts = [];
    const cx2 = width / 2, cy2 = height * 0.42;
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const r = i % 2 === 0 ? width / 2 - 4 : width / 2 - 14;
      pts.push(`${cx2 + r * Math.cos(a)},${cy2 + r * Math.sin(a) * 0.6}`);
    }
    return (
      <svg width={width} height={height} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}>
        <polygon points={pts.join(' ')} fill={fill} stroke={stroke} strokeWidth={2} />
        <polygon points={`${width * 0.4},${height * 0.82} ${width * 0.5},${height} ${width * 0.55},${height * 0.82}`} fill={fill} stroke={stroke} strokeWidth={2} />
      </svg>
    );
  }
  return (
    <svg width={width} height={height} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}>
      <rect x={4} y={4} width={width - 8} height={height * 0.78} rx={12} fill={fill} stroke={stroke} strokeWidth={type === 'whisper' ? 1 : 2} strokeDasharray={type === 'whisper' ? '5,3' : undefined} />
      <polygon points={`${width * 0.3},${height * 0.82} ${width * 0.4},${height} ${width * 0.5},${height * 0.82}`} fill={fill} stroke={stroke} strokeWidth={type === 'whisper' ? 1 : 2} />
    </svg>
  );
}

const styles = {
  wrapper: { position: 'relative', borderRadius: 14 },
  canvas: { position: 'relative', border: '2px dashed var(--t-panel-border)', borderRadius: 12, overflow: 'hidden', userSelect: 'none' },
  noBgHint: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 1 },
  noBgIcon: { width: 52, height: 52, borderRadius: 14, background: 'rgba(249,115,22,0.10)', color: 'var(--t-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  decorDots: {
    position: 'absolute', top: 12, right: 12, width: 48, height: 48, pointerEvents: 'none', zIndex: 0,
    backgroundImage: 'radial-gradient(circle, var(--t-panel-border) 1.5px, transparent 1.5px)',
    backgroundSize: '8px 8px',
    opacity: 0.6,
  },
  decorBlob: {
    position: 'absolute', bottom: 16, right: 16, width: 80, height: 80, pointerEvents: 'none', zIndex: 0,
    background: 'radial-gradient(ellipse at center, rgba(249,115,22,0.08) 0%, transparent 70%)',
    borderRadius: '50%',
  },
  placed: { position: 'absolute', userSelect: 'none' },
  removeItem: { position: 'absolute', top: -10, right: -10, width: 20, height: 20, background: '#ef4444', color: '#fff', border: 'none', borderRadius: '50%', cursor: 'pointer', fontSize: 14, lineHeight: 1, zIndex: 11 },
  bubbleText: { position: 'absolute', top: 0, left: 0, right: 0, padding: '8px 14px', textAlign: 'center', pointerEvents: 'none', wordBreak: 'break-word' },
  bubbleTextEdit: { position: 'absolute', top: 0, left: 0, right: 0, background: 'transparent', border: 'none', resize: 'none', textAlign: 'center', padding: '8px 14px', fontFamily: 'Comic Neue, cursive', fontSize: 13, outline: 'none', cursor: 'text' },
};
