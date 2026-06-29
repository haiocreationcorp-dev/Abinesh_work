import { useState, useEffect } from 'react';
import { getCharacterPresets, getExpressions, getAssetById, getFacePartAlignmentsPublic, getAssets } from '../../api/assets.js';
import { buildFaceFromLayout, computeFaceContentBounds, resolveLayoutFilePaths, orderFaceParts, FACE_CANVAS_W, FACE_CANVAS_H } from '../../utils/faceLayout.js';
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
//
// `presetOverride` lets a caller render a live preview of a NOT-YET-SAVED preset (e.g.
// Character Preset Builder, while the admin is still picking options) — when provided, it's
// used directly instead of fetching+looking up a saved preset by instance.presetId.
// `headBoxOverride` lets a caller (Pose Builder) supply a head box that hasn't been saved
// yet — e.g. while live-dragging the placement box — instead of always fetching the saved
// FacePartAlignment for instance.bodyPoseId. Takes priority over the fetched one when set.
export default function CharacterPresetRig({ instance, presetOverride, headBoxOverride, maxW = MAX_W, maxH = MAX_H }) {
  const [preset, setPreset] = useState(null);
  const [bodyPose, setBodyPose] = useState(null);
  const [face, setFace] = useState(null); // { faceShape, parts }
  const [headBox, setHeadBox] = useState(null);
  const [naturalSize, setNaturalSize] = useState(null);
  const [recoloredBodySrc, setRecoloredBodySrc] = useState(null);

  // Looks up the CharacterPreset definition (name/skinTone/hairColor/face ids/etc) —
  // split from the pose/face effect below so that switching only the placement-level
  // bodyPoseId or hairstyleAssetId (Outfit/Hairstyle tools) doesn't refetch the entire
  // CharacterPreset list every time; it only reruns when the preset identity itself changes.
  useEffect(() => {
    let active = true;
    (async () => {
      if (presetOverride) { if (active) setPreset(presetOverride); return; }
      const presets = await getCharacterPresets().catch(() => []);
      if (!active) return;
      setPreset(presets.find((x) => x.id === instance.presetId) || null);
    })();
    return () => { active = false; };
  }, [instance.presetId, presetOverride]);

  useEffect(() => {
    let active = true;
    // Reset bodyPose too, not just naturalSize/face/headBox — otherwise the still-stale
    // bodyPose object (from the previous costume) briefly renders the measuring pass
    // against the OLD image while naturalSize has already been cleared, capturing the
    // wrong natural pixel dimensions and scaling the new head box against them.
    setBodyPose(null); setFace(null); setHeadBox(null); setNaturalSize(null);
    setRecoloredBodySrc(null);

    (async () => {
      const p = preset;
      if (!p) return;
      const pose = await getAssetById(instance.bodyPoseId).catch(() => null);
      if (!active) return;
      setBodyPose(pose);
      if (!pose) return;

      // Prefer the face matching this body pose's own view; if that view has no face
      // assigned, fall back to whichever view the admin explicitly picked as default
      // (defaultFaceView); if even that isn't set, fall back to whichever face exists.
      const faceId = (pose.view === 'THREE_QUARTER' && p.threeQuarterFaceId) ? p.threeQuarterFaceId
        : (pose.view === 'FRONT' && p.frontFaceId) ? p.frontFaceId
        : (p.defaultFaceView === 'THREE_QUARTER' && p.threeQuarterFaceId) ? p.threeQuarterFaceId
        : (p.defaultFaceView === 'FRONT' && p.frontFaceId) ? p.frontFaceId
        : (p.frontFaceId || p.threeQuarterFaceId);
      if (!faceId) return;
      // Which view (Front/3-4) the face above actually resolved to — used below to keep a
      // chosen expression's eye/mouth art in sync with whatever view the character is
      // currently on, since switching pose (Outfit/Pose tools) doesn't itself touch
      // instance.expressionId.
      const resolvedView = faceId === p.threeQuarterFaceId ? 'THREE_QUARTER' : faceId === p.frontFaceId ? 'FRONT' : null;

      const [faceAsset, faceAlignments, headAlignments] = await Promise.all([
        getAssetById(faceId).catch(() => null),
        getFacePartAlignmentsPublic(faceId).catch(() => []),
        getFacePartAlignmentsPublic(instance.bodyPoseId).catch(() => []),
      ]);
      if (!active || !faceAsset) return;

      let layout = null;
      if (faceAsset.layoutPath) {
        try {
          layout = await fetch(faceAsset.layoutPath).then((r) => r.json());
          layout = await resolveLayoutFilePaths(layout);
        } catch { /* ignore */ }
      }
      const built = buildFaceFromLayout(layout, faceAsset);

      // Per-placement expression override (chosen directly in the Comic canvas) wins over
      // the preset's own default — eye/mouth use the SHARED_ALIGNMENT_KEY (not a per-asset
      // one like hairstyle), so any expression's eye/mouth pair drops into the same
      // calibrated box this specific face (front or 3/4, whichever got resolved above) already
      // has saved.
      const effectiveExpressionId = instance.expressionId || p.defaultExpressionId;
      if (effectiveExpressionId) {
        try {
          const expressions = await getExpressions();
          let expr = expressions.find((e) => e.id === effectiveExpressionId);
          if (expr) {
            const eyeAlign = faceAlignments.find((a) => a.partType === 'eye' && a.partAssetId === SHARED_ALIGNMENT_KEY);
            const mouthAlign = faceAlignments.find((a) => a.partType === 'mouth' && a.partAssetId === SHARED_ALIGNMENT_KEY);
            let [eyeAsset, mouthAsset] = await Promise.all([
              getAssetById(expr.eyeAssetId).catch(() => null),
              getAssetById(expr.mouthAssetId).catch(() => null),
            ]);
            // The chosen expression's own eye art may be for a different view than the face
            // we just landed on (e.g. picked while on a 3/4 pose, then the pose switched to
            // front via Outfit/Pose) — swap to the same-NAME sibling expression for the
            // correct view instead of dragging mismatched-view art and its now-wrong
            // position onto this face.
            if (resolvedView && eyeAsset?.view && eyeAsset.view !== resolvedView) {
              const sibling = expressions.find((e) => e.name === expr.name && e.id !== expr.id);
              if (sibling) {
                const [siblingEye, siblingMouth] = await Promise.all([
                  getAssetById(sibling.eyeAssetId).catch(() => null),
                  getAssetById(sibling.mouthAssetId).catch(() => null),
                ]);
                if (siblingEye?.view === resolvedView) {
                  expr = sibling; eyeAsset = siblingEye; mouthAsset = siblingMouth;
                }
              }
            }
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

      // Per-placement hairstyle override (chosen directly in the Comic canvas) wins over
      // the face template's own native hairstyle — calibrated per-asset (not a shared key
      // like eye/mouth), so its alignment is looked up by the specific override asset id.
      if (instance.hairstyleAssetId) {
        let hairAsset = await getAssetById(instance.hairstyleAssetId).catch(() => null);
        // Same situation as expressions: an override picked while on one view's face
        // doesn't carry over to a different view's face (different pose switched in via
        // Outfit/Pose) — that asset's id simply has no alignment on this face. Swap to the
        // same-NAME sibling hairstyle for the view we're actually on instead of silently
        // falling back to the face's default hair.
        if (resolvedView && hairAsset?.view && hairAsset.view !== resolvedView) {
          const siblings = await getAssets({ category: 'FACE_PART', partType: 'HAIR', view: resolvedView }).catch(() => []);
          const sibling = siblings.find((a) => a.name === hairAsset.name);
          if (sibling) hairAsset = sibling;
        }
        const hairAlign = faceAlignments.find((a) => a.partType === 'hairstyle' && a.partAssetId === hairAsset?.id);
        if (hairAlign && hairAsset) {
          built.parts.hairstyle = { ...built.parts.hairstyle, assetId: hairAsset.id, filePath: hairAsset.filePath,
            x: hairAlign.x, y: hairAlign.y, w: hairAlign.w, h: hairAlign.h,
            rotation: hairAlign.rotation, flipX: hairAlign.flipX, flipY: hairAlign.flipY };
        }
      }

      if (!active) return;
      setFace(built);

      const headAlign = headAlignments.find((a) => a.partType === 'head' && a.partAssetId === SHARED_ALIGNMENT_KEY);
      if (headAlign) setHeadBox({ x: headAlign.x, y: headAlign.y, w: headAlign.w, h: headAlign.h });
    })();

    return () => { active = false; };
  }, [preset, instance.bodyPoseId, instance.hairstyleAssetId, instance.expressionId]);

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

  if (!bodyPose) return <div style={{ width: maxW, height: maxH }} />;

  const bodySrc = recoloredBodySrc || bodyPose.filePath;
  const effectiveHeadBox = headBoxOverride || headBox;

  if (!naturalSize) {
    // Measuring pass — load invisibly just to get natural width/height before drawing.
    return (
      <div style={{ width: maxW, height: maxH, position: 'relative', overflow: 'hidden' }}>
        <img src={bodySrc} alt="" draggable={false}
          onLoad={(e) => setNaturalSize({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
          style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }} />
      </div>
    );
  }

  // Anchor the head box to the FACE SHAPE alone, not the full face+hair+eyes+mouth union
  // — hair length/volume varies wildly between characters, and fitting the whole union
  // into one calibrated box meant the face itself rendered at a different size/position
  // depending purely on hairstyle. Instead: R is the canvas-unit -> natural-pixel ratio
  // that fits just the face shape into the head box; naturalOrigin is where canvas (0,0)
  // lands in natural-pixel space. Hair/eyes/mouth then ride along at that same R/origin
  // (their x/y/w/h are already relative to the same canvas the face shape lives on), so
  // they scale and move in lockstep with the face shape and are free to extend beyond the
  // box's nominal rectangle — exactly like real hair draping past a head outline.
  // Both R and naturalOrigin are independent of drawScale (it cancels out), so they can
  // be computed before drawScale is chosen — needed so the outer canvas can be sized to
  // fit hair overflow too, instead of clipping it.
  let faceGeom = null;
  if (face && effectiveHeadBox) {
    const faceShape = face.faceShape;
    const fsBounds = faceShape
      ? { minX: faceShape.x, minY: faceShape.y, maxX: faceShape.x + faceShape.w, maxY: faceShape.y + faceShape.h }
      : computeFaceContentBounds(face);
    const fsW = (fsBounds.maxX - fsBounds.minX) || FACE_CANVAS_W;
    const fsH = (fsBounds.maxY - fsBounds.minY) || FACE_CANVAS_H;
    const R = Math.min(effectiveHeadBox.w / fsW, effectiveHeadBox.h / fsH);
    const naturalOriginX = effectiveHeadBox.x + (effectiveHeadBox.w - fsW * R) / 2 - fsBounds.minX * R;
    const naturalOriginY = effectiveHeadBox.y + (effectiveHeadBox.h - fsH * R) / 2 - fsBounds.minY * R;
    const contentBounds = computeFaceContentBounds(face);
    faceGeom = {
      R, naturalOriginX, naturalOriginY,
      fullMinX: naturalOriginX + contentBounds.minX * R,
      fullMaxX: naturalOriginX + contentBounds.maxX * R,
      fullMinY: naturalOriginY + contentBounds.minY * R,
      fullMaxY: naturalOriginY + contentBounds.maxY * R,
    };
  }

  // Content bounds = union of the body image's own pixel bounds, the head box, and the
  // face's actual rendered extent (which can spill past the head box via long hair etc.)
  // — a head box (or hair) can deliberately extend above/beside the body's natural frame
  // (e.g. y<0 for a pose whose visible crop starts at the shoulders, or hair draping past
  // the box). Fitting just the body's own size would leave zero margin on that side and
  // this content would get clipped by the outer overflow:hidden.
  const unionMinX = Math.min(0, effectiveHeadBox?.x ?? 0, faceGeom?.fullMinX ?? 0);
  const unionMinY = Math.min(0, effectiveHeadBox?.y ?? 0, faceGeom?.fullMinY ?? 0);
  const unionMaxX = Math.max(naturalSize.w, effectiveHeadBox ? effectiveHeadBox.x + effectiveHeadBox.w : 0, faceGeom?.fullMaxX ?? 0);
  const unionMaxY = Math.max(naturalSize.h, effectiveHeadBox ? effectiveHeadBox.y + effectiveHeadBox.h : 0, faceGeom?.fullMaxY ?? 0);
  const drawScale = Math.min(maxW / (unionMaxX - unionMinX), maxH / (unionMaxY - unionMinY));
  const drawW = Math.round(naturalSize.w * drawScale);
  const drawH = Math.round(naturalSize.h * drawScale);
  const originLeft = (maxW - (unionMaxX - unionMinX) * drawScale) / 2 - unionMinX * drawScale;
  const originTop = (maxH - (unionMaxY - unionMinY) * drawScale) / 2 - unionMinY * drawScale;

  return (
    <div style={{ width: maxW, height: maxH, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: originLeft, top: originTop, width: drawW, height: drawH }}>
        <img src={bodySrc} alt={bodyPose.name} draggable={false} style={{ width: drawW, height: drawH, display: 'block' }} />
        {face && faceGeom && (() => {
          const faceScale = faceGeom.R * drawScale;
          return (
            <div style={{
              position: 'absolute',
              left: faceGeom.naturalOriginX * drawScale, top: faceGeom.naturalOriginY * drawScale,
              width: FACE_CANVAS_W, height: FACE_CANVAS_H,
              transform: `scale(${faceScale})`,
              transformOrigin: 'top left',
            }}>
              {orderFaceParts(face).map(({ pt, part }) => (
                <CPPart key={pt} part={part}
                  hairColor={pt === 'hairstyle' ? hairColor : null}
                  skinTone={(pt === 'nose' || pt === 'faceShape') ? skinTone : null}
                  eyeColors={pt === 'eye' ? { hairColor, irisColor } : null}
                />
              ))}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
