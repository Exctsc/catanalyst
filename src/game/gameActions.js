import { VERTEX_TO_HEXES, VERTEX_ADJACENCY, EDGES, HEX_TO_VERTICES, TILE_TO_RESOURCE } from './gameRules.js';

const RESOURCE_TYPES = ['brick', 'wood', 'ore', 'wheat', 'sheep'];

// Pieces each player owns. Upgrading to a city returns the settlement piece,
// which falls out naturally: the settlement leaves player.settlements.
export const PIECE_LIMITS = { settlements: 5, cities: 4, roads: 15 };

function isValidPlayer(gameState, playerIndex) {
  return Number.isInteger(playerIndex) && playerIndex >= 0 && playerIndex < gameState.players.length;
}

// Single shared log helper — every action appends human-readable entries
// through this; playerIndex colours the entry in the UI (null = system line).
function log(gameState, playerIndex, text) {
  return { ...gameState, log: [...gameState.log, { id: gameState.log.length, playerIndex, text }] };
}

export function rollDice() {
  const die1 = Math.ceil(Math.random() * 6);
  const die2 = Math.ceil(Math.random() * 6);
  const total = die1 + die2;
  return { die1, die2, total, isRobber: total === 7 };
}

// The whole roll as one state transition (so App's functional update stays
// atomic against rapid clicks): roll, log, then collect or start the robber.
export function performRoll(gameState) {
  if (gameState.phase !== 'play' || gameState.dice !== null || gameState.winner !== null) return gameState;
  const result = rollDice();
  const player = gameState.players[gameState.currentPlayerIndex];
  let s = log({ ...gameState, dice: result }, gameState.currentPlayerIndex,
    `${player.name} rolled ${result.die1} + ${result.die2} = ${result.total}`);
  if (result.isRobber) return startRobber(s);
  return collectResources(s, result.total);
}

export function endTurn(gameState) {
  if (gameState.phase !== 'play' || gameState.robber !== null || gameState.winner !== null) return gameState;
  // Must roll before the turn can end.
  if (gameState.dice === null) return gameState;
  const cur = gameState.currentPlayerIndex;
  const next = (cur + 1) % gameState.players.length;
  // Cards bought this turn become playable next turn; clear the per-turn flags.
  const players = gameState.players.map((p, i) =>
    i === cur ? { ...p, devCards: p.devCards.map(c => ({ ...c, newlyBought: false })) } : p
  );
  // `turn` counts rounds: it advances when play wraps back to the first player.
  const turn = next === 0 ? gameState.turn + 1 : gameState.turn;
  return log({
    ...gameState, players, currentPlayerIndex: next, dice: null, turn,
    devCardPlayedThisTurn: false, roadBuilding: null, tradeOffer: null,
  }, next, next === 0 ? `Turn ${turn} — ${gameState.players[next].name}'s turn` : `${gameState.players[next].name}'s turn`);
}

// Each settlement is at an intersectionIndex; check all adjacent hexes for production.
export function collectResources(gameState, diceTotal) {
  if (diceTotal === 7) return gameState;

  const bank = { ...gameState.bank };
  const gains = [];

  const players = gameState.players.map((player, playerIdx) => {
    const resources = { ...player.resources };
    const gained = {};

    const buildings = [
      ...player.settlements.map(s => ({ intersectionIndex: s.intersectionIndex, amount: 1 })),
      ...player.cities.map(c => ({ intersectionIndex: c.intersectionIndex, amount: 2 })),
    ];
    buildings.forEach(({ intersectionIndex, amount }) => {
      VERTEX_TO_HEXES[intersectionIndex].forEach(hexIdx => {
        if (hexIdx === gameState.robberHex) return;
        if (gameState.board.numbers[hexIdx] !== diceTotal) return;
        const resource = TILE_TO_RESOURCE[gameState.board.tiles[hexIdx]];
        if (!resource) return;
        const payout = Math.min(amount, bank[resource]);
        if (payout <= 0) return;
        resources[resource] += payout;
        bank[resource] -= payout;
        gained[resource] = (gained[resource] || 0) + payout;
      });
    });

    if (Object.keys(gained).length) gains.push({ playerIdx, gained });
    return { ...player, resources };
  });

  let s = { ...gameState, players, bank };
  gains.forEach(({ playerIdx, gained }) => {
    const detail = Object.entries(gained).map(([r, n]) => `${n} ${r}`).join(', ');
    s = log(s, playerIdx, `${gameState.players[playerIdx].name} collected ${detail}`);
  });
  return s;
}

// Snake order 1,2,3,4,4,3,2,1 — maps setup turnIndex (0–7) to a player index
function setupPlayerFor(turnIndex) {
  return turnIndex < 4 ? turnIndex : 7 - turnIndex;
}

