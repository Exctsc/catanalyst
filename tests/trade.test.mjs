import initialGameState from '../src/game/gameState.js';
import { bankTrade } from '../src/game/gameActions.js';

let pass = 0, fail = 0;
function check(name, cond) {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}`);
}

const playState = {
  ...initialGameState,
  phase: 'play',
  setup: null,
  players: initialGameState.players.map((p, i) =>
    i === 0 ? { ...p, resources: { ...p.resources, brick: 5 } } : p
  ),
};

// Valid trade: 4 brick for 1 wood
const s1 = bankTrade(playState, 0, 'brick', 'wood');
check('trade succeeds', typeof s1 !== 'string');
check('4 brick deducted', s1.players[0].resources.brick === 1);
check('1 wood received', s1.players[0].resources.wood === 1);
check('bank gains 4 brick', s1.bank.brick === 23);
check('bank gives 1 wood', s1.bank.wood === 18);

// Failures
check('insufficient resources rejected', typeof bankTrade(s1, 0, 'brick', 'wood') === 'string');
check('same resource rejected', typeof bankTrade(playState, 0, 'brick', 'brick') === 'string');
check('unknown resource rejected', typeof bankTrade(playState, 0, 'gold', 'wood') === 'string');
check('wrong turn rejected', typeof bankTrade(playState, 1, 'brick', 'wood') === 'string');
check('setup phase rejected', typeof bankTrade({ ...playState, phase: 'setup', setup: initialGameState.setup }, 0, 'brick', 'wood') === 'string');

// Bank empty of requested resource
const emptyBank = { ...playState, bank: { ...playState.bank, wood: 0 } };
check('bank out of resource rejected', typeof bankTrade(emptyBank, 0, 'brick', 'wood') === 'string');

// Failure leaves no mutation of the input state
check('failed trade does not mutate input', playState.players[0].resources.brick === 5 && playState.bank.wood === 19);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
