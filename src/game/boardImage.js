// Reading terrain off a screenshot of a board. The image is placed under the
// board in board coordinates ({ x, y, width } of its top-left corner and size;
// its pixels are `naturalWidth` wide), each hex is sampled on a ring between
// the number token and the corners, and the median colour is matched to the
// nearest reference colour. Numbers and ports are left to the user.
import { HEX_CENTERS, SIZE } from './gameRules.js';

// Reference colours per terrain: this app's palette plus typical online-board
// shades. ponytail: nearest-colour matching, extend these lists if a theme misreads.
const REFERENCE = {
  hills: ['#C1440E', '#C8642C', '#B5532F', '#D2691E'],
  forest: ['#228B22', '#1F6B33', '#2E7D32', '#3B6E2A'],
  pasture: ['#90EE90', '#8CC63F', '#9CCC65', '#A5D46A'],
  fields: ['#F4D03F', '#F1C232', '#E5B53A', '#E8C547'],
  mountains: ['#8C8C8C', '#9AA3AD', '#7D868F', '#A0A0A8'],
  desert: ['#DEB887', '#E3CF9A', '#D8C08A', '#E6D3A3'],
};

const hexToRgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

// sRGB (0–255) → OKLab, where Euclidean distance tracks perceived difference.
export function toLab([r, g, b]) {
  const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

const REFERENCE_LAB = Object.entries(REFERENCE).flatMap(([terrain, hexes]) =>
  hexes.map(h => ({ terrain, lab: toLab(hexToRgb(h)) })));

export function classifyColor(rgb) {
  const lab = toLab(rgb);
  let best = null, bestD = Infinity;
  for (const ref of REFERENCE_LAB) {
    const d = (lab[0] - ref.lab[0]) ** 2 + (lab[1] - ref.lab[1]) ** 2 + (lab[2] - ref.lab[2]) ** 2;
    if (d < bestD) { bestD = d; best = ref.terrain; }
  }
  return best;
}

// Board-coordinate sample points for a hex: a ring at 55% of the hex radius,
// clear of the centre token and of pieces sitting on corners and edges.
export function samplePoints(hexIndex, count = 12) {
  const { cx, cy } = HEX_CENTERS[hexIndex];
  return Array.from({ length: count }, (_, k) => {
    const a = (2 * Math.PI * k) / count;
    return { x: cx + 0.55 * SIZE * Math.cos(a), y: cy + 0.55 * SIZE * Math.sin(a) };
  });
}

const median = xs => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

// getPixel(px, py) → [r, g, b] or null outside the image. Returns 19 terrains;
// a hex whose ring falls outside the image keeps `fallback[h]`.
export function detectTerrains(getPixel, placement, naturalWidth, fallback = []) {
  const k = naturalWidth / placement.width;
  return HEX_CENTERS.map((_, h) => {
    const colours = samplePoints(h)
      .map(p => getPixel(Math.round((p.x - placement.x) * k), Math.round((p.y - placement.y) * k)))
      .filter(Boolean);
    if (colours.length < 4) return fallback[h] ?? 'desert';
    return classifyColor([0, 1, 2].map(c => median(colours.map(col => col[c]))));
  });
}

// Two-click alignment: q0 / q18 are the image-pixel positions the user clicked
// for the centres of the top-left hex (0) and bottom-right hex (18). Returns
// the placement { x, y, width } that puts them on those hexes. No rotation.
export function alignFromHexes(q0, q18, naturalWidth) {
  const h0 = HEX_CENTERS[0], h18 = HEX_CENTERS[18];
  const k = Math.hypot(h18.cx - h0.cx, h18.cy - h0.cy) / Math.hypot(q18.x - q0.x, q18.y - q0.y);
  const mid = { x: (h0.cx + h18.cx) / 2, y: (h0.cy + h18.cy) / 2 };
  return { x: mid.x - ((q0.x + q18.x) / 2) * k, y: mid.y - ((q0.y + q18.y) / 2) * k, width: naturalWidth * k };
}

// Board point → image pixel for a placement.
export function toImagePixel(point, placement, naturalWidth) {
  const k = naturalWidth / placement.width;
  return { x: (point.x - placement.x) * k, y: (point.y - placement.y) * k };
}

// ---------------------------------------------------------------------------
// Number tokens. A token is a pale patch (white square, cream disc) holding
// dark or red "ink": the number above a row of pips. Reading it needs no OCR:
//   pips 1 → 2/12, 2 → 3/11, 3 → 4/10, 4 → 5/9, 5 → 6/8
//   two digits → 10/11/12; a closed loop splits 9 from 5; two loops make an 8.
// ---------------------------------------------------------------------------

const luma = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;
const chroma = c => Math.max(...c) - Math.min(...c);
const isPaper = c => luma(c) >= 185 && chroma(c) <= 70;

// 4-connected components of the cells where mask[i] is true. w × h grid.
function components(mask, w, h) {
  const label = new Int32Array(w * h).fill(-1);
  const comps = [];
  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || label[start] >= 0) continue;
    const id = comps.length, cells = [start];
    label[start] = id;
    let x0 = w, y0 = h, x1 = 0, y1 = 0;
    for (let k = 0; k < cells.length; k++) {
      const i = cells[k], x = i % w, y = (i / w) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
        if (j >= 0 && mask[j] && label[j] < 0) { label[j] = id; cells.push(j); }
      }
    }
    comps.push({ id, cells, x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 });
  }
  return { label, comps };
}

