import initialGameState from '../src/game/gameState.js';
import { placeRoad, playRoadBuilding } from '../src/game/gameActions.js';
import { EDGES, VERTEX_ADJACENCY } from '../src/game/gameRules.js';

let pass = 0, fail = 0;
function check(name, cond) {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}`);
}

const edge = (a, b) => EDGES.findIndex(([x, y]) => (x === a && y === b) || (x === b && y === a));

// P1 owns a settlement at A and roads A-B, B-C. Then a building sits on C.
const A = 0;
const B = VERTEX_ADJACENCY[A][0];
const C = VERTEX_ADJACENCY[B].find(v => v !== A);
const D = VERTEX_ADJACENCY[C].find(v => v !== B);      // beyond C
const E = VERTEX_ADJACENCY[B].find(v => v !== A && v !== C); // side branch at B

const rich = { brick: 5, wood: 5, ore: 0, wheat: 0, sheep: 0 };
function stateWithBuildingAtC(ownerIndex) {
  return {
    ...initialGameState, phase: 'play', setup: null, dice: { die1: 3, die2: 3, total: 6, isRobber: false },
    players: initialGameState.players.map((p, i) => {
      const settlements = [];
      if (i === 0) settlements.push({ intersectionIndex: A });
      if (i === ownerIndex) settlements.push({ intersectionIndex: C });
      const roads = i === 0 ? [{ edgeIndex: edge(A, B) }, { edgeIndex: edge(B, C) }] : [];
      return { ...p, settlements, roads, resources: i === 0 ? rich : p.resources };
    }),
  };
}

const blocked = stateWithBuildingAtC(1);
const r1 = placeRoad(blocked, 0, edge(C, D));
check('road cannot extend through opponent settlement', r1 === 'Road must connect to your existing network');
check('other branches still open', typeof placeRoad(blocked, 0, edge(B, E)) !== 'string');

const cityBlocked = {
  ...blocked,
  players: blocked.players.map((p, i) => i === 1 ? { ...p, settlements: [], cities: [{ intersectionIndex: C }] } : p),
};
check('road cannot extend through opponent city', typeof placeRoad(cityBlocked, 0, edge(C, D)) === 'string');

const own = stateWithBuildingAtC(0);
check('own settlement does not block', typeof placeRoad(own, 0, edge(C, D)) !== 'string');

const unbuilt = stateWithBuildingAtC(-1);
check('empty road end extends normally', typeof placeRoad(unbuilt, 0, edge(C, D)) !== 'string');

// Road Building's free roads obey the same rule.
const rb = playRoadBuilding({
  ...blocked,
  players: blocked.players.map((p, i) => i === 0 ? { ...p, devCards: [{ type: 'roadBuilding', newlyBought: false }] } : p),
}, 0);
check('free road through opponent rejected', typeof rb !== 'string' && typeof placeRoad(rb, 0, edge(C, D)) === 'string');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
