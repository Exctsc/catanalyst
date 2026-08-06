import baseState from '../src/game/gameState.js';

// Test settlements were removed from initialGameState for the real setup phase;
// recreate them here and run road tests in play-phase-like setup ('setup' with expecting road)
const initialGameState = {
  ...baseState,
  setup: { ...baseState.setup, expecting: 'road', lastSettlementIndex: 0, settlementsPlaced: [1, 0, 0, 0] },
  players: baseState.players.map((p, i) =>
    i === 0 ? { ...p, settlements: [{ intersectionIndex: 0 }, { intersectionIndex: 12 }] } : p
  ),
};
import { placeRoad } from '../src/game/gameActions.js';
import { EDGES } from '../src/game/gameRules.js';

let pass = 0, fail = 0;
function check(name, cond) {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}`);
}

// Player 1 has a settlement at intersection 0. Find an edge touching vertex 0 and one touching neither settlement.
const edgeAt0 = EDGES.findIndex(([a, b]) => a === 0 || b === 0);
const settled = new Set([0, 12]);
const farEdge = EDGES.findIndex(([a, b]) => !settled.has(a) && !settled.has(b));

// Setup phase: connected road is free
let s1 = placeRoad(initialGameState, 0, edgeAt0);
check('setup: connected road placed', typeof s1 !== 'string' && s1.players[0].roads.length === 1);
check('setup: road is free', typeof s1 !== 'string' && s1.players[0].resources.brick === 0);

// Unconnected road rejected
const bad = placeRoad(initialGameState, 0, farEdge);
check('unconnected road rejected', typeof bad === 'string');


// Wrong player rejected
check('wrong turn rejected', typeof placeRoad(initialGameState, 1, edgeAt0) === 'string');

// Play phase: costs 1 brick + 1 wood. dice non-null = already rolled this turn.
const playState = {
  ...initialGameState,
  phase: 'play',
  dice: { die1: 3, die2: 3, total: 6, isRobber: false },
  players: initialGameState.players.map((p, i) =>
    i === 0 ? { ...p, resources: { ...p.resources, brick: 1, wood: 1 } } : p
  ),
};
const s2 = placeRoad(playState, 0, edgeAt0);
check('play: road placed with resources', typeof s2 !== 'string' && s2.players[0].roads.length === 1);
check('play: brick+wood deducted', typeof s2 !== 'string' && s2.players[0].resources.brick === 0 && s2.players[0].resources.wood === 0);
check('play: bank refunded', typeof s2 !== 'string' && s2.bank.brick === 20 && s2.bank.wood === 20);

// Play phase, broke: rejected with no state change
const broke = placeRoad({ ...playState, players: initialGameState.players }, 0, EDGES.findIndex(([a, b], i) => (a === 0 || b === 0) && i !== edgeAt0));
check('play: insufficient resources rejected', typeof broke === 'string');

// Play phase: road extends network, duplicate rejected
const [a0, b0] = EDGES[edgeAt0];
const farV = a0 === 0 ? b0 : a0;
const extEdge = EDGES.findIndex(([a, b], i) => i !== edgeAt0 && (a === farV || b === farV) && a !== 0 && b !== 0);
const richState = {
  ...playState,
  players: playState.players.map((p, i) =>
    i === 0 ? { ...p, resources: { ...p.resources, brick: 2, wood: 2 } } : p
  ),
};
const c1 = placeRoad(richState, 0, edgeAt0);
check('duplicate edge rejected', typeof placeRoad(c1, 0, edgeAt0) === 'string');
const c2 = placeRoad(c1, 0, extEdge);
check('road chains off existing road', typeof c2 !== 'string' && c2.players[0].roads.length === 2);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
