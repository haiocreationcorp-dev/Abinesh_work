import { useState, useEffect } from 'react';
import { getCharacterPresets, getExpressions, getAssetById, getFacePartAlignmentsPublic } from '../../api/assets.js';
import { buildFaceFromLayout, computeFaceContentBounds, FACE_CANVAS_W, FACE_CANVAS_H } from '../../utils/faceLayout.js';
import { loadTrimRect, trimmedRect } from '../../utils/trimRect.js';
import { hexToRgb } from '../../lighting/lightingEngine.js';
import { recolorSkin, recolorEyeAsset } from '../../utils/recolorImage.js';

const MAX_W = 120;
const MAX_H = 200;
const SHARED_ALIGNMENT_KEY = '__ALL__';

const HAIR_BLEND_MODE = 'multiply';
const HAIR_OPACITY = 0.9;

// Renders one face part, trimmed-to-content — same pattern as FaceRig's FacePart, plus
// optional hair-color tint / skin-tone recolor / eye-colors recolor. Skin uses the same
// exact-match recolorSkin() pixel swap as the body (now that face/nose assets are
// normalized to the 3-tone highlight/base/shadow palette via Palette Normalizer) — gives
// an exact tone match instead of approximating with a blend mode. The eye part's eyebrow
// (synced to hairColor) and iris (its own irisColor) use the same exact-match technique
// via recolorEyeAsset, since that image is normalized to its own two reference colors.
// The hairstyle part still uses a masked multiply tint since hair is a free-form color
// choice, not a fixed-palette swap.
function CPPart({ part, hairColor, skinTone, eyeColors }) {
  const [trim, setTrim] = useState(null);
  useEffect(() => {
    let active = true;
    loadTrimRect(part.filePath).then((t) => { if (active) setTrim(t); });
    return () => { active = false; };
  }, [part.filePath]);

  const [recoloredSrc, setRecoloredSrc] = useState(null);
  useEffect(() => {
    let active = true;
    if (skinTone) {
      recolorSkin(part.filePath, skinTone).then((url) => { if (active) setRecoloredSrc(url); });
    } else if (eyeColors && (eyeColors.hairColor || eyeColors.irisColor)) {
      recolorEyeAsset(part.filePath, eyeColors).then((url) => { if (active) setRecoloredSrc(url); });
    } else {
      setRecoloredSrc(null);
    }
    return () => { active = false; };
  }, [part.filePath, skinTone, eyeColors?.hairColor, eyeColors?.irisColor]);

  const transform = [
    part.rotation ? `rotate(${part.rotation}deg)` : '',
    part.flipX ? 'scaleX(-1)' : '',
    part.flipY ? 'scaleY(-1)' : '',
  ].filter(Boolean).join(' ');

  const rect = trimmedRect(trim, 0, 0, part.w, part.h);
  const hairRgb = hairColor ? hexToRgb(hairColor) : null;
  const imgSrc = recoloredSrc || part.filePath;

  return (
    <div style={{
      position: 'absolute', left: part.x, top: part.y, width: part.w, height: part.h,
      transform, transformOrigin: 'center', overflow: 'hidden', pointerEvents: 'none',
    }}>
      <img src={imgSrc} alt="" draggable={false}
        style={{ position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h, pointerEvents: 'none' }} />
      {hairRgb && (
        <div style={{
          position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h,
          background: `rgba(${hairRgb.r},${hairRgb.g},${hairRgb.b},${HAIR_OPACITY})`,
          mixBlendMode: HAIR_BLEND_MODE, pointerEvents: 'none',
          WebkitMaskImage: `url(${part.filePath})`, maskImage: `url(${part.filePath})`,
          WebkitMaskSize: '100% 100%', maskSize: '100% 100%',
          WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
        }} />
      )}
    </div>
  );
}

