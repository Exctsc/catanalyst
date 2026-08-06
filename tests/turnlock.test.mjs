import initialGameState from '../src/game/gameState.js';
import {
  endTurn, placeSettlement, placeRoad, upgradeToCity, bankTrade,
  playKnight, playRoadBuilding,
} from '../src/game/gameActions.js';
import { EDGES, VERTICES, VERTEX_ADJACENCY } from '../src/game/gameRules.js';

let pass = 0, fail = 0;
function check(name, cond) {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}`);
}

const ROLLED = { die1: 3, die2: 3, total: 6, isRobber: false };
const R = amt => ({ brick: amt, wood: amt, ore: amt, wheat: amt, sheep: amt });

// Play-phase state; `dice` decides pre-roll vs post-roll.
function play(dice, p0 = {}) {
  return {
    ...initialGameState, phase: 'play', setup: null, currentPlayerIndex: 0, dice,
    players: initialGameState.players.map((p, i) => i === 0
      ? { ...p, settlements: [{ intersectionIndex: 0 }], resources: R(5), ...p0 }
      : { ...p, settlements: [{ intersectionIndex: 30 }] }),
  };
}
const edgeAt0 = EDGES.findIndex(([a, b]) => a === 0 || b === 0);

// --- 1. Roll-before-end-turn ---
const preRoll = play(null)
check('End Turn is a no-op before rolling', endTurn(preRoll) === preRoll || endTurn(preRoll).currentPlayerIndex === 0)
const postRoll = play(ROLLED)
const ended = endTurn(postRoll)
check('End Turn advances after rolling', ended.currentPlayerIndex === 1)
check('End Turn clears dice for the next player', ended.dice === null)

// --- 2. No build/trade before rolling ---
check('settlement blocked before rolling', typeof placeSettlement(play(null), 0, 8) === 'string' && placeSettlement(play(null), 0, 8) === 'Roll the dice first')
check('road blocked before rolling', placeRoad(play(null), 0, edgeAt0) === 'Roll the dice first')
check('city blocked before rolling', upgradeToCity(play(null), 0, 0) === 'Roll the dice first')
check('bank trade blocked before rolling', bankTrade(play(null), 0, 'brick', 'wood') === 'Roll the dice first')

// After rolling, the same actions are permitted
check('road allowed after rolling', typeof placeRoad(play(ROLLED), 0, edgeAt0) !== 'string')
check('city allowed after rolling', typeof upgradeToCity(play(ROLLED, { resources: { ...R(5), wheat: 2, ore: 3 } }), 0, 0) !== 'string')
check('bank trade allowed after rolling', typeof bankTrade(play(ROLLED), 0, 'brick', 'wood') !== 'string')

// --- Dev-card exception: playable before rolling ---
const knightPre = play(null, { devCards: [{ type: 'knight', newlyBought: false }], knightsPlayed: 0 })
const kp = playKnight(knightPre, 0)
check('Knight is playable before rolling', typeof kp !== 'string' && kp.robber && kp.robber.stage === 'move')

// Road Building's free roads work before rolling (a dev-card consequence)
const rbPre = play(null, { devCards: [{ type: 'roadBuilding', newlyBought: false }], resources: R(0) })
const rb = playRoadBuilding(rbPre, 0)
check('Road Building playable before rolling', typeof rb !== 'string' && rb.roadBuilding && rb.roadBuilding.remaining === 2)
const rbRoad = placeRoad(rb, 0, edgeAt0)
check('free road places before rolling (roadBuilding bypasses the gate)', typeof rbRoad !== 'string' && rbRoad.players[0].roads.length === 1)

// --- Setup phase is unaffected (no dice gate) ---
const setupSettle = placeSettlement(initialGameState, 0, 0)
check('setup settlement works with dice null (no gate in setup)', typeof setupSettle !== 'string')

// The whole setup runs with dice === null, so the gate must never bite for any
// of the 4 players: a phase-blind `dice === null` check would stall turn 0.
let su = initialGameState
const occupied = () => new Set(su.players.flatMap(p => p.settlements.map(s => s.intersectionIndex)))
let setupOk = true
for (let t = 0; t < 8; t++) {
  const who = su.currentPlayerIndex
  const occ = occupied()
  const v = VERTICES.findIndex((_, i) => !occ.has(i) && !VERTEX_ADJACENCY[i].some(a => occ.has(a)))
  const afterSettlement = placeSettlement(su, who, v)
  if (typeof afterSettlement === 'string' || su.dice !== null) { setupOk = false; break }
  su = afterSettlement
  const taken = new Set(su.players.flatMap(p => p.roads.map(r => r.edgeIndex)))
  const e = EDGES.findIndex(([a, b], i) => !taken.has(i) && (a === v || b === v))
  const afterRoad = placeRoad(su, who, e)
  if (typeof afterRoad === 'string') { setupOk = false; break }
  su = afterRoad
}
check('all 8 setup placements succeed with dice null (all 4 players)', setupOk)
check('setup completes into play phase', su.phase === 'play' && su.setup === null)
check('every player placed 2 settlements during setup', su.players.every(p => p.settlements.length === 2))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
