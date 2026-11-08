// Action-sourced engine: every state change is a plain, serialisable action
// run through dispatch(). A game is { options, actions }; rebuilding it is
// createGame(options) followed by the actions in order, and because every
// random draw comes from the seeded rng in state, the result is identical.
import * as A from './gameActions.js';
import { createGame } from './gameState.js';
import { setDiceQueue } from './dice.js';
import { sandboxEdit } from './sandbox.js';
import { EDGES, VERTICES } from './gameRules.js';

const EDGE_IDS = EDGES.map((_, i) => i);
const VERTEX_IDS = VERTICES.map((_, i) => i);

const HANDLERS = {
  roll: s => A.performRoll(s),
  endTurn: s => A.endTurn(s),
  placeSettlement: (s, a) => A.placeSettlement(s, a.player, a.vertex),
  placeRoad: (s, a) => A.placeRoad(s, a.player, a.edge),
  upgradeToCity: (s, a) => A.upgradeToCity(s, a.player, a.vertex),
  bankTrade: (s, a) => A.bankTrade(s, a.player, a.give, a.receive),
  discard: (s, a) => A.discardCards(s, a.player, a.cards),
  moveRobber: (s, a) => A.moveRobber(s, a.player, a.hex),
  steal: (s, a) => A.stealResource(s, a.player, a.victim),
  buyDevCard: (s, a) => A.buyDevCard(s, a.player),
  playKnight: (s, a) => A.playKnight(s, a.player),
  playRoadBuilding: (s, a) => A.playRoadBuilding(s, a.player),
  skipRoadBuilding: (s, a) => A.skipRoadBuilding(s, a.player),
  playYearOfPlenty: (s, a) => A.playYearOfPlenty(s, a.player, a.picks),
  playMonopoly: (s, a) => A.playMonopoly(s, a.player, a.resource),
  proposeTrade: (s, a) => A.proposeTrade(s, a.player, a.to, a.give, a.get),
  acceptTrade: (s, a) => A.acceptTrade(s, a.player),
  declineTrade: (s, a) => A.declineTrade(s, a.player),
  setDiceQueue: (s, a) => setDiceQueue(s, a.queue),
  sandbox: (s, a) => sandboxEdit(s, a.edit),
};

export const ACTION_TYPES = Object.keys(HANDLERS);

// Returns the next state, the same state for a no-op (e.g. rolling twice),
// or an error string. Never throws on a malformed action.
export function dispatch(state, action) {
  const handler = action && HANDLERS[action.type];
  if (!handler) return `Unknown action: ${action && action.type}`;
  return handler(state, action);
}

// Rebuild a game. Returns every intermediate state (states[0] is the initial
// one) so the replay viewer can step through them, or an error naming the
// first action that fails to apply.
export function replay(options, actions) {
  const states = [createGame(options)];
  for (let i = 0; i < actions.length; i++) {
    const next = dispatch(states[i], actions[i]);
    if (typeof next === 'string') return { states, error: `Action ${i + 1} (${actions[i]?.type}): ${next}` };
    states.push(next);
  }
  return { states, error: null };
}

// Apply an action to a game record, appending it only if it changed the state.
// Returns the new record or an error string.
export function applyAction(game, action) {
  const next = dispatch(game.state, action);
  if (typeof next === 'string') return next;
  if (next === game.state) return game;
  return { ...game, actions: [...game.actions, action], state: next };
}

export function newGame(options) {
  return { options, actions: [], state: createGame(options) };
}

// Index of the first state of each play-phase turn, for "jump to turn".
// Setup is listed as turn 0 at index 0.
export function turnStarts(states) {
  const starts = [{ turn: 0, index: 0 }];
  states.forEach((s, i) => {
    if (s.phase === 'play' && !starts.some(t => t.turn === s.turn)) starts.push({ turn: s.turn, index: i });
  });
  return starts;
}

// A new game that shares the first `index` actions with `game` and continues
// from there. The original record is not touched.
export function branchGame(game, index) {
  const actions = game.actions.slice(0, index);
  const { states, error } = replay(game.options, actions);
  if (error) return error;
  return { options: game.options, actions, state: states.at(-1) };
}

// What each purchase costs; the rules in gameActions charge the same (a test
// checks), this copy is what the UI shows.
export const BUILD_COSTS = {
  road: { brick: 1, wood: 1 },
  settlement: { brick: 1, wood: 1, wheat: 1, sheep: 1 },
  city: { wheat: 2, ore: 3 },
  devCard: { ore: 1, wheat: 1, sheep: 1 },
};

// Board spots where the current player could build `kind` right now: edge
// indexes for 'road', vertex indexes for 'settlement' / 'city'. Asks dispatch
// itself, so cost, pieces left, phase and placement rules all count.
export function legalSpots(state, kind) {
  const player = state.currentPlayerIndex;
  const ok = action => typeof dispatch(state, action) !== 'string';
  if (kind === 'road') return EDGE_IDS.filter(edge => ok({ type: 'placeRoad', player, edge }));
  const type = kind === 'city' ? 'upgradeToCity' : 'placeSettlement';
  return VERTEX_IDS.filter(vertex => ok({ type, player, vertex }));
}

// A bank trade as picked on the cards: `give` is N× the port rate of one
// resource, `get` is N cards of other resources. Returns the bankTrade
// actions to apply in order, or a short reason it isn't a bank trade.
export function bankTradePlan(state, give, get) {
  const player = state.currentPlayerIndex;
  const types = Object.keys(give).filter(r => give[r] > 0);
  const wanted = Object.keys(get).flatMap(r => Array(get[r] > 0 ? get[r] : 0).fill(r));
  if (types.length !== 1 || wanted.length === 0) return 'give one kind of card and pick what you get';
  const [res] = types;
  const rate = A.portRate(state, player, res);
  if (give[res] % rate) return `the bank trades ${res} at ${rate}:1`;
  if (give[res] / rate !== wanted.length) return `${give[res]} ${res} buys ${give[res] / rate} card${give[res] / rate === 1 ? '' : 's'}`;
  if (wanted.includes(res)) return 'pick a different resource to get';
  return wanted.map(receive => ({ type: 'bankTrade', player, give: res, receive }));
}
