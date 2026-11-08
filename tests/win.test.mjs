import initialGameState from '../src/game/gameState.js';
import { placeSettlement, upgradeToCity, placeRoad, bankTrade } from '../src/game/gameActions.js';
import { VERTICES, VERTEX_ADJACENCY, EDGES } from '../src/game/gameRules.js';

let pass = 0, fail = 0;
function check(name, cond) {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}`);
}

function playState(p1Overrides) {
  return {
    ...initialGameState,
    phase: 'play', dice: { die1: 3, die2: 3, total: 6, isRobber: false },
    setup: null,
    players: initialGameState.players.map((p, i) => i === 0 ? { ...p, ...p1Overrides } : p),
  };
}

// Play-phase settlements must touch one of the owner's roads.
const roadTo = v => ({ edgeIndex: EDGES.findIndex(e => e.includes(v)) });

// Settlement grants 1 VP
const s1 = placeSettlement(playState({ roads: [roadTo(0)], resources: { brick: 1, wood: 1, ore: 0, wheat: 1, sheep: 1 } }), 0, 0);
check('settlement worth 1 VP', typeof s1 !== 'string' && s1.players[0].victoryPoints === 1);
check('no winner at 1 VP', s1.winner === null);

// City upgrade: 1 VP settlement becomes 2 VP city
const s2 = upgradeToCity(playState({
  settlements: [{ intersectionIndex: 0 }],
  victoryPoints: 1,
  resources: { brick: 0, wood: 0, ore: 3, wheat: 2, sheep: 0 },
}), 0, 0);
check('city worth 2 VP', typeof s2 !== 'string' && s2.players[0].victoryPoints === 2);

// Setup settlements also count VP
const setupPlace = placeSettlement(initialGameState, 0, 0);
check('setup settlement grants VP', typeof setupPlace !== 'string' && setupPlace.players[0].victoryPoints === 1);

// Reaching 10: 4 cities (8 VP) + 1 settlement (9 VP) + new settlement -> 10.
// Pick 5 pairwise-non-adjacent occupied vertices plus a legal 6th from the graph.
const occupied = [];
for (let v = 0; v < VERTICES.length && occupied.length < 6; v++) {
  if (!occupied.includes(v) && !VERTEX_ADJACENCY[v].some(a => occupied.includes(a))) occupied.push(v);
}
const nearWin = playState({
  cities: occupied.slice(0, 4).map(v => ({ intersectionIndex: v })),
  settlements: [{ intersectionIndex: occupied[4] }],
  roads: [roadTo(occupied[5])],
  victoryPoints: 9,
  resources: { brick: 1, wood: 1, ore: 3, wheat: 3, sheep: 1 },
});
const won = placeSettlement(nearWin, 0, occupied[5]);
check('10th point placement accepted', typeof won !== 'string');
check('winner declared at 10 VP', won.winner === 0);
check('winning player has 10 VP', won.players[0].victoryPoints === 10);

// City upgrade can also win: 8 VP + settlement upgrade (1 -> 2) = 10
const cityWin = upgradeToCity(playState({
  cities: occupied.slice(0, 4).map(v => ({ intersectionIndex: v })),
  settlements: [{ intersectionIndex: occupied[4] }],
  victoryPoints: 9,
  resources: { brick: 0, wood: 0, ore: 3, wheat: 2, sheep: 0 },
}), 0, occupied[4]);
check('city upgrade can trigger the win', typeof cityWin !== 'string' && cityWin.winner === 0);

// After the win every action is rejected
check('settlement rejected after win', typeof placeSettlement(won, 0, 30) === 'string');
check('road rejected after win', typeof placeRoad(won, 0, 0) === 'string');
check('city rejected after win', typeof upgradeToCity(won, 0, 0) === 'string');
check('trade rejected after win', typeof bankTrade(won, 0, 'ore', 'wood') === 'string');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
