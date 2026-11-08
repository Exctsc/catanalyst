import { classifyColor, detectTerrains, samplePoints, toLab, alignFromHexes, toImagePixel } from '../src/game/boardImage.js';
import { HEX_CENTERS, SIZE, DEFAULT_BOARD } from '../src/game/gameRules.js';
import { generateBoard } from '../src/game/boardGen.js';
import { createRng } from '../src/game/rng.js';

let pass = 0, fail = 0;
function check(name, cond) {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}`);
}

// --- colour classification
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const cases = {
  hills: ['#C1440E', '#CD5C2A', '#B0502A'],
  forest: ['#228B22', '#25703A', '#355E2B'],
  pasture: ['#90EE90', '#94C84A', '#A8D870'],
  fields: ['#F4D03F', '#EDC03A', '#DDB040'],
  mountains: ['#8C8C8C', '#959EA8', '#76808A'],
  desert: ['#DEB887', '#E0CC98', '#D4BC8C'],
};
for (const [terrain, colours] of Object.entries(cases)) {
  check(`classifies ${terrain} shades`, colours.every(c => classifyColor(rgb(c)) === terrain));
}
check('OKLab of white is L=1', Math.abs(toLab([255, 255, 255])[0] - 1) < 1e-3);

// --- a synthetic screenshot: each hex filled with a shade of its terrain, a
// beige number token in the middle, a settlement-sized blob on one corner,
// plus noise. Pixels are 2.5x board units, offset arbitrarily.
const SHADE = { hills: '#C8642C', forest: '#1F6B33', pasture: '#8CC63F', fields: '#F1C232', mountains: '#9AA3AD', desert: '#E3CF9A' };
function screenshot(board, placement, scale) {
  let seed = 7;
  const noise = () => { seed = (seed * 16807) % 2147483647; return (seed % 21) - 10; };
  return (px, py) => {
    if (px < 0 || py < 0 || px >= 2000 || py >= 2000) return null;
    const bx = px / scale + placement.x, by = py / scale + placement.y;
    let h = -1, d = Infinity;
    HEX_CENTERS.forEach((c, i) => { const dd = Math.hypot(c.cx - bx, c.cy - by); if (dd < d) { d = dd; h = i; } });
    if (d > SIZE) return [40, 90, 160]; // sea
    if (d < 0.35 * SIZE) return [245, 230, 200]; // number token
    const { cx, cy } = HEX_CENTERS[h];
    if (Math.hypot(bx - (cx + SIZE * 0.866), by - (cy + SIZE * 0.5)) < 12) return [220, 40, 40]; // a settlement
    return rgb(SHADE[board.tiles[h]]).map(c => Math.max(0, Math.min(255, c + noise())));
  };
}

const placement = { x: -320, y: -140, width: 800 };
const scale = 2.5; // natural width 2000 px over 800 board units
for (const [label, board] of [['default board', DEFAULT_BOARD], ['random board', generateBoard(createRng(3))[0]], ['balanced board', generateBoard(createRng(9), { balanced: true })[0]]]) {
  const tiles = detectTerrains(screenshot(board, placement, scale), placement, 2000);
  check(`detects every hex of the ${label}`, tiles.join() === board.tiles.join());
}

// A misaligned overlay reads the wrong hexes: alignment matters.
const shifted = { ...placement, x: placement.x + SIZE * 1.7 };
check('a shifted overlay does not match', detectTerrains(screenshot(DEFAULT_BOARD, placement, scale), shifted, 2000).join() !== DEFAULT_BOARD.tiles.join());

// Hexes outside the image keep the fallback.
const tiny = { x: -40, y: -40, width: 80 };
const fallback = DEFAULT_BOARD.tiles;
const partial = detectTerrains((px, py) => (px >= 0 && py >= 0 && px < 200 && py < 200 ? [200, 200, 200] : null), tiny, 200, fallback);
check('hexes off the image keep their current terrain', partial[18] === fallback[18] && partial[0] === fallback[0]);

check('sample ring stays clear of token and corners', samplePoints(4).every(p => {
  const d = Math.hypot(p.x - HEX_CENTERS[4].cx, p.y - HEX_CENTERS[4].cy);
  return d > 0.4 * SIZE && d < 0.8 * SIZE;
}));

// --- two-click alignment recovers the placement from the clicked hex centres
const truth = { x: -351.6, y: -212.1, width: 1024 };
const q0 = toImagePixel({ x: HEX_CENTERS[0].cx, y: HEX_CENTERS[0].cy }, truth, 800);
const q18 = toImagePixel({ x: HEX_CENTERS[18].cx, y: HEX_CENTERS[18].cy }, truth, 800);
const got = alignFromHexes(q0, q18, 800);
check('alignment recovers position and size', Math.abs(got.x - truth.x) < 1e-6 && Math.abs(got.y - truth.y) < 1e-6 && Math.abs(got.width - truth.width) < 1e-6);
const sloppy = alignFromHexes({ x: q0.x + 3, y: q0.y - 2 }, { x: q18.x - 2, y: q18.y + 3 }, 800);
const sloppyTiles = detectTerrains(screenshot(DEFAULT_BOARD, truth, 800 / 1024), sloppy, 800);
check('a few pixels of click error still detects every hex', sloppyTiles.join() === DEFAULT_BOARD.tiles.join());

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
