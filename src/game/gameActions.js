import { VERTEX_TO_HEXES, VERTEX_ADJACENCY, EDGES } from './gameRules.js';

// Mirrors tile/number layout in HexBoard.jsx — kept in sync manually
const HEX_TILES = [
  'mountains', 'fields',  'forest',
  'fields',    'hills',   'pasture',  'mountains',
  'fields',    'forest',  'desert',   'forest',   'mountains',
  'hills',     'pasture', 'pasture',  'fields',
  'forest',    'hills',   'pasture',
];
const HEX_NUMBERS = [2, 3, 3, 4, 4, 5, 5, 6, 6, null, 8, 8, 9, 9, 10, 10, 11, 11, 12];
const TILE_TO_RESOURCE = {
  mountains: 'ore', fields: 'wheat', forest: 'wood',
  hills: 'brick', pasture: 'sheep', desert: null,
};

export function rollDice() {
  const die1 = Math.ceil(Math.random() * 6);
  const die2 = Math.ceil(Math.random() * 6);
  const total = die1 + die2;
  return { die1, die2, total, isRobber: total === 7 };
}

// Each settlement is at an intersectionIndex; check all adjacent hexes for production.
export function collectResources(gameState, diceTotal) {
  if (diceTotal === 7) return gameState;

  const bank = { ...gameState.bank };

  const players = gameState.players.map(player => {
    const resources = { ...player.resources };

    player.settlements.forEach(({ intersectionIndex }) => {
      VERTEX_TO_HEXES[intersectionIndex].forEach(hexIdx => {
        if (HEX_NUMBERS[hexIdx] !== diceTotal) return;
        const resource = TILE_TO_RESOURCE[HEX_TILES[hexIdx]];
        if (!resource) return;
        const isCity = player.cities.some(c => c.intersectionIndex === intersectionIndex);
        const amount = isCity ? 2 : 1;
        const payout = Math.min(amount, bank[resource]);
        if (payout <= 0) return;
        resources[resource] += payout;
        bank[resource] -= payout;
      });
    });

    return { ...player, resources };
  });

  return { ...gameState, players, bank };
}

function isOccupied(gameState, intersectionIndex) {
  return gameState.players.some(p =>
    p.settlements.some(s => s.intersectionIndex === intersectionIndex) ||
    p.cities.some(c => c.intersectionIndex === intersectionIndex)
  );
}

export function placeSettlement(gameState, playerIndex, intersectionIndex) {
  if (gameState.currentPlayerIndex !== playerIndex) return 'Not your turn';
  if (isOccupied(gameState, intersectionIndex)) return 'Intersection already occupied';
  if (VERTEX_ADJACENCY[intersectionIndex].some(adj => isOccupied(gameState, adj)))
    return 'Too close to another settlement';

  const isSetup = gameState.phase === 'setup';

  if (!isSetup) {
    const res = gameState.players[playerIndex].resources;
    if (res.brick < 1 || res.wood < 1 || res.wheat < 1 || res.sheep < 1)
      return 'Insufficient resources';
  }

  const players = gameState.players.map((p, idx) => {
    if (idx !== playerIndex) return p;
    const settlements = [...p.settlements, { intersectionIndex }];
    const resources = isSetup ? { ...p.resources } : {
      ...p.resources, brick: p.resources.brick - 1, wood: p.resources.wood - 1,
      wheat: p.resources.wheat - 1, sheep: p.resources.sheep - 1,
    };
    return { ...p, settlements, resources };
  });

  const bank = isSetup ? { ...gameState.bank } : {
    ...gameState.bank,
    brick: gameState.bank.brick + 1, wood: gameState.bank.wood + 1,
    wheat: gameState.bank.wheat + 1, sheep: gameState.bank.sheep + 1,
  };

  return { ...gameState, players, bank };
}

export function placeRoad(gameState, playerIndex, edgeIndex) {
  if (gameState.currentPlayerIndex !== playerIndex) return 'Not your turn';
  if (edgeIndex < 0 || edgeIndex >= EDGES.length) return 'Invalid edge';

  const edgeTaken = gameState.players.some(p => p.roads.some(r => r.edgeIndex === edgeIndex));
  if (edgeTaken) return 'Edge already has a road';

  const player = gameState.players[playerIndex];
  const [v1, v2] = EDGES[edgeIndex];

  const network = new Set([
    ...player.settlements.map(s => s.intersectionIndex),
    ...player.cities.map(c => c.intersectionIndex),
    ...player.roads.flatMap(r => EDGES[r.edgeIndex]),
  ]);
  if (!network.has(v1) && !network.has(v2)) return 'Road must connect to your existing network';

  const isSetup = gameState.phase === 'setup';

  if (!isSetup && (player.resources.brick < 1 || player.resources.wood < 1))
    return 'Insufficient resources';

  const players = gameState.players.map((p, idx) => {
    if (idx !== playerIndex) return p;
    const roads = [...p.roads, { edgeIndex }];
    const resources = isSetup ? { ...p.resources } : {
      ...p.resources, brick: p.resources.brick - 1, wood: p.resources.wood - 1,
    };
    return { ...p, roads, resources };
  });

  const bank = isSetup ? { ...gameState.bank } : {
    ...gameState.bank, brick: gameState.bank.brick + 1, wood: gameState.bank.wood + 1,
  };

  return { ...gameState, players, bank };
}
