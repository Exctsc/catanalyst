import { isDeepStrictEqual } from 'node:util';
import { findShips, detectPorts, assignPortTypes, iconDistance } from '../src/game/boardImage.js';
import { encodeBoard, decodeBoard } from '../src/game/boardCode.js';
import { validateBoard } from '../src/game/boardGen.js';
import {
  HEX_CENTERS, VERTICES, EDGES, SIZE, COASTAL_EDGES, COAST_RING, coastalNormal, portSlot, DEFAULT_BOARD, PORTS,
} from '../src/game/gameRules.js';

let pass = 0, fail = 0;
function check(name, cond) {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}`);
}

check('30 coastal edges, ring covers them all', COASTAL_EDGES.length === 30 && new Set(COAST_RING).size === 30);
check('standard ports sit on coastal edges', validateBoard(DEFAULT_BOARD).length === 0);

// --- a synthetic online-style board: sea, land, white sails off 9 coastal
// edges (shifted along the coast like Colonist's), orange plank docks.
const SEA = [9, 101, 163], LAND = [120, 160, 90], SAIL = [252, 252, 250], PLANK = [220, 150, 50];
const placement = { x: -320, y: -160, width: 640 };
const k = 1280 / placement.width; // 2 px per board unit
const px = (x, y) => ({ x: (x - placement.x) * k, y: (y - placement.y) * k });
const distToSegment = (p, a, b) => {
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / ((b.x - a.x) ** 2 + (b.y - a.y) ** 2)));
  return Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.y - (a.y + t * (b.y - a.y)));
};
function harbourScene(edges, shift) {
  const ships = edges.map(e => {
    const { mx, my, nx, ny } = coastalNormal(e);
    const sail = px(mx + nx * 1.15 * SIZE - ny * shift * SIZE, my + ny * 1.15 * SIZE + nx * shift * SIZE);
    const [a, b] = EDGES[e].map(v => px(VERTICES[v].x, VERTICES[v].y));
    return { sail, a, b };
  });
  return (x, y) => {
    if (x < 0 || y < 0 || x >= 1280 || y >= 1100) return null;
    const p = { x, y };
    for (const s of ships) if (Math.hypot(x - s.sail.x, y - s.sail.y) < 0.35 * SIZE * k) return SAIL;
    const bx = x / k + placement.x, by = y / k + placement.y;
    if (HEX_CENTERS.some(c => Math.hypot(c.cx - bx, c.cy - by) < SIZE * 0.95)) return LAND;
    for (const s of ships) if (distToSegment(p, s.sail, s.a) < 3 || distToSegment(p, s.sail, s.b) < 3) return PLANK;
    return SEA;
  };
}
const portEdges = PORTS.map(p => COASTAL_EDGES.find(e => EDGES[e].includes(p.vertices[0]) && EDGES[e].includes(p.vertices[1])));
for (const shift of [0, 0.3, -0.3]) {
  const found = findShips(harbourScene(portEdges, shift), placement, 1280).map(s => s.edge).sort((a, b) => a - b);
  check(`finds all 9 harbours by their docks (sails shifted ${shift} along the coast)`, isDeepStrictEqual(found, [...portEdges].sort((a, b) => a - b)));
}
check('no ships means no ports', detectPorts((x, y) => (x >= 0 && y >= 0 && x < 1280 && y < 1100 ? SEA : null), placement, 1280) === null);

// --- icon types: profiles with noise, shuffled, solved with the 4+5 rule
const PROFILE = {
  sheep: { ink: 0.155, dom: 1, aspect: 1.4 },
  wood: { ink: 0.112, dom: 1, aspect: 0.83 },
  brick: { ink: 0.173, dom: 1, aspect: 1.67 }, // brick blurred into one blob at small size
  ore: { ink: 0.113, dom: 0.37, aspect: 0.83 },
  wheat: { ink: 0.061, dom: 0.89, aspect: 0.89 },
  generic: { ink: 0.04, dom: 0.83, aspect: 0.86 },
};
const truth = ['generic', 'wheat', 'generic', 'brick', 'ore', 'generic', 'sheep', 'wood', 'generic'];
const got = assignPortTypes(truth.map(t => PROFILE[t]));
check('assigns the standard harbour set from icon features', isDeepStrictEqual(got, truth));
check('a blurred brick looks like a sheep on its own', iconDistance(PROFILE.brick, 'sheep') < iconDistance(PROFILE.brick, 'brick'));
check('…but the 4+5 harbour set still sorts it out', got[3] === 'brick' && got[6] === 'sheep');
check('fewer than 9 ships: each takes its nearest type', isDeepStrictEqual(assignPortTypes([PROFILE.wood, PROFILE.generic]), ['wood', 'generic']));

// --- moved ports: validation and board codes
const usedElsewhere = new Set(DEFAULT_BOARD.ports.slice(1).flatMap(p => p.vertices));
const freeEdge = COAST_RING.find(e => e !== portEdges[0] && !EDGES[e].some(v => usedElsewhere.has(v)));
const moved = { ...DEFAULT_BOARD, ports: DEFAULT_BOARD.ports.map((p, i) => (i === 0 ? { ...portSlot(freeEdge), type: p.type } : p)) };
check('a port moved to a free coastal edge is valid', validateBoard(moved).length === 0);
const code = encodeBoard(moved);
check('moved ports use the longer version-2 code', code[0] === '2' && code.length === 36 && /^[A-Za-z0-9_-]+$/.test(code));
check('version-2 code round-trips', isDeepStrictEqual(decodeBoard(code), moved));
check('standard boards keep the short version-1 code', encodeBoard(DEFAULT_BOARD)[0] === '1' && encodeBoard(DEFAULT_BOARD).length === 28);
check('version-2 with a bad edge index is rejected', decodeBoard('2' + '_'.repeat(35)) === null);
const inlandEdge = EDGES.findIndex((_, j) => !COASTAL_EDGES.includes(j));
const inland = { ...DEFAULT_BOARD, ports: DEFAULT_BOARD.ports.map((p, i) => (i === 0 ? { ...p, vertices: [...EDGES[inlandEdge]] } : p)) };
check('a port off the coast is rejected, even in free mode', validateBoard(inland, { free: true }).includes('Every port must sit on a coastal edge'));
const neighbour = COAST_RING[(COAST_RING.indexOf(portEdges[1]) + 1) % 30];
const crowded = { ...DEFAULT_BOARD, ports: DEFAULT_BOARD.ports.map((p, i) => (i === 0 ? { ...portSlot(neighbour), type: p.type } : p)) };
check('two ports sharing a corner are rejected', validateBoard(crowded).includes('Two ports share a corner'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