// Public victory points shown in shared UI: 1/settlement, 2/city, +2 for each
// award held. Deliberately EXCLUDES hidden Victory Point dev cards.
function publicVP(gameState, playerIndex) {
  const p = gameState.players[playerIndex];
  let vp = p.settlements.length + 2 * p.cities.length;
  if (gameState.largestArmy === playerIndex) vp += 2;
  if (gameState.longestRoad === playerIndex) vp += 2;
  return vp;
}

function vpCardCount(player) {
  return player.devCards.filter(c => c.type === 'victoryPoint').length;
}

// Recompute every player's public VP, then declare a winner at 10 — where the
// win check counts hidden VP cards on top of the public total. The acting
// player wins ties (only one player's total changes per action anyway).
function recomputeVictory(gameState, actingPlayerIndex) {
  const players = gameState.players.map((p, i) => ({ ...p, victoryPoints: publicVP(gameState, i) }));
  let s = { ...gameState, players };
  if (gameState.winner !== null) return s;

  const order = actingPlayerIndex == null
    ? players.map((_, i) => i)
    : [actingPlayerIndex, ...players.map((_, i) => i).filter(i => i !== actingPlayerIndex)];
  let winner = null;
  for (const i of order) {
    if (players[i].victoryPoints + vpCardCount(players[i]) >= 10) { winner = i; break; }
  }
  if (winner !== null) s = log({ ...s, winner }, winner, `🏆 ${players[winner].name} wins with 10 victory points!`);
  return s;
}

// Largest Army: 3+ knights and strictly more than the current holder. Ties keep
// it with the holder. Returns the new holder index (or null / unchanged).
function recomputeLargestArmy(gameState) {
  const counts = gameState.players.map(p => p.knightsPlayed || 0);
  const holder = gameState.largestArmy;
  if (holder !== null) {
    let maxOther = -1, maxOtherCount = -1;
    counts.forEach((c, i) => { if (i !== holder && c > maxOtherCount) { maxOtherCount = c; maxOther = i; } });
    return maxOtherCount > counts[holder] ? maxOther : holder;
  }
  // No holder yet: award to the unique leader with >= 3 knights.
  let best = -1, bestCount = 2, tie = false;
  counts.forEach((c, i) => {
    if (c > bestCount) { best = i; bestCount = c; tie = false; }
    else if (c === bestCount && bestCount >= 3) tie = true;
  });
  return best >= 0 && !tie ? best : null;
}

// Longest continuous road for one player: the longest trail (no repeated road
// segment) over their roads, where a trail cannot pass THROUGH a vertex holding
// an opponent's settlement/city (but may end there). Own buildings never block.
export function longestRoadLength(gameState, playerIndex) {
  const roadEdges = gameState.players[playerIndex].roads.map(r => r.edgeIndex);
  if (roadEdges.length === 0) return 0;

  const blocked = new Set();
  gameState.players.forEach((p, i) => {
    if (i === playerIndex) return;
    p.settlements.forEach(s => blocked.add(s.intersectionIndex));
    p.cities.forEach(c => blocked.add(c.intersectionIndex));
  });

  const vertexEdges = new Map();
  roadEdges.forEach(ei => {
    const [a, b] = EDGES[ei];
    if (!vertexEdges.has(a)) vertexEdges.set(a, []);
    if (!vertexEdges.has(b)) vertexEdges.set(b, []);
    vertexEdges.get(a).push(ei);
    vertexEdges.get(b).push(ei);
  });

  // Longest chain continuing outward from `vertex`, not reusing edges in `used`.
  function extend(vertex, used) {
    if (blocked.has(vertex)) return 0;
    let best = 0;
    for (const f of vertexEdges.get(vertex) || []) {
      if (used.has(f)) continue;
      const [x, y] = EDGES[f];
      used.add(f);
      const len = 1 + extend(x === vertex ? y : x, used);
      used.delete(f);
      if (len > best) best = len;
    }
    return best;
  }

  let max = 0;
  for (const ei of roadEdges) {
    const [a, b] = EDGES[ei];
    max = Math.max(max, 1 + extend(b, new Set([ei])), 1 + extend(a, new Set([ei])));
  }
  return max;
}

// Longest Road: a 5+ chain, strictly longer than the current holder. Ties keep
// it with the holder; the holder also loses it if their chain drops below 5.
function recomputeLongestRoad(gameState) {
  const lengths = gameState.players.map((_, i) => longestRoadLength(gameState, i));
  const holder = gameState.longestRoad;
  if (holder !== null && lengths[holder] >= 5) {
    let maxOther = -1, maxOtherLen = -1;
    lengths.forEach((l, i) => { if (i !== holder && l > maxOtherLen) { maxOtherLen = l; maxOther = i; } });
    return maxOtherLen > lengths[holder] ? maxOther : holder;
  }
  let best = -1, bestLen = 4, tie = false;
  lengths.forEach((l, i) => {
    if (l > bestLen) { best = i; bestLen = l; tie = false; }
    else if (l === bestLen && bestLen >= 5) tie = true;
  });
  return best >= 0 && !tie ? best : null;
}

