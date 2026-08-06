import initialGameState from '../src/game/gameState.js';
import { portRate, bankTrade } from '../src/game/gameActions.js';
import { PORTS } from '../src/game/gameRules.js';

let pass = 0, fail = 0;
function check(name, cond) {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}`);
}

// Confirm the fixture assumptions about the standard port layout.
const oreP = PORTS.find(p => p.type === 'ore');
const genericP = PORTS.find(p => p.type === 'generic');
const wheatP = PORTS.find(p => p.type === 'wheat');
check('layout has 4 generic + 5 resource ports', PORTS.filter(p => p.type === 'generic').length === 4 && PORTS.filter(p => p.type !== 'generic').length === 5);
check('one 2:1 port per resource type', ['brick', 'wood', 'ore', 'wheat', 'sheep'].every(r => PORTS.some(p => p.type === r)));

const ROLLED = { die1: 3, die2: 3, total: 6, isRobber: false };
const R = amt => ({ brick: amt, wood: amt, ore: amt, wheat: amt, sheep: amt });

// Play-phase state where player 0 owns a given set of building vertices.
function withBuildings(settlements, cities = [], resources = R(9)) {
  return {
    ...initialGameState, phase: 'play', setup: null, currentPlayerIndex: 0, dice: ROLLED,
    players: initialGameState.players.map((p, i) => i === 0
      ? { ...p, settlements: settlements.map(v => ({ intersectionIndex: v })), cities: cities.map(v => ({ intersectionIndex: v })), resources }
      : p),
  };
}

// --- No ports: default 4:1 everywhere ---
const noPorts = withBuildings([30]);
check('no port → 4:1 for every resource', ['brick', 'wood', 'ore', 'wheat', 'sheep'].every(r => portRate(noPorts, 0, r) === 4));

// --- Resource-specific 2:1 port ---
const oreOwner = withBuildings([oreP.vertices[0]]);
check('owning the ore port → 2:1 on ore', portRate(oreOwner, 0, 'ore') === 2);
check('ore port does not help other resources → 4:1', portRate(oreOwner, 0, 'wheat') === 4);
// the OTHER coastal vertex of the same port also grants it
const oreOwner2 = withBuildings([oreP.vertices[1]]);
check('either coastal vertex of the port grants it', portRate(oreOwner2, 0, 'ore') === 2);
// a city (not just a settlement) on a port vertex grants it too
const oreCity = withBuildings([], [oreP.vertices[0]]);
check('a city on the port vertex grants the rate', portRate(oreCity, 0, 'ore') === 2);

// --- Generic 3:1 port ---
const genericOwner = withBuildings([genericP.vertices[0]]);
check('owning a generic port → 3:1 on any resource', ['brick', 'wood', 'ore', 'wheat', 'sheep'].every(r => portRate(genericOwner, 0, r) === 3));

// --- Best rate wins when holding both ---
const both = withBuildings([oreP.vertices[0], genericP.vertices[0]]);
check('2:1 beats 3:1 for the matching resource', portRate(both, 0, 'ore') === 2);
check('3:1 applies to non-matching resources', portRate(both, 0, 'wheat') === 3);

// --- bankTrade actually uses the resolved rate ---
const t4 = bankTrade(withBuildings([30], [], { ...R(0), ore: 4 }), 0, 'ore', 'wheat');
check('no-port trade spends 4', typeof t4 !== 'string' && t4.players[0].resources.ore === 0 && t4.players[0].resources.wheat === 1);

const t2 = bankTrade(withBuildings([oreP.vertices[0]], [], { ...R(0), ore: 2 }), 0, 'ore', 'wheat');
check('2:1 port trade spends only 2', typeof t2 !== 'string' && t2.players[0].resources.ore === 0 && t2.players[0].resources.wheat === 1);
check('2:1 trade returns exactly 2 to the bank', typeof t2 !== 'string' && t2.bank.ore === 21);

const t3 = bankTrade(withBuildings([genericP.vertices[0]], [], { ...R(0), wheat: 3 }), 0, 'wheat', 'ore');
check('3:1 generic port trade spends 3', typeof t3 !== 'string' && t3.players[0].resources.wheat === 0 && t3.players[0].resources.ore === 1);

// Not enough for the (better) rate is still rejected with the right number
const short = bankTrade(withBuildings([oreP.vertices[0]], [], { ...R(0), ore: 1 }), 0, 'ore', 'wheat');
check('insufficient for the resolved rate rejected', short === 'You need 2 ore to trade');
const shortNoPort = bankTrade(withBuildings([30], [], { ...R(0), ore: 3 }), 0, 'ore', 'wheat');
check('no-port shortfall names the 4 rate', shortNoPort === 'You need 4 ore to trade');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
