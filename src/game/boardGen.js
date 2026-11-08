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

export const TERRAINS = Object.keys(STANDARD_TILE_COUNTS);
export const NUMBER_TOKENS = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12];
export const PORT_TYPES = Object.keys(STANDARD_PORT_COUNTS);

// Problems with a board as a list of messages (empty = fine). Shape checks
// always run; with { free: true } the standard piece counts are skipped.
export function validateBoard(board, { free = false } = {}) {
  if (!board || !Array.isArray(board.tiles) || !Array.isArray(board.numbers) || !Array.isArray(board.ports))
    return ['Board is missing tiles, numbers or ports'];
  if (board.tiles.length !== 19 || board.numbers.length !== 19) return ['A board has 19 hexes'];
  if (board.ports.length !== PORTS.length) return [`A board has ${PORTS.length} ports`];
  const errors = [];
  if (board.tiles.some(t => !TERRAINS.includes(t))) errors.push('Unknown terrain');
  if (board.numbers.some(n => n !== null && !NUMBER_TOKENS.includes(n))) errors.push('Number tokens must be 2–6 or 8–12');
  if (board.ports.some(p => !p || !PORT_TYPES.includes(p.type))) errors.push('Unknown port type');
  if (free || errors.length) return errors;

  const diff = (label, have, want) => {
    for (const k of Object.keys(want)) {
      const n = have.filter(x => x === k).length;
      if (n !== want[k]) errors.push(`${label}: ${n} ${k}, standard is ${want[k]}`);
    }
  };
  diff('Terrain', board.tiles, STANDARD_TILE_COUNTS);
  diff('Ports', board.ports.map(p => p.type), STANDARD_PORT_COUNTS);
  const tokens = board.numbers.filter(n => n !== null).sort((a, b) => a - b);
  if (tokens.join() !== STANDARD_NUMBERS.join())
    errors.push(`Number tokens must be exactly ${STANDARD_NUMBERS.join(', ')}`);
  board.tiles.forEach((t, h) => {
    if (t === 'desert' && board.numbers[h] !== null) errors.push(`Hex ${h + 1}: the desert takes no number`);
    if (t !== 'desert' && board.numbers[h] === null) errors.push(`Hex ${h + 1}: needs a number token`);
  });
  return errors;
}