// Recompute Longest Road (which a new road OR a road-breaking settlement can
// change), log any handover, then recompute VP + win. Used after every build.
function finalizeBuild(gameState, playerIndex) {
  const longestRoad = recomputeLongestRoad(gameState);
  let s = gameState;
  if (longestRoad !== s.longestRoad) {
    s = { ...s, longestRoad };
    if (longestRoad === null) s = log(s, null, 'Longest Road is now unclaimed');
    else s = log(s, longestRoad, `${s.players[longestRoad].name} takes Longest Road (2 VP)`);
  }
  return recomputeVictory(s, playerIndex);
}

function isOccupied(gameState, intersectionIndex) {
  return gameState.players.some(p =>
    p.settlements.some(s => s.intersectionIndex === intersectionIndex) ||
    p.cities.some(c => c.intersectionIndex === intersectionIndex)
  );
}

export function placeSettlement(gameState, playerIndex, intersectionIndex) {
  if (!isValidPlayer(gameState, playerIndex)) return 'Invalid player';
  if (!(intersectionIndex >= 0 && intersectionIndex < VERTEX_ADJACENCY.length)) return 'Invalid intersection';
  if (gameState.winner !== null) return 'Game is over';
  if (gameState.currentPlayerIndex !== playerIndex) return 'Not your turn';
  if (gameState.robber) return 'Resolve the robber first';
  // In play phase, no manual building before the dice are rolled.
  if (gameState.phase === 'play' && gameState.dice === null) return 'Roll the dice first';
  if (gameState.players[playerIndex].settlements.length >= PIECE_LIMITS.settlements)
    return `No settlements left (${PIECE_LIMITS.settlements} max) — upgrade one to a city`;
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
    const touchesOwnRoad = gameState.players[playerIndex].roads.some(r => EDGES[r.edgeIndex].includes(intersectionIndex));
    if (!touchesOwnRoad) return 'Settlement must connect to one of your roads';
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
          const resource = TILE_TO_RESOURCE[gameState.board.tiles[hexIdx]];
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

  const playerName = gameState.players[playerIndex].name;
  let s = log({ ...gameState, players, bank, setup }, playerIndex, `${playerName} built a settlement`);
  if (isSecondSetupSettlement) {
    const granted = players[playerIndex].resources;
    const detail = RESOURCE_TYPES.filter(r => granted[r] > gameState.players[playerIndex].resources[r])
      .map(r => `${granted[r] - gameState.players[playerIndex].resources[r]} ${r}`).join(', ');
    if (detail) s = log(s, playerIndex, `${playerName} received starting resources: ${detail}`);
  }
  // A settlement on a previously-empty vertex can sever an opponent's road chain.
  return finalizeBuild(s, playerIndex);
}

export function placeRoad(gameState, playerIndex, edgeIndex) {
  if (!isValidPlayer(gameState, playerIndex)) return 'Invalid player';
  if (gameState.winner !== null) return 'Game is over';
  if (gameState.currentPlayerIndex !== playerIndex) return 'Not your turn';
  if (gameState.robber) return 'Resolve the robber first';
  // No manual road-building before rolling — but Road Building's free roads
  // (a dev-card consequence) are allowed since they run while roadBuilding is set.
  if (gameState.phase === 'play' && gameState.dice === null && !gameState.roadBuilding)
    return 'Roll the dice first';
  if (edgeIndex < 0 || edgeIndex >= EDGES.length) return 'Invalid edge';

  if (gameState.players[playerIndex].roads.length >= PIECE_LIMITS.roads)
    return `No roads left (${PIECE_LIMITS.roads} max)`;
  const edgeTaken = gameState.players.some(p => p.roads.some(r => r.edgeIndex === edgeIndex));
  if (edgeTaken) return 'Edge already has a road';

  const player = gameState.players[playerIndex];
  const [v1, v2] = EDGES[edgeIndex];
  if (!touchesNetwork(gameState, playerIndex, edgeIndex)) return 'Road must connect to your existing network';

  const isSetup = gameState.phase === 'setup';
  // A played Road Building card grants free roads; otherwise pay 1 brick + 1 wood.
  const isFreeRoad = !isSetup && gameState.roadBuilding && gameState.roadBuilding.remaining > 0;

  if (isSetup) {
    const setup = gameState.setup;
    if (setup.expecting !== 'road') return 'Place a settlement first';
    if (setup.roadsPlaced[playerIndex] >= 2) return 'You have placed both setup roads';
    if (v1 !== setup.lastSettlementIndex && v2 !== setup.lastSettlementIndex)
      return 'Road must connect to the settlement you just placed';
  } else if (!isFreeRoad && (player.resources.brick < 1 || player.resources.wood < 1)) {
    return 'Insufficient resources';
  }

  const chargesCost = !isSetup && !isFreeRoad;
  const players = gameState.players.map((p, idx) => {
    if (idx !== playerIndex) return p;
    const roads = [...p.roads, { edgeIndex }];
    const resources = chargesCost
      ? { ...p.resources, brick: p.resources.brick - 1, wood: p.resources.wood - 1 }
      : { ...p.resources };
    return { ...p, roads, resources };
  });

  const bank = chargesCost
    ? { ...gameState.bank, brick: gameState.bank.brick + 1, wood: gameState.bank.wood + 1 }
    : { ...gameState.bank };

  const playerName = gameState.players[playerIndex].name;
  let s = log({ ...gameState, players, bank }, playerIndex,
    isFreeRoad ? `${playerName} built a free road` : `${playerName} built a road`);

  if (isSetup) {
    // Setup turn complete — advance the snake order or transition to play
    const roadsPlaced = gameState.setup.roadsPlaced.map((n, idx) => idx === playerIndex ? n + 1 : n);
    const turnIndex = gameState.setup.turnIndex + 1;
    if (turnIndex === 8) {
      s = log({ ...s, phase: 'play', currentPlayerIndex: 0, setup: null },
        null, `Setup complete — ${gameState.players[0].name} begins the game`);
    } else {
      const nextPlayer = setupPlayerFor(turnIndex);
      s = log({
        ...s,
        currentPlayerIndex: nextPlayer,
        setup: { ...gameState.setup, roadsPlaced, turnIndex, expecting: 'settlement', lastSettlementIndex: null },
      }, nextPlayer, `${gameState.players[nextPlayer].name}'s turn to place`);
    }
  } else if (isFreeRoad) {
    // Consume one free road; end road-building when spent or no legal spot remains.
    const remaining = gameState.roadBuilding.remaining - 1;
    const more = remaining > 0 && hasLegalRoad(s, playerIndex);
    s = { ...s, roadBuilding: more ? { remaining } : null };
    if (!more && remaining > 0) s = log(s, playerIndex, `${playerName} has no more legal free roads`);
  }

  // Recompute Longest Road + VP after every road placement.
  return finalizeBuild(s, playerIndex);
}

