import initialGameState from '../src/game/gameState.js';
import * as actions from '../src/game/gameActions.js';

let pass = 0, fail = 0;
function check(name, cond) {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}`);
}

// Every action that takes a playerIndex, with otherwise-plausible arguments.
const calls = {
  placeSettlement: (s, p) => actions.placeSettlement(s, p, 0),
  placeRoad: (s, p) => actions.placeRoad(s, p, 0),
  upgradeToCity: (s, p) => actions.upgradeToCity(s, p, 0),
  bankTrade: (s, p) => actions.bankTrade(s, p, 'brick', 'wood'),
  discardCards: (s, p) => actions.discardCards(s, p, { brick: 1 }),
  moveRobber: (s, p) => actions.moveRobber(s, p, 0),
  stealResource: (s, p) => actions.stealResource(s, p, 1),
  buyDevCard: (s, p) => actions.buyDevCard(s, p),
  playKnight: (s, p) => actions.playKnight(s, p),
  playRoadBuilding: (s, p) => actions.playRoadBuilding(s, p),
  playYearOfPlenty: (s, p) => actions.playYearOfPlenty(s, p, ['brick', 'wood']),
  playMonopoly: (s, p) => actions.playMonopoly(s, p, 'brick'),
};

const bad = [-1, 4, 99, 1.5, undefined, null, '0', NaN];
for (const [name, call] of Object.entries(calls)) {
  const allRejected = bad.every(p => {
    try { return call(initialGameState, p) === 'Invalid player'; } catch { return false; }
  });
  check(`${name} rejects invalid player indexes cleanly`, allRejected);
  check(`${name} accepts a valid index past the guard`, call(initialGameState, 0) !== 'Invalid player');
}

check('settlement rejects out-of-range intersection', actions.placeSettlement(initialGameState, 0, 54) === 'Invalid intersection');
check('city rejects out-of-range intersection', actions.upgradeToCity(initialGameState, 0, -1) === 'Invalid intersection');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
