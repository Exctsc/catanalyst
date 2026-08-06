// Maps a game-state transition to the cues it should play.
//
// Deriving sounds from a prev→next state diff (rather than calling playSound()
// inside each click handler) means a cue fires exactly when the state really
// changed. Actions that fail validation return an error string and never
// produce a new state, so they can't make a sound; and knock-on effects the
// UI never clicked for — resource collection after a roll, the turn handoff at
// the end of setup, a Knight winning the game — are covered by the same path.
//
// Pure: no audio, no React, no DOM. tests/sound.test.mjs drives it directly.

import { SOUNDS } from './sounds.js';

const RESOURCES = ['brick', 'wood', 'ore', 'wheat', 'sheep'];

function handSize(player) {
  return RESOURCES.reduce((sum, r) => sum + player.resources[r], 0);
}

function totalCards(state) {
  return state.players.reduce((sum, p) => sum + handSize(p), 0);
}

function totalBuildings(state, key) {
  return state.players.reduce((sum, p) => sum + p[key].length, 0);
}

export function soundsForTransition(prev, next) {
  if (!prev || !next || prev === next) return [];

  // A win ends the game; one fanfare beats stacking it under the placement or
  // dev-card cue that triggered it.
  if (prev.winner === null && next.winner !== null) return ['win'];

  const cues = [];

  if (prev.dice === null && next.dice !== null) cues.push('dice');

  // upgradeToCity moves a settlement into `cities`, so settlements *drop* on an
  // upgrade — check cities first and treat the two as mutually exclusive.
  if (totalBuildings(next, 'cities') > totalBuildings(prev, 'cities')) cues.push('city');
  else if (totalBuildings(next, 'settlements') > totalBuildings(prev, 'settlements')) cues.push('settlement');

  if (totalBuildings(next, 'roads') > totalBuildings(prev, 'roads')) cues.push('road');

  if (next.devCardDeck.length < prev.devCardDeck.length) cues.push('devBuy');
  if (!prev.devCardPlayedThisTurn && next.devCardPlayedThisTurn) cues.push('devPlay');

  if (next.robberHex !== prev.robberHex) cues.push('robber');
  // Resolution leaves the steal stage only once a card has actually been taken.
  if (prev.robber?.stage === 'steal' && next.robber === null) cues.push('steal');

  // Income, tied to the roll that produced it. Bank trades and builds also move
  // cards around, so this is scoped to the roll transition rather than being a
  // bare "someone gained cards" check.
  if (cues.includes('dice') && totalCards(next) > totalCards(prev)) cues.push('resources');

  if (prev.currentPlayerIndex !== next.currentPlayerIndex) cues.push('turn');

  return cues.filter(name => name in SOUNDS);
}