// Owner of the building at a vertex, or null.
function buildingOwner(gameState, vertex) {
  const i = gameState.players.findIndex(p =>
    p.settlements.some(s => s.intersectionIndex === vertex) || p.cities.some(c => c.intersectionIndex === vertex));
  return i === -1 ? null : i;
}

// An edge connects if either endpoint holds the player's own building, or is
// the end of one of their roads and not occupied by an opponent's building
// (an opponent's settlement or city blocks extension through that vertex).
function touchesNetwork(gameState, playerIndex, edgeIndex) {
  const roadEnds = new Set(gameState.players[playerIndex].roads.flatMap(r => EDGES[r.edgeIndex]));
  return EDGES[edgeIndex].some(v => {
    const owner = buildingOwner(gameState, v);
    if (owner === playerIndex) return true;
    return owner === null && roadEnds.has(v);
  });
}

// A road is legal if the edge is free and touches the player's network.
function isLegalRoad(gameState, playerIndex, edgeIndex) {
  if (gameState.players.some(p => p.roads.some(r => r.edgeIndex === edgeIndex))) return false;
  return touchesNetwork(gameState, playerIndex, edgeIndex);
}

function hasLegalRoad(gameState, playerIndex) {
  if (gameState.players[playerIndex].roads.length >= PIECE_LIMITS.roads) return false;
  for (let ei = 0; ei < EDGES.length; ei++) if (isLegalRoad(gameState, playerIndex, ei)) return true;
  return false;
}

export function upgradeToCity(gameState, playerIndex, intersectionIndex) {
  if (!isValidPlayer(gameState, playerIndex)) return 'Invalid player';
  if (!(intersectionIndex >= 0 && intersectionIndex < VERTEX_ADJACENCY.length)) return 'Invalid intersection';
  if (gameState.winner !== null) return 'Game is over';
  if (gameState.currentPlayerIndex !== playerIndex) return 'Not your turn';
  if (gameState.robber) return 'Resolve the robber first';
  if (gameState.phase === 'setup') return 'Cannot build cities during setup';
  if (gameState.dice === null) return 'Roll the dice first';

  const player = gameState.players[playerIndex];
  if (!player.settlements.some(s => s.intersectionIndex === intersectionIndex))
    return 'You need a settlement here to build a city';
  if (player.cities.length >= PIECE_LIMITS.cities) return `No cities left (${PIECE_LIMITS.cities} max)`;

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

  const s = log({ ...gameState, players, bank }, playerIndex,
    `${gameState.players[playerIndex].name} upgraded a settlement to a city`);
  return finalizeBuild(s, playerIndex);
}

