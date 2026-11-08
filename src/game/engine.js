// Action-sourced engine: every state change is a plain, serialisable action
// run through dispatch(). A game is { options, actions }; rebuilding it is
// createGame(options) followed by the actions in order, and because every
// random draw comes from the seeded rng in state, the result is identical.
import * as A from './gameActions.js';
import { createGame } from './gameState.js';
import { setDiceQueue } from './dice.js';

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
