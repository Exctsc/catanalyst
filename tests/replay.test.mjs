import { isDeepStrictEqual } from 'node:util';
import { replay, turnStarts, branchGame, applyAction } from '../src/game/engine.js';
import { playGame } from './bot.mjs';

let pass = 0, fail = 0;
function check(name, cond) {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}`);
}

const game = playGame({ seed: 99, diceMode: 'balanced' });
const { states } = replay(game.options, game.actions);

// Stepping: state k is exactly the game after k actions.
check('step 0 is the initial position', states[0].phase === 'setup' && states[0].players.every(p => p.settlements.length === 0));
check('last step is the live game', isDeepStrictEqual(states.at(-1), game.state));
const mid = Math.floor(game.actions.length / 2);
let manual = { ...game, actions: [], state: states[0] };
for (const a of game.actions.slice(0, mid)) manual = applyAction(manual, a);
check('stepping forward k times equals states[k]', isDeepStrictEqual(manual.state, states[mid]));

// Jump to turn
const starts = turnStarts(states);
check('setup listed first', starts[0].turn === 0 && starts[0].index === 0);
check('every play turn listed once, in order', starts.slice(1).every((t, i) => t.turn === i + 1));
check('a jump lands on the first state of that turn', starts.slice(1).every(t => states[t.index].turn === t.turn && (t.index === 0 || states[t.index - 1].turn !== t.turn || states[t.index - 1].phase !== 'play')));
check('turn 1 starts when setup ends', states[starts[1].index].phase === 'play' && states[starts[1].index - 1].phase === 'setup');

// Branch: play from here
const before = JSON.stringify(game);
const branch = branchGame(game, mid);
check('branch keeps the first k actions', branch.actions.length === mid && isDeepStrictEqual(branch.actions, game.actions.slice(0, mid)));
check('branch starts from states[k]', isDeepStrictEqual(branch.state, states[mid]));
check('original game is untouched', JSON.stringify(game) === before);

// The branch diverges and is itself replayable.
let b = branch;
if (b.state.dice === null && b.state.phase === 'play' && !b.state.robber) b = applyAction(b, { type: 'roll' });
check('branch can continue independently', typeof b !== 'string' && b.actions.length >= mid);
const rebuilt = replay(b.options, b.actions);
check('branch replays to its own state', isDeepStrictEqual(rebuilt.states.at(-1), b.state));
check('branch at 0 is a fresh game', isDeepStrictEqual(branchGame(game, 0).state, states[0]));
check('branch at the end equals the game', isDeepStrictEqual(branchGame(game, game.actions.length).state, game.state));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