// Best bank-trade rate for giving away `resource`: 2 with the matching 2:1
// port, else 3 with any generic 3:1 port, else the default 4:1. A port is held
// if the player has a settlement or city on either of its two coastal vertices.
export function portRate(gameState, playerIndex, resource) {
  const player = gameState.players[playerIndex];
  const owned = new Set([
    ...player.settlements.map(s => s.intersectionIndex),
    ...player.cities.map(c => c.intersectionIndex),
  ]);
  let hasGeneric = false;
  for (const port of gameState.board.ports) {
    if (!port.vertices.some(v => owned.has(v))) continue;
    if (port.type === resource) return 2;
    if (port.type === 'generic') hasGeneric = true;
  }
  return hasGeneric ? 3 : 4;
}

export function bankTrade(gameState, playerIndex, give, receive) {
  if (!isValidPlayer(gameState, playerIndex)) return 'Invalid player';
  if (gameState.winner !== null) return 'Game is over';
  if (gameState.currentPlayerIndex !== playerIndex) return 'Not your turn';
  if (gameState.robber) return 'Resolve the robber first';
  if (gameState.phase === 'setup') return 'Cannot trade during setup';
  if (gameState.dice === null) return 'Roll the dice first';
  if (!RESOURCE_TYPES.includes(give) || !RESOURCE_TYPES.includes(receive)) return 'Unknown resource';
  if (give === receive) return 'Pick two different resources';

  const rate = portRate(gameState, playerIndex, give);
  if (gameState.players[playerIndex].resources[give] < rate) return `You need ${rate} ${give} to trade`;
  if (gameState.bank[receive] < 1) return `Bank is out of ${receive}`;

  const players = gameState.players.map((p, idx) => {
    if (idx !== playerIndex) return p;
    return {
      ...p,
      resources: { ...p.resources, [give]: p.resources[give] - rate, [receive]: p.resources[receive] + 1 },
    };
  });

  const bank = {
    ...gameState.bank,
    [give]: gameState.bank[give] + rate,
    [receive]: gameState.bank[receive] - 1,
  };

  return log({ ...gameState, players, bank }, playerIndex,
    `${gameState.players[playerIndex].name} traded ${rate} ${give} for 1 ${receive} with the bank`);
}

// ---------------------------------------------------------------------------
// Player-to-player trading (hotseat): the current player offers cards to one
// opponent, who accepts or declines on the same screen.
// ---------------------------------------------------------------------------

// Normalise { resource: count } to positive integer counts; error string if malformed.
function cleanBundle(bundle) {
  if (!bundle || typeof bundle !== 'object') return 'Malformed trade';
  const out = {};
  for (const [r, n] of Object.entries(bundle)) {
    if (!RESOURCE_TYPES.includes(r)) return 'Unknown resource';
    if (!Number.isInteger(n) || n < 0) return 'Counts must be whole numbers';
    if (n > 0) out[r] = n;
  }
  return out;
}

function holds(player, bundle) {
  return Object.entries(bundle).every(([r, n]) => player.resources[r] >= n);
}

function describe(bundle) {
  return Object.entries(bundle).map(([r, n]) => `${n} ${r}`).join(', ');
}

export function proposeTrade(gameState, playerIndex, toIndex, give, get) {
  if (!isValidPlayer(gameState, playerIndex)) return 'Invalid player';
  if (!isValidPlayer(gameState, toIndex)) return 'Invalid trade partner';
  if (gameState.winner !== null) return 'Game is over';
  if (gameState.currentPlayerIndex !== playerIndex) return 'Not your turn';
  if (gameState.phase !== 'play') return 'Cannot trade during setup';
  if (gameState.robber) return 'Resolve the robber first';
  if (gameState.roadBuilding) return 'Finish placing your free roads first';
  if (gameState.dice === null) return 'Roll the dice first';
  if (toIndex === playerIndex) return 'Pick another player to trade with';
  const g = cleanBundle(give);
  if (typeof g === 'string') return g;
  const w = cleanBundle(get);
  if (typeof w === 'string') return w;
  if (!Object.keys(g).length || !Object.keys(w).length) return 'Both sides of a trade need at least one card';
  if (Object.keys(g).some(r => r in w)) return 'Cannot trade a resource for itself';
  if (!holds(gameState.players[playerIndex], g)) return 'You do not have those cards';
  if (!holds(gameState.players[toIndex], w)) return `${gameState.players[toIndex].name} does not have those cards`;

  return log({ ...gameState, tradeOffer: { from: playerIndex, to: toIndex, give: g, get: w } }, playerIndex,
    `${gameState.players[playerIndex].name} offers ${gameState.players[toIndex].name} ${describe(g)} for ${describe(w)}`);
}

