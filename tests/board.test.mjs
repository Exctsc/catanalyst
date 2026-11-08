import initialGameState from '../src/game/gameState.js';
import { collectResources, portRate, moveRobber } from '../src/game/gameActions.js';
import { HEX_TO_VERTICES, VERTEX_TO_HEXES, DEFAULT_BOARD } from '../src/game/gameRules.js';

let pass = 0, fail = 0;
function check(name, cond) {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}`);
}

// The layout lives in state: rules read gameState.board, not a module constant.
check('new game carries a board', initialGameState.board.tiles.length === 19 && initialGameState.board.numbers.length === 19 && initialGameState.board.ports.length === 9);
check('robber starts on the desert', initialGameState.board.tiles[initialGameState.robberHex] === 'desert');

// A vertex touching only hex 0 (a corner of the board).
const v = HEX_TO_VERTICES[0].find(x => VERTEX_TO_HEXES[x].length === 1);
const withSettlement = board => ({
  ...initialGameState, phase: 'play', setup: null, board, robberHex: 9,
  players: initialGameState.players.map((p, i) => i === 0 ? { ...p, settlements: [{ intersectionIndex: v }] } : p),
});

const tiles = [...DEFAULT_BOARD.tiles]; tiles[0] = 'pasture';
const numbers = [...DEFAULT_BOARD.numbers]; numbers[0] = 8;
const custom = withSettlement({ ...DEFAULT_BOARD, tiles, numbers });
const paid = collectResources(custom, 8);
check('collection follows state board terrain and number', paid.players[0].resources.sheep === 1);
check('old number no longer pays', collectResources(custom, DEFAULT_BOARD.numbers[0]).players[0].resources.sheep === 0);

// Ports: retyping a slot in state changes the rate.
const portV = DEFAULT_BOARD.ports[0].vertices[0];
const ports = DEFAULT_BOARD.ports.map((p, i) => i === 0 ? { ...p, type: 'sheep' } : p);
const atPort = { ...withSettlement({ ...DEFAULT_BOARD, ports }), players: initialGameState.players.map((p, i) => i === 0 ? { ...p, settlements: [{ intersectionIndex: portV }] } : p) };
check('port type read from state', portRate(atPort, 0, 'sheep') === 2 && portRate(atPort, 0, 'ore') === 4);

// Robber log names the state board's terrain.
const moved = moveRobber({ ...custom, robber: { stage: 'move' } }, 0, 0);
check('robber log uses state board', typeof moved !== 'string' && moved.log.at(-1).text.includes('pasture (8)'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
