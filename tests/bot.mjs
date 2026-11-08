// Deterministic scripted player for tests: picks the first legal action from a
// fixed priority list, using only dispatch(). Not a strategy, just a way to
// drive whole games through the engine.
import { newGame, applyAction, dispatch } from '../src/game/engine.js';
import { VERTICES, EDGES, HEX_TO_VERTICES } from '../src/game/gameRules.js';

const RES = ['brick', 'wood', 'ore', 'wheat', 'sheep'];
const range = n => [...Array(n).keys()];

function firstLegal(state, candidates) {
  for (const a of candidates) {
    const next = dispatch(state, a);
    if (typeof next !== 'string' && next !== state) return a;
  }
  return null;
}

function discardFor(player, n) {
  const hand = { ...player.resources };
  const cards = {};
  for (let i = 0; i < n; i++) {
    const r = RES.reduce((best, x) => (hand[x] > hand[best] ? x : best), RES[0]);
    hand[r]--; cards[r] = (cards[r] || 0) + 1;
  }
  return cards;
}

export function chooseAction(state, turnMemo) {
  if (state.winner !== null) return null;
  const me = state.currentPlayerIndex;
  const player = state.players[me];

  if (state.phase === 'setup') {
    if (state.setup.expecting === 'settlement') return firstLegal(state, range(VERTICES.length).map(v => ({ type: 'placeSettlement', player: me, vertex: v })));
    return firstLegal(state, range(EDGES.length).map(e => ({ type: 'placeRoad', player: me, edge: e })));
  }
  if (state.robber?.stage === 'discard') {
    const p = state.robber.pending[0];
    return { type: 'discard', player: p, cards: discardFor(state.players[p], state.robber.required[p]) };
  }
  if (state.robber?.stage === 'move') {
    const occupiedBy = h => HEX_TO_VERTICES[h].some(v => state.players.some((o, i) => i !== me && [...o.settlements, ...o.cities].some(b => b.intersectionIndex === v)));
    const hexes = range(19).filter(h => h !== state.robberHex);
    const hex = hexes.find(occupiedBy) ?? hexes[0];
    return { type: 'moveRobber', player: me, hex };
  }
  if (state.robber?.stage === 'steal') return { type: 'steal', player: me, victim: state.robber.candidates[0] };
  if (state.roadBuilding) {
    return firstLegal(state, range(EDGES.length).map(e => ({ type: 'placeRoad', player: me, edge: e })))
      ?? { type: 'skipRoadBuilding', player: me };
  }
  if (state.dice === null) {
    return firstLegal(state, [{ type: 'playKnight', player: me }]) ?? { type: 'roll' };
  }

  const owned = player.settlements.map(s => s.intersectionIndex);
  const build = firstLegal(state, [
    ...owned.map(v => ({ type: 'upgradeToCity', player: me, vertex: v })),
    ...range(VERTICES.length).map(v => ({ type: 'placeSettlement', player: me, vertex: v })),
    { type: 'buyDevCard', player: me },
    { type: 'playMonopoly', player: me, resource: 'ore' },
    { type: 'playYearOfPlenty', player: me, picks: ['ore', 'wheat'] },
    { type: 'playRoadBuilding', player: me },
    ...(player.roads.length < 13 ? range(EDGES.length).map(e => ({ type: 'placeRoad', player: me, edge: e })) : []),
  ]);
  if (build) return build;

  // One bank trade per turn: dump the biggest pile for the scarcest resource.
  if (!turnMemo.traded) {
    const give = RES.reduce((b, r) => (player.resources[r] > player.resources[b] ? r : b), RES[0]);
    const receive = RES.reduce((b, r) => (player.resources[r] < player.resources[b] ? r : b), RES[0]);
    const trade = firstLegal(state, [{ type: 'bankTrade', player: me, give, receive }]);
    turnMemo.traded = true;
    if (trade) return trade;
  }
  turnMemo.traded = false;
  return { type: 'endTurn' };
}

// Play a whole game from options; returns the game record { options, actions, state }.
export function playGame(options, maxActions = 4000) {
  let game = newGame(options);
  const memo = { traded: false };
  while (game.actions.length < maxActions) {
    const action = chooseAction(game.state, memo);
    if (!action) break;
    const next = applyAction(game, action);
    if (typeof next === 'string') throw new Error(`bot chose an illegal action ${JSON.stringify(action)}: ${next}`);
    game = next;
  }
  return game;
}