export function acceptTrade(gameState, playerIndex) {
  if (!isValidPlayer(gameState, playerIndex)) return 'Invalid player';
  const offer = gameState.tradeOffer;
  if (!offer) return 'No trade is pending';
  if (offer.to !== playerIndex) return 'Only the player receiving the offer can accept it';
  // Hands may have changed since the offer was made; check both again.
  if (!holds(gameState.players[offer.from], offer.give)) return `${gameState.players[offer.from].name} no longer has those cards`;
  if (!holds(gameState.players[offer.to], offer.get)) return `${gameState.players[offer.to].name} does not have those cards`;

  const players = gameState.players.map((p, i) => {
    if (i !== offer.from && i !== offer.to) return p;
    const [out, inn] = i === offer.from ? [offer.give, offer.get] : [offer.get, offer.give];
    const resources = { ...p.resources };
    Object.entries(out).forEach(([r, n]) => { resources[r] -= n; });
    Object.entries(inn).forEach(([r, n]) => { resources[r] += n; });
    return { ...p, resources };
  });
  return log({ ...gameState, players, tradeOffer: null }, playerIndex,
    `${gameState.players[offer.to].name} accepted: ${describe(offer.give)} for ${describe(offer.get)} with ${gameState.players[offer.from].name}`);
}

// Either side can call it off: the recipient declines, the offerer withdraws.
export function declineTrade(gameState, playerIndex) {
  if (!isValidPlayer(gameState, playerIndex)) return 'Invalid player';
  const offer = gameState.tradeOffer;
  if (!offer) return 'No trade is pending';
  if (playerIndex !== offer.to && playerIndex !== offer.from) return 'Not part of this trade';
  const text = playerIndex === offer.to
    ? `${gameState.players[offer.to].name} declined the trade`
    : `${gameState.players[offer.from].name} withdrew the trade offer`;
  return log({ ...gameState, tradeOffer: null }, playerIndex, text);
}

function totalCards(player) {
  return RESOURCE_TYPES.reduce((sum, r) => sum + player.resources[r], 0);
}

// Called after a 7 is rolled: players over 7 cards must discard half (rounded
// down) before the robber moves; otherwise go straight to moving it.
export function startRobber(gameState) {
  const overLimit = gameState.players
    .map((p, i) => ({ i, total: totalCards(p) }))
    .filter(x => x.total > 7);

  if (overLimit.length === 0) {
    return log({ ...gameState, robber: { stage: 'move' } },
      gameState.currentPlayerIndex,
      `${gameState.players[gameState.currentPlayerIndex].name} is moving the robber`);
  }

  let s = {
    ...gameState,
    robber: {
      stage: 'discard',
      pending: overLimit.map(x => x.i),
      required: Object.fromEntries(overLimit.map(x => [x.i, Math.floor(x.total / 2)])),
    },
  };
  overLimit.forEach(x => {
    s = log(s, x.i, `${gameState.players[x.i].name} must discard ${Math.floor(x.total / 2)} cards`);
  });
  return s;
}

// discards is { resource: count }; total must equal the player's required count
export function discardCards(gameState, playerIndex, discards) {
  if (!isValidPlayer(gameState, playerIndex)) return 'Invalid player';
  const robber = gameState.robber;
  if (!robber || robber.stage !== 'discard') return 'No discard is pending';
  if (!robber.pending.includes(playerIndex)) return 'You have nothing to discard';

  const player = gameState.players[playerIndex];
  const entries = Object.entries(discards).filter(([, n]) => n > 0);
  if (entries.some(([r]) => !RESOURCE_TYPES.includes(r))) return 'Unknown resource';
  if (entries.some(([r, n]) => n > player.resources[r])) return 'You do not have those cards';

  const discardTotal = entries.reduce((sum, [, n]) => sum + n, 0);
  if (discardTotal !== robber.required[playerIndex])
    return `You must discard exactly ${robber.required[playerIndex]} cards`;

  const bank = { ...gameState.bank };
  const players = gameState.players.map((p, idx) => {
    if (idx !== playerIndex) return p;
    const resources = { ...p.resources };
    entries.forEach(([r, n]) => { resources[r] -= n; bank[r] += n; });
    return { ...p, resources };
  });

  const pending = robber.pending.filter(i => i !== playerIndex);
  const detail = entries.map(([r, n]) => `${n} ${r}`).join(', ');
  let s = log({ ...gameState, players, bank }, playerIndex,
    `${player.name} discarded ${detail}`);
  if (!pending.length) {
    s = log(s, gameState.currentPlayerIndex,
      `${gameState.players[gameState.currentPlayerIndex].name} is moving the robber`);
  }
  return { ...s, robber: pending.length ? { ...robber, pending } : { stage: 'move' } };
}

// Opponents with a settlement or city on the hex and at least one card
function stealCandidates(gameState, playerIndex, hexIndex) {
  const hexVerts = new Set(HEX_TO_VERTICES[hexIndex]);
  return gameState.players
    .map((p, i) => ({ p, i }))
    .filter(({ p, i }) =>
      i !== playerIndex &&
      totalCards(p) > 0 &&
      [...p.settlements, ...p.cities].some(b => hexVerts.has(b.intersectionIndex))
    )
    .map(({ i }) => i);
}

