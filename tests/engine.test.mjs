import { readFileSync, readdirSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { dispatch, replay, applyAction, newGame, ACTION_TYPES } from '../src/game/engine.js';
import { createGame } from '../src/game/gameState.js';
import { next, shuffle, createRng } from '../src/game/rng.js';
import { playGame } from './bot.mjs';

let pass = 0, fail = 0;
function check(name, cond) {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}`);
}

// --- rng
const [a1] = next(createRng(42));
const [a2] = next(createRng(42));
check('same seed, same draw', a1 === a2 && a1 >= 0 && a1 < 1);
check('different seed, different draw', next(createRng(43))[0] !== a1);
check('rng position advances', next(createRng(42))[1].n === 1);
const [deck] = shuffle(createRng(7), [1, 2, 3, 4, 5, 6, 7, 8]);
check('shuffle is a permutation', [...deck].sort().join() === '1,2,3,4,5,6,7,8');

// --- createGame is a pure function of its options
check('createGame deterministic', isDeepStrictEqual(createGame({ seed: 9 }), createGame({ seed: 9 })));
check('seed changes the dev deck order', createGame({ seed: 9 }).devCardDeck.join() !== createGame({ seed: 10 }).devCardDeck.join());
check('seed and position live in state', createGame({ seed: 9 }).rng.seed === 9 && typeof createGame({ seed: 9 }).rng.n === 'number');

// --- dispatch contract
check('unknown action rejected', typeof dispatch(createGame(), { type: 'teleport' }) === 'string');
check('missing action rejected', typeof dispatch(createGame(), null) === 'string');
check('every handler is reachable', ACTION_TYPES.length >= 18);
const g0 = newGame({ seed: 3 });
check('no-op action not recorded', applyAction(g0, { type: 'roll' }) === g0);
check('illegal action returns the error', typeof applyAction(g0, { type: 'placeRoad', player: 0, edge: 0 }) === 'string');

// --- a full scripted game, twice
const options = { seed: 20261108 };
const first = playGame(options);
const second = playGame(options);
check('scripted game reaches a winner', first.state.winner !== null);
check('scripted game is long (real game, not a stub)', first.actions.length > 150);
check('same seed + same script = same actions', isDeepStrictEqual(first.actions, second.actions));
check('same seed + same script = deep-equal final state', isDeepStrictEqual(first.state, second.state));

const rebuilt = replay(options, first.actions);
check('replay applies every action', rebuilt.error === null && rebuilt.states.length === first.actions.length + 1);
check('replay reproduces the identical game', isDeepStrictEqual(rebuilt.states.at(-1), first.state));

// JSON round-trip: what export/import will do.
const fromJson = replay(JSON.parse(JSON.stringify(options)), JSON.parse(JSON.stringify(first.actions)));
check('replay survives a JSON round-trip', isDeepStrictEqual(fromJson.states.at(-1), first.state));

const other = playGame({ seed: 77 });
check('a different seed plays a different game', !isDeepStrictEqual(other.state.log, first.state.log));

const truncated = replay(options, [...first.actions.slice(0, 5), { type: 'placeRoad', player: 0, edge: -1 }]);
check('replay reports the first failing action', truncated.error?.startsWith('Action 6') && truncated.states.length === 6);

// --- no hidden randomness left in game logic
const leaks = readdirSync('src/game').filter(f => f !== 'rng.js' && readFileSync(`src/game/${f}`, 'utf8').includes('Math.random'));
check('only rng.js touches Math.random', leaks.length === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
