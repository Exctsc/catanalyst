// Short URL-safe board codes: "1" (format version) + 27 base64url chars.
// Each hex packs terrain (3 bits) and number token (4 bits, 0 = none); each
// port packs its type (3 bits). 19*7 + 9*3 = 160 bits.
import { PORTS } from './gameRules.js';
import { TERRAINS, NUMBER_TOKENS, PORT_TYPES } from './boardGen.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const VERSION = '1';
const LENGTH = 1 + Math.ceil((19 * 7 + PORTS.length * 3) / 6);

export function encodeBoard(board) {
  const bits = [];
  const put = (value, width) => { for (let i = width - 1; i >= 0; i--) bits.push((value >> i) & 1); };
  board.tiles.forEach((t, h) => {
    put(TERRAINS.indexOf(t), 3);
    put(board.numbers[h] === null ? 0 : NUMBER_TOKENS.indexOf(board.numbers[h]) + 1, 4);
  });
  board.ports.forEach(p => put(PORT_TYPES.indexOf(p.type), 3));
  while (bits.length % 6) bits.push(0);
  let code = VERSION;
  for (let i = 0; i < bits.length; i += 6) code += ALPHABET[parseInt(bits.slice(i, i + 6).join(''), 2)];
  return code;
}

// Returns the board, or null for anything that is not a well-formed code.
export function decodeBoard(code) {
  if (typeof code !== 'string' || code.length !== LENGTH || code[0] !== VERSION) return null;
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
    const p = take(3);
    if (p >= PORT_TYPES.length) return null;
    ports.push({ ...slot, type: PORT_TYPES[p] });
  }
  return { tiles, numbers, ports };
}

export function boardLink(board, base) {
  return `${base}?board=${encodeBoard(board)}`;
}