export function moveRobber(gameState, playerIndex, hexIndex) {
  if (!isValidPlayer(gameState, playerIndex)) return 'Invalid player';
  if (gameState.currentPlayerIndex !== playerIndex) return 'Not your turn';
  if (!gameState.robber || gameState.robber.stage !== 'move') return 'The robber cannot move right now';
  if (hexIndex < 0 || hexIndex >= HEX_TO_VERTICES.length) return 'Invalid hex';
  if (hexIndex === gameState.robberHex) return 'The robber must move to a different hex';

  const candidates = stealCandidates(gameState, playerIndex, hexIndex);
  const tile = gameState.board.tiles[hexIndex];
  const number = gameState.board.numbers[hexIndex];
  return log({
    ...gameState,
    robberHex: hexIndex,
    robber: candidates.length ? { stage: 'steal', candidates } : null,
  }, playerIndex,
    `${gameState.players[playerIndex].name} moved the robber to ${tile}${number !== null ? ` (${number})` : ''}`);
}

export function stealResource(gameState, playerIndex, victimIndex) {
  if (!isValidPlayer(gameState, playerIndex)) return 'Invalid player';
  if (gameState.currentPlayerIndex !== playerIndex) return 'Not your turn';
  if (!gameState.robber || gameState.robber.stage !== 'steal') return 'No steal is pending';
  if (!gameState.robber.candidates.includes(victimIndex)) return 'You cannot steal from that player';

  const victim = gameState.players[victimIndex];
  const deck = RESOURCE_TYPES.flatMap(r => Array(victim.resources[r]).fill(r));
  const stolen = deck[Math.floor(Math.random() * deck.length)];

  const players = gameState.players.map((p, idx) => {
    if (idx === victimIndex)
      return { ...p, resources: { ...p.resources, [stolen]: p.resources[stolen] - 1 } };
    if (idx === playerIndex)
      return { ...p, resources: { ...p.resources, [stolen]: p.resources[stolen] + 1 } };
    return p;
  });

  return log({ ...gameState, players, robber: null }, playerIndex,
    `${gameState.players[playerIndex].name} stole a card from ${victim.name}`);
}

// ---------------------------------------------------------------------------
// Development cards
// ---------------------------------------------------------------------------

const DEV_CARD_LABEL = {
  knight: 'Knight', victoryPoint: 'Victory Point', roadBuilding: 'Road Building',
  yearOfPlenty: 'Year of Plenty', monopoly: 'Monopoly',
};

// Buy the top card of the draw pile for 1 ore + 1 wheat + 1 sheep. Multiple
// purchases per turn are allowed. The card enters the hand as newlyBought.
export function buyDevCard(gameState, playerIndex) {
  if (!isValidPlayer(gameState, playerIndex)) return 'Invalid player';
  if (gameState.winner !== null) return 'Game is over';
  if (gameState.currentPlayerIndex !== playerIndex) return 'Not your turn';
  if (gameState.phase === 'setup') return 'Cannot buy dev cards during setup';
  if (gameState.robber) return 'Resolve the robber first';
  if (gameState.roadBuilding) return 'Finish placing your free roads first';
  if (gameState.devCardDeck.length === 0) return 'The dev card deck is empty';

  const res = gameState.players[playerIndex].resources;
  if (res.ore < 1 || res.wheat < 1 || res.sheep < 1) return 'Insufficient resources';

  const card = gameState.devCardDeck[gameState.devCardDeck.length - 1];
  const devCardDeck = gameState.devCardDeck.slice(0, -1);
  const players = gameState.players.map((p, i) => i !== playerIndex ? p : {
    ...p,
    resources: { ...p.resources, ore: p.resources.ore - 1, wheat: p.resources.wheat - 1, sheep: p.resources.sheep - 1 },
    devCards: [...p.devCards, { type: card, newlyBought: true }],
  });
  const bank = {
    ...gameState.bank,
    ore: gameState.bank.ore + 1, wheat: gameState.bank.wheat + 1, sheep: gameState.bank.sheep + 1,
  };

  // Log line is deliberately generic — the drawn card stays hidden.
  const s = log({ ...gameState, players, bank, devCardDeck }, playerIndex,
    `${gameState.players[playerIndex].name} bought a development card`);
  // A Victory Point card can complete a win the instant it is drawn.
  return recomputeVictory(s, playerIndex);
}

// Shared play-time guards. Returns an error string or null. Victory Point cards
// are never "played", so `type` is only ever a playable action card here.
function canPlayDevCard(gameState, playerIndex, type) {
  if (gameState.winner !== null) return 'Game is over';
  if (gameState.currentPlayerIndex !== playerIndex) return 'Not your turn';
  if (gameState.phase === 'setup') return 'Cannot play dev cards during setup';
  if (gameState.robber) return 'Resolve the robber first';
  if (gameState.roadBuilding) return 'Finish placing your free roads first';
  if (gameState.devCardPlayedThisTurn) return 'You already played a dev card this turn';
  if (!gameState.players[playerIndex].devCards.some(c => c.type === type && !c.newlyBought))
    return `No playable ${DEV_CARD_LABEL[type]} card`;
  return null;
}

