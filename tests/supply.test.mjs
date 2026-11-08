import initialGameState from '../src/game/gameState.js';
import { placeSettlement, placeRoad, upgradeToCity, PIECE_LIMITS } from '../src/game/gameActions.js';
import { VERTICES, VERTEX_ADJACENCY, EDGES } from '../src/game/gameRules.js';

let pass = 0, fail = 0;
function check(name, cond) {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}`);
}

check('limits are 5 / 4 / 15', PIECE_LIMITS.settlements === 5 && PIECE_LIMITS.cities === 4 && PIECE_LIMITS.roads === 15);

// 11 pairwise non-adjacent vertices to build on.
const spots = [];
for (let v = 0; v < VERTICES.length && spots.length < 11; v++) {
  if (!VERTEX_ADJACENCY[v].some(a => spots.includes(a))) spots.push(v);
}
const at = vs => vs.map(v => ({ intersectionIndex: v }));
const roadTo = v => ({ edgeIndex: EDGES.findIndex(e => e.includes(v)) });
const rich = { brick: 9, wood: 9, ore: 9, wheat: 9, sheep: 9 };
const play = p0 => ({
  ...initialGameState, phase: 'play', setup: null, dice: { die1: 3, die2: 3, total: 6, isRobber: false },
  players: initialGameState.players.map((p, i) => i === 0 ? { ...p, resources: rich, ...p0 } : p),
});

// Settlements
const fiveOut = play({ settlements: at(spots.slice(0, 5)), roads: [roadTo(spots[5])] });
const noSettle = placeSettlement(fiveOut, 0, spots[5]);
check('6th settlement rejected', typeof noSettle === 'string' && noSettle.startsWith('No settlements left'));
const fourOut = play({ settlements: at(spots.slice(0, 4)), roads: [roadTo(spots[5])] });
check('5th settlement allowed', typeof placeSettlement(fourOut, 0, spots[5]) !== 'string');

// Upgrading returns the settlement piece
const upgraded = upgradeToCity(fiveOut, 0, spots[0]);
check('upgrade with 5 settlements out succeeds', typeof upgraded !== 'string');
check('upgrade frees a settlement piece', typeof placeSettlement(upgraded, 0, spots[5]) !== 'string');

// Cities
const citiesOut = play({ cities: at(spots.slice(0, 4)), settlements: at([spots[4]]) });
check('5th city rejected', upgradeToCity(citiesOut, 0, spots[4]) === 'No cities left (4 max)');
const threeCities = play({ cities: at(spots.slice(0, 3)), settlements: at([spots[4]]) });
check('4th city allowed', typeof upgradeToCity(threeCities, 0, spots[4]) !== 'string');

// Roads: a 15-segment trail, then one more off its end.
const edge = (a, b) => EDGES.findIndex(([x, y]) => (x === a && y === b) || (x === b && y === a));
// Greedy walk from vertex 0 that never revisits a vertex, so no edge repeats.
function trail(len) {
  const path = [0];
  while (path.length <= len) path.push(VERTEX_ADJACENCY[path.at(-1)].find(n => !path.includes(n)));
  return path.slice(1).map((v, i) => edge(path[i], v));
}
const fifteen = trail(15);
check('fixture trail has 15 roads', fifteen.length === 15);
const roadsOut = play({ settlements: at([0]), roads: fifteen.map(e => ({ edgeIndex: e })) });
const spare = EDGES.findIndex((e, i) => !fifteen.includes(i) && e.includes(0));
check('16th road rejected', placeRoad(roadsOut, 0, spare) === 'No roads left (15 max)');
const fourteen = play({ settlements: at([0]), roads: fifteen.slice(0, 14).map(e => ({ edgeIndex: e })) });
check('15th road allowed', typeof placeRoad(fourteen, 0, spare) !== 'string');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
