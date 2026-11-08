import { isDeepStrictEqual } from 'node:util';
import { exportGame, importGame, serializeLibrary, parseLibrary, rebuildGame } from '../src/game/saveFile.js';
import { applyAction } from '../src/game/engine.js';
import { generateBoard } from '../src/game/boardGen.js';
import { createRng } from '../src/game/rng.js';
import { playGame } from './bot.mjs';

let pass = 0, fail = 0;
function check(name, cond) {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}`);
}

const [board] = generateBoard(createRng(31), { balanced: true });
let game = playGame({ seed: 31, board, diceMode: 'scripted', diceQueue: [{ total: 6 }, { die1: 2, die2: 2 }] }, 120);
game = applyAction(game, { type: 'sandbox', edit: { op: 'setRobber', hex: 3 } });

// --- export → import round trip
const text = exportGame(game, 'Training position');
const data = JSON.parse(text);
check('file holds board, seed and actions', data.options.seed === 31 && isDeepStrictEqual(data.options.board, board) && data.actions.length === game.actions.length);
const loaded = importGame(text);
check('import succeeds', typeof loaded !== 'string');
check('import keeps the name', loaded.name === 'Training position');
check('imported game is the identical state', isDeepStrictEqual(loaded.game.state, game.state));
check('imported game keeps its actions for replay', isDeepStrictEqual(loaded.game.actions, game.actions));
check('imported game can keep playing', typeof applyAction(loaded.game, { type: 'sandbox', edit: { op: 'setRobber', hex: 4 } }) !== 'string');

// --- malformed files are rejected with a clear message
const variant = patch => JSON.stringify({ ...data, ...patch });
const cases = [
  ['not JSON', '{oops', 'not valid JSON'],
  ['empty file', '', 'not valid JSON'],
  ['JSON but not a game', '[1,2,3]', 'not a Catanalyst game file'],
  ['wrong format tag', variant({ format: 'other' }), 'not a Catanalyst game file'],
  ['future version', variant({ version: 99 }), 'Unsupported game file version'],
  ['missing options', variant({ options: undefined }), 'Missing game options'],
  ['bad seed', variant({ options: { ...data.options, seed: 'abc' } }), 'Seed'],
  ['bad board', variant({ options: { ...data.options, board: { tiles: [] } } }), 'Board'],
  ['bad dice mode', variant({ options: { ...data.options, diceMode: 'loaded' } }), 'dice mode'],
  ['bad dice queue', variant({ options: { ...data.options, diceQueue: [{ total: 13 }] } }), 'Dice queue'],
  ['actions not a list', variant({ actions: 'roll' }), 'Actions must be a list'],
  ['unknown action', variant({ actions: [{ type: 'cheat' }] }), 'Action 1 is not a recognised action'],
  ['moves that do not replay', variant({ actions: [...data.actions.slice(0, 3), { type: 'placeRoad', player: 0, edge: 999 }] }), 'do not replay'],
];
for (const [label, input, expected] of cases) {
  const r = importGame(input);
  check(`rejects ${label}`, typeof r === 'string' && r.includes(expected));
}

// --- autosave library
const other = playGame({ seed: 8, board }, 30);
const library = [{ id: 'a', name: 'First', game }, { id: 'b', name: 'Second', game: other }];
const stored = serializeLibrary(library, 'b');
const back = parseLibrary(stored);
check('library round-trips every game', back.games.length === 2 && isDeepStrictEqual(back.games[0].game.state, game.state) && isDeepStrictEqual(back.games[1].game.state, other.state));
check('library remembers the open game', back.currentId === 'b');
check('library keeps names', back.games.map(g => g.name).join() === 'First,Second');
check('corrupt storage gives an empty library', isDeepStrictEqual(parseLibrary('{nope'), { games: [], currentId: null }));
check('missing storage gives an empty library', isDeepStrictEqual(parseLibrary(null), { games: [], currentId: null }));
const damaged = JSON.parse(stored);
damaged.games[0].actions = [{ type: 'teleport' }];
const partial = parseLibrary(JSON.stringify(damaged));
check('one broken entry is dropped, the rest survive', partial.games.length === 1 && partial.games[0].id === 'b');
check('stale current id falls back to none', parseLibrary(serializeLibrary(library, 'zzz')).currentId === null);
check('rebuildGame reports errors as strings', typeof rebuildGame({ seed: 1 }, []) === 'string');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
