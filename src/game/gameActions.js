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

    const buildings = [
      ...player.settlements.map(s => ({ intersectionIndex: s.intersectionIndex, amount: 1 })),
      ...player.cities.map(c => ({ intersectionIndex: c.intersectionIndex, amount: 2 })),
    ];
    buildings.forEach(({ intersectionIndex, amount }) => {
      VERTEX_TO_HEXES[intersectionIndex].forEach(hexIdx => {
        if (HEX_NUMBERS[hexIdx] !== diceTotal) return;
        const resource = TILE_TO_RESOURCE[HEX_TILES[hexIdx]];
        if (!resource) return;
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

// Snake order 1,2,3,4,4,3,2,1 — maps setup turnIndex (0–7) to a player index
function setupPlayerFor(turnIndex) {
  return turnIndex < 4 ? turnIndex : 7 - turnIndex;
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
  let isSecondSetupSettlement = false;

  if (isSetup) {
    const setup = gameState.setup;
    if (setup.expecting !== 'settlement') return 'Place a road to finish your setup turn';
    if (setup.settlementsPlaced[playerIndex] >= 2) return 'You have placed both setup settlements';
    isSecondSetupSettlement = setup.settlementsPlaced[playerIndex] === 1;
  } else {
    const res = gameState.players[playerIndex].resources;
    if (res.brick < 1 || res.wood < 1 || res.wheat < 1 || res.sheep < 1)
      return 'Insufficient resources';
  }

  const bank = { ...gameState.bank };

  const players = gameState.players.map((p, idx) => {
    if (idx !== playerIndex) return p;
    const settlements = [...p.settlements, { intersectionIndex }];
    const resources = { ...p.resources };
    if (isSetup) {
      // Second setup settlement grants one resource per adjacent producing hex
      if (isSecondSetupSettlement) {
        VERTEX_TO_HEXES[intersectionIndex].forEach(hexIdx => {
          const resource = TILE_TO_RESOURCE[HEX_TILES[hexIdx]];
          if (!resource || bank[resource] < 1) return;
          resources[resource] += 1;
          bank[resource] -= 1;
        });
      }
    } else {
      resources.brick -= 1; resources.wood -= 1;
      resources.wheat -= 1; resources.sheep -= 1;
      bank.brick += 1; bank.wood += 1; bank.wheat += 1; bank.sheep += 1;
    }
    return { ...p, settlements, resources };
  });

  const setup = isSetup ? {
    ...gameState.setup,
    settlementsPlaced: gameState.setup.settlementsPlaced.map((n, idx) => idx === playerIndex ? n + 1 : n),
    expecting: 'road',
    lastSettlementIndex: intersectionIndex,
  } : gameState.setup;

  return { ...gameState, players, bank, setup };
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

  if (isSetup) {
    const setup = gameState.setup;
    if (setup.expecting !== 'road') return 'Place a settlement first';
    if (setup.roadsPlaced[playerIndex] >= 2) return 'You have placed both setup roads';
    if (v1 !== setup.lastSettlementIndex && v2 !== setup.lastSettlementIndex)
      return 'Road must connect to the settlement you just placed';
  } else if (player.resources.brick < 1 || player.resources.wood < 1) {
    return 'Insufficient resources';
  }

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

  if (!isSetup) return { ...gameState, players, bank };

  // Setup turn complete — advance the snake order or transition to play
  const roadsPlaced = gameState.setup.roadsPlaced.map((n, idx) => idx === playerIndex ? n + 1 : n);
  const turnIndex = gameState.setup.turnIndex + 1;

  if (turnIndex === 8) {
    return {
      ...gameState, players, bank,
      phase: 'play',
      currentPlayerIndex: 0,
      setup: null,
    };
  }

  return {
    ...gameState, players, bank,
    currentPlayerIndex: setupPlayerFor(turnIndex),
    setup: {
      ...gameState.setup,
      roadsPlaced,
      turnIndex,
      expecting: 'settlement',
      lastSettlementIndex: null,
    },
  };
}

export function upgradeToCity(gameState, playerIndex, intersectionIndex) {
  if (gameState.currentPlayerIndex !== playerIndex) return 'Not your turn';
  if (gameState.phase === 'setup') return 'Cannot build cities during setup';

  const player = gameState.players[playerIndex];
  if (!player.settlements.some(s => s.intersectionIndex === intersectionIndex))
    return 'You need a settlement here to build a city';

  if (player.resources.wheat < 2 || player.resources.ore < 3)
    return 'Insufficient resources';

  const players = gameState.players.map((p, idx) => {
    if (idx !== playerIndex) return p;
    return {
      ...p,
      settlements: p.settlements.filter(s => s.intersectionIndex !== intersectionIndex),
      cities: [...p.cities, { intersectionIndex }],
      resources: { ...p.resources, wheat: p.resources.wheat - 2, ore: p.resources.ore - 3 },
    };
  });

  const bank = { ...gameState.bank, wheat: gameState.bank.wheat + 2, ore: gameState.bank.ore + 3 };

  return { ...gameState, players, bank };
}