// Remove one playable (not newly-bought) card of the given type from a hand.
function removeOneCard(devCards, type) {
  const idx = devCards.findIndex(c => c.type === type && !c.newlyBought);
  return devCards.filter((_, i) => i !== idx);
}

// Knight: increment the knight count, recompute Largest Army, then hand off to
// the existing robber move/steal flow — but with no discard step.
export function playKnight(gameState, playerIndex) {
  if (!isValidPlayer(gameState, playerIndex)) return 'Invalid player';
  const err = canPlayDevCard(gameState, playerIndex, 'knight');
  if (err) return err;

  const name = gameState.players[playerIndex].name;
  const players = gameState.players.map((p, i) => i !== playerIndex ? p : {
    ...p, devCards: removeOneCard(p.devCards, 'knight'), knightsPlayed: (p.knightsPlayed || 0) + 1,
  });
  let s = log({ ...gameState, players, devCardPlayedThisTurn: true }, playerIndex, `${name} played a Knight`);

  const largestArmy = recomputeLargestArmy(s);
  if (largestArmy !== s.largestArmy) {
    s = { ...s, largestArmy };
    s = log(s, largestArmy, `${gameState.players[largestArmy].name} takes Largest Army (2 VP)`);
  }

  // Largest Army may itself be the 10th point — recompute win before the move.
  s = recomputeVictory(s, playerIndex);
  if (s.winner !== null) return s;

  s = { ...s, robber: { stage: 'move' } };
  return log(s, playerIndex, `${name} is moving the robber`);
}

// Road Building: place up to 2 free roads following normal placement rules.
export function playRoadBuilding(gameState, playerIndex) {
  if (!isValidPlayer(gameState, playerIndex)) return 'Invalid player';
  const err = canPlayDevCard(gameState, playerIndex, 'roadBuilding');
  if (err) return err;

  const name = gameState.players[playerIndex].name;
  const players = gameState.players.map((p, i) => i !== playerIndex ? p : {
    ...p, devCards: removeOneCard(p.devCards, 'roadBuilding'),
  });
  let s = log({ ...gameState, players, devCardPlayedThisTurn: true }, playerIndex, `${name} played Road Building`);

  if (!hasLegalRoad(s, playerIndex)) {
    return log(s, playerIndex, `${name} has no legal roads to build`);
  }
  return { ...s, roadBuilding: { remaining: 2 } };
}

// Year of Plenty: take any 2 resources from the bank for free (capped by stock).
export function playYearOfPlenty(gameState, playerIndex, picks) {
  if (!isValidPlayer(gameState, playerIndex)) return 'Invalid player';
  const err = canPlayDevCard(gameState, playerIndex, 'yearOfPlenty');
  if (err) return err;
  if (!Array.isArray(picks) || picks.length !== 2) return 'Pick exactly 2 resources';
  if (picks.some(r => !RESOURCE_TYPES.includes(r))) return 'Unknown resource';

  const bank = { ...gameState.bank };
  const gained = {};
  picks.forEach(r => { if (bank[r] > 0) { bank[r] -= 1; gained[r] = (gained[r] || 0) + 1; } });

  const players = gameState.players.map((p, i) => {
    if (i !== playerIndex) return p;
    const resources = { ...p.resources };
    Object.entries(gained).forEach(([r, n]) => { resources[r] += n; });
    return { ...p, devCards: removeOneCard(p.devCards, 'yearOfPlenty'), resources };
  });

  const detail = Object.entries(gained).map(([r, n]) => `${n} ${r}`).join(', ') || 'nothing (bank empty)';
  return log({ ...gameState, players, bank, devCardPlayedThisTurn: true }, playerIndex,
    `${gameState.players[playerIndex].name} played Year of Plenty and took ${detail}`);
}

// Monopoly: every other player hands over all cards of the named resource.
export function playMonopoly(gameState, playerIndex, resource) {
  if (!isValidPlayer(gameState, playerIndex)) return 'Invalid player';
  const err = canPlayDevCard(gameState, playerIndex, 'monopoly');
  if (err) return err;
  if (!RESOURCE_TYPES.includes(resource)) return 'Unknown resource';

  let taken = 0;
  gameState.players.forEach((p, i) => { if (i !== playerIndex) taken += p.resources[resource]; });
  const players = gameState.players.map((p, i) => {
    if (i === playerIndex) return {
      ...p, devCards: removeOneCard(p.devCards, 'monopoly'),
      resources: { ...p.resources, [resource]: p.resources[resource] + taken },
    };
    return { ...p, resources: { ...p.resources, [resource]: 0 } };
  });

  return log({ ...gameState, players, devCardPlayedThisTurn: true }, playerIndex,
    `${gameState.players[playerIndex].name} played Monopoly on ${resource} and collected ${taken}`);
}
