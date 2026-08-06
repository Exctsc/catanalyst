import initialGameState from '../src/game/gameState.js';
import {
  SOUNDS, SOUND_EVENTS, DEFAULT_SETTINGS, STORAGE_KEY,
  clampVolume, parseSettings, serializeSettings, playSound,
} from '../src/audio/sounds.js';
import { soundsForTransition } from '../src/audio/gameSounds.js';

let pass = 0, fail = 0;
function check(name, cond) {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}`);
}

// --- Sound table integrity -------------------------------------------------
// Every cue the game can ask for must exist, or an action silently does nothing.
const REQUIRED_CUES = [
  'dice', 'resources', 'settlement', 'road', 'city',
  'trade', 'devBuy', 'devPlay', 'robber', 'steal', 'turn', 'win',
];
check('every gameplay event named in the brief has a cue', REQUIRED_CUES.every(c => c in SOUNDS));
check('SOUND_EVENTS lists exactly the defined cues', SOUND_EVENTS.length === Object.keys(SOUNDS).length
  && REQUIRED_CUES.every(c => SOUND_EVENTS.includes(c)));

check('every cue has at least one note', Object.values(SOUNDS).every(s => Array.isArray(s.notes) && s.notes.length > 0));
check('every note has an audible frequency and a positive duration', Object.values(SOUNDS).every(s =>
  s.notes.every(n => Number.isFinite(n.freq) && n.freq > 20 && n.freq < 20000 && n.dur > 0)));
check('every cue gain is within 0..1', Object.values(SOUNDS).every(s => s.gain > 0 && s.gain <= 1));
check('every note level is within 0..1', Object.values(SOUNDS).every(s =>
  s.notes.every(n => n.level === undefined || (n.level > 0 && n.level <= 1))));
check('every waveform is one the Web Audio API supports', Object.values(SOUNDS).every(s =>
  s.notes.every(n => n.type === undefined || ['sine', 'square', 'triangle', 'sawtooth'].includes(n.type))));
check('pitch sweep targets stay audible', Object.values(SOUNDS).every(s =>
  s.notes.every(n => n.to === undefined || (n.to > 20 && n.to < 20000))));

// Repeated actions shouldn't be jarring: keep the frequent cues short and the
// only long one the once-per-game fanfare.
function cueLength(spec) {
  return Math.max(...spec.notes.map(n => (n.at || 0) + n.dur));
}
check('dice / road / turn cues stay under 300ms', ['dice', 'road', 'turn'].every(c => cueLength(SOUNDS[c]) < 0.3));
check('no cue except the win fanfare runs past 500ms', Object.entries(SOUNDS)
  .every(([name, spec]) => name === 'win' || cueLength(spec) <= 0.5));
check('the turn cue is the quietest, since it fires every turn',
  SOUNDS.turn.gain <= Math.min(...REQUIRED_CUES.filter(c => c !== 'turn').map(c => SOUNDS[c].gain)));

// --- Volume clamping -------------------------------------------------------
check('clampVolume passes a mid value through', clampVolume(0.5) === 0.5);
check('clampVolume floors at 0', clampVolume(-2) === 0);
check('clampVolume caps at 1', clampVolume(7) === 1);
check('clampVolume accepts the exact bounds', clampVolume(0) === 0 && clampVolume(1) === 1);
check('clampVolume rejects NaN', clampVolume(NaN) === DEFAULT_SETTINGS.volume);
check('clampVolume rejects a string', clampVolume('loud') === DEFAULT_SETTINGS.volume);

// --- Settings persistence --------------------------------------------------
check('default volume is modest, not full blast', DEFAULT_SETTINGS.volume > 0 && DEFAULT_SETTINGS.volume <= 0.5);
check('sound is on by default', DEFAULT_SETTINGS.muted === false);
check('the storage key is namespaced to the app', STORAGE_KEY.startsWith('catanalyst'));

check('parseSettings round-trips a serialized value', (() => {
  const original = { muted: true, volume: 0.62 };
  const back = parseSettings(serializeSettings(original));
  return back.muted === true && Math.abs(back.volume - 0.62) < 1e-9;
})());
check('parseSettings falls back on a null (first visit)', (() => {
  const s = parseSettings(null);
  return s.muted === DEFAULT_SETTINGS.muted && s.volume === DEFAULT_SETTINGS.volume;
})());
check('parseSettings falls back on an empty string', parseSettings('').volume === DEFAULT_SETTINGS.volume);
check('parseSettings survives corrupt JSON', parseSettings('{not json').volume === DEFAULT_SETTINGS.volume);
check('parseSettings survives a JSON non-object', parseSettings('42').volume === DEFAULT_SETTINGS.volume);
check('parseSettings survives JSON null', parseSettings('null').volume === DEFAULT_SETTINGS.volume);
check('parseSettings clamps an out-of-range stored volume', parseSettings('{"volume":99}').volume === 1);
check('parseSettings coerces a non-boolean muted', parseSettings('{"muted":"yes"}').muted === false);
check('parseSettings ignores a non-numeric volume', parseSettings('{"volume":"loud"}').volume === DEFAULT_SETTINGS.volume);
check('serializeSettings clamps before writing', JSON.parse(serializeSettings({ muted: false, volume: 12 })).volume === 1);
check('serializeSettings emits only the two known keys', (() => {
  const keys = Object.keys(JSON.parse(serializeSettings({ muted: true, volume: 0.3, junk: 1 })));
  return keys.length === 2 && keys.includes('muted') && keys.includes('volume');
})());

// --- playSound in a headless environment -----------------------------------
// No AudioContext in Node: playSound must report failure, not throw. This is
// the same path a very old browser takes.
check('playSound returns false for an unknown cue', playSound('nope') === false);
check('playSound degrades quietly with no Web Audio available', playSound('dice') === false);

// --- soundsForTransition ---------------------------------------------------
const ROLLED = { die1: 3, die2: 4, total: 7, isRobber: true };
const SIX = { die1: 3, die2: 3, total: 6, isRobber: false };
const base = initialGameState;

function withPlayer(state, index, patch) {
  return { ...state, players: state.players.map((p, i) => (i === index ? { ...p, ...patch } : p)) };
}
const playing = { ...base, phase: 'play', setup: null, dice: null };

check('no cues when nothing changed', soundsForTransition(playing, playing).length === 0);
check('no cues for a missing previous state', soundsForTransition(null, playing).length === 0);
check('an identical-by-reference state produces no cues', soundsForTransition(base, base).length === 0);

check('rolling the dice plays the dice cue', (() => {
  const cues = soundsForTransition(playing, { ...playing, dice: SIX });
  return cues.includes('dice');
})());

check('a roll that pays out plays dice then resources, in that order', (() => {
  const next = withPlayer({ ...playing, dice: SIX }, 0, { resources: { brick: 2, wood: 0, ore: 0, wheat: 0, sheep: 0 } });
  const cues = soundsForTransition(playing, next);
  return cues.indexOf('dice') === 0 && cues.includes('resources') && cues.indexOf('resources') > cues.indexOf('dice');
})());

check('a roll that pays nobody skips the resources cue', (() => {
  const cues = soundsForTransition(playing, { ...playing, dice: SIX });
  return cues.includes('dice') && !cues.includes('resources');
})());

check('cards gained outside a roll do not fire the resources cue', (() => {
  // e.g. Monopoly: cards move, but no dice transition happened.
  const prev = { ...playing, dice: SIX };
  const next = withPlayer(prev, 0, { resources: { brick: 5, wood: 0, ore: 0, wheat: 0, sheep: 0 } });
  return !soundsForTransition(prev, next).includes('resources');
})());

check('placing a settlement plays the settlement cue', (() => {
  const next = withPlayer(playing, 0, { settlements: [{ intersectionIndex: 10 }] });
  return soundsForTransition(playing, next).includes('settlement');
})());

check('placing a road plays the road cue', (() => {
  const next = withPlayer(playing, 0, { roads: [{ edgeIndex: 4 }] });
  return soundsForTransition(playing, next).includes('road');
})());

check('a settlement plus its setup road plays both cues', (() => {
  const next = withPlayer(playing, 0, { settlements: [{ intersectionIndex: 10 }], roads: [{ edgeIndex: 4 }] });
  const cues = soundsForTransition(playing, next);
  return cues.includes('settlement') && cues.includes('road');
})());

check('upgrading to a city plays city, not settlement', (() => {
  // The settlement is consumed by the upgrade, so its count drops.
  const prev = withPlayer(playing, 0, { settlements: [{ intersectionIndex: 10 }] });
  const next = withPlayer(playing, 0, { settlements: [], cities: [{ intersectionIndex: 10 }] });
  const cues = soundsForTransition(prev, next);
  return cues.includes('city') && !cues.includes('settlement');
})());

check('buying a dev card plays the buy cue', (() => {
  const next = { ...playing, devCardDeck: playing.devCardDeck.slice(0, -1) };
  return soundsForTransition(playing, next).includes('devBuy');
})());

check('playing a dev card plays the play cue', (() => {
  const next = { ...playing, devCardPlayedThisTurn: true };
  return soundsForTransition(playing, next).includes('devPlay');
})());

check('a dev card already played this turn does not re-fire', (() => {
  const prev = { ...playing, devCardPlayedThisTurn: true };
  return !soundsForTransition(prev, { ...prev, dice: SIX }).includes('devPlay');
})());

check('moving the robber plays the robber cue', (() => {
  const prev = { ...playing, dice: ROLLED, robber: { stage: 'move' }, robberHex: 9 };
  const next = { ...prev, robberHex: 4, robber: null };
  return soundsForTransition(prev, next).includes('robber');
})());

check('completing a steal plays the steal cue', (() => {
  const prev = { ...playing, dice: ROLLED, robber: { stage: 'steal', candidates: [1] } };
  const next = { ...prev, robber: null };
  return soundsForTransition(prev, next).includes('steal');
})());

check('entering the steal stage does not yet play the steal cue', (() => {
  const prev = { ...playing, dice: ROLLED, robber: { stage: 'move' }, robberHex: 9 };
  const next = { ...prev, robberHex: 4, robber: { stage: 'steal', candidates: [1] } };
  const cues = soundsForTransition(prev, next);
  return cues.includes('robber') && !cues.includes('steal');
})());

check('a discard stage on its own is silent', (() => {
  const prev = { ...playing, dice: ROLLED };
  const next = { ...prev, robber: { stage: 'discard', pending: [1], required: { 1: 4 } } };
  return soundsForTransition(prev, next).length === 0;
})());

check('ending the turn plays the turn cue', (() => {
  const prev = { ...playing, dice: SIX };
  const next = { ...prev, currentPlayerIndex: 1, dice: null };
  return soundsForTransition(prev, next).includes('turn');
})());

check('the turn cue comes last in a multi-cue transition', (() => {
  const prev = { ...playing, dice: SIX };
  const next = { ...prev, currentPlayerIndex: 1, dice: null };
  const cues = soundsForTransition(prev, next);
  return cues[cues.length - 1] === 'turn';
})());

check('winning plays only the win fanfare', (() => {
  const prev = withPlayer(playing, 0, { cities: [{ intersectionIndex: 1 }] });
  const next = { ...withPlayer(prev, 0, { cities: [{ intersectionIndex: 1 }, { intersectionIndex: 5 }] }), winner: 0 };
  const cues = soundsForTransition(prev, next);
  return cues.length === 1 && cues[0] === 'win';
})());

check('an already-won game stays silent', (() => {
  const prev = { ...playing, winner: 0 };
  return soundsForTransition(prev, { ...prev, dice: SIX }).length === 0
    || !soundsForTransition(prev, { ...prev, dice: SIX }).includes('win');
})());

check('every cue produced is a real sound', (() => {
  const prev = { ...playing, dice: null };
  const next = withPlayer({ ...playing, dice: SIX, currentPlayerIndex: 1, devCardPlayedThisTurn: true, robberHex: 3 },
    0, { settlements: [{ intersectionIndex: 2 }], roads: [{ edgeIndex: 1 }], resources: { brick: 1, wood: 0, ore: 0, wheat: 0, sheep: 0 } });
  const cues = soundsForTransition(prev, next);
  return cues.length > 0 && cues.every(c => c in SOUNDS);
})());

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
