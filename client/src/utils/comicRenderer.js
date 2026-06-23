import { processBubbleSvg, tightenSvgViewBoxString } from '../components/comic/Panel.jsx';

// ── Pure canvas-based comic page renderer (no html2canvas — avoids SVG/transform issues) ──
// Used by both the export feature (ComicEditorPage) and the teacher's read-only comic viewer.
export const RENDER_SCALE = 3;
const RENDER_GAP = 6;
// Must match LAYOUT_CANVAS in ComicEditor.jsx — item positions are stored in that coordinate space
export const LAYOUTS = { single:{cols:1,pw:600,ph:338}, '2h':{cols:2,pw:296,ph:338}, '2v':{cols:1,pw:600,ph:165}, '4':{cols:2,pw:296,ph:165} };
export const LAYOUT_COUNT = { single:1, '2h':2, '2v':2, '4':4 };
const BASE_W = 120, BASE_H = 200;

const svgRawCache = {};

const loadImg = (src) => new Promise((resolve) => {
  const img = new Image(); img.crossOrigin = 'anonymous';
  img.onload = () => resolve(img); img.onerror = () => resolve(null);
  img.src = src;
});

const loadImgPlain = (src) => new Promise((resolve) => {
  const img = new Image();
  img.onload = () => resolve(img); img.onerror = () => resolve(null);
  img.src = src;
});

// Mirrors CSS `background-size: cover; background-position: center` (the live panel's
// background style) — crops to fill instead of stretching to fit.
const drawCover = (ctx, img, x, y, w, h) => {
  const ir = img.width / img.height, fr = w / h;
  let sx, sy, sw, sh;
  if (ir > fr) { sh = img.height; sw = sh * fr; sx = (img.width - sw) / 2; sy = 0; }
  else { sw = img.width; sh = sw / fr; sx = 0; sy = (img.height - sh) / 2; }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
};

// contentEditable text is stored as HTML (e.g. "Hello<br>World") — convert to plain lines
const htmlToLines = (html) => {
  if (!html) return [];
  const tmp = document.createElement('div');
  tmp.innerHTML = html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div)>/gi, '\n');
  return (tmp.textContent || '').replace(/\n{2,}/g, '\n').split('\n');
};

// Draws a placed SVG speech bubble (data.bubbles) — same shape/recolor logic as the live editor
const drawSvgBubble = async (ctx, x, y, bubble) => {
  const w = bubble.width || 220, h = bubble.height || 150;
  const rotation = bubble.rotation || 0;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(rotation * Math.PI / 180);
  ctx.translate(-w / 2, -h / 2);

  let raw = svgRawCache[bubble.filePath];
  if (raw === undefined) {
    raw = await fetch(bubble.filePath).then((r) => r.text()).catch(() => null);
    svgRawCache[bubble.filePath] = raw;
  }
  if (raw) {
    let processed = processBubbleSvg(raw, bubble.fillColor || '#F5C518', bubble.strokeColor || '#000000', bubble.showShadow !== false, bubble.flipX || false, bubble.strokeWidth);
    processed = tightenSvgViewBoxString(processed, bubble.flipX || false);
    const svgUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(processed);
    const img = await loadImgPlain(svgUrl);
    if (img) ctx.drawImage(img, 0, 0, w, h);
  } else {
    ctx.fillStyle = bubble.fillColor || '#F5C518';
    ctx.strokeStyle = bubble.strokeColor || '#000000';
    ctx.lineWidth = bubble.strokeWidth || 2;
    const r = 12;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(0, 0, w, h, r) : ctx.rect(0, 0, w, h);
    ctx.fill(); ctx.stroke();
  }

  const ts = bubble.textStyle || {};
  const lines = htmlToLines(bubble.text);
  if (lines.length && lines.some((l) => l.trim())) {
    const fontSize = ts.fontSize || 16;
    const weight = ts.bold ? 'bold' : 'normal';
    const styleIt = ts.italic ? 'italic' : 'normal';
    ctx.font = `${styleIt} ${weight} ${fontSize}px ${ts.fontFamily || "'Comic Sans MS', cursive"}`;
    ctx.fillStyle = ts.color || '#000000';
    const align = ts.textAlign || 'center';
    ctx.textAlign = align === 'left' || align === 'right' ? align : 'center';
    ctx.textBaseline = 'middle';
    const zoneX = w * 0.10, zoneY = h * 0.06, zoneW = w * 0.80, zoneH = h * 0.75;
    const lineH = fontSize * 1.3;
    const totalH = lines.length * lineH;
    const startY = zoneY + zoneH / 2 - totalH / 2 + lineH / 2;
    const tx = ctx.textAlign === 'left' ? zoneX : ctx.textAlign === 'right' ? zoneX + zoneW : zoneX + zoneW / 2;
    lines.forEach((line, i) => ctx.fillText(line, tx, startY + i * lineH));
  }
  ctx.restore();
};

