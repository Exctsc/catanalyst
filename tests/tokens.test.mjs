import { readToken, detectNumbers } from '../src/game/boardImage.js';
import { HEX_CENTERS, SIZE, DEFAULT_BOARD } from '../src/game/gameRules.js';

let pass = 0, fail = 0;
function check(name, cond) {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}`);
}

// A 5x7 seven-segment style font with solid corners (real digits are drawn
// joined). 0, 6 and 9 have one closed loop, 8 has two, 2/3/4/5 none.
const GLYPH = {
  0: ['#####', '#   #', '#   #', '#   #', '#   #', '#   #', '#####'],
  1: ['  #  ', ' ##  ', '  #  ', '  #  ', '  #  ', '  #  ', ' ### '],
  2: ['#####', '    #', '    #', '#####', '#    ', '#    ', '#####'],
  3: ['#####', '    #', '    #', ' ####', '    #', '    #', '#####'],
  4: ['#   #', '#   #', '#   #', '#####', '    #', '    #', '    #'],
  5: ['#####', '#    ', '#    ', '#####', '    #', '    #', '#####'],
  6: ['#####', '#    ', '#    ', '#####', '#   #', '#   #', '#####'],
  8: ['#####', '#   #', '#   #', '#####', '#   #', '#   #', '#####'],
  9: ['#####', '#   #', '#   #', '#####', '    #', '    #', '#####'],
};
const PIPS = n => 6 - Math.abs(7 - n);
const GREEN = [70, 140, 60], PAPER = [245, 242, 232], DARK = [20, 50, 25], RED = [200, 30, 30];

// Draw one token (and optional decoys) into a pixel function. The token is a
// pale rounded square centred at (cx, cy+offset) like an online board's.
function scene(n, { cell = 4, pitch = 9, pipR = 3, offset = 18, decoy = true, round = false } = {}) {
  const ink = n === 6 || n === 8 ? RED : DARK;
  const cx = 100, cy = 100, half = 34;
  const tx = cx, ty = cy + offset;
  const digits = String(n).split('');
  const gw = 5 * cell, gap = cell, totalW = digits.length * gw + (digits.length - 1) * gap;
  const gx0 = tx - totalW / 2, gy0 = ty - half + 8;
  const pipY = gy0 + 7 * cell + 10, pipCount = PIPS(n);
  const px0 = tx - ((pipCount - 1) * pitch) / 2;
  return (x, y) => {
    if (x < 0 || y < 0 || x >= 200 || y >= 200) return null;
    // white "sheep" decoy above the token: pale, but with no marks inside
    if (decoy && Math.hypot(x - cx, y - (cy - 40)) < 16) return Math.hypot(x - (cx + 14), y - (cy - 40)) < 6 ? DARK : PAPER;
    const inToken = round ? Math.hypot(x - tx, y - ty) <= half : Math.abs(x - tx) <= half && Math.abs(y - ty) <= half;
    if (!inToken) return GREEN;
    for (let k = 0; k < pipCount; k++) if (Math.hypot(x - (px0 + k * pitch), y - pipY) <= pipR) return ink;
    const gy = Math.floor((y - gy0) / cell);
    for (let d = 0; d < digits.length; d++) {
      const gx = Math.floor((x - (gx0 + d * (gw + gap))) / cell);
      if (gy >= 0 && gy < 7 && gx >= 0 && gx < 5 && x >= gx0 + d * (gw + gap) && GLYPH[digits[d]][gy][gx] === '#') return ink;
    }
    return PAPER;
  };
}

for (const n of [2, 3, 4, 5, 6, 8, 9, 10, 11, 12]) {
  const t = readToken(scene(n), 100, 100, 90);
  check(`reads ${n} (pips ${t?.pips}, digits ${t?.digits}, loops ${t?.loops}${t?.red ? ', red' : ''})`, t?.number === n);
}
for (const n of [5, 6, 8, 9, 11]) {
  check(`reads ${n} on a round cream token`, readToken(scene(n, { round: true, offset: 0, decoy: false }), 100, 100, 90)?.number === n);
}
// Pips touching each other: a blurred bar is counted by its length.
for (const n of [3, 4, 5, 9, 10]) {
  const t = readToken(scene(n, { pitch: 7, pipR: 3.6 }), 100, 100, 90);
  check(`counts ${PIPS(n)} blurred pips for ${n}`, t?.pips === PIPS(n) && t?.number === n);
}
check('no token (plain terrain) reads nothing', readToken((x, y) => (x >= 0 && y >= 0 && x < 200 && y < 200 ? GREEN : null), 100, 100, 90) === null);
check('a pale decoy alone is not a token', readToken((x, y) => (Math.hypot(x - 100, y - 100) < 20 ? PAPER : GREEN), 100, 100, 90) === null);

// detectNumbers: every hex of a synthetic board, desert hex left empty.
const placement = { x: -300, y: -120, width: 600 };
const k = 1000 / placement.width; // 1000 px image
const scenes = HEX_CENTERS.map(({ cx, cy }, h) => {
  const n = DEFAULT_BOARD.numbers[h];
  return { x: (cx - placement.x) * k, y: (cy - placement.y) * k, draw: n ? scene(n, { cell: 3, pitch: 7, pipR: 2.2, offset: 10, decoy: false }) : null };
});
const getPixel = (x, y) => {
  let best = null, d = Infinity;
  for (const s of scenes) { const dd = Math.hypot(x - s.x, y - s.y); if (dd < d) { d = dd; best = s; } }
  if (d > SIZE * k) return [30, 80, 160];
  return best.draw ? best.draw(x - best.x + 100, y - best.y + 100) : [220, 200, 150];
};
const numbers = detectNumbers(getPixel, placement, 1000);
check('detects all 18 numbers on a synthetic board, desert empty', numbers.every((n, h) => n === DEFAULT_BOARD.numbers[h]));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
