// Shared trim-rect logic: detects an image's non-transparent content bounds and
// computes how to place/scale that image so its trimmed content fills a target box,
// centered — matching the live PartAssembler canvas's part rendering.

const cache = new Map(); // filePath -> trim rect | null

// Detects the tight non-transparent bounding box of a loaded <img> element via offscreen canvas.
export function computeTrimRect(img) {
  try {
    const nw = img.naturalWidth, nh = img.naturalHeight;
    if (nw < 1 || nh < 1) return null;
    const limit = 256;
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

// Loads an image from filePath and computes its trim rect, caching the result.
export function loadTrimRect(filePath) {
  if (cache.has(filePath)) return Promise.resolve(cache.get(filePath));
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const trim = computeTrimRect(img);
      cache.set(filePath, trim);
      resolve(trim);
    };
    img.onerror = () => { cache.set(filePath, null); resolve(null); };
    img.src = filePath;
  });
}

// Returns the position/size for the FULL (untrimmed) image such that its trimmed
// content fills (boxW x boxH) at (boxX, boxY), centered. If trim is null, the image
// is placed to exactly fill the box (no adjustment).
export function trimmedRect(trim, boxX, boxY, boxW, boxH) {
  if (!trim) return { x: boxX, y: boxY, w: boxW, h: boxH };
  const { minX, minY, maxX, maxY, nw, nh } = trim;
  const cw = maxX - minX, ch = maxY - minY;
  if (cw <= 0 || ch <= 0) return { x: boxX, y: boxY, w: boxW, h: boxH };
  const scale = Math.min(boxW / cw, boxH / ch);
  const imgW = nw * scale, imgH = nh * scale;
  const contentW = cw * scale, contentH = ch * scale;
  return {
    x: boxX - minX * scale + (boxW - contentW) / 2,
    y: boxY - minY * scale + (boxH - contentH) / 2,
    w: imgW, h: imgH,
  };
}