const drawBubble = (ctx, bx, by, bubble) => {
  const { type, text, width: bw, height: bh, style: bs = {} } = bubble;
  const fill = bs.fillColor || '#fff', stroke = bs.strokeColor || '#000';
  const fontSize = bs.fontSize || 14;
  ctx.save();
  if (type === 'thought') {
    ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(bx+bw/2, by+bh*0.42, bw/2-4, bh*0.4, 0, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(bx+bw*0.35, by+bh*0.88, 7, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(bx+bw*0.28, by+bh*0.97, 4, 0, Math.PI*2); ctx.fill(); ctx.stroke();
  } else if (type === 'shout') {
    const cx2=bx+bw/2, cy2=by+bh*0.42;
    ctx.fillStyle=fill; ctx.strokeStyle=stroke; ctx.lineWidth=2;
    ctx.beginPath();
    for(let i=0;i<20;i++){const a=(i/20)*Math.PI*2,r=i%2===0?bw/2-4:bw/2-14;const px=cx2+r*Math.cos(a),py=cy2+r*Math.sin(a)*0.6;i===0?ctx.moveTo(px,py):ctx.lineTo(px,py);}
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx+bw*0.4,by+bh*0.82); ctx.lineTo(bx+bw*0.5,by+bh); ctx.lineTo(bx+bw*0.55,by+bh*0.82); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else {
    const isDash = type === 'whisper';
    ctx.fillStyle=fill; ctx.strokeStyle=stroke; ctx.lineWidth=isDash?1:2;
    if(isDash) ctx.setLineDash([5,3]);
    const rx=12,rx2=bx+4,ry2=by+4,rw2=bw-8,rh2=bh*0.78;
    ctx.beginPath();
    ctx.moveTo(rx2+rx,ry2); ctx.lineTo(rx2+rw2-rx,ry2); ctx.arcTo(rx2+rw2,ry2,rx2+rw2,ry2+rx,rx);
    ctx.lineTo(rx2+rw2,ry2+rh2-rx); ctx.arcTo(rx2+rw2,ry2+rh2,rx2+rw2-rx,ry2+rh2,rx);
    ctx.lineTo(rx2+rx,ry2+rh2); ctx.arcTo(rx2,ry2+rh2,rx2,ry2+rh2-rx,rx);
    ctx.lineTo(rx2,ry2+rx); ctx.arcTo(rx2,ry2,rx2+rx,ry2,rx);
    ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(bx+bw*0.3,by+bh*0.82); ctx.lineTo(bx+bw*0.4,by+bh); ctx.lineTo(bx+bw*0.5,by+bh*0.82); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.fillStyle = bs.textColor || '#000';
  ctx.font = `${fontSize}px ${bs.fontFamily || 'Arial, sans-serif'}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const lines = (text || '').split('\n'), lineH = fontSize * 1.3;
  lines.forEach((line, i) => ctx.fillText(line, bx+bw/2, by+bh*0.35+(i-(lines.length-1)/2)*lineH));
  ctx.restore();
};

const drawPanel = async (ctx, data, x, y, w, h) => {
  // Background (clipped to panel)
  ctx.save(); ctx.beginPath(); ctx.rect(x,y,w,h); ctx.clip();
  if (data.background?.filePath) {
    const bg = await loadImg(data.background.filePath);
    if (bg) drawCover(ctx, bg, x, y, w, h);
    else { ctx.fillStyle='#fff'; ctx.fillRect(x,y,w,h); }
  } else { ctx.fillStyle='#fff'; ctx.fillRect(x,y,w,h); }
  ctx.restore();
  // Items: props, effects, costumes, characters (characters rendered on top)
  const items = [...(data.props||[]),...(data.effects||[]),...(data.costumes||[]),...(data.characters||[])];
  for (const item of items) {
    if (!item.filePath) continue;
    const img = await loadImg(item.filePath);
    if (!img) continue;
    const scale = item.scale || 1;
    const rot   = (item.rotation || 0) * Math.PI / 180;
    const flipX = item.flipX ? -1 : 1;
    const { left:cl=0, right:cr=0, top:ct=0, bottom:cb=0 } = item.crop || {};
    ctx.save();
    ctx.beginPath(); ctx.rect(x,y,w,h); ctx.clip(); // keep inside panel
    ctx.translate(x + item.position.x + BASE_W/2, y + item.position.y + BASE_H/2);
    ctx.rotate(rot); ctx.scale(flipX*scale, scale);
    ctx.translate(-BASE_W/2, -BASE_H/2);
    if (cl||cr||ct||cb) { ctx.beginPath(); ctx.rect(cl,ct,BASE_W-cl-cr,BASE_H-ct-cb); ctx.clip(); }
    ctx.drawImage(img, 0, 0, BASE_W, BASE_H);
    ctx.restore();
  }
  // Speech bubbles (legacy code-drawn)
  for (const b of (data.speechBubbles||[])) drawBubble(ctx, x+b.position.x, y+b.position.y, b);
  // Placed SVG bubbles (the bubble shapes used by the Bubbles tab)
  for (const b of (data.bubbles||[])) await drawSvgBubble(ctx, x+(b.position?.x||0), y+(b.position?.y||0), b);
  // Narration boxes
  for (const nb of (data.narrationBoxes||[])) {
    const fs = nb.style?.fontSize || 13;
    const lh = fs * 1.3;
    const lines = htmlToLines(nb.text);
    let bx, by, bw, bh;
    if (nb.position === 'top')    { bx=x;           by=y;         bw=w;                   bh=nb.style?.height||40; }
    else if (nb.position==='bottom') { bx=x;         by=y+h-(nb.style?.height||40); bw=w; bh=nb.style?.height||40; }
    else if (nb.position==='left')   { bx=x;         by=y;         bw=nb.style?.width||60; bh=h; }
    else if (nb.position==='right')  { bx=x+w-(nb.style?.width||60); by=y; bw=nb.style?.width||60; bh=h; }
    else { bx=x; by=y; bw=w; bh=nb.style?.height||40; }
    ctx.fillStyle = nb.style?.fillColor || '#000';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = nb.style?.textColor || '#fff';
    ctx.font = `${fs}px Comic Neue, Arial, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const cx2 = bx + bw / 2, cy2 = by + bh / 2;
    lines.forEach((line, i) => ctx.fillText(line, cx2, cy2 + (i - (lines.length-1)/2) * lh));
  }
};

// Renders one comic page (its panels) to an offscreen canvas at RENDER_SCALE resolution.
export const renderPage = async (pagePanels, layout) => {
  const g = LAYOUTS[layout] || LAYOUTS.single;
  const count = LAYOUT_COUNT[layout] || 1;
  const rows  = Math.ceil(count / g.cols);
  const totalW = g.cols*g.pw + (g.cols-1)*RENDER_GAP;
  const totalH = rows*g.ph  + (rows-1)*RENDER_GAP;
  const canvas = document.createElement('canvas');
  canvas.width = totalW * RENDER_SCALE; canvas.height = totalH * RENDER_SCALE;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.scale(RENDER_SCALE, RENDER_SCALE);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,totalW,totalH);
  for (let i = 0; i < pagePanels.length; i++) {
    const col = i % g.cols, row = Math.floor(i / g.cols);
    await drawPanel(ctx, pagePanels[i].data||{}, col*(g.pw+RENDER_GAP), row*(g.ph+RENDER_GAP), g.pw, g.ph);
  }
  return canvas;
};

// Index of the first panel belonging to page `idx`, given each page's panel count by layout.
export const pageStartIndex = (pages, idx) => {
  let s = 0; for (let i=0;i<idx;i++) s += (LAYOUT_COUNT[pages[i]?.layout]||1); return s;
};

// Renders a whole comic (its pages + panels, as returned by getComic()) to a multi-page PDF Blob.
// One PDF page per comic page (no 2-up pairing — that's just a print-layout nicety the main
// export feature uses; submissions don't need it).
export const renderComicToPdfBlob = async (comic) => {
  const { jsPDF } = await import('jspdf');
  const pages = comic.pages?.length ? comic.pages : [{ layout: 'single' }];
  let pdf = null;
  for (let i = 0; i < pages.length; i++) {
    const layout = pages[i]?.layout || 'single';
    const start = pageStartIndex(pages, i);
    const panels = comic.panels.slice(start, start + (LAYOUT_COUNT[layout] || 1));
    const canvas = await renderPage(panels, layout);
    const w = canvas.width / RENDER_SCALE, h = canvas.height / RENDER_SCALE;
    const orient = w >= h ? 'landscape' : 'portrait';
    if (!pdf) pdf = new jsPDF({ orientation: orient, unit: 'px', format: [w, h] });
    else pdf.addPage([w, h], orient);
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, w, h);
  }
  return pdf.output('blob');
};
