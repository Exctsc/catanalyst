import initialGameState from '../src/game/gameState.js';
import { placeSettlement, placeRoad } from '../src/game/gameActions.js';
import { EDGES, VERTICES, VERTEX_ADJACENCY, VERTEX_TO_HEXES } from '../src/game/gameRules.js';

let pass = 0, fail = 0;
function check(name, cond) {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}`);
}

function occupiedSet(gs) {
  const s = new Set();
  gs.players.forEach(p => {
    p.settlements.forEach(x => s.add(x.intersectionIndex));
    p.cities.forEach(x => s.add(x.intersectionIndex));
  });
  return s;
}
function firstLegalVertex(gs) {
  const occ = occupiedSet(gs);
  for (let v = 0; v < VERTICES.length; v++) {
    if (!occ.has(v) && !VERTEX_ADJACENCY[v].some(a => occ.has(a))) return v;
  }
  throw new Error('no legal vertex');
}
function freeEdgeTouching(gs, v) {
  const taken = new Set(gs.players.flatMap(p => p.roads.map(r => r.edgeIndex)));
  return EDGES.findIndex(([a, b], i) => !taken.has(i) && (a === v || b === v));
}

let gs = initialGameState;
const expectedOrder = [0, 1, 2, 3, 3, 2, 1, 0];

// Before anything: road first should be rejected
check('road before settlement rejected', typeof placeRoad(gs, 0, 0) === 'string');
// Rolling order enforcement
check('starts with player 1', gs.currentPlayerIndex === 0);

const secondSettlementVertices = {};

for (let t = 0; t < 8; t++) {
  const p = gs.currentPlayerIndex;
  check(`turn ${t}: current player is ${expectedOrder[t] + 1}`, p === expectedOrder[t]);

  const v = firstLegalVertex(gs);
  const before = gs.players[p].resources;

  // A road not touching the about-to-be-placed settlement should still be rejected (expecting settlement)
  const r1 = placeRoad(gs, p, freeEdgeTouching(gs, v));
  check(`turn ${t}: road before settlement rejected`, typeof r1 === 'string');

  gs = placeSettlement(gs, p, v);
  check(`turn ${t}: settlement placed`, typeof gs !== 'string');
  if (typeof gs === 'string') break;

  const isSecond = t >= 4;
  if (isSecond) secondSettlementVertices[p] = v;

  // Second settlement of same turn rejected
  check(`turn ${t}: second settlement in same turn rejected`, typeof placeSettlement(gs, p, firstLegalVertex(gs)) === 'string');

  // Resource grant check
  const after = gs.players[p].resources;
  const total = Object.values(after).reduce((a, b) => a + b, 0) - Object.values(before).reduce((a, b) => a + b, 0);
  if (isSecond) {
    const TILE_TO_RESOURCE = { mountains: 'ore', fields: 'wheat', forest: 'wood', hills: 'brick', pasture: 'sheep', desert: null };
    const HEX_TILES = ['mountains','fields','forest','fields','hills','pasture','mountains','fields','forest','desert','forest','mountains','hills','pasture','pasture','fields','forest','hills','pasture'];
    const expected = VERTEX_TO_HEXES[v].filter(h => TILE_TO_RESOURCE[HEX_TILES[h]]).length;
    check(`turn ${t}: second settlement granted ${expected} resources`, total === expected);
  } else {
    check(`turn ${t}: first settlement granted nothing`, total === 0);
  }

  // Road not touching the new settlement rejected
  const detached = EDGES.findIndex(([a, b], i) => a !== v && b !== v && !gs.players.some(pl => pl.roads.some(r => r.edgeIndex === i)) && (gs.players[p].settlements.some(s => s.intersectionIndex === a || s.intersectionIndex === b)));
  if (detached !== -1 && t >= 4) {
    check(`turn ${t}: road not touching new settlement rejected`, typeof placeRoad(gs, p, detached) === 'string');
  }

  gs = placeRoad(gs, p, freeEdgeTouching(gs, v));
  check(`turn ${t}: road placed`, typeof gs !== 'string');
  if (typeof gs === 'string') break;
}

check('phase is play after setup', gs.phase === 'play');
check('setup cleared', gs.setup === null);
check('play starts with player 1', gs.currentPlayerIndex === 0);
gs.players.forEach((p, i) => {
  check(`player ${i + 1} has 2 settlements, 2 roads`, p.settlements.length === 2 && p.roads.length === 2);
});
const totalRes = gs.players.reduce((a, p) => a + Object.values(p.resources).reduce((x, y) => x + y, 0), 0);
const bankTotal = Object.values(gs.bank).reduce((a, b) => a + b, 0);
check('bank + players conserve 95 cards', totalRes + bankTotal === 95);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
