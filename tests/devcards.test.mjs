import initialGameState from '../src/game/gameState.js';
import {
  buyDevCard, playKnight, playRoadBuilding, playYearOfPlenty, playMonopoly,
  placeRoad, endTurn,
} from '../src/game/gameActions.js';
import { EDGES } from '../src/game/gameRules.js';

let pass = 0, fail = 0;
function check(name, cond) {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}`);
}

// Play-phase base with a configurable deck and player-0 overrides.
function play(deck, p0) {
  return {
    ...initialGameState, phase: 'play', setup: null, currentPlayerIndex: 0,
    devCardDeck: deck,
    players: initialGameState.players.map((p, i) => i === 0 ? { ...p, ...p0 } : p),
  };
}
const R = amt => ({ brick: amt, wood: amt, ore: amt, wheat: amt, sheep: amt });

// --- Buying ---
const buyable = play(['knight', 'monopoly'], { resources: R(1) });
const bought = buyDevCard(buyable, 0);
check('buy succeeds', typeof bought !== 'string');
check('drew a card into hand', bought.players[0].devCards.length === 1);
check('card is newlyBought', bought.players[0].devCards[0].newlyBought === true);
check('ore/wheat/sheep deducted', bought.players[0].resources.ore === 0 && bought.players[0].resources.wheat === 0 && bought.players[0].resources.sheep === 0);
check('brick/wood untouched', bought.players[0].resources.brick === 1 && bought.players[0].resources.wood === 1);
check('deck shrank by 1', bought.devCardDeck.length === 1);
check('bank refunded the 3 resources', bought.bank.ore === 20 && bought.bank.wheat === 20 && bought.bank.sheep === 20);
check('log stays generic (no card type revealed)', bought.log[bought.log.length - 1].text === 'Player 1 bought a development card');

check('buy fails with insufficient resources', typeof buyDevCard(play(['knight'], { resources: { brick: 5, wood: 5, ore: 0, wheat: 1, sheep: 1 } }), 0) === 'string');
check('buy fails on empty deck', typeof buyDevCard(play([], { resources: R(3) }), 0) === 'string');
check('buy fails on wrong turn', typeof buyDevCard(play(['knight'], { resources: R(3) }), 1) === 'string');
check('buy fails during setup', typeof buyDevCard({ ...play(['knight'], { resources: R(3) }), phase: 'setup', setup: initialGameState.setup }, 0) === 'string');

// Multiple purchases per turn
const twice = buyDevCard(buyDevCard(play(['knight', 'monopoly', 'monopoly'], { resources: R(2) }), 0), 0);
check('two purchases in one turn allowed', typeof twice !== 'string' && twice.players[0].devCards.length === 2);

// --- Newly-bought cannot be played same turn ---
const freshKnight = play(['x'], { devCards: [{ type: 'knight', newlyBought: true }], resources: R(0) });
check('newly-bought card is not playable', typeof playKnight(freshKnight, 0) === 'string');

// endTurn clears newlyBought for the player who bought
const cleared = endTurn(bought);
check('endTurn clears newlyBought flags', cleared.players[0].devCards.every(c => c.newlyBought === false));
check('endTurn resets devCardPlayedThisTurn', cleared.devCardPlayedThisTurn === false);

// --- One dev card per turn ---
const twoPlayable = play(['x'], { devCards: [{ type: 'knight', newlyBought: false }, { type: 'monopoly', newlyBought: false }], resources: R(0) });
const afterKnight = playKnight(twoPlayable, 0);
check('knight sets devCardPlayedThisTurn', afterKnight.devCardPlayedThisTurn === true);
check('second dev card same turn rejected', typeof playMonopoly(afterKnight, 0, 'wheat') === 'string');

// --- Knight ---
check('knight increments knightsPlayed', afterKnight.players[0].knightsPlayed === 1);
check('knight removes one knight card', afterKnight.players[0].devCards.filter(c => c.type === 'knight').length === 0);
check('knight enters robber move (no discard)', afterKnight.robber && afterKnight.robber.stage === 'move');

// Knight skips discard even when a player is over 7 cards
const knightWithFatHands = play(['x'], {
  devCards: [{ type: 'knight', newlyBought: false }], resources: R(0),
});
knightWithFatHands.players[1] = { ...knightWithFatHands.players[1], resources: { brick: 9, wood: 0, ore: 0, wheat: 0, sheep: 0 } };
const kf = playKnight(knightWithFatHands, 0);
check('knight never triggers discard stage', kf.robber.stage === 'move');

// --- Road Building ---
const rbBase = play(['x'], {
  devCards: [{ type: 'roadBuilding', newlyBought: false }],
  settlements: [{ intersectionIndex: 0 }], resources: R(0),
});
const rb = playRoadBuilding(rbBase, 0);
check('road building enters free-road mode', rb.roadBuilding && rb.roadBuilding.remaining === 2);
const edgeA = EDGES.findIndex(([a, b]) => a === 0 || b === 0);
const rbAfter1 = placeRoad(rb, 0, edgeA);
check('free road placed without cost', typeof rbAfter1 !== 'string' && rbAfter1.players[0].resources.brick === 0 && rbAfter1.players[0].resources.wood === 0);
check('road building decrements remaining', rbAfter1.roadBuilding && rbAfter1.roadBuilding.remaining === 1);
const [a0, b0] = EDGES[edgeA];
const farV = a0 === 0 ? b0 : a0;
const edgeB = EDGES.findIndex(([a, b], i) => i !== edgeA && (a === farV || b === farV) && a !== 0 && b !== 0);
const rbAfter2 = placeRoad(rbAfter1, 0, edgeB);
check('road building clears after 2 roads', rbAfter2.roadBuilding === null);
check('both free roads exist', rbAfter2.players[0].roads.length === 2);

// Road Building with no legal spot: consumes card, no free-road mode
const rbNoSpot = play(['x'], { devCards: [{ type: 'roadBuilding', newlyBought: false }], resources: R(0) });
const rbNone = playRoadBuilding(rbNoSpot, 0);
check('road building with no legal spot consumes card', rbNone.players[0].devCards.length === 0 && rbNone.roadBuilding == null);

// --- Year of Plenty ---
const yop = playYearOfPlenty(play(['x'], { devCards: [{ type: 'yearOfPlenty', newlyBought: false }], resources: R(0) }), 0, ['ore', 'wheat']);
check('year of plenty grants 2 chosen resources', yop.players[0].resources.ore === 1 && yop.players[0].resources.wheat === 1);
check('year of plenty draws from bank', yop.bank.ore === 18 && yop.bank.wheat === 18);
const yopSame = playYearOfPlenty(play(['x'], { devCards: [{ type: 'yearOfPlenty', newlyBought: false }], resources: R(0) }), 0, ['brick', 'brick']);
check('year of plenty allows two of the same type', yopSame.players[0].resources.brick === 2);
const yopCap = playYearOfPlenty({ ...play(['x'], { devCards: [{ type: 'yearOfPlenty', newlyBought: false }], resources: R(0) }), bank: { brick: 1, wood: 19, ore: 19, wheat: 19, sheep: 19 } }, 0, ['brick', 'brick']);
check('year of plenty capped by bank stock', yopCap.players[0].resources.brick === 1 && yopCap.bank.brick === 0);

// --- Monopoly ---
const monoBase = play(['x'], { devCards: [{ type: 'monopoly', newlyBought: false }], resources: { brick: 0, wood: 0, ore: 0, wheat: 2, sheep: 0 } });
monoBase.players[1] = { ...monoBase.players[1], resources: { brick: 0, wood: 0, ore: 0, wheat: 3, sheep: 0 } };
monoBase.players[2] = { ...monoBase.players[2], resources: { brick: 0, wood: 0, ore: 0, wheat: 1, sheep: 0 } };
const mono = playMonopoly(monoBase, 0, 'wheat');
check('monopoly collects all of the type from others', mono.players[0].resources.wheat === 6);
check('monopoly leaves other players with 0', mono.players[1].resources.wheat === 0 && mono.players[2].resources.wheat === 0);

// --- VP card counts toward win but not public VP ---
const nearWinVP = play(['x'], {
  // 8 public VP (4 cities) + 2 hidden VP cards = 10 internal
  cities: [{ intersectionIndex: 0 }, { intersectionIndex: 2 }, { intersectionIndex: 4 }, { intersectionIndex: 6 }],
  devCards: [{ type: 'victoryPoint', newlyBought: false }, { type: 'victoryPoint', newlyBought: false }],
  resources: R(3),
});
// Trigger a recompute via a purchase (buy a VP card too, but here just re-run recompute by buying)
const vpWin = buyDevCard({ ...nearWinVP, devCardDeck: ['victoryPoint'] }, 0);
check('VP cards drive the win check', vpWin.winner === 0);
check('public victoryPoints excludes VP cards', vpWin.players[0].victoryPoints === 8);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
