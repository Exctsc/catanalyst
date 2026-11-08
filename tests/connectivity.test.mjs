import initialGameState from '../src/game/gameState.js';
import { placeSettlement } from '../src/game/gameActions.js';
import { EDGES } from '../src/game/gameRules.js';

let pass = 0, fail = 0;
function check(name, cond) {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}`);
}

const V = 20;
const roadAtV = { edgeIndex: EDGES.findIndex(e => e.includes(V)) };
const funds = { brick: 1, wood: 1, ore: 0, wheat: 1, sheep: 1 };
const play = (p0, p1 = {}) => ({
  ...initialGameState, phase: 'play', setup: null, dice: { die1: 3, die2: 3, total: 6, isRobber: false },
  players: initialGameState.players.map((p, i) => i === 0 ? { ...p, resources: funds, ...p0 } : i === 1 ? { ...p, ...p1 } : p),
});

check('play: settlement without a road rejected', placeSettlement(play({}), 0, V) === 'Settlement must connect to one of your roads');
check('play: settlement on own road end accepted', typeof placeSettlement(play({ roads: [roadAtV] }), 0, V) !== 'string');
check('play: opponent road does not count', typeof placeSettlement(play({}, { roads: [roadAtV] }), 0, V) === 'string');
check('setup: first settlement needs no road', typeof placeSettlement(initialGameState, 0, V) !== 'string');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
