import { isDeepStrictEqual } from 'node:util';
import { generateBoard, isBalanced } from '../src/game/boardGen.js';
import { createRng } from '../src/game/rng.js';
import { DEFAULT_BOARD, HEX_ADJACENCY, STANDARD_TILE_COUNTS, STANDARD_NUMBERS, STANDARD_PORT_COUNTS, PORTS } from '../src/game/gameRules.js';
import { createGame } from '../src/game/gameState.js';

let pass = 0, fail = 0;
function check(name, cond) {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}`);
}

const count = xs => xs.reduce((m, x) => ({ ...m, [x]: (m[x] || 0) + 1 }), {});
const sameCounts = (a, b) => isDeepStrictEqual(Object.entries(a).sort(), Object.entries(b).sort());

function standard(board) {
  const desert = board.tiles.indexOf('desert');
  return sameCounts(count(board.tiles), STANDARD_TILE_COUNTS)
    && isDeepStrictEqual(board.numbers.filter(n => n !== null).sort((a, b) => a - b), STANDARD_NUMBERS)
    && board.numbers[desert] === null && board.numbers.filter(n => n === null).length === 1
    && sameCounts(count(board.ports.map(p => p.type)), STANDARD_PORT_COUNTS)
    && board.ports.every((p, i) => p.vertices === PORTS[i].vertices);
}

const SEEDS = 400;
let allStandard = true, allBalanced = true, randomUnbalanced = 0;
const layouts = new Set();
for (let seed = 1; seed <= SEEDS; seed++) {
  const [plain] = generateBoard(createRng(seed));
  const [bal] = generateBoard(createRng(seed), { balanced: true });
  allStandard = allStandard && standard(plain) && standard(bal);
  allBalanced = allBalanced && isBalanced(bal.numbers);
  if (!isBalanced(plain.numbers)) randomUnbalanced++;
  layouts.add(plain.tiles.join() + plain.numbers.join());
}
check(`${SEEDS} seeds: every board has standard tile, number and port counts`, allStandard);
check(`${SEEDS} seeds: every balanced board has no adjacent 6/8 and no adjacent equal numbers`, allBalanced);
check('plain random boards are not secretly balanced', randomUnbalanced > SEEDS / 2);
check('boards vary across seeds', layouts.size === SEEDS);

// isBalanced itself
const reds = [...DEFAULT_BOARD.numbers];
const a = 0, b = HEX_ADJACENCY[0][0];
reds[a] = 6; reds[b] = 8;
check('isBalanced rejects touching 6 and 8', !isBalanced(reds));
const twins = DEFAULT_BOARD.numbers.map(() => null); twins[a] = 4; twins[b] = 4;
check('isBalanced rejects touching equal numbers', !isBalanced(twins));
const apart = DEFAULT_BOARD.numbers.map(() => null); apart[a] = 6; apart[b] = 5;
check('isBalanced accepts a red next to a different non-red', isBalanced(apart));

// Deterministic per seed, and usable as a game board
check('same seed, same board', isDeepStrictEqual(generateBoard(createRng(5)), generateBoard(createRng(5))));
const [board] = generateBoard(createRng(5), { balanced: true });
const g = createGame({ seed: 5, board });
check('game starts with the robber on the generated desert', g.board.tiles[g.robberHex] === 'desert');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
