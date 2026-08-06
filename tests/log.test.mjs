import initialGameState from '../src/game/gameState.js';
import {
  performRoll, endTurn, placeSettlement, placeRoad, upgradeToCity, bankTrade,
  startRobber, discardCards, moveRobber,
} from '../src/game/gameActions.js';
import { VERTICES, VERTEX_ADJACENCY, EDGES, HEX_TO_VERTICES } from '../src/game/gameRules.js';

let pass = 0, fail = 0;
function check(name, cond) {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}`);
}

const last = gs => gs.log[gs.log.length - 1];

// Initial state seeds one system entry
check('initial log has a seed entry', initialGameState.log.length === 1);
check('seed entry is a system line', initialGameState.log[0].playerIndex === null);

// Setup settlement + road append entries tagged with the acting player
const s1 = placeSettlement(initialGameState, 0, 0);
check('settlement logs an entry', last(s1).text.includes('built a settlement'));
check('entry tagged with acting player', last(s1).playerIndex === 0);
check('log ids are sequential', s1.log.every((e, i) => e.id === i));

const edgeAt0 = EDGES.findIndex(([a, b]) => a === 0 || b === 0);
const s2 = placeRoad(s1, 0, edgeAt0);
check('road logs an entry', s2.log.some(e => e.text.includes('built a road')));
check("setup advances with a turn entry", s2.log.some(e => e.text.includes("Player 2")));

// Second settlement logs starting-resource grant
function occupied(gs) {
  const set = new Set();
  gs.players.forEach(p => { p.settlements.forEach(x => set.add(x.intersectionIndex)); p.cities.forEach(x => set.add(x.intersectionIndex)); });
  return set;
}
function firstLegal(gs) {
  const occ = occupied(gs);
  for (let v = 0; v < VERTICES.length; v++) if (!occ.has(v) && !VERTEX_ADJACENCY[v].some(a => occ.has(a))) return v;
  throw new Error('no legal vertex');
}
function freeEdgeTouching(gs, v) {
  const taken = new Set(gs.players.flatMap(p => p.roads.map(r => r.edgeIndex)));
  return EDGES.findIndex(([a, b], i) => !taken.has(i) && (a === v || b === v));
}
// Run all 8 setup placements to reach play phase
let gs = initialGameState;
for (let t = 0; t < 8; t++) {
  const v = firstLegal(gs);
  gs = placeSettlement(gs, gs.currentPlayerIndex, v);
  gs = placeRoad(gs, gs.currentPlayerIndex, freeEdgeTouching(gs, v));
}
check('setup completion logs a system line', gs.log.some(e => e.playerIndex === null && e.text.includes('Setup complete')));
check('a starting-resources grant was logged', gs.log.some(e => e.text.includes('starting resources')));
check('phase is play', gs.phase === 'play');

// performRoll logs the roll (and a collection line when not a 7)
let sawRoll = false, sawCollectOrRobber = false;
for (let i = 0; i < 40 && !(sawRoll && sawCollectOrRobber); i++) {
  const before = gs.log.length;
  const rolled = performRoll(gs);
  const newEntries = rolled.log.slice(before);
  if (newEntries.some(e => /rolled \d \+ \d = \d+/.test(e.text))) sawRoll = true;
  if (newEntries.some(e => e.text.includes('collected') || e.text.includes('robber'))) sawCollectOrRobber = true;
  gs = endTurn(rolled.dice && rolled.robber ? rolled : rolled); // advance regardless
  // If a robber is pending, endTurn is a no-op; resolve minimally by clearing via a fresh state
  if (gs.robber) {
    // discard for anyone pending, then move robber to a free hex
    while (gs.robber?.stage === 'discard') {
      const pi = gs.robber.pending[0];
      let need = gs.robber.required[pi];
      const d = {};
      for (const r of ['brick', 'wood', 'ore', 'wheat', 'sheep']) {
        const take = Math.min(need, gs.players[pi].resources[r]);
        if (take > 0) { d[r] = take; need -= take; }
      }
      gs = discardCards(gs, pi, d);
    }
    if (gs.robber?.stage === 'move') {
      const emptyHex = HEX_TO_VERTICES.findIndex((verts, h) =>
        h !== gs.robberHex && !verts.some(v => gs.players.some(p => [...p.settlements, ...p.cities].some(b => b.intersectionIndex === v))));
      gs = moveRobber(gs, gs.currentPlayerIndex, emptyHex >= 0 ? emptyHex : (gs.robberHex + 1) % 19);
    }
    gs = endTurn(gs);
  }
}
check('performRoll logs the dice roll', sawRoll);
check('roll resolves into a collection or robber log line', sawCollectOrRobber);
check('endTurn logs a turn-change entry', gs.log.some(e => e.text.includes("turn")));

// bankTrade logs
const tradeState = {
  ...initialGameState, phase: 'play', setup: null, dice: { die1: 3, die2: 3, total: 6, isRobber: false },
  players: initialGameState.players.map((p, i) => i === 0 ? { ...p, resources: { ...p.resources, brick: 4 } } : p),
};
const traded = bankTrade(tradeState, 0, 'brick', 'wood');
check('bank trade logs an entry', last(traded).text.includes('traded 4 brick for 1 wood'));

// Robber discard/steal path logs
const robberState = {
  ...initialGameState, phase: 'play', setup: null,
  players: initialGameState.players.map((p, i) => i === 1 ? { ...p, resources: { brick: 8, wood: 0, ore: 0, wheat: 0, sheep: 0 } } : p),
};
const rob = startRobber(robberState);
check('startRobber logs a discard requirement', rob.log.some(e => e.text.includes('must discard')));
const discarded = discardCards(rob, 1, { brick: 4 });
check('discard logs the cards', discarded.log.some(e => e.text.includes('discarded 4 brick')));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
