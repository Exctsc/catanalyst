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
