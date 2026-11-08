import { isDeepStrictEqual } from 'node:util';
import { newGame, applyAction, dispatch, legalSpots, bankTradePlan, BUILD_COSTS } from '../src/game/engine.js';
import { chooseAction } from './bot.mjs';
import { EDGES } from '../src/game/gameRules.js';

let pass = 0, fail = 0;
function check(name, cond) {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}`);
}

const EMPTY = { brick: 0, wood: 0, ore: 0, wheat: 0, sheep: 0 };
let game = newGame({ seed: 5 });
const start = legalSpots(game.state, 'settlement');
check('setup: every empty corner is open at the start', start.length === 54);
check('setup: no roads before the first settlement', legalSpots(game.state, 'road').length === 0);
game = applyAction(game, { type: 'placeSettlement', player: 0, vertex: start[0] });
const roads = legalSpots(game.state, 'road');
check('setup: roads only touch the new settlement', roads.length >= 2 && roads.length <= 3);
const nextTurn = applyAction(game, { type: 'placeRoad', player: 0, edge: roads[0] }).state;
check('setup: the settlement and its neighbours are closed', [start[0], ...EDGES.filter(e => e.includes(start[0])).flat()].every(v => !legalSpots(nextTurn, 'settlement').includes(v)));

while (game.state.phase === 'setup') game = applyAction(game, chooseAction(game.state));
game = applyAction(game, { type: 'roll' });
const me = game.state.currentPlayerIndex;
const withHand = hand => applyAction(game, { type: 'sandbox', edit: { op: 'setHand', player: me, resources: { ...EMPTY, ...hand } } }).state;

const broke = withHand({});
check('no cards: nothing to build', ['road', 'settlement', 'city'].every(k => legalSpots(broke, k).length === 0));
const rich = withHand({ brick: 9, wood: 9, ore: 9, wheat: 9, sheep: 9 });
check('city spots are exactly my settlements', isDeepStrictEqual(
  legalSpots(rich, 'city').sort((a, b) => a - b),
  rich.players[me].settlements.map(s => s.intersectionIndex).sort((a, b) => a - b)));
check('roads extend my network', legalSpots(rich, 'road').length > 0);

// The shown costs are what the rules charge: exactly the cost works, one short doesn't.
const tryBuild = (kind, hand) => {
  const s = withHand(hand);
  if (kind === 'devCard') return typeof dispatch(s, { type: 'buyDevCard', player: me }) !== 'string';
  return legalSpots(s, kind).length > 0;
};
for (const [kind, cost] of Object.entries(BUILD_COSTS)) {
  if (kind === 'settlement') continue; // needs a road-reachable spot; covered by the rules tests
  check(`${kind}: the listed cost is enough`, tryBuild(kind, cost));
  check(`${kind}: one card short is not`, Object.keys(cost).every(r => !tryBuild(kind, { ...cost, [r]: cost[r] - 1 })));
}

// Bank trades picked on cards
const bank = withHand({ brick: 8, wood: 2 });
const plan = bankTradePlan(bank, { ...EMPTY, brick: 8 }, { ...EMPTY, ore: 1, wheat: 1 });
check('8 brick buys 2 cards as two 4:1 trades', isDeepStrictEqual(plan.map(a => [a.give, a.receive]), [['brick', 'ore'], ['brick', 'wheat']]));
let after = bank;
for (const a of plan) after = dispatch(after, a);
check('…and the trades apply', after.players[me].resources.brick === 0 && after.players[me].resources.ore === 1 && after.players[me].resources.wheat === 1);
check('wrong amount is explained', typeof bankTradePlan(bank, { ...EMPTY, brick: 3 }, { ...EMPTY, ore: 1 }) === 'string');
check('too many cards asked is explained', typeof bankTradePlan(bank, { ...EMPTY, brick: 4 }, { ...EMPTY, ore: 2 }) === 'string');
check('two kinds given is not a bank trade', typeof bankTradePlan(bank, { ...EMPTY, brick: 4, wood: 2 }, { ...EMPTY, ore: 1 }) === 'string');
check('getting what you give is refused', typeof bankTradePlan(bank, { ...EMPTY, brick: 4 }, { ...EMPTY, brick: 1 }) === 'string');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