// Composites a CharacterPreset onto a BODY_POSE: resolves the right face (front/3-4, with
// front as the never-fails fallback), swaps in the preset's default expression if any,
// places the face into the pose's calibrated head box (from Pose Builder), and recolors
// both the body image and the face shape to the preset's skin tone (plus a hair-color
// tint on the hairstyle part) — all via the existing exact-match recolor/alignment
// mechanisms, nothing new there. instance = { presetId, bodyPoseId }.
export default function CharacterPresetRig({ instance }) {
  const [preset, setPreset] = useState(null);
  const [bodyPose, setBodyPose] = useState(null);
  const [face, setFace] = useState(null); // { faceShape, parts }
  const [headBox, setHeadBox] = useState(null);
  const [naturalSize, setNaturalSize] = useState(null);
  const [recoloredBodySrc, setRecoloredBodySrc] = useState(null);

  useEffect(() => {
    let active = true;
    setFace(null); setHeadBox(null); setNaturalSize(null);
    setRecoloredBodySrc(null);

    (async () => {
      const [presets, pose] = await Promise.all([
        getCharacterPresets(),
        getAssetById(instance.bodyPoseId).catch(() => null),
      ]);
      if (!active) return;
      const p = presets.find((x) => x.id === instance.presetId) || null;
      setPreset(p);
      setBodyPose(pose);
      if (!p || !pose) return;

      const faceId = (pose.view === 'THREE_QUARTER' && p.threeQuarterFaceId) ? p.threeQuarterFaceId : p.frontFaceId;
      if (!faceId) return;

      const [faceAsset, faceAlignments, headAlignments] = await Promise.all([
        getAssetById(faceId).catch(() => null),
        getFacePartAlignmentsPublic(faceId).catch(() => []),
        getFacePartAlignmentsPublic(instance.bodyPoseId).catch(() => []),
      ]);
      if (!active || !faceAsset) return;

      let layout = null;
      if (faceAsset.layoutPath) {
        try { layout = await fetch(faceAsset.layoutPath).then((r) => r.json()); } catch { /* ignore */ }
      }
      const built = buildFaceFromLayout(layout, faceAsset);

      if (p.defaultExpressionId) {
        try {
          const expressions = await getExpressions();
          const expr = expressions.find((e) => e.id === p.defaultExpressionId);
          if (expr) {
            const eyeAlign = faceAlignments.find((a) => a.partType === 'eye' && a.partAssetId === SHARED_ALIGNMENT_KEY);
            const mouthAlign = faceAlignments.find((a) => a.partType === 'mouth' && a.partAssetId === SHARED_ALIGNMENT_KEY);
            const [eyeAsset, mouthAsset] = await Promise.all([
              getAssetById(expr.eyeAssetId).catch(() => null),
              getAssetById(expr.mouthAssetId).catch(() => null),
            ]);
            if (eyeAlign && eyeAsset) {
              built.parts.eye = { ...built.parts.eye, assetId: eyeAsset.id, filePath: eyeAsset.filePath,
                x: eyeAlign.x, y: eyeAlign.y, w: eyeAlign.w, h: eyeAlign.h,
                rotation: eyeAlign.rotation, flipX: eyeAlign.flipX, flipY: eyeAlign.flipY };
            }
            if (mouthAlign && mouthAsset) {
              built.parts.mouth = { ...built.parts.mouth, assetId: mouthAsset.id, filePath: mouthAsset.filePath,
                x: mouthAlign.x, y: mouthAlign.y, w: mouthAlign.w, h: mouthAlign.h,
                rotation: mouthAlign.rotation, flipX: mouthAlign.flipX, flipY: mouthAlign.flipY };
            }
          }
        } catch { /* keep the face template's own eye/mouth */ }
      }

      if (!active) return;
      setFace(built);

      const headAlign = headAlignments.find((a) => a.partType === 'head' && a.partAssetId === SHARED_ALIGNMENT_KEY);
      if (headAlign) setHeadBox({ x: headAlign.x, y: headAlign.y, w: headAlign.w, h: headAlign.h });
    })();

    return () => { active = false; };
  }, [instance.presetId, instance.bodyPoseId]);

  // Per-placement overrides (set via the Comic UI's Skin Tone/Hair Color controls) win
  // over the preset's own defaults, without mutating the underlying CharacterPreset.
  const skinTone = instance.skinTone || preset?.skinTone;
  const hairColor = instance.hairColor || preset?.hairColor;
  const irisColor = instance.irisColor || preset?.irisColor;

  useEffect(() => {
    if (!skinTone || !bodyPose) return;
    let active = true;
    recolorSkin(bodyPose.filePath, skinTone).then((url) => { if (active) setRecoloredBodySrc(url); });
    return () => { active = false; };
  }, [skinTone, bodyPose]);

  if (!bodyPose) return <div style={{ width: MAX_W, height: MAX_H }} />;

  const bodySrc = recoloredBodySrc || bodyPose.filePath;

  if (!naturalSize) {
    // Measuring pass — load invisibly just to get natural width/height before drawing.
    return (
      <div style={{ width: MAX_W, height: MAX_H, position: 'relative', overflow: 'hidden' }}>
        <img src={bodySrc} alt="" draggable={false}
          onLoad={(e) => setNaturalSize({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
          style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }} />
      </div>
    );
  }

  // Content bounds = union of the body image's own pixel bounds and the head box, since
  // a head box can deliberately extend above/beside the body's natural frame (e.g. y<0
  // for a pose whose visible crop starts at the shoulders). Fitting just the body's own
  // size would leave zero margin on that side and the head box would get clipped by the
  // outer overflow:hidden.
  const unionMinX = Math.min(0, headBox?.x ?? 0);
  const unionMinY = Math.min(0, headBox?.y ?? 0);
  const unionMaxX = Math.max(naturalSize.w, headBox ? headBox.x + headBox.w : 0);
  const unionMaxY = Math.max(naturalSize.h, headBox ? headBox.y + headBox.h : 0);
  const drawScale = Math.min(MAX_W / (unionMaxX - unionMinX), MAX_H / (unionMaxY - unionMinY));
  const drawW = Math.round(naturalSize.w * drawScale);
  const drawH = Math.round(naturalSize.h * drawScale);
  const originLeft = (MAX_W - (unionMaxX - unionMinX) * drawScale) / 2 - unionMinX * drawScale;
  const originTop = (MAX_H - (unionMaxY - unionMinY) * drawScale) / 2 - unionMinY * drawScale;

  return (
    <div style={{ width: MAX_W, height: MAX_H, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: originLeft, top: originTop, width: drawW, height: drawH }}>
        <img src={bodySrc} alt={bodyPose.name} draggable={false} style={{ width: drawW, height: drawH, display: 'block' }} />
        {face && headBox && (() => {
          const boxW = headBox.w * drawScale;
          const boxH = headBox.h * drawScale;
          // Fit the face's actual content bounds (not the nominal canvas, which has
          // padding and lets parts like hair extend above y=0) into the head box,
          // uniformly scaled and centered — guarantees nothing gets clipped.
          const bounds = computeFaceContentBounds(face);
          const contentW = bounds.maxX - bounds.minX || FACE_CANVAS_W;
          const contentH = bounds.maxY - bounds.minY || FACE_CANVAS_H;
          const faceScale = Math.min(boxW / contentW, boxH / contentH);
          const innerW = contentW * faceScale;
          const innerH = contentH * faceScale;
          const drawLeft = (boxW - innerW) / 2 - bounds.minX * faceScale;
          const drawTop = (boxH - innerH) / 2 - bounds.minY * faceScale;
          return (
            <div style={{
              position: 'absolute',
              left: headBox.x * drawScale, top: headBox.y * drawScale,
              width: boxW, height: boxH,
              overflow: 'hidden',
            }}>
              <div style={{
                position: 'absolute', left: drawLeft, top: drawTop,
                width: FACE_CANVAS_W, height: FACE_CANVAS_H,
                transform: `scale(${faceScale})`,
                transformOrigin: 'top left',
              }}>
                {face.faceShape && <CPPart part={face.faceShape} skinTone={skinTone} />}
                {['hairstyle', 'nose', 'eye', 'mouth'].map((pt) => {
                  const part = face.parts[pt];
                  if (!part) return null;
                  return (
                    <CPPart key={pt} part={part}
                      hairColor={pt === 'hairstyle' ? hairColor : null}
                      skinTone={pt === 'nose' ? skinTone : null}
                      eyeColors={pt === 'eye' ? { hairColor, irisColor } : null}
                    />
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
