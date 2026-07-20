import initialGameState from '../src/game/gameState.js';
import { playKnight } from '../src/game/gameActions.js';

let pass = 0, fail = 0;
function check(name, cond) {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}`);
}

// A play-phase state where `current` holds one playable knight and each player
// has a preset knightsPlayed count.
function armyState(current, knightCounts, largestArmy = null) {
  return {
    ...initialGameState, phase: 'play', setup: null, currentPlayerIndex: current, largestArmy,
    players: initialGameState.players.map((p, i) => ({
      ...p,
      knightsPlayed: knightCounts[i],
      devCards: i === current ? [{ type: 'knight', newlyBought: false }] : [],
    })),
  };
}

// Below 3 knights: no award
const two = playKnight(armyState(0, [2, 0, 0, 0]), 0);
check('reaching 3 knights claims Largest Army', two.players[0].knightsPlayed === 3 && two.largestArmy === 0);
check('Largest Army grants +2 public VP', two.players[0].victoryPoints === 2);

const one = playKnight(armyState(0, [1, 0, 0, 0]), 0);
check('2 knights is not enough for Largest Army', one.largestArmy === null);
check('no army means no VP bonus', one.players[0].victoryPoints === 0);

// Tie does not steal the title: holder has 3, challenger reaches 3
const tie = playKnight(armyState(1, [3, 2, 0, 0], 0), 1);
check('equal knight count leaves title with holder', tie.largestArmy === 0);
check('holder keeps the +2 VP on a tie', tie.players[0].victoryPoints === 2 && tie.players[1].victoryPoints === 0);

// Strictly exceeding transfers the title
const steal = playKnight(armyState(1, [3, 3, 0, 0], 0), 1);
check('strictly more knights transfers Largest Army', steal.largestArmy === 1);
check('new holder gains +2 VP', steal.players[1].victoryPoints === 2);
check('old holder loses the +2 VP', steal.players[0].victoryPoints === 0);

// Largest Army can be the winning 10th point
const winState = armyState(0, [2, 0, 0, 0], null);
winState.players[0] = { ...winState.players[0], cities: [{ intersectionIndex: 0 }, { intersectionIndex: 2 }, { intersectionIndex: 4 }, { intersectionIndex: 6 }] };
// 8 VP from cities + 2 from Largest Army = 10
const armyWin = playKnight(winState, 0);
check('Largest Army can complete a win', armyWin.winner === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
