import { isDeepStrictEqual } from 'node:util';
import { drawDice, parseDiceScript, formatDiceQueue, setDiceQueue, BALANCED_RESHUFFLE_AT } from '../src/game/dice.js';
import { createGame } from '../src/game/gameState.js';
import { newGame, applyAction, replay } from '../src/game/engine.js';
import { playGame } from './bot.mjs';

let pass = 0, fail = 0;
function check(name, cond) {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}`);
}

// Draw n rolls in a row from a fresh game of the given mode.
function rolls(mode, n, seed = 1, extra = {}) {
  let s = createGame({ seed, diceMode: mode, ...extra });
  const out = [];
  for (let i = 0; i < n; i++) {
    const [d, patch] = drawDice(s);
    s = { ...s, ...patch };
    out.push(d);
  }
  return { out, state: s };
}

// --- random
const r = rolls('random', 2000).out;
check('random: dice are 1–6 and totals consistent', r.every(d => d.die1 >= 1 && d.die1 <= 6 && d.die2 >= 1 && d.die2 <= 6 && d.total === d.die1 + d.die2));
check('random: isRobber exactly on 7', r.every(d => d.isRobber === (d.total === 7)));
check('random: every total 2–12 appears', new Set(r.map(d => d.total)).size === 11);
check('random: same seed same rolls', isDeepStrictEqual(rolls('random', 50, 9).out, rolls('random', 50, 9).out));

// --- balanced
const firstDeal = rolls('balanced', 36 - BALANCED_RESHUFFLE_AT + 1).out;
const pairs = firstDeal.map(d => `${d.die1}${d.die2}`);
check('balanced: no combination repeats within one deal', new Set(pairs).size === pairs.length);
// One deal yields 36 - 13 + 1 = 24 rolls (12 left); the 25th roll reshuffles.
check('balanced: 12 combinations left unused after a deal', rolls('balanced', 36 - BALANCED_RESHUFFLE_AT + 1).state.diceDeck.length === BALANCED_RESHUFFLE_AT - 1);
const afterDeal = rolls('balanced', 36 - BALANCED_RESHUFFLE_AT + 2).state;
check(`balanced: deck reshuffles once fewer than ${BALANCED_RESHUFFLE_AT} remain`, afterDeal.diceDeck.length === 36 - 1);
check('balanced: deck state lives in game state', Array.isArray(afterDeal.diceDeck) && afterDeal.rng.n > 0);

// Over many rolls, balanced tracks the 2d6 distribution far more tightly than random.
const N = 36 * 100;
const expected = t => (6 - Math.abs(7 - t)) / 36 * N;
const maxDeviation = list => Math.max(...[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(t =>
  Math.abs(list.filter(d => d.total === t).length - expected(t)) / N));
const balDev = maxDeviation(rolls('balanced', N, 3).out);
const randDev = maxDeviation(rolls('random', N, 3).out);
check(`balanced: every total within 1.5% of expectation over ${N} rolls (got ${(balDev * 100).toFixed(2)}%)`, balDev < 0.015);
check('balanced: tighter than random on the same seed', balDev < randDev);

// --- scripted
const script = parseDiceScript('6 8 3+4, 12');
check('parse totals and pairs', isDeepStrictEqual(script, [{ total: 6 }, { total: 8 }, { die1: 3, die2: 4 }, { total: 12 }]));
check('format round-trips', formatDiceQueue(script) === '6 8 3+4 12' && isDeepStrictEqual(parseDiceScript(formatDiceQueue(script)), script));
check('parse rejects 7+1, 13, 1 and words', ['7+1', '13', '1', 'six', '0+3'].every(t => typeof parseDiceScript(t) === 'string'));
check('empty script is an empty queue', isDeepStrictEqual(parseDiceScript('  '), []));

const sc = rolls('scripted', 6, 1, { diceQueue: script });
check('scripted: totals come out in order', sc.out.slice(0, 4).map(d => d.total).join() === '6,8,7,12');
check('scripted: exact pair kept', sc.out[2].die1 === 3 && sc.out[2].die2 === 4 && sc.out[2].isRobber);
check('scripted: totals become a valid pair', sc.out.slice(0, 4).every(d => d.die1 >= 1 && d.die1 <= 6 && d.die2 >= 1 && d.die2 <= 6));
check('scripted: empty queue falls back to random', sc.state.diceQueue.length === 0 && sc.state.rng.n > createGame({ seed: 1 }).rng.n);
check('scripted: fallback matches random mode draws', isDeepStrictEqual(rolls('scripted', 3, 4).out, rolls('random', 3, 4).out));

// setDiceQueue validation
const scGame = createGame({ diceMode: 'scripted' });
check('setDiceQueue only in scripted mode', typeof setDiceQueue(createGame(), [{ total: 6 }]) === 'string');
check('setDiceQueue rejects bad entries', typeof setDiceQueue(scGame, [{ total: 7 }, { total: 1 }]) === 'string' && typeof setDiceQueue(scGame, 'x') === 'string');
check('setDiceQueue stores a clean copy', isDeepStrictEqual(setDiceQueue(scGame, [{ total: 5, junk: 1 }]).diceQueue, [{ total: 5 }]));

// --- through the engine: a scripted game edited mid-game replays exactly
const options = { seed: 5, diceMode: 'scripted', diceQueue: [{ total: 8 }] };
let g = playGame({ ...options }, 40); // setup + a few actions
const hadRolled = g.state.phase === 'play';
g = applyAction(g, { type: 'setDiceQueue', queue: [{ die1: 6, die2: 6 }, { total: 4 }] });
check('mid-game queue edit is recorded', typeof g !== 'string' && g.actions.at(-1).type === 'setDiceQueue');
while (g.state.dice !== null) g = applyAction(g, { type: 'endTurn' });
g = applyAction(g, { type: 'roll' });
check('edited queue drives the next roll', hadRolled && g.state.dice.total === 12);
const again = replay(options, g.actions);
check('scripted game with mid-game edits replays identically', again.error === null && isDeepStrictEqual(again.states.at(-1), g.state));

// Mode is fixed at start and full games still complete in each mode.
for (const mode of ['random', 'balanced', 'scripted']) {
  const full = playGame({ seed: 12, diceMode: mode, diceQueue: mode === 'scripted' ? parseDiceScript('6 8 6 8 5 9') : [] });
  check(`${mode}: a full scripted game finishes`, full.state.winner !== null && full.state.diceMode === mode);
}
check('fresh newGame carries the mode', newGame({ seed: 1, diceMode: 'balanced' }).state.diceMode === 'balanced');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
