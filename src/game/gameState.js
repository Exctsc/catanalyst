// Desert hex is at index 9 in the 3-4-5-4-3 TILES layout
const DESERT_HEX_INDEX = 9;

function buildDevCardDeck() {
  const deck = [
    ...Array(14).fill('knight'),
    ...Array(5).fill('victoryPoint'),
    ...Array(2).fill('roadBuilding'),
    ...Array(2).fill('yearOfPlenty'),
    ...Array(2).fill('monopoly'),
  ];
  // Fisher-Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

const initialGameState = {
  players: [
    { id: 0, name: 'Player 1', colour: '#E74C3C', resources: { brick: 0, wood: 0, ore: 0, wheat: 0, sheep: 0 }, settlements: [], roads: [], cities: [], devCards: [], victoryPoints: 0 },
    { id: 1, name: 'Player 2', colour: '#3498DB', resources: { brick: 0, wood: 0, ore: 0, wheat: 0, sheep: 0 }, settlements: [], roads: [], cities: [], devCards: [], victoryPoints: 0 },
    { id: 2, name: 'Player 3', colour: '#2ECC71', resources: { brick: 0, wood: 0, ore: 0, wheat: 0, sheep: 0 }, settlements: [], roads: [], cities: [], devCards: [], victoryPoints: 0 },
    { id: 3, name: 'Player 4', colour: '#F39C12', resources: { brick: 0, wood: 0, ore: 0, wheat: 0, sheep: 0 }, settlements: [], roads: [], cities: [], devCards: [], victoryPoints: 0 },
  ],
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
  robberHex: DESERT_HEX_INDEX,
  // Non-null while a rolled 7 is being resolved:
  //   { stage: 'discard', pending: [playerIndexes], required: { playerIndex: count } }
  //   { stage: 'move' }
  //   { stage: 'steal', candidates: [playerIndexes] }
  robber: null,
  bank: { brick: 19, wood: 19, ore: 19, wheat: 19, sheep: 19 },
  devCardDeck: buildDevCardDeck(),
  longestRoad: null,
  largestArmy: null,
  winner: null,
  turn: 1,
};

export default initialGameState;
