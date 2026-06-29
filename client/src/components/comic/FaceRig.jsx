import { useState, useEffect } from 'react';
import { FACE_CANVAS_W, FACE_CANVAS_H, orderFaceParts } from '../../utils/faceLayout.js';
import { loadTrimRect, trimmedRect } from '../../utils/trimRect.js';
import { hexToRgb } from '../../lighting/lightingEngine.js';

const BASE_W = 120;
const BASE_H = 200;
const SCALE = Math.min(BASE_W / FACE_CANVAS_W, BASE_H / FACE_CANVAS_H);
const INNER_W = FACE_CANVAS_W * SCALE;
const INNER_H = FACE_CANVAS_H * SCALE;

// Renders one face part, trimmed-to-content and centered within its box —
// matching the live PartAssembler canvas's rendering for this image.
function FacePart({ part }) {
  const [trim, setTrim] = useState(null);
  useEffect(() => {
    let active = true;
    loadTrimRect(part.filePath).then((t) => { if (active) setTrim(t); });
    return () => { active = false; };
  }, [part.filePath]);

  const transform = [
    part.rotation ? `rotate(${part.rotation}deg)` : '',
    part.flipX ? 'scaleX(-1)' : '',
    part.flipY ? 'scaleY(-1)' : '',
  ].filter(Boolean).join(' ');

  const rect = trimmedRect(trim, 0, 0, part.w, part.h);
  const overlayRgb = part.skinOverlay ? hexToRgb(part.skinOverlay.color) : null;
  const hairOverlayRgb = part.hairOverlay ? hexToRgb(part.hairOverlay.color) : null;

  return (
    <div style={{
      position: 'absolute', left: part.x, top: part.y, width: part.w, height: part.h,
      transform, transformOrigin: 'center', overflow: 'hidden', pointerEvents: 'none',
    }}>
      <img src={part.filePath} alt="" draggable={false}
        style={{ position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h, pointerEvents: 'none' }} />
      {overlayRgb && (
        <div style={{
          position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h,
          background: `rgba(${overlayRgb.r},${overlayRgb.g},${overlayRgb.b},${(part.skinOverlay.opacity ?? 50) / 100})`,
          mixBlendMode: part.skinOverlay.blendMode || 'multiply', pointerEvents: 'none',
          WebkitMaskImage: `url(${part.filePath})`, maskImage: `url(${part.filePath})`,
          WebkitMaskSize: '100% 100%', maskSize: '100% 100%',
          WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
          WebkitMaskPosition: '0 0', maskPosition: '0 0',
        }} />
      )}
      {hairOverlayRgb && (
        <div style={{
          position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h,
          background: `rgba(${hairOverlayRgb.r},${hairOverlayRgb.g},${hairOverlayRgb.b},${(part.hairOverlay.opacity ?? 50) / 100})`,
          mixBlendMode: part.hairOverlay.blendMode || 'multiply', pointerEvents: 'none',
          WebkitMaskImage: `url(${part.filePath})`, maskImage: `url(${part.filePath})`,
          WebkitMaskSize: '100% 100%', maskSize: '100% 100%',
          WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
          WebkitMaskPosition: '0 0', maskPosition: '0 0',
        }} />
      )}
    </div>
  );
}

export default function FaceRig({ face }) {
  const { faceShape, parts = {} } = face;
  return (
    <div style={{ width: BASE_W, height: BASE_H, position: 'relative', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute',
        left: (BASE_W - INNER_W) / 2, top: (BASE_H - INNER_H) / 2,
        width: FACE_CANVAS_W, height: FACE_CANVAS_H,
        transform: `scale(${SCALE})`, transformOrigin: 'top left',
      }}>
        {orderFaceParts({ faceShape, parts }).map(({ pt, part }) => (
          <FacePart key={pt} part={part} />
        ))}
      </div>
    </div>
  );
}
