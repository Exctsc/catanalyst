// Short URL-safe board codes: a format version character + base64url bits.
// Each hex packs terrain (3 bits) and number token (4 bits, 0 = none).
//   "1": ports on the standard slots, 3 bits of type each       → 28 chars
//   "2": ports anywhere on the coast, 5 bits of coastal edge
//        index + 3 bits of type each (screenshot boards)        → 36 chars
import { PORTS, EDGES, COASTAL_EDGES, portSlot } from './gameRules.js';
import { TERRAINS, NUMBER_TOKENS, PORT_TYPES } from './boardGen.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const HEX_BITS = 19 * 7;
const LENGTH = { 1: 1 + Math.ceil((HEX_BITS + PORTS.length * 3) / 6), 2: 1 + Math.ceil((HEX_BITS + PORTS.length * 8) / 6) };

const sameEdge = (a, b) => (a[0] === b[0] && a[1] === b[1]) || (a[0] === b[1] && a[1] === b[0]);
const coastalIndex = vertices => COASTAL_EDGES.findIndex(e => sameEdge(EDGES[e], vertices));
// A port on a standard slot's edge keeps that slot's tuned label position.
const slotFor = edge => {
  const std = PORTS.find(p => sameEdge(p.vertices, EDGES[edge]));
  return std ? { vertices: std.vertices, x: std.x, y: std.y } : portSlot(edge);
};
const onStandardSlots = board => board.ports.every((p, i) => sameEdge(p.vertices, PORTS[i].vertices));

export function encodeBoard(board) {
  const version = onStandardSlots(board) ? '1' : '2';
  const bits = [];
  const put = (value, width) => { for (let i = width - 1; i >= 0; i--) bits.push((value >> i) & 1); };
  board.tiles.forEach((t, h) => {
    put(TERRAINS.indexOf(t), 3);
    put(board.numbers[h] === null ? 0 : NUMBER_TOKENS.indexOf(board.numbers[h]) + 1, 4);
  });
  board.ports.forEach(p => {
    if (version === '2') put(coastalIndex(p.vertices), 5);
    put(PORT_TYPES.indexOf(p.type), 3);
  });
  while (bits.length % 6) bits.push(0);
  let code = version;
  for (let i = 0; i < bits.length; i += 6) code += ALPHABET[parseInt(bits.slice(i, i + 6).join(''), 2)];
  return code;
}

// Returns the board, or null for anything that is not a well-formed code.
export function decodeBoard(code) {
  if (typeof code !== 'string') return null;
  const version = code[0];
  if (!LENGTH[version] || code.length !== LENGTH[version]) return null;
  const bits = [];
  for (const ch of code.slice(1)) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) return null;
    for (let i = 5; i >= 0; i--) bits.push((v >> i) & 1);
  }
  let pos = 0;
  const take = width => { let v = 0; for (let i = 0; i < width; i++) v = (v << 1) | bits[pos++]; return v; };
  const tiles = [], numbers = [];
  for (let h = 0; h < 19; h++) {
    const t = take(3), n = take(4);
    if (t >= TERRAINS.length || n > NUMBER_TOKENS.length) return null;
    tiles.push(TERRAINS[t]);
    numbers.push(n === 0 ? null : NUMBER_TOKENS[n - 1]);
  }
  const ports = [];
  for (const slot of PORTS) {
    const edge = version === '2' ? take(5) : null;
    const p = take(3);
    if (p >= PORT_TYPES.length || (edge !== null && edge >= COASTAL_EDGES.length)) return null;
    ports.push({ ...(edge === null ? slot : slotFor(COASTAL_EDGES[edge])), type: PORT_TYPES[p] });
  }
  return { tiles, numbers, ports };
}

export function boardLink(board, base) {
  return `${base}?board=${encodeBoard(board)}`;
}
