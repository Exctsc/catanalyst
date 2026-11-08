import { DEFAULT_BOARD } from './gameRules.js';
import { createRng, shuffle } from './rng.js';

const DEV_DECK = [
  ...Array(14).fill('knight'),
  ...Array(5).fill('victoryPoint'),
  ...Array(2).fill('roadBuilding'),
  ...Array(2).fill('yearOfPlenty'),
  ...Array(2).fill('monopoly'),
];

const COLOURS = ['#E74C3C', '#3498DB', '#2ECC71', '#F39C12'];

// A new game is a pure function of its options, so a saved game only needs
// these options plus its action list to be rebuilt exactly.
export function createGame({ seed = 1, board = DEFAULT_BOARD } = {}) {
  const [devCardDeck, rng] = shuffle(createRng(seed), DEV_DECK);
  return {
    players: COLOURS.map((colour, id) => ({
      id, name: `Player ${id + 1}`, colour,
      resources: { brick: 0, wood: 0, ore: 0, wheat: 0, sheep: 0 },
      settlements: [], roads: [], cities: [], devCards: [], knightsPlayed: 0, victoryPoints: 0,
    })),
    currentPlayerIndex: 0,
    phase: 'setup',
    // Snake-order setup: turnIndex 0–7 maps to players 1,2,3,4,4,3,2,1.
    // Each setup turn is one settlement then one connected road.
    setup: {
      turnIndex: 0,
      settlementsPlaced: [0, 0, 0, 0],
      roadsPlaced: [0, 0, 0, 0],
      expecting: 'settlement',
      lastSettlementIndex: null,
    },
    dice: null,
    // Board layout for this game: tiles (terrain per hex), numbers (token per
    // hex, null on the desert) and ports ({ type, vertices, x, y } per slot).
    board,
    // On the desert; a free-mode board without one starts with the robber off-board.
    robberHex: board.tiles.includes('desert') ? board.tiles.indexOf('desert') : null,
    // Non-null while a rolled 7 is being resolved:
    //   { stage: 'discard', pending: [playerIndexes], required: { playerIndex: count } }
    //   { stage: 'move' }
    //   { stage: 'steal', candidates: [playerIndexes] }
    robber: null,
    bank: { brick: 19, wood: 19, ore: 19, wheat: 19, sheep: 19 },
    // Draw pile (shuffled from the seed). Players' devCards hold { type, newlyBought }
    // objects; newlyBought blocks playing a card the same turn it was bought.
    devCardDeck,
    // Seeded generator for every random event (dice, steals); see rng.js.
    rng,
    // At most one dev card may be *played* per turn; reset by endTurn.
    devCardPlayedThisTurn: false,
    // Non-null while resolving a played Road Building card: { remaining: 1|2 }.
    roadBuilding: null,
    // Pending player-to-player offer: { from, to, give: {res: n}, get: {res: n} }.
    tradeOffer: null,
    // Holder player index (or null). longestRoad needs a 5+ chain, largestArmy 3+ knights.
    longestRoad: null,
    largestArmy: null,
    winner: null,
    turn: 1,
    // Append-only event log: { id, playerIndex (null = system), text }
    log: [{ id: 0, playerIndex: null, text: 'Setup phase — Player 1, place a settlement' }],
  };
}

// A fixed-seed game for tests and as a harmless default.
const initialGameState = createGame();
export default initialGameState;
