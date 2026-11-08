// Dice modes, chosen at game start:
//   random    two independent d6 from the seeded rng
//   balanced  draw without replacement from the 36 two-dice combinations,
//             reshuffling the full deck once fewer than BALANCED_RESHUFFLE_AT remain
//   scripted  pop the next entry of diceQueue (a total or an exact pair);
//             an empty queue falls back to random
import { nextInt, shuffle } from './rng.js';

export const DICE_MODES = ['random', 'balanced', 'scripted'];
export const BALANCED_RESHUFFLE_AT = 13;
const ALL_PAIRS = Array.from({ length: 36 }, (_, i) => [Math.floor(i / 6) + 1, (i % 6) + 1]);

const toDice = (die1, die2) => ({ die1, die2, total: die1 + die2, isRobber: die1 + die2 === 7 });

// A scripted total becomes a fixed pair so the readout is stable: 2 → 1+1, 9 → 3+6.
function entryToDice(entry) {
  if ('die1' in entry) return toDice(entry.die1, entry.die2);
  const die1 = Math.max(1, entry.total - 6);
  return toDice(die1, entry.total - die1);
}

// Returns [dice, patch] where patch holds the state fields the draw consumed.
export function drawDice(state) {
  const queue = state.diceQueue || [];
  if (state.diceMode === 'scripted' && queue.length > 0) {
    return [entryToDice(queue[0]), { diceQueue: queue.slice(1) }];
  }
  let rng = state.rng;
  if (state.diceMode === 'balanced') {
    let deck = state.diceDeck || [];
    if (deck.length < BALANCED_RESHUFFLE_AT) [deck, rng] = shuffle(rng, ALL_PAIRS);
    const [a, b] = deck[deck.length - 1];
    return [toDice(a, b), { diceDeck: deck.slice(0, -1), rng }];
  }
  let a, b;
  [a, rng] = nextInt(rng, 6);
  [b, rng] = nextInt(rng, 6);
  return [toDice(a + 1, b + 1), { rng }];
}

function isEntry(e) {
  if (!e || typeof e !== 'object') return false;
  if ('die1' in e) return [e.die1, e.die2].every(d => Number.isInteger(d) && d >= 1 && d <= 6);
  return Number.isInteger(e.total) && e.total >= 2 && e.total <= 12;
}

// "6 8 3+4 12" → [{total:6},{total:8},{die1:3,die2:4},{total:12}], or an error string.
export function parseDiceScript(text) {
  const tokens = String(text).split(/[\s,]+/).filter(Boolean);
  const queue = [];
  for (const t of tokens) {
    const pair = t.match(/^(\d)\+(\d)$/);
    const entry = pair ? { die1: +pair[1], die2: +pair[2] } : /^\d{1,2}$/.test(t) ? { total: +t } : null;
    if (!isEntry(entry)) return `"${t}" is not a roll: use a total 2–12 or a pair like 3+4`;
    queue.push(entry);
  }
  return queue;
}

export function formatDiceQueue(queue) {
  return (queue || []).map(e => ('die1' in e ? `${e.die1}+${e.die2}` : `${e.total}`)).join(' ');
}

// Replace the scripted queue mid-game. Allowed at any time: it is a training
// control, not a player move, and it is recorded like any other action.
export function setDiceQueue(state, queue) {
  if (state.diceMode !== 'scripted') return 'Dice queue only applies to scripted dice';
  if (!Array.isArray(queue) || !queue.every(isEntry)) return 'Invalid dice queue';
  return { ...state, diceQueue: queue.map(e => ('die1' in e ? { die1: e.die1, die2: e.die2 } : { total: e.total })) };
}

export const DICE_LABELS = {
  random: 'Random',
  balanced: 'Balanced (36-combination deck)',
  scripted: 'Scripted (type the rolls)',
};

// Game options from the picker, or an error string if the script is malformed.
export function diceOptions({ diceMode, script }) {
  if (diceMode !== 'scripted') return { diceMode };
  const queue = parseDiceScript(script);
  return typeof queue === 'string' ? queue : { diceMode, diceQueue: queue };
}
