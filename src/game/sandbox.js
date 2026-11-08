// Sandbox / position setup. Each edit ignores costs and placement rules and is
// dispatched as a recorded { type: 'sandbox', edit } action, so replays include
// it. The final { op: 'resume' } edit turns the result back into a normal
// play-phase position.
import { EDGES, VERTICES } from './gameRules.js';
import { recomputeAwards } from './gameActions.js';

const RES = ['brick', 'wood', 'ore', 'wheat', 'sheep'];
const DEV_TYPES = ['knight', 'victoryPoint', 'roadBuilding', 'yearOfPlenty', 'monopoly'];
const BANK_SIZE = 19;
// `dice` stands for "has rolled this turn"; a sandbox-set roll has no values.
export const SANDBOX_ROLLED = { die1: null, die2: null, total: null, isRobber: false };

const isIndex = (n, length) => Number.isInteger(n) && n >= 0 && n < length;
const isCount = n => Number.isInteger(n) && n >= 0 && n <= 99;

function mapPlayer(state, index, fn) {
  return { ...state, players: state.players.map((p, i) => (i === index ? fn(p) : p)) };
}

function setBuilding(state, { vertex, player, kind }) {
  if (!isIndex(vertex, VERTICES.length)) return 'Invalid intersection';
  if (kind !== null && (!isIndex(player, state.players.length) || !['settlement', 'city'].includes(kind))) return 'Invalid building';
  const players = state.players.map((p, i) => {
    const settlements = p.settlements.filter(b => b.intersectionIndex !== vertex);
    const cities = p.cities.filter(b => b.intersectionIndex !== vertex);
    if (i === player && kind === 'settlement') settlements.push({ intersectionIndex: vertex });
    if (i === player && kind === 'city') cities.push({ intersectionIndex: vertex });
    return { ...p, settlements, cities };
  });
  return { ...state, players };
}

function setRoad(state, { edge, player }) {
  if (!isIndex(edge, EDGES.length)) return 'Invalid edge';
  if (player !== null && !isIndex(player, state.players.length)) return 'Invalid player';
  const players = state.players.map((p, i) => {
    const roads = p.roads.filter(r => r.edgeIndex !== edge);
    if (i === player) roads.push({ edgeIndex: edge });
    return { ...p, roads };
  });
  return { ...state, players };
}

function setHand(state, { player, resources }) {
  if (!isIndex(player, state.players.length)) return 'Invalid player';
  if (!resources || !RES.every(r => isCount(resources[r]))) return 'Hand counts must be whole numbers 0–99';
  return mapPlayer(state, player, p => ({ ...p, resources: Object.fromEntries(RES.map(r => [r, resources[r]])) }));
}

// Cards added come out of the draw pile when it has one of that type; cards
// removed go to the bottom of the pile (the draw end is the top).
function setDevCards(state, { player, counts }) {
  if (!isIndex(player, state.players.length)) return 'Invalid player';
  if (!counts || !DEV_TYPES.every(t => isCount(counts[t] ?? 0))) return 'Dev card counts must be whole numbers';
  let deck = [...state.devCardDeck];
  const hand = [];
  for (const t of DEV_TYPES) {
    const have = state.players[player].devCards.filter(c => c.type === t).length;
    const want = counts[t] ?? 0;
    for (let k = have; k < want; k++) {
      const at = deck.indexOf(t);
      if (at >= 0) deck.splice(at, 1);
    }
    for (let k = want; k < have; k++) deck.unshift(t);
    for (let k = 0; k < want; k++) hand.push({ type: t, newlyBought: false });
  }
  return mapPlayer({ ...state, devCardDeck: deck }, player, p => ({ ...p, devCards: hand }));
}

function setKnights(state, { player, count }) {
  if (!isIndex(player, state.players.length) || !isCount(count)) return 'Invalid knight count';
  return mapPlayer(state, player, p => ({ ...p, knightsPlayed: count }));
}

function setRobber(state, { hex }) {
  if (!isIndex(hex, 19)) return 'Invalid hex';
  return { ...state, robberHex: hex };
}

function setTurn(state, { player, rolled }) {
  if (!isIndex(player, state.players.length)) return 'Invalid player';
  return {
    ...state,
    currentPlayerIndex: player,
    dice: rolled ? (state.dice ?? SANDBOX_ROLLED) : null,
    devCardPlayedThisTurn: false,
  };
}

// Back to normal rules: play phase, nothing pending, the bank holds whatever
// the hands do not, and awards / VP / winner reflect the edited position.
function resume(state) {
  const bank = Object.fromEntries(RES.map(r =>
    [r, Math.max(0, BANK_SIZE - state.players.reduce((sum, p) => sum + p.resources[r], 0))]));
  const s = recomputeAwards({
    ...state, phase: 'play', setup: null, robber: null, roadBuilding: null, tradeOffer: null, bank,
  });
  const p = s.players[s.currentPlayerIndex];
  return {
    ...s,
    log: [...s.log, { id: s.log.length, playerIndex: null, text: `Position edited in sandbox — ${p.name} to ${s.dice ? 'act' : 'roll'}` }],
  };
}

const OPS = { setBuilding, setRoad, setHand, setDevCards, setKnights, setRobber, setTurn, resume };

export function sandboxEdit(state, edit) {
  const op = edit && OPS[edit.op];
  if (!op) return `Unknown sandbox edit: ${edit && edit.op}`;
  return op(state, edit);
}
