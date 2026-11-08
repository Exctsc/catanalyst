// Game files and the autosave library. A game is stored as its creation
// options (seed, board, dice) plus its action list; the state is rebuilt by
// replaying, which also proves the file is internally consistent.
import { replay, ACTION_TYPES } from './engine.js';
import { validateBoard } from './boardGen.js';
import { DICE_MODES, parseDiceScript, formatDiceQueue } from './dice.js';

export const FILE_FORMAT = 'catanalyst-game';
export const FILE_VERSION = 1;
export const STORAGE_KEY = 'catanalyst.games';

export function exportGame(game, name = 'Catanalyst game') {
  const { seed, board, diceMode = 'random', diceQueue = [] } = game.options;
  return JSON.stringify({
    format: FILE_FORMAT, version: FILE_VERSION, name,
    options: { seed, board, diceMode, diceQueue }, actions: game.actions,
  }, null, 2);
}

// Checks the options object of a file. Returns clean options or an error string.
function readOptions(o) {
  if (!o || typeof o !== 'object') return 'Missing game options';
  if (!Number.isInteger(o.seed) || o.seed < 0 || o.seed > 0xFFFFFFFF) return 'Seed must be a whole number';
  const boardErrors = validateBoard(o.board, { free: true });
  if (boardErrors.length) return `Board: ${boardErrors[0]}`;
  const diceMode = o.diceMode ?? 'random';
  if (!DICE_MODES.includes(diceMode)) return `Unknown dice mode "${diceMode}"`;
  const queue = parseDiceScript(formatDiceQueue(Array.isArray(o.diceQueue) ? o.diceQueue : []));
  if (typeof queue === 'string' || (o.diceQueue !== undefined && !Array.isArray(o.diceQueue))) return 'Dice queue is malformed';
  return {
    seed: o.seed,
    board: { tiles: o.board.tiles, numbers: o.board.numbers, ports: o.board.ports },
    diceMode,
    diceQueue: queue,
  };
}

// Rebuilds a game from stored options + actions. Returns the record or an error.
export function rebuildGame(rawOptions, actions) {
  const options = readOptions(rawOptions);
  if (typeof options === 'string') return options;
  if (!Array.isArray(actions)) return 'Actions must be a list';
  const unknown = actions.findIndex(a => !a || typeof a !== 'object' || !ACTION_TYPES.includes(a.type));
  if (unknown >= 0) return `Action ${unknown + 1} is not a recognised action`;
  const { states, error } = replay(options, actions);
  if (error) return `The moves do not replay: ${error}`;
  return { options, actions, state: states.at(-1) };
}

// Parses an imported file. Returns { name, game } or a message saying why not.
export function importGame(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return 'This file is not valid JSON.';
  }
  if (!data || typeof data !== 'object' || data.format !== FILE_FORMAT) return 'This is not a Catanalyst game file.';
  if (data.version !== FILE_VERSION) return `Unsupported game file version ${data.version}.`;
  const game = rebuildGame(data.options, data.actions);
  if (typeof game === 'string') return `Could not load this game. ${game}.`;
  return { name: typeof data.name === 'string' && data.name.trim() ? data.name.trim().slice(0, 120) : 'Imported game', game };
}

// --- autosave library: [{ id, name, game }] plus the open game's id ---

export function serializeLibrary(games, currentId) {
  return JSON.stringify({
    version: FILE_VERSION,
    currentId,
    games: games.map(({ id, name, game }) => ({ id, name, options: game.options, actions: game.actions })),
  });
}

// Tolerant: corrupt or foreign storage gives an empty library, and any single
// entry that no longer replays is dropped rather than breaking the rest.
export function parseLibrary(text) {
  try {
    const data = JSON.parse(text);
    if (!data || !Array.isArray(data.games)) return { games: [], currentId: null };
    const games = data.games.flatMap(entry => {
      if (!entry || typeof entry.id !== 'string') return [];
      const game = rebuildGame(entry.options, entry.actions);
      return typeof game === 'string' ? [] : [{ id: entry.id, name: String(entry.name ?? 'Saved game'), game }];
    });
    const currentId = games.some(g => g.id === data.currentId) ? data.currentId : null;
    return { games, currentId };
  } catch {
    return { games: [], currentId: null };
  }
}
