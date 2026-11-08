import { isDeepStrictEqual } from 'node:util';
import { sandboxEdit, SANDBOX_ROLLED } from '../src/game/sandbox.js';
import { createGame } from '../src/game/gameState.js';
import { newGame, applyAction, replay, dispatch } from '../src/game/engine.js';
import { EDGES, VERTEX_ADJACENCY } from '../src/game/gameRules.js';
import { playGame } from './bot.mjs';

let pass = 0, fail = 0;
function check(name, cond) {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}`);
}

const edit = (s, e) => sandboxEdit(s, e);
const g0 = createGame({ seed: 4 });

// --- pieces, ignoring rules and costs
const A = 0, B = VERTEX_ADJACENCY[0][0];
let s = edit(g0, { op: 'setBuilding', vertex: A, player: 0, kind: 'settlement' });
s = edit(s, { op: 'setBuilding', vertex: B, player: 1, kind: 'city' });
check('adjacent buildings allowed, no cost', s.players[0].settlements.length === 1 && s.players[1].cities.length === 1 && s.players[0].resources.brick === 0);
s = edit(s, { op: 'setBuilding', vertex: A, player: 2, kind: 'city' });
check('placing on an occupied spot replaces the piece', s.players[0].settlements.length === 0 && s.players[2].cities[0].intersectionIndex === A);
s = edit(s, { op: 'setBuilding', vertex: A, player: null, kind: null });
check('a building can be removed', s.players[2].cities.length === 0);
const farEdge = EDGES.findIndex(([a, b]) => a > 40 && b > 40);
s = edit(s, { op: 'setRoad', edge: farEdge, player: 3 });
check('an unconnected road can be placed', s.players[3].roads.length === 1);
s = edit(s, { op: 'setRoad', edge: farEdge, player: 0 });
check('a road can change owner', s.players[3].roads.length === 0 && s.players[0].roads[0].edgeIndex === farEdge);
s = edit(s, { op: 'setRoad', edge: farEdge, player: null });
check('a road can be removed', s.players[0].roads.length === 0);

// --- hands, dev cards, knights, robber, turn
s = edit(s, { op: 'setHand', player: 1, resources: { brick: 2, wood: 0, ore: 5, wheat: 1, sheep: 0 } });
check('hand set exactly', isDeepStrictEqual(s.players[1].resources, { brick: 2, wood: 0, ore: 5, wheat: 1, sheep: 0 }));
check('bad hand rejected', typeof edit(s, { op: 'setHand', player: 1, resources: { brick: -1 } }) === 'string');

const deckBefore = s.devCardDeck.length;
s = edit(s, { op: 'setDevCards', player: 2, counts: { knight: 2, monopoly: 1 } });
check('dev cards set and playable', s.players[2].devCards.length === 3 && s.players[2].devCards.every(c => !c.newlyBought));
check('added dev cards leave the draw pile', s.devCardDeck.length === deckBefore - 3);
s = edit(s, { op: 'setDevCards', player: 2, counts: { knight: 1 } });
check('removed dev cards return to the pile bottom', s.devCardDeck.length === deckBefore - 1 && s.devCardDeck.slice(0, 2).join() === 'monopoly,knight');

s = edit(s, { op: 'setKnights', player: 2, count: 3 });
check('knights played set', s.players[2].knightsPlayed === 3);
s = edit(s, { op: 'setRobber', hex: 4 });
check('robber moved anywhere', s.robberHex === 4);
check('bad robber hex rejected', typeof edit(s, { op: 'setRobber', hex: 19 }) === 'string');
s = edit(s, { op: 'setTurn', player: 1, rolled: true });
check('turn and rolled flag set', s.currentPlayerIndex === 1 && isDeepStrictEqual(s.dice, SANDBOX_ROLLED));
check('unknown op rejected', typeof edit(s, { op: 'teleport' }) === 'string');

// --- resume: normal rules from the edited position
const r = edit(s, { op: 'resume' });
check('resume enters play phase', r.phase === 'play' && r.setup === null && r.robber === null);
check('bank holds what the hands do not', r.bank.ore === 14 && r.bank.brick === 17 && r.bank.wood === 19);
check('largest army awarded from edited knights', r.largestArmy === 2);
check('VP recomputed', r.players[2].victoryPoints === 2 && r.players[1].victoryPoints === 2);
check('resume is logged', r.log.at(-1).text.startsWith('Position edited in sandbox'));
check('rolled player can end the turn', dispatch(r, { type: 'endTurn' }).currentPlayerIndex === 2);
check('rolled player cannot roll again', dispatch(r, { type: 'roll' }) === r);
const notRolled = edit(edit(s, { op: 'setTurn', player: 1, rolled: false }), { op: 'resume' });
check('unrolled player must roll first', typeof dispatch(notRolled, { type: 'placeRoad', player: 1, edge: 0 }) === 'string' && dispatch(notRolled, { type: 'roll' }).dice !== null);
check('normal costs apply after resume', dispatch(r, { type: 'upgradeToCity', player: 1, vertex: B }) === 'You need a settlement here to build a city');

// Award stripping: a holder below 3 knights loses Largest Army on resume.
const stripped = edit(edit({ ...r }, { op: 'setKnights', player: 2, count: 1 }), { op: 'resume' });
check('award holder below threshold loses it', stripped.largestArmy === null);

// Resume can declare a winner, and clears one that no longer holds.
let win = createGame({ seed: 4 });
[0, 3, 10, 13, 20].forEach(v => { win = edit(win, { op: 'setBuilding', vertex: v, player: 0, kind: 'city' }); });
win = edit(win, { op: 'resume' });
check('a 10 VP position declares the winner', win.winner === 0);
const unwin = edit(edit(win, { op: 'setBuilding', vertex: 0, player: null, kind: null }), { op: 'resume' });
check('removing points clears the winner', unwin.winner === null);

// --- through the engine mid-game, and it replays
const options = { seed: 21 };
let g = playGame(options, 60);
g = applyAction(g, { type: 'sandbox', edit: { op: 'setHand', player: 0, resources: { brick: 9, wood: 9, ore: 9, wheat: 9, sheep: 9 } } });
g = applyAction(g, { type: 'sandbox', edit: { op: 'setTurn', player: 0, rolled: true } });
g = applyAction(g, { type: 'sandbox', edit: { op: 'resume' } });
check('sandbox edits are recorded actions', typeof g !== 'string' && g.actions.slice(-3).every(a => a.type === 'sandbox'));
g = applyAction(g, { type: 'buyDevCard', player: 0 });
check('play continues after resume', typeof g !== 'string' && g.state.players[0].resources.ore === 8);
const again = replay(options, g.actions);
check('a game with sandbox edits replays identically', again.error === null && isDeepStrictEqual(again.states.at(-1), g.state));
check('fresh game has no sandbox residue', isDeepStrictEqual(newGame(options).state, createGame(options)));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
