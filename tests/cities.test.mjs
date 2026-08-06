import initialGameState from '../src/game/gameState.js';
import { upgradeToCity, collectResources } from '../src/game/gameActions.js';

let pass = 0, fail = 0;
function check(name, cond) {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}`);
}

// Play-phase state: P1 settlement at vertex 0 (adjacent to hexes 0 mountains#2, 1 fields#3, 4 hills#4)
// P2 settlement at vertex 12 (adjacent to hex 2 forest#3 only).
const base = {
  ...initialGameState,
  phase: 'play', dice: { die1: 3, die2: 3, total: 6, isRobber: false },
  setup: null,
  players: initialGameState.players.map((p, i) => {
    if (i === 0) return { ...p, settlements: [{ intersectionIndex: 0 }], resources: { ...p.resources, wheat: 2, ore: 3 } };
    if (i === 1) return { ...p, settlements: [{ intersectionIndex: 12 }] };
    return p;
  }),
};

// Upgrade own settlement
const s1 = upgradeToCity(base, 0, 0);
check('upgrade succeeds', typeof s1 !== 'string');
check('settlement removed', s1.players[0].settlements.length === 0);
check('city added at vertex 0', s1.players[0].cities.some(c => c.intersectionIndex === 0));
check('2 wheat + 3 ore deducted', s1.players[0].resources.wheat === 0 && s1.players[0].resources.ore === 0);
check('bank refunded', s1.bank.wheat === 21 && s1.bank.ore === 22);

// Failures leave state unreturned (error string)
check('insufficient resources rejected', typeof upgradeToCity({ ...base, players: base.players.map((p, i) => i === 0 ? { ...p, resources: { ...p.resources, ore: 2 } } : p) }, 0, 0) === 'string');
check('empty intersection rejected', typeof upgradeToCity(base, 0, 30) === 'string');
check("other player's settlement rejected", typeof upgradeToCity(base, 0, 12) === 'string');
check('wrong turn rejected', typeof upgradeToCity(base, 1, 12) === 'string');
check('setup phase rejected', typeof upgradeToCity({ ...base, phase: 'setup', setup: initialGameState.setup }, 0, 0) === 'string');

// Production: city at vertex 0 produces 2 ore on roll 2; P2 settlement produces 1 wood on roll 3
const afterRoll2 = collectResources(s1, 2);
check('city produces 2 on matching roll', afterRoll2.players[0].resources.ore === 2);
const afterRoll3 = collectResources(s1, 3);
check('city produces 2 wheat on roll 3', afterRoll3.players[0].resources.wheat === 2);
check('settlement still produces 1', afterRoll3.players[1].resources.wood === 1);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
