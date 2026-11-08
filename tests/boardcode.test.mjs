import { isDeepStrictEqual } from 'node:util';
import { encodeBoard, decodeBoard, boardLink } from '../src/game/boardCode.js';
import { generateBoard } from '../src/game/boardGen.js';
import { createRng } from '../src/game/rng.js';
import { DEFAULT_BOARD } from '../src/game/gameRules.js';

let pass = 0, fail = 0;
function check(name, cond) {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}`);
}

const code = encodeBoard(DEFAULT_BOARD);
check('code is short', code.length === 28);
check('code is URL-safe', /^[A-Za-z0-9_-]+$/.test(code) && encodeURIComponent(code) === code);
check('default board round-trips', isDeepStrictEqual(decodeBoard(code), DEFAULT_BOARD));

let all = true;
for (let seed = 1; seed <= 300; seed++) {
  const [b] = generateBoard(createRng(seed), { balanced: seed % 2 === 0 });
  all = all && isDeepStrictEqual(decodeBoard(encodeBoard(b)), b);
}
check('300 generated boards round-trip exactly', all);

// Free-mode boards (non-standard counts) round-trip too.
const odd = {
  tiles: DEFAULT_BOARD.tiles.map(() => 'mountains'),
  numbers: DEFAULT_BOARD.numbers.map(() => null),
  ports: DEFAULT_BOARD.ports.map(p => ({ ...p, type: 'sheep' })),
};
check('free-mode board round-trips', isDeepStrictEqual(decodeBoard(encodeBoard(odd)), odd));
const twelves = { ...DEFAULT_BOARD, numbers: DEFAULT_BOARD.numbers.map(() => 12) };
check('max token value round-trips', isDeepStrictEqual(decodeBoard(encodeBoard(twelves)), twelves));

check('different boards give different codes', encodeBoard(generateBoard(createRng(1))[0]) !== encodeBoard(generateBoard(createRng(2))[0]));

// Malformed input is rejected, never thrown.
const bad = [null, undefined, '', 'x', code.slice(0, -1), code + 'A', '2' + code.slice(1), code.slice(0, 5) + '!' + code.slice(6), 42];
check('malformed codes return null', bad.every(c => decodeBoard(c) === null));
const outOfRange = '1' + '_'.repeat(27); // all ones: terrain index 7 is invalid
check('out-of-range fields return null', decodeBoard(outOfRange) === null);

check('link carries the code', boardLink(DEFAULT_BOARD, 'https://x.test/') === `https://x.test/?board=${code}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
