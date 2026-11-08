// Analysis numbers for the sidebar. All pure: board-derived values read one
// state; history-derived values read the replayed states plus the action that
// produced each one (states[i + 1] = dispatch(states[i], actions[i])).
import { VERTEX_TO_HEXES, VERTEX_ADJACENCY, TILE_TO_RESOURCE } from './gameRules.js';

export const RESOURCES = ['brick', 'wood', 'ore', 'wheat', 'sheep'];
const zero = () => Object.fromEntries(RESOURCES.map(r => [r, 0]));

// Dots on a number token: the number of ways to roll it out of 36.
export function pips(n) {
  return n === null || n === undefined || n === 7 ? 0 : 6 - Math.abs(7 - n);
}

// Chance of each 2d6 total, for the histogram expectation.
export const TOTAL_PROBABILITY = Object.fromEntries(
  [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(t => [t, (6 - Math.abs(7 - t)) / 36]));

function buildings(player) {
  return [
    ...player.settlements.map(b => ({ vertex: b.intersectionIndex, mult: 1 })),
    ...player.cities.map(b => ({ vertex: b.intersectionIndex, mult: 2 })),
  ];
}

// Total pips touching a vertex (structural: the robber is ignored).
export function vertexPips(board, vertex) {
  return VERTEX_TO_HEXES[vertex].reduce((sum, h) => sum + (TILE_TO_RESOURCE[board.tiles[h]] ? pips(board.numbers[h]) : 0), 0);
}

// Pip value at every intersection a settlement could legally go by the
// distance rule (empty, no building next to it). [{ vertex, pips }]
export function openIntersectionPips(state) {
  const taken = new Set(state.players.flatMap(p => buildings(p).map(b => b.vertex)));
  return VERTEX_TO_HEXES.map((_, v) => v)
    .filter(v => !taken.has(v) && !VERTEX_ADJACENCY[v].some(a => taken.has(a)))
    .map(v => ({ vertex: v, pips: vertexPips(state.board, v) }));
}

// Each player's pips per resource from their buildings (cities count double).
export function playerPips(state) {
  return state.players.map(p => {
    const out = zero();
    for (const { vertex, mult } of buildings(p)) {
      for (const h of VERTEX_TO_HEXES[vertex]) {
        const r = TILE_TO_RESOURCE[state.board.tiles[h]];
        if (r) out[r] += mult * pips(state.board.numbers[h]);
      }
    }
    return out;
  });
}

// Expected cards per roll right now: pips / 36, skipping the robbed hex.
export function expectedPerRoll(state) {
  return state.players.map(p => {
    const out = zero();
    for (const { vertex, mult } of buildings(p)) {
      for (const h of VERTEX_TO_HEXES[vertex]) {
        const r = TILE_TO_RESOURCE[state.board.tiles[h]];
        if (r && h !== state.robberHex) out[r] += (mult * pips(state.board.numbers[h])) / 36;
      }
    }
    return out;
  });
}

// Rolled totals so far vs what 2d6 predicts for the same number of rolls.
export function rollHistogram(states, actions) {
  const counts = Object.fromEntries(Object.keys(TOTAL_PROBABILITY).map(t => [t, 0]));
  let rolls = 0;
  actions.forEach((a, i) => {
    const dice = states[i + 1]?.dice;
    if (a.type === 'roll' && dice && dice !== states[i].dice && dice.total !== null) { counts[dice.total]++; rolls++; }
  });
  return Object.keys(counts).map(t => ({ total: +t, actual: counts[t], expected: rolls * TOTAL_PROBABILITY[t] }));
}

// Where each player's cards came from and went. Spending on builds and dev
// cards, cards given away in trades, and sandbox edits are not income.
const GAIN = { roll: 'rolls', placeSettlement: 'setup', bankTrade: 'trades', acceptTrade: 'trades', playYearOfPlenty: 'devCards', playMonopoly: 'devCards', steal: 'stolen' };
const LOSS = { steal: 'robber', discard: 'discards', playMonopoly: 'monopoly' };
export const GAIN_KEYS = ['rolls', 'setup', 'trades', 'devCards', 'stolen'];
export const LOSS_KEYS = ['robber', 'discards', 'monopoly'];

export function incomeBreakdown(states, actions) {
  const out = states[0].players.map(() => ({
    gained: Object.fromEntries(GAIN_KEYS.map(k => [k, 0])),
    lost: Object.fromEntries(LOSS_KEYS.map(k => [k, 0])),
  }));
  actions.forEach((a, i) => {
    const before = states[i], after = states[i + 1];
    if (!after) return;
    after.players.forEach((p, pi) => {
      for (const r of RESOURCES) {
        const d = p.resources[r] - before.players[pi].resources[r];
        if (d > 0 && GAIN[a.type]) out[pi].gained[GAIN[a.type]] += d;
        if (d < 0 && LOSS[a.type]) out[pi].lost[LOSS[a.type]] -= d;
      }
    });
  });
  return out;
}
