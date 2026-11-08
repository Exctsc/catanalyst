import initialGameState from '../src/game/gameState.js';
import { longestRoadLength, placeRoad, placeSettlement } from '../src/game/gameActions.js';
import { EDGES, VERTEX_ADJACENCY } from '../src/game/gameRules.js';

let pass = 0, fail = 0;
function check(name, cond) {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}`);
}

const edgeIndexOf = new Map();
EDGES.forEach(([a, b], i) => { edgeIndexOf.set(`${a},${b}`, i); edgeIndexOf.set(`${b},${a}`, i); });
const eidx = (a, b) => edgeIndexOf.get(`${a},${b}`);

// Walk a simple path of `length` edges from `start`, avoiding a set of vertices.
function simplePath(start, length, avoid = new Set()) {
  const path = [start];
  const visited = new Set([start, ...avoid]);
  let cur = start;
  while (path.length <= length) {
    const next = VERTEX_ADJACENCY[cur].find(v => !visited.has(v));
    if (next === undefined) break;
    visited.add(next);
    path.push(next);
    cur = next;
  }
  return path;
}

// State with player 0 owning the roads along `path` (as raw road records).
function roadsState(path, extra = {}) {
  const roads = [];
  for (let k = 0; k < path.length - 1; k++) roads.push({ edgeIndex: eidx(path[k], path[k + 1]) });
  return {
    ...initialGameState, phase: 'play', setup: null, dice: { die1: 3, die2: 3, total: 6, isRobber: false },
    players: initialGameState.players.map((p, i) => i === 0 ? { ...p, roads } : p),
    ...extra,
  };
}

// --- Graph correctness (longestRoadLength) ---
const p6 = simplePath(0, 6);
check('built a 6-vertex simple path for testing', p6.length === 7);
check('straight chain length = number of segments', longestRoadLength(roadsState(p6.slice(0, 6)), 0) === 5);
check('4-segment chain measures 4', longestRoadLength(roadsState(p6.slice(0, 5)), 0) === 4);

// Branch (T-shape): main path v0-v1-v2-v3 plus a stub off v1. Longest trail = 3.
const main = simplePath(0, 3);            // v0..v3 (3 edges)
const stubStart = main[1];
const stubEnd = VERTEX_ADJACENCY[stubStart].find(v => !main.includes(v));
const branchRoads = [
  { edgeIndex: eidx(main[0], main[1]) },
  { edgeIndex: eidx(main[1], main[2]) },
  { edgeIndex: eidx(main[2], main[3]) },
  { edgeIndex: eidx(stubStart, stubEnd) },
];
const branchState = {
  ...initialGameState, phase: 'play', setup: null, dice: { die1: 3, die2: 3, total: 6, isRobber: false },
  players: initialGameState.players.map((p, i) => i === 0 ? { ...p, roads: branchRoads } : p),
};
check('branch has 4 roads', branchState.players[0].roads.length === 4);
check('branch longest trail counts the longest path, not every segment', longestRoadLength(branchState, 0) === 3);

// --- Opponent settlement breaks a chain; own settlement does not ---
const chain5 = simplePath(0, 5);          // vertices v0..v5, 5 edges
const midVertex = chain5[2];
const oppBreak = roadsState(chain5.slice(0, 6));
oppBreak.players[1] = { ...oppBreak.players[1], settlements: [{ intersectionIndex: midVertex }] };
check('opponent settlement on a middle vertex breaks the chain below 5', longestRoadLength(oppBreak, 0) < 5);
const ownMid = roadsState(chain5.slice(0, 6));
ownMid.players[0] = { ...ownMid.players[0], settlements: [{ intersectionIndex: midVertex }] };
check('own settlement on the chain does not break it', longestRoadLength(ownMid, 0) === 5);

// --- Award via placeRoad: reaching 5 grants Longest Road (+2 VP) ---
// Build a fresh chain segment-by-segment through the real placement rules.
function buildChain(state, playerIndex, path) {
  let s = state;
  for (let k = 0; k < path.length - 1; k++) {
    const r = placeRoad(s, playerIndex, eidx(path[k], path[k + 1]));
    if (typeof r === 'string') throw new Error(`road ${k} failed: ${r}`);
    s = r;
  }
  return s;
}
const bigAmt = 20;
const roadPath = simplePath(0, 5); // 5 edges
let awardState = {
  ...initialGameState, phase: 'play', setup: null, dice: { die1: 3, die2: 3, total: 6, isRobber: false }, currentPlayerIndex: 0,
  players: initialGameState.players.map((p, i) => i === 0
    ? { ...p, settlements: [{ intersectionIndex: roadPath[0] }], resources: { brick: bigAmt, wood: bigAmt, ore: 0, wheat: 0, sheep: 0 } }
    : p),
};
const after4 = buildChain(awardState, 0, roadPath.slice(0, 5)); // 4 roads
check('4 roads does not claim Longest Road', after4.longestRoad === null);
const after5 = placeRoad(after4, 0, eidx(roadPath[4], roadPath[5]));
check('reaching 5 segments claims Longest Road', typeof after5 !== 'string' && after5.longestRoad === 0);
check('Longest Road grants +2 public VP (1 settlement + 2)', after5.players[0].victoryPoints === 3);

// --- Tie keeps the holder; strictly longer transfers ---
// Player 1 builds a disjoint 5-chain: does NOT take it from player 0 (tie).
const path1 = simplePath(30, 6, new Set(roadPath));
let twoChains = {
  ...after5,
  currentPlayerIndex: 1,
  players: after5.players.map((p, i) => i === 1
    ? { ...p, settlements: [{ intersectionIndex: path1[0] }], resources: { brick: bigAmt, wood: bigAmt, ore: 0, wheat: 0, sheep: 0 } }
    : p),
};
const p1Five = buildChain(twoChains, 1, path1.slice(0, 6)); // player 1 reaches 5
check('equal-length chain leaves Longest Road with the holder', p1Five.longestRoad === 0);
check('holder still has the +2 VP after a tie', p1Five.players[0].victoryPoints === 3);
const p1Six = placeRoad(p1Five, 1, eidx(path1[5], path1[6]));
check('strictly longer chain transfers Longest Road', typeof p1Six !== 'string' && p1Six.longestRoad === 1);
check('new holder gains +2 VP', p1Six.players[1].victoryPoints === 3);
check('old holder loses the +2 VP', p1Six.players[0].victoryPoints === 1);

// --- A road-breaking settlement can strip the holder below 5 ---
// Player 0 holds it with a 5-chain; player 1 places a settlement on the middle.
const holderState = { ...after5 };
const breakVertex = roadPath[2];
// give player 1 the turn + resources, an empty legal spot at breakVertex, and
// a road leading to it (play-phase settlements must touch the owner's road)
const sideVertex = VERTEX_ADJACENCY[breakVertex].find(v => v !== roadPath[1] && v !== roadPath[3]);
const settleBreak = {
  ...holderState, currentPlayerIndex: 1,
  players: holderState.players.map((p, i) => i === 1
    ? { ...p, resources: { brick: 1, wood: 1, ore: 0, wheat: 1, sheep: 1 }, roads: [...p.roads, { edgeIndex: eidx(breakVertex, sideVertex) }] }
    : p),
};
const broken = placeSettlement(settleBreak, 1, breakVertex);
check('opponent settlement can strip Longest Road from the holder', typeof broken !== 'string' && broken.longestRoad !== 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
