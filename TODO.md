# Animation Effects – 3-Effect System

## Effects Defined

| # | Name | Duration | Trigger |
|---|------|----------|---------|
| 1 | Grey/Ash fade | 0.5 s | Hairstyle, Expression, Skin colour, Eye colour, Hair colour changes on an existing character |
| 2 | Bottom-up reveal | 2 s | **First placement only** — when a new character is placed into a comic panel for the first time |
| 3 | Disappear → Reappear | 1.5 s gap (reappear at ~1.6 s) | Outfit or Pose changes on an existing character |

## Assignment Matrix

| Sidebar tab / change | Instance field updated | Effect |
|----------------------|------------------------|--------|
| New character placed | (first render) | **Effect 2** – bottom-up reveal |
| Outfit | `bodyPoseId` (via `handleSetPresetBodyPose`) | **Effect 3** – vanish 1.5 s → reappear |
| Pose | `bodyPoseId` (via `handleSetPresetBodyPose`) | **Effect 3** – vanish 1.5 s → reappear |
| Hairstyle | `hairstyleAssetId` | **Effect 1** – grey fade 0.5 s |
| Expression | `expressionId` | **Effect 1** – grey fade 0.5 s |
| Skin colour | `skinTone` | **Effect 1** – grey fade 0.5 s |
| Eye colour | `irisColor` | **Effect 1** – grey fade 0.5 s |
| Hair colour | `hairColor` | **Effect 1** – grey fade 0.5 s |

## Implementation Plan

### 1. `client/src/index.css`
Add two new keyframes:
- `@keyframes fade-grey` — overlays a greyscale/ash tint and fades out over 0.5 s
- `@keyframes vanish-reappear` — opacity 0 for 1.5 s, then snaps back to 1 at ~1.6 s

### 2. `client/src/utils/revealAnimation.js`
Add two new exported helpers alongside existing `playReveal`:
- `playGreyFade(el)` — triggers the `fade-grey` animation (Effect 1, 0.5 s)
- `playVanishReappear(el)` — triggers the `vanish-reappear` animation (Effect 3, ~1.6 s)
Keep `playReveal` unchanged (Effect 2, 2 s bottom-up).

### 3. `client/src/components/comic/CharacterPresetRig.jsx`
- Add `isFirstRender` ref (starts `true`, flipped to `false` after first commit) to distinguish
  first placement (Effect 2) from subsequent swaps.
- Track `prevBodyPoseId` ref to detect outfit/pose changes → Effect 3.
- All other changes (hairstyle, expression, skin, iris, hair colour) → Effect 1.
- Wire the three helpers in the `useEffect([rendered])` block.

### 4. `client/src/components/comic/DressRig.jsx`
DressRig is used for plain CHARACTER dress-mode (not CharacterPreset mode).
- Add `isFirstSlotRender` ref per-part (or a wrapper-level first flag) for Effect 2.
- Classify part category:
  - `cloth`, `neck`, `hands` → Effect 3 (outfit/pose)
  - everything else (`hair`, face parts, etc.) → Effect 1 (hairstyle/expression/colour)
- First placement of any part → Effect 2.

## Status
- [x] Create this TODO file
- [x] Add keyframes to index.css (`fade-grey`, `vanish-reappear`)
- [x] Add `playGreyFade` and `playVanishReappear` to revealAnimation.js
- [x] Update CharacterPresetRig.jsx — isFirstRender/prevBodyPoseId refs + pendingPlayFn routing
- [x] Update DressRig.jsx — isFirstCommit ref per DressPart + OUTFIT_DRESS_KEYS set
