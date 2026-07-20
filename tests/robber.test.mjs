import initialGameState from '../src/game/gameState.js';
import { startRobber, discardCards, moveRobber, stealResource, collectResources, bankTrade, placeRoad } from '../src/game/gameActions.js';
import { HEX_TO_VERTICES } from '../src/game/gameRules.js';

let pass = 0, fail = 0;
function check(name, cond) {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}`);
}

// Play-phase base: P1 (current) settlement at vertex 0; P2 settlement at vertex 12
// (adjacent to hex 2 forest #3); P2 holds 9 cards, P3 holds 8, P4 holds 2.
const base = {
  ...initialGameState,
  phase: 'play',
  setup: null,
  players: initialGameState.players.map((p, i) => {
    if (i === 0) return { ...p, settlements: [{ intersectionIndex: 0 }] };
    if (i === 1) return { ...p, settlements: [{ intersectionIndex: 12 }], resources: { brick: 3, wood: 3, ore: 3, wheat: 0, sheep: 0 } };
    if (i === 2) return { ...p, resources: { brick: 8, wood: 0, ore: 0, wheat: 0, sheep: 0 } };
    return { ...p, resources: { brick: 1, wood: 1, ore: 0, wheat: 0, sheep: 0 } };
  }),
};

// --- startRobber: discard requirements
const s1 = startRobber(base);
check('discard stage when players over 7 cards', s1.robber.stage === 'discard');
check('P2 (9 cards) and P3 (8 cards) pending', JSON.stringify(s1.robber.pending) === '[1,2]');
check('required is floor(total/2)', s1.robber.required[1] === 4 && s1.robber.required[2] === 4);

const nobodyOver = startRobber({ ...base, players: base.players.map(p => ({ ...p, resources: { brick: 2, wood: 0, ore: 0, wheat: 0, sheep: 0 } })) });
check('straight to move stage when nobody over 7', nobodyOver.robber.stage === 'move');

// --- discard validation
check('wrong count rejected', typeof discardCards(s1, 1, { brick: 1 }) === 'string');
check('cards not held rejected', typeof discardCards(s1, 1, { wheat: 4 }) === 'string');
check('non-pending player rejected', typeof discardCards(s1, 3, { brick: 1 }) === 'string');

const s2 = discardCards(s1, 1, { brick: 2, wood: 2 });
check('valid discard accepted', typeof s2 !== 'string');
check('cards returned to bank', s2.bank.brick === 21 && s2.bank.wood === 21);
check('still in discard stage while P3 pending', s2.robber.stage === 'discard' && JSON.stringify(s2.robber.pending) === '[2]');

// --- actions blocked during robber resolution
check('trade blocked during robber', typeof bankTrade(s2, 0, 'brick', 'wood') === 'string');
check('road blocked during robber', typeof placeRoad(s2, 0, 0) === 'string');

const s3 = discardCards(s2, 2, { brick: 4 });
check('move stage after all discards', typeof s3 !== 'string' && s3.robber.stage === 'move');

// --- moveRobber
check('same hex rejected', typeof moveRobber(s3, 0, s3.robberHex) === 'string');
check('wrong player rejected', typeof moveRobber(s3, 1, 2) === 'string');
check('out of range rejected', typeof moveRobber(s3, 0, 19) === 'string');

// Move to hex 2 (forest #3): P2 has a settlement there and cards -> steal stage
const s4 = moveRobber(s3, 0, 2);
check('robber moved', typeof s4 !== 'string' && s4.robberHex === 2);
check('steal stage with P2 as candidate', s4.robber.stage === 'steal' && JSON.stringify(s4.robber.candidates) === '[1]');

// Move to a hex with no opponent buildings -> resolution ends, no steal
const emptyHex = HEX_TO_VERTICES.findIndex((verts, h) =>
  h !== s3.robberHex && !verts.some(v => base.players.some(p => p.settlements.some(s => s.intersectionIndex === v))));
const s4b = moveRobber(s3, 0, emptyHex);
check('no candidates -> robber resolution done', typeof s4b !== 'string' && s4b.robber === null);

// Own-building-only hex: hex 0 touches only P1's settlement (vertex 0) -> no self-steal
const s4c = moveRobber(s3, 0, 0);
check('own settlement is not a steal candidate', typeof s4c !== 'string' && s4c.robber === null);

// --- stealResource
check('non-candidate steal rejected', typeof stealResource(s4, 0, 2) === 'string');
const s5 = stealResource(s4, 0, 1);
check('steal succeeds', typeof s5 !== 'string');
const p1Total = Object.values(s5.players[0].resources).reduce((a, b) => a + b, 0);
const p2Total = Object.values(s5.players[1].resources).reduce((a, b) => a + b, 0);
check('1 card moved from victim to thief', p1Total === 1 && p2Total === 4);
check('robber resolution complete after steal', s5.robber === null);

// Victim with zero cards never becomes a candidate (so "no cards -> no steal" holds)
const brokeP2 = { ...s3, players: s3.players.map((p, i) => i === 1 ? { ...p, resources: { brick: 0, wood: 0, ore: 0, wheat: 0, sheep: 0 } } : p) };
const s6 = moveRobber(brokeP2, 0, 2);
check('cardless opponent excluded from candidates', typeof s6 !== 'string' && s6.robber === null);

// --- robber blocks production
// P2's settlement at vertex 12 produces wood on 3 from hex 2; with robber on hex 2 it must not.
const blocked = collectResources(s4, 3);
check('robber hex produces nothing', blocked.players[1].resources.wood === s4.players[1].resources.wood);
const unblocked = collectResources({ ...s4, robberHex: 9, robber: null }, 3);
check('production resumes when robber elsewhere', unblocked.players[1].resources.wood === s4.players[1].resources.wood + 1);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