// Cells inside a bounding box that are not `inside` and cannot reach the box
// edge through other non-`inside` cells: the holes of a shape.
function holes(inside, w, box) {
  const bw = box.w, bh = box.h;
  const free = new Uint8Array(bw * bh);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) free[y * bw + x] = inside((box.y0 + y) * w + box.x0 + x) ? 0 : 1;
  const outside = new Uint8Array(bw * bh), queue = [];
  for (let x = 0; x < bw; x++) for (const y of [0, bh - 1]) if (free[y * bw + x]) { outside[y * bw + x] = 1; queue.push(y * bw + x); }
  for (let y = 0; y < bh; y++) for (const x of [0, bw - 1]) if (free[y * bw + x] && !outside[y * bw + x]) { outside[y * bw + x] = 1; queue.push(y * bw + x); }
  for (let k = 0; k < queue.length; k++) {
    const i = queue[k], x = i % bw, y = (i / bw) | 0;
    for (const j of [x > 0 ? i - 1 : -1, x < bw - 1 ? i + 1 : -1, y > 0 ? i - bw : -1, y < bh - 1 ? i + bw : -1]) {
      if (j >= 0 && free[j] && !outside[j]) { outside[j] = 1; queue.push(j); }
    }
  }
  const hole = new Uint8Array(bw * bh);
  for (let i = 0; i < bw * bh; i++) hole[i] = free[i] && !outside[i] ? 1 : 0;
  return { hole, bw, bh };
}

// Read the token in a square window around (cx, cy) of half-size `reach`
// image pixels. Returns { number, pips, digits, loops, red } or null.
export function readToken(getPixel, cx, cy, reach) {
  const left = Math.round(cx - reach), top = Math.round(cy - reach);
  const w = Math.round(2 * reach), h = w;
  const px = new Array(w * h);
  const paper = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = getPixel(left + x, top + y);
    px[y * w + x] = c;
    paper[y * w + x] = c && isPaper(c) ? 1 : 0;
  }

  // The token is the pale patch with the most separate ink marks inside it.
  const { label, comps } = components(paper, w, h);
  let best = null;
  for (const comp of comps) {
    if (comp.w < reach * 0.25 || comp.h < reach * 0.25 || comp.w > reach * 1.9) continue;
    const { hole, bw, bh } = holes(i => label[i] === comp.id, w, comp);
    // Ink only: pale counters inside a digit (the middle of a 9) stay out.
    for (let i = 0; i < bw * bh; i++) if (hole[i] && paper[(comp.y0 + ((i / bw) | 0)) * w + comp.x0 + (i % bw)]) hole[i] = 0;
    const marks = components(hole, bw, bh).comps.filter(m => m.cells.length >= 3);
    if (marks.length >= 2 && (!best || marks.length > best.marks.length || (marks.length === best.marks.length && comp.cells.length > best.comp.cells.length))) {
      best = { comp, marks, bw };
    }
  }
  if (!best) return null;

  const { comp, marks, bw } = best;
  const H = comp.h;
  const digitMarks = marks.filter(m => m.h >= 0.25 * H);
  const pipMarks = marks.filter(m => m.h < 0.2 * H && m.y0 > 0.45 * H);
  if (!digitMarks.length) return null;
  // Small screenshots blur a row of pips into one bar; a pip is about as wide
  // as it is tall, with a little gap, so a bar's length gives the count.
  const pips = pipMarks.reduce((n, m) => n + (m.w > 1.6 * m.h ? Math.round((m.w - m.h) / (1.25 * m.h)) + 1 : 1), 0);

  // Digits: separate marks, or one wide mark when they touch.
  const dx0 = Math.min(...digitMarks.map(m => m.x0)), dx1 = Math.max(...digitMarks.map(m => m.x1));
  const dy0 = Math.min(...digitMarks.map(m => m.y0)), dy1 = Math.max(...digitMarks.map(m => m.y1));
  const digits = digitMarks.length >= 2 || (dx1 - dx0 + 1) / (dy1 - dy0 + 1) > 0.95 ? 2 : 1;

  // Loops inside a single digit: pale counters enclosed by its ink.
  let loops = 0;
  if (digits === 1) {
    const d = digitMarks[0];
    const inDigit = new Set(d.cells);
    const { hole: counters, bw: cw, bh: ch } = holes(i => inDigit.has(i), bw, d);
    loops = components(counters, cw, ch).comps.filter(c => c.cells.length >= 2).length;
  }

  // Red ink (6 and 8): a good share of the digit's pixels clearly red. Edge
  // pixels blend with the paper, so this is a share, not an average.
  let reddish = 0, n = 0;
  for (const d of digitMarks) for (const i of d.cells) {
    const c = px[(comp.y0 + ((i / bw) | 0)) * w + comp.x0 + (i % bw)];
    if (!c) continue;
    n++;
    if (c[0] - Math.max(c[1], c[2]) > 60) reddish++;
  }
  const red = n > 0 && reddish / n > 0.3;

  let number = null;
  const p = red ? 5 : pips;
  if (p === 1) number = digits === 2 ? 12 : 2;
  else if (p === 2) number = digits === 2 ? 11 : 3;
  else if (p === 3) number = digits === 2 ? 10 : 4;
  else if (p === 4) number = loops >= 1 ? 9 : 5;
  else if (p === 5) number = loops >= 2 ? 8 : 6;
  return { number, pips, digits, loops, red };
}

// Numbers for all 19 hexes from an aligned screenshot (null where no token reads).
export function detectNumbers(getPixel, placement, naturalWidth) {
  const k = naturalWidth / placement.width;
  return HEX_CENTERS.map(({ cx, cy }) => {
    const t = readToken(getPixel, (cx - placement.x) * k, (cy - placement.y) * k, 0.95 * SIZE * k);
    return t ? t.number : null;
  });
}
