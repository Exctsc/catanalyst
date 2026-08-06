// Board graph derived from the same constants as HexBoard.jsx.
// Indices produced here match HexBoard VERTICES indices exactly.

const SIZE = 50;
const H_SPACING = SIZE * Math.sqrt(3);
const V_SPACING = SIZE * 1.5;
const ROWS = [3, 4, 5, 4, 3];

function round(n) { return Math.round(n * 1000) / 1000; }

// --- Build vertex registry (same traversal order as HexBoard IIFE) ---
const _keyToIdx = {};
export const VERTICES = [];
export const HEX_CENTERS = [];

ROWS.forEach((count, row) => {
  const cy = row * V_SPACING;
  for (let i = 0; i < count; i++) {
    const cx = (i - (count - 1) / 2) * H_SPACING;
    HEX_CENTERS.push({ cx, cy });
    for (let k = 0; k < 6; k++) {
      const angle = Math.PI / 6 + (k * Math.PI) / 3;
      const key = `${round(cx + SIZE * Math.cos(angle))},${round(cy + SIZE * Math.sin(angle))}`;
      if (!(key in _keyToIdx)) {
        _keyToIdx[key] = VERTICES.length;
        VERTICES.push({ x: round(cx + SIZE * Math.cos(angle)), y: round(cy + SIZE * Math.sin(angle)) });
      }
    }
  }
});

function hexVertexIndices(hexIdx) {
  const { cx, cy } = HEX_CENTERS[hexIdx];
  return Array.from({ length: 6 }, (_, k) => {
    const angle = Math.PI / 6 + (k * Math.PI) / 3;
    return _keyToIdx[`${round(cx + SIZE * Math.cos(angle))},${round(cy + SIZE * Math.sin(angle))}`];
  });
}

// HEX_TO_VERTICES[h] — the 6 vertex indices at the corners of hex h
export const HEX_TO_VERTICES = HEX_CENTERS.map((_, hexIdx) => hexVertexIndices(hexIdx));

// VERTEX_TO_HEXES[v] — hex indices whose corner is vertex v (1–3 entries)
export const VERTEX_TO_HEXES = Array.from({ length: VERTICES.length }, () => []);
HEX_CENTERS.forEach((_, hexIdx) => {
  hexVertexIndices(hexIdx).forEach(v => VERTEX_TO_HEXES[v].push(hexIdx));
});

// VERTEX_ADJACENCY[v] — vertices sharing a hex edge with v (distance rule)
export const VERTEX_ADJACENCY = Array.from({ length: VERTICES.length }, () => []);

// EDGES — 72 unique [v1, v2] pairs; index = edgeIndex used in road placement
const _edgeSet = new Set();
export const EDGES = [];

HEX_CENTERS.forEach((_, hexIdx) => {
  const verts = hexVertexIndices(hexIdx);
  for (let k = 0; k < 6; k++) {
    const a = verts[k];
    const b = verts[(k + 1) % 6];
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    if (!_edgeSet.has(key)) {
      _edgeSet.add(key);
      EDGES.push([a, b]);
      VERTEX_ADJACENCY[a].push(b);
      VERTEX_ADJACENCY[b].push(a);
    }
  }
});

// PORTS — the 9 standard harbours: 4 generic 3:1 + one 2:1 per resource type.
// `vertices` are the two coastal intersection indices the port serves; `type`
// is 'generic' (3:1) or a resource name (2:1). `x`/`y` position the dock label
// out to sea; these coastal edges were derived from the same VERTICES geometry.
export const PORTS = [
  { type: 'generic', vertices: [4, 5],   x:  -80, y:  -92 },
  { type: 'ore',     vertices: [9, 12],  x:   80, y:  -92 },
  { type: 'generic', vertices: [22, 24], x:  242, y:   60 },
  { type: 'wheat',   vertices: [35, 36], x:  242, y:  195 },
  { type: 'brick',   vertices: [52, 53], x:  165, y:  378 },
  { type: 'generic', vertices: [50, 51], x:    0, y:  390 },
  { type: 'sheep',   vertices: [48, 49], x: -165, y:  378 },
  { type: 'wood',    vertices: [26, 27], x: -242, y:  195 },
  { type: 'generic', vertices: [16, 17], x: -242, y:   60 },
];

// --- Board extents ---
// The SVG viewBox and the board's unscaled pixel size, derived from the same
// SIZE/spacing constants as the geometry above. Exported from this pure module
// (rather than computed in HexBoard.jsx) so BoardViewport's zoom/pan limits and
// the Node tests can use them without importing JSX.
export const BOARD_PADDING = 65;
export const BOARD_WIDTH = 5 * H_SPACING + 2 * BOARD_PADDING;
export const BOARD_HEIGHT = 4 * V_SPACING + 2 * SIZE + 2 * BOARD_PADDING;
export const BOARD_MIN_X = -2.5 * H_SPACING - BOARD_PADDING;
export const BOARD_MIN_Y = -SIZE - BOARD_PADDING;
