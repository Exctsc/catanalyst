import initialGameState from '../src/game/gameState.js';
import { proposeTrade, acceptTrade, declineTrade, endTurn, placeRoad } from '../src/game/gameActions.js';
import { EDGES } from '../src/game/gameRules.js';

let pass = 0, fail = 0;
function check(name, cond) {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}`);
}

const ROLLED = { die1: 3, die2: 3, total: 6, isRobber: false };
const hand = (brick, wood, ore, wheat, sheep) => ({ brick, wood, ore, wheat, sheep });
const base = {
  ...initialGameState, phase: 'play', setup: null, dice: ROLLED,
  players: initialGameState.players.map((p, i) =>
    i === 0 ? { ...p, resources: hand(3, 1, 0, 0, 0) } : i === 1 ? { ...p, resources: hand(0, 0, 2, 1, 0) } : p),
};

// --- validation
check('before rolling rejected', proposeTrade({ ...base, dice: null }, 0, 1, { brick: 1 }, { ore: 1 }) === 'Roll the dice first');
check('during setup rejected', proposeTrade({ ...initialGameState }, 0, 1, { brick: 1 }, { ore: 1 }) === 'Cannot trade during setup');
check('not your turn rejected', proposeTrade(base, 1, 0, { ore: 1 }, { brick: 1 }) === 'Not your turn');
check('trade with self rejected', typeof proposeTrade(base, 0, 0, { brick: 1 }, { wood: 1 }) === 'string');
check('invalid partner rejected', proposeTrade(base, 0, 7, { brick: 1 }, { ore: 1 }) === 'Invalid trade partner');
check('gift (empty get) rejected', typeof proposeTrade(base, 0, 1, { brick: 1 }, {}) === 'string');
check('empty give rejected', typeof proposeTrade(base, 0, 1, { brick: 0 }, { ore: 1 }) === 'string');
check('same resource both sides rejected', typeof proposeTrade(base, 0, 1, { brick: 1 }, { brick: 1, ore: 1 }) === 'string');
check('negative / fractional counts rejected', typeof proposeTrade(base, 0, 1, { brick: -1 }, { ore: 1 }) === 'string' && typeof proposeTrade(base, 0, 1, { brick: 1.5 }, { ore: 1 }) === 'string');
check('unknown resource rejected', proposeTrade(base, 0, 1, { gold: 1 }, { ore: 1 }) === 'Unknown resource');
check('offerer short of cards rejected', proposeTrade(base, 0, 1, { brick: 4 }, { ore: 1 }) === 'You do not have those cards');
check('partner short of cards rejected', typeof proposeTrade(base, 0, 1, { brick: 1 }, { ore: 3 }) === 'string');
check('during robber rejected', typeof proposeTrade({ ...base, robber: { stage: 'move' } }, 0, 1, { brick: 1 }, { ore: 1 }) === 'string');

// --- happy path: any counts
const offered = proposeTrade(base, 0, 1, { brick: 2, wood: 1 }, { ore: 2, wheat: 1 });
check('valid offer recorded', typeof offered !== 'string' && offered.tradeOffer.to === 1 && offered.tradeOffer.give.brick === 2);
check('offer logged', offered.log.at(-1).text === 'Player 1 offers Player 2 2 brick, 1 wood for 2 ore, 1 wheat');
check('offer moves no cards yet', offered.players[0].resources.brick === 3);
check('only the recipient can accept', acceptTrade(offered, 0) === 'Only the player receiving the offer can accept it' && typeof acceptTrade(offered, 2) === 'string');

const done = acceptTrade(offered, 1);
check('accept swaps both hands', typeof done !== 'string'
  && JSON.stringify(done.players[0].resources) === JSON.stringify(hand(1, 0, 2, 1, 0))
  && JSON.stringify(done.players[1].resources) === JSON.stringify(hand(2, 1, 0, 0, 0)));
check('accept clears the offer', done.tradeOffer === null);
check('accept logged', done.log.at(-1).text.includes('accepted'));
check('bank untouched', JSON.stringify(done.bank) === JSON.stringify(base.bank));
check('accept with no offer rejected', acceptTrade(done, 1) === 'No trade is pending');

// --- decline / withdraw
const declined = declineTrade(offered, 1);
check('recipient can decline', typeof declined !== 'string' && declined.tradeOffer === null && declined.log.at(-1).text === 'Player 2 declined the trade');
check('offerer can withdraw', declineTrade(offered, 0).log.at(-1).text === 'Player 1 withdrew the trade offer');
check('bystander cannot decline', declineTrade(offered, 2) === 'Not part of this trade');
check('hands unchanged after decline', declined.players[0].resources.brick === 3 && declined.players[1].resources.ore === 2);

// --- hands re-validated at accept time
const spentWood = { ...offered, players: offered.players.map((p, i) => i === 0 ? { ...p, resources: { ...p.resources, wood: 0 } } : p) };
check('accept re-checks offerer hand', acceptTrade(spentWood, 1) === 'Player 1 no longer has those cards');
const builtAfterOffer = placeRoad({ ...offered, players: offered.players.map((p, i) => i === 0 ? { ...p, settlements: [{ intersectionIndex: 0 }] } : p) }, 0, EDGES.findIndex(e => e.includes(0)));
check('accept fails after offerer spent the cards', typeof builtAfterOffer !== 'string' && typeof acceptTrade(builtAfterOffer, 1) === 'string');

// --- end turn clears a pending offer
check('end turn clears pending offer', endTurn(offered).tradeOffer === null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
