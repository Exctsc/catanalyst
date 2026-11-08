import initialGameState from '../src/game/gameState.js';
import { endTurn } from '../src/game/gameActions.js';

let pass = 0, fail = 0;
function check(name, cond) {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}`);
}

const ROLLED = { die1: 3, die2: 3, total: 6, isRobber: false };
let s = { ...initialGameState, phase: 'play', setup: null, currentPlayerIndex: 0, dice: ROLLED };
check('play starts at turn 1', s.turn === 1);

const seen = [];
for (let i = 0; i < 9; i++) {
  s = endTurn({ ...s, dice: ROLLED });
  seen.push(`${s.currentPlayerIndex}:${s.turn}`);
}
check('turn stays put within a round', seen.slice(0, 3).join(' ') === '1:1 2:1 3:1');
check('turn advances when play wraps to player 1', seen[3] === '0:2');
check('two full rounds later it is turn 3', seen[7] === '0:3' && seen[8] === '1:3');
check('round start is logged', s.log.some(e => e.text.startsWith('Turn 2 — Player 1')));
check('endTurn before rolling does not advance', endTurn({ ...s, dice: null }).turn === s.turn);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
