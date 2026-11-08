// Random board generation from the seeded rng.
import {
  HEX_ADJACENCY, PORTS, STANDARD_TILE_COUNTS, STANDARD_NUMBERS, STANDARD_PORT_COUNTS,
} from './gameRules.js';
import { shuffle } from './rng.js';

const expand = counts => Object.entries(counts).flatMap(([k, n]) => Array(n).fill(k));
const isRed = n => n === 6 || n === 8;

// "Balanced": no two red numbers (6/8) touch, and no two equal numbers touch.
export function isBalanced(numbers) {
  return numbers.every((n, h) => n === null || HEX_ADJACENCY[h].every(o => {
    const m = numbers[o];
    return m === null || (m !== n && !(isRed(n) && isRed(m)));
  }));
}

// Returns [board, rng]. Terrain, number tokens and port types are each
// shuffled; with { balanced: true } the numbers are re-dealt until they pass
// isBalanced. ponytail: rejection sampling, ~3% of deals pass so ~35 tries on
// average; a constructive placer if it ever shows up in profiles.
export function generateBoard(rng, { balanced = false } = {}) {
  let r = rng;
  let tiles, numbers, portTypes;
  [tiles, r] = shuffle(r, expand(STANDARD_TILE_COUNTS));
  [portTypes, r] = shuffle(r, expand(STANDARD_PORT_COUNTS));
  for (let attempt = 0; ; attempt++) {
    let deal;
    [deal, r] = shuffle(r, STANDARD_NUMBERS);
    numbers = tiles.map(t => (t === 'desert' ? null : deal.shift()));
    if (!balanced || isBalanced(numbers)) break;
    if (attempt > 100000) throw new Error('could not deal a balanced board');
  }
  const ports = PORTS.map((slot, i) => ({ ...slot, type: portTypes[i] }));
  return [{ tiles, numbers, ports }, r];
}
