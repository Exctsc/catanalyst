// Online play protocol. The host's browser keeps the real game; guests send
// the actions they want, the host checks the sender owns the acting seat,
// applies them with the same engine and tells everyone what was appended.
// Pure functions only: the network transport lives in src/net/.
//
// room  (host):  { game, seats: [guestId | null per player], names: { guestId: name } }
//                A seat owned by null is played by the host.
// view  (guest): { game | null, seats, names, error, stale }
import { applyAction, ACTION_TYPES } from './engine.js';
import { rebuildGame } from './saveFile.js';

const HOST_ONLY = new Set(['sandbox', 'setDiceQueue']);
const MAX_BATCH = 12;
const cleanName = name => String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 24) || 'Guest';

// Which player an action is made by, or null for host-only / malformed actions.
export function actorOf(state, action) {
  if (!action || typeof action !== 'object' || !ACTION_TYPES.includes(action.type) || HOST_ONLY.has(action.type)) return null;
  if (action.type === 'roll' || action.type === 'endTurn') return state.currentPlayerIndex;
  return Number.isInteger(action.player) && action.player >= 0 && action.player < state.players.length ? action.player : null;
}

export function createRoom(game) {
  return { game, seats: game.state.players.map(() => null), names: {} };
}

// Options can leave the board implicit (the default); the board never changes
// in play, so the state's copy is sent.
const sync = room => ({ t: 'sync', options: { ...room.game.options, board: room.game.options.board ?? room.game.state.board }, actions: room.game.actions, seats: room.seats, names: room.names });
const seatsMsg = room => ({ t: 'seats', seats: room.seats, names: room.names });

// Applies a batch for `who` (a guest id, or null for the host, who may act
// for anyone). Returns { room, out } where out is a list of { to, msg } and
// to is a guest id or '*' for everyone.
function applyBatch(room, who, actions) {
  const reply = message => ({ room, out: who === null ? [] : [{ to: who, msg: { t: 'error', message } }], error: message });
  if (!Array.isArray(actions) || actions.length === 0 || actions.length > MAX_BATCH) return reply('That move was not understood');
  let game = room.game;
  for (const action of actions) {
    if (who !== null) {
      const actor = actorOf(game.state, action);
      if (actor === null || room.seats[actor] !== who) return reply("That isn't your move to make");
    }
    const next = applyAction(game, action);
    if (typeof next === 'string') return reply(next);
    game = next;
  }
  const index = room.game.actions.length;
  const appended = game.actions.slice(index);
  const out = appended.length ? [{ to: '*', msg: { t: 'append', index, actions: appended } }] : [];
  return { room: { ...room, game }, out, error: null };
}

// The host's own moves.
export function hostAct(room, actions) {
  return applyBatch(room, null, actions);
}

// A message from guest `from`. Anything malformed is ignored or answered with an error.
export function hostReceive(room, from, msg) {
  if (!msg || typeof msg !== 'object') return { room, out: [] };
  const err = message => ({ room, out: [{ to: from, msg: { t: 'error', message } }] });
  switch (msg.t) {
    case 'hello': {
      const next = { ...room, names: { ...room.names, [from]: cleanName(msg.name) } };
      return { room: next, out: [{ to: from, msg: sync(next) }, { to: '*', msg: seatsMsg(next) }] };
    }
    case 'resync':
      return { room, out: [{ to: from, msg: sync(room) }] };
    case 'claim': {
      if (!Number.isInteger(msg.seat) || msg.seat < 0 || msg.seat >= room.seats.length) return err('No such seat');
      if (room.seats[msg.seat] !== null) return err('That seat is taken');
      // One seat per guest: taking a seat gives back any other.
      const next = { ...room, seats: room.seats.map((s, i) => (i === msg.seat ? from : s === from ? null : s)) };
      return { room: next, out: [{ to: '*', msg: seatsMsg(next) }] };
    }
    case 'release': {
      if (room.seats[msg.seat] !== from) return { room, out: [] };
      const next = { ...room, seats: room.seats.map((s, i) => (i === msg.seat ? null : s)) };
      return { room: next, out: [{ to: '*', msg: seatsMsg(next) }] };
    }
    case 'act':
      return applyBatch(room, from, msg.actions);
    default:
      return { room, out: [] };
  }
}

// The host takes a seat back from a guest.
export function hostReclaim(room, seat) {
  if (!Number.isInteger(seat) || room.seats[seat] == null) return { room, out: [] };
  const next = { ...room, seats: room.seats.map((s, i) => (i === seat ? null : s)) };
  return { room: next, out: [{ to: '*', msg: seatsMsg(next) }] };
}

// A guest left: their seats go back to the host.
export function hostLeave(room, id) {
  if (!(id in room.names) && !room.seats.includes(id)) return { room, out: [] };
  const names = { ...room.names };
  delete names[id];
  const next = { ...room, names, seats: room.seats.map(s => (s === id ? null : s)) };
  return { room: next, out: [{ to: '*', msg: seatsMsg(next) }] };
}

export const emptyView = () => ({ game: null, seats: [], names: {}, error: null, stale: false });

// A message from the host. `stale` asks the caller to request a resync.
export function guestReceive(view, msg) {
  if (!msg || typeof msg !== 'object') return view;
  switch (msg.t) {
    case 'sync': {
      const game = rebuildGame(msg.options, msg.actions);
      if (typeof game === 'string') return { ...view, error: `The host's game could not be loaded. ${game}.` };
      return { ...view, game, seats: msg.seats, names: msg.names, error: null, stale: false };
    }
    case 'append': {
      if (!view.game || msg.index !== view.game.actions.length || !Array.isArray(msg.actions)) return { ...view, stale: true };
      let game = view.game;
      for (const action of msg.actions) {
        const next = applyAction(game, action);
        if (typeof next === 'string' || next === game) return { ...view, stale: true };
        game = next;
      }
      return { ...view, game, error: null };
    }
    case 'seats':
      return { ...view, seats: msg.seats, names: msg.names };
    case 'error':
      return { ...view, error: String(msg.message) };
    default:
      return view;
  }
}
