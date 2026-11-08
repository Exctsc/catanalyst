import {
  pips, TOTAL_PROBABILITY, vertexPips, openIntersectionPips, playerPips, expectedPerRoll,
  rollHistogram, incomeBreakdown, RESOURCES,
} from '../src/game/analysis.js';
import { createGame } from '../src/game/gameState.js';
import { replay, newGame, applyAction } from '../src/game/engine.js';
import { DEFAULT_BOARD, VERTEX_TO_HEXES, VERTEX_ADJACENCY } from '../src/game/gameRules.js';
import { playGame } from './bot.mjs';

let pass = 0, fail = 0;
function check(name, cond) {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}`);
}
const close = (a, b) => Math.abs(a - b) < 1e-9;
const sum = o => Object.values(o).reduce((a, b) => a + b, 0);

// --- pips and probabilities
check('pips: 6 and 8 are 5, 2 and 12 are 1, desert/7 are 0', pips(6) === 5 && pips(8) === 5 && pips(2) === 1 && pips(12) === 1 && pips(null) === 0 && pips(7) === 0);
check('2d6 probabilities sum to 1', close(sum(TOTAL_PROBABILITY), 1) && close(TOTAL_PROBABILITY[7], 6 / 36));
check('board pips total 58', DEFAULT_BOARD.numbers.reduce((s, n) => s + pips(n), 0) === 58);

// Hex 0 on the default board is mountains with a 2; a vertex touching only it has 1 pip.
const lone = VERTEX_TO_HEXES.findIndex(hs => hs.length === 1 && hs[0] === 0);
check('vertex pips: lone corner of hex 0 (2) = 1', vertexPips(DEFAULT_BOARD, lone) === 1);
const triple = VERTEX_TO_HEXES.findIndex(hs => hs.length === 3);
const expectTriple = VERTEX_TO_HEXES[triple].reduce((s, h) => s + (DEFAULT_BOARD.tiles[h] === 'desert' ? 0 : pips(DEFAULT_BOARD.numbers[h])), 0);
check('vertex pips: three-hex vertex sums its hexes', vertexPips(DEFAULT_BOARD, triple) === expectTriple);
const desertVertex = VERTEX_TO_HEXES.findIndex(hs => hs.includes(9));
check('desert adds no pips even if numbered (free mode)', vertexPips({ ...DEFAULT_BOARD, numbers: DEFAULT_BOARD.numbers.map((n, i) => (i === 9 ? 6 : n)) }, desertVertex) === vertexPips(DEFAULT_BOARD, desertVertex));

// --- open intersections
const g = createGame();
check('empty board: all 54 intersections open', openIntersectionPips(g).length === 54);
const withOne = { ...g, players: g.players.map((p, i) => (i === 0 ? { ...p, settlements: [{ intersectionIndex: triple }] } : p)) };
const open = openIntersectionPips(withOne).map(o => o.vertex);
check('a building closes its spot and its neighbours', !open.includes(triple) && VERTEX_ADJACENCY[triple].every(a => !open.includes(a)) && open.length === 54 - 1 - VERTEX_ADJACENCY[triple].length);

// --- player pips and expected income
const s = {
  ...g,
  robberHex: 9,
  players: g.players.map((p, i) => (i === 0 ? { ...p, settlements: [{ intersectionIndex: lone }], cities: [{ intersectionIndex: triple }] } : p)),
};
const pp = playerPips(s)[0];
const manual = { brick: 0, wood: 0, ore: 1, wheat: 0, sheep: 0 };
VERTEX_TO_HEXES[triple].forEach(h => {
  const r = { mountains: 'ore', fields: 'wheat', forest: 'wood', hills: 'brick', pasture: 'sheep' }[DEFAULT_BOARD.tiles[h]];
  if (r) manual[r] += 2 * pips(DEFAULT_BOARD.numbers[h]);
});
check('player pips: settlement x1 + city x2 per resource', RESOURCES.every(r => pp[r] === manual[r]));
check('players without buildings have zero pips', sum(playerPips(s)[1]) === 0);
const ex = expectedPerRoll(s)[0];
check('expected per roll = pips / 36', RESOURCES.every(r => close(ex[r], manual[r] / 36)));
const robbed = { ...s, robberHex: 0 };
const hex0Ore = 1 + (VERTEX_TO_HEXES[triple].includes(0) ? 2 : 0) * pips(DEFAULT_BOARD.numbers[0]);
check('the robbed hex is excluded from expected income', close(expectedPerRoll(robbed)[0].ore, (manual.ore - hex0Ore) / 36) && sum(expectedPerRoll(robbed)[0]) < sum(ex));

// --- history: a full game's histogram and income
const game = playGame({ seed: 4242, diceMode: 'balanced' });
const { states } = replay(game.options, game.actions);
const hist = rollHistogram(states, game.actions);
const rollCount = game.actions.filter(a => a.type === 'roll').length;
check('histogram counts every roll', hist.reduce((n, b) => n + b.actual, 0) === rollCount && hist.length === 11);
check('histogram expectation scales with rolls', close(hist.reduce((n, b) => n + b.expected, 0), rollCount) && close(hist.find(b => b.total === 7).expected, rollCount / 6));
check('histogram matches the dice in state', game.actions.every((a, i) => a.type !== 'roll' || hist.find(b => b.total === states[i + 1].dice.total).actual > 0));

const income = incomeBreakdown(states, game.actions);
const rollGains = income.reduce((n, p) => n + p.gained.rolls, 0);
// Sum the "N resource" counts after a log verb, e.g. "Player 2 collected 1 wood, 2 ore".
const logged = verb => states.at(-1).log.filter(e => e.text.includes(` ${verb} `))
  .reduce((n, e) => n + [...e.text.split(` ${verb} `)[1].matchAll(/(\d+) \w+/g)].reduce((m, x) => m + +x[1], 0), 0);
const collected = logged('collected');
check('roll income equals what the log says was collected', rollGains === collected && rollGains > 0);
check('setup income is the starting resources', income.reduce((n, p) => n + p.gained.setup, 0) > 0);
const discarded = income.reduce((n, p) => n + p.lost.discards, 0);
check('discards counted', discarded === logged('discarded'));
const steals = game.actions.filter(a => a.type === 'steal').length;
check('every steal is one card gained and one lost', income.reduce((n, p) => n + p.gained.stolen, 0) === steals && income.reduce((n, p) => n + p.lost.robber, 0) === steals);

// Small hand-made history: a trade and a monopoly.
let h = newGame({ seed: 1 });
h = applyAction(h, { type: 'sandbox', edit: { op: 'setHand', player: 0, resources: { brick: 0, wood: 0, ore: 0, wheat: 0, sheep: 4 } } });
h = applyAction(h, { type: 'sandbox', edit: { op: 'setHand', player: 1, resources: { brick: 0, wood: 3, ore: 0, wheat: 0, sheep: 0 } } });
h = applyAction(h, { type: 'sandbox', edit: { op: 'setDevCards', player: 0, counts: { monopoly: 1 } } });
h = applyAction(h, { type: 'sandbox', edit: { op: 'setTurn', player: 0, rolled: true } });
h = applyAction(h, { type: 'sandbox', edit: { op: 'resume' } });
h = applyAction(h, { type: 'bankTrade', player: 0, give: 'sheep', receive: 'ore' });
h = applyAction(h, { type: 'playMonopoly', player: 0, resource: 'wood' });
const hs = replay(h.options, h.actions).states;
const inc = incomeBreakdown(hs, h.actions);
check('sandbox hand edits are not income', inc[0].gained.rolls === 0 && inc[0].gained.setup === 0);
check('bank trade counts the card received', inc[0].gained.trades === 1);
check('monopoly: gain for the player, loss for victims', inc[0].gained.devCards === 3 && inc[1].lost.monopoly === 3);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
