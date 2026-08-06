// Synthesized sound effects, built entirely from Web Audio oscillators.
//
// There are no audio files: every cue is a short oscillator envelope described
// by the SOUNDS table below. That keeps the app asset-free (nothing to fetch,
// nothing to bundle) and sidesteps sample licensing entirely.
//
// Two halves live here:
//   1. The settings store (muted / volume), persisted to localStorage. The
//      parse/serialize/clamp helpers are pure so they are testable in Node.
//   2. The player, which lazily builds an AudioContext on first playback.

export const STORAGE_KEY = 'catanalyst.audio';

// Deliberately modest: dice rolls and placements fire constantly, and a loud
// default is the fastest way to make a player mute the game permanently.
export const DEFAULT_SETTINGS = { muted: false, volume: 0.35 };

// Scales every note. Keeps peak output well below clipping once the volume
// slider is at 100% and two cues overlap.
const OUTPUT_TRIM = 0.28;

export function clampVolume(volume) {
  if (!Number.isFinite(volume)) return DEFAULT_SETTINGS.volume;
  return Math.min(1, Math.max(0, volume));
}

// Tolerant by design: a corrupt or hand-edited localStorage entry should fall
// back to defaults, never throw and never leave the game silent by accident.
export function parseSettings(raw) {
  if (typeof raw !== 'string' || raw === '') return { ...DEFAULT_SETTINGS };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_SETTINGS };
    return {
      muted: parsed.muted === true,
      volume: clampVolume(typeof parsed.volume === 'number' ? parsed.volume : DEFAULT_SETTINGS.volume),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function serializeSettings(settings) {
  return JSON.stringify({
    muted: settings.muted === true,
    volume: clampVolume(settings.volume),
  });
}

// --- Sound table -----------------------------------------------------------
//
// Each note: { freq, dur } plus optional
//   at    — start offset in seconds from the cue's start (default 0)
//   to    — frequency to glide to across the note (pitch sweep)
//   type  — oscillator waveform (default 'sine')
//   level — per-note gain multiplier (default 1)
//
// `gain` scales the whole cue, so related cues can be balanced against each
// other without rewriting every note.

export const SOUNDS = {
  // Three descending wooden clicks — dice tumbling, not a musical note.
  dice: {
    gain: 0.85,
    notes: [
      { freq: 260, to: 170, dur: 0.05, type: 'square', level: 0.5 },
      { freq: 230, to: 150, dur: 0.05, type: 'square', at: 0.055, level: 0.55 },
      { freq: 200, to: 120, dur: 0.07, type: 'square', at: 0.11, level: 0.6 },
      { freq: 320, to: 240, dur: 0.09, type: 'triangle', at: 0.18, level: 0.45 },
    ],
  },
  // Bright ascending arpeggio for income.
  resources: {
    gain: 0.7,
    notes: [
      { freq: 523.25, dur: 0.1 },
      { freq: 659.25, dur: 0.1, at: 0.07 },
      { freq: 783.99, dur: 0.16, at: 0.14 },
    ],
  },
  settlement: {
    gain: 0.8,
    notes: [
      { freq: 196, to: 147, dur: 0.11, type: 'triangle', level: 0.9 },
      { freq: 587.33, dur: 0.12, at: 0.05 },
    ],
  },
  // Shortest cue in the set: roads get placed in bursts of two or three.
  road: {
    gain: 0.6,
    notes: [
      { freq: 165, to: 120, dur: 0.07, type: 'square' },
      { freq: 440, dur: 0.06, at: 0.02, level: 0.5 },
    ],
  },
  // A settlement upgrade should sound like more than a settlement.
  city: {
    gain: 0.85,
    notes: [
      { freq: 174.61, to: 130, dur: 0.13, type: 'triangle', level: 0.9 },
      { freq: 523.25, dur: 0.11, at: 0.04 },
      { freq: 659.25, dur: 0.11, at: 0.11 },
      { freq: 783.99, dur: 0.18, at: 0.18 },
    ],
  },
  // Two notes swapping places, for a two-way exchange.
  trade: {
    gain: 0.65,
    notes: [
      { freq: 698.46, to: 523.25, dur: 0.1, type: 'triangle' },
      { freq: 523.25, to: 698.46, dur: 0.12, at: 0.09, type: 'triangle' },
    ],
  },
  // Dry paper-ish riffle for drawing off the deck.
  devBuy: {
    gain: 0.55,
    notes: [
      { freq: 900, to: 1150, dur: 0.05, type: 'triangle', level: 0.7 },
      { freq: 1150, to: 1400, dur: 0.06, at: 0.05, type: 'triangle', level: 0.55 },
    ],
  },
  devPlay: {
    gain: 0.7,
    notes: [
      { freq: 880, dur: 0.09, type: 'triangle' },
      { freq: 1174.66, dur: 0.09, at: 0.07, type: 'triangle' },
      { freq: 1567.98, dur: 0.14, at: 0.14, type: 'triangle', level: 0.7 },
    ],
  },
  // Low ominous slide for the robber arriving.
  robber: {
    gain: 0.8,
    notes: [
      { freq: 180, to: 75, dur: 0.32, type: 'sawtooth', level: 0.8 },
      { freq: 240, to: 110, dur: 0.28, at: 0.04, type: 'triangle', level: 0.5 },
    ],
  },
  // Descending pluck — something left your hand.
  steal: {
    gain: 0.75,
    notes: [
      { freq: 587.33, to: 261.63, dur: 0.18, type: 'triangle' },
      { freq: 146.83, dur: 0.14, at: 0.12, type: 'sine', level: 0.7 },
    ],
  },
  // Quiet on purpose: this one fires every single turn.
  turn: {
    gain: 0.45,
    notes: [
      { freq: 440, dur: 0.09 },
      { freq: 587.33, dur: 0.13, at: 0.08 },
    ],
  },
  win: {
    gain: 1,
    notes: [
      { freq: 523.25, dur: 0.15 },
      { freq: 659.25, dur: 0.15, at: 0.13 },
      { freq: 783.99, dur: 0.15, at: 0.26 },
      { freq: 1046.5, dur: 0.42, at: 0.39 },
      { freq: 1318.51, dur: 0.38, at: 0.45, level: 0.6 },
    ],
  },
};

// Every game event that has a cue. Exported so a test can assert the game
// never asks for a sound that does not exist.
export const SOUND_EVENTS = Object.keys(SOUNDS);

// --- Settings store --------------------------------------------------------

let settings = null;
const listeners = new Set();

function readStorage() {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return null; // private-mode / disabled storage: fall back to defaults
  }
}

function writeStorage(next) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, serializeSettings(next));
  } catch {
    // Non-fatal: settings just won't survive a reload.
  }
}

export function getAudioSettings() {
  if (!settings) settings = parseSettings(readStorage());
  return settings;
}

export function subscribeAudioSettings(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function updateSettings(patch) {
  const current = getAudioSettings();
  settings = {
    muted: patch.muted === undefined ? current.muted : patch.muted === true,
    volume: patch.volume === undefined ? current.volume : clampVolume(patch.volume),
  };
  writeStorage(settings);
  if (master && ctx) master.gain.setTargetAtTime(masterLevel(), ctx.currentTime, 0.01);
  listeners.forEach(listener => listener(settings));
  return settings;
}

export function setAudioMuted(muted) {
  return updateSettings({ muted });
}

// Nudging the slider off zero also unmutes — otherwise the slider looks broken.
export function setAudioVolume(volume) {
  const next = clampVolume(volume);
  return updateSettings({ volume: next, muted: next === 0 ? getAudioSettings().muted : false });
}

// --- Player ----------------------------------------------------------------

let ctx = null;
let master = null;

function masterLevel() {
  const { muted, volume } = getAudioSettings();
  return muted ? 0 : volume;
}

// Built on first playback rather than at import time: browsers only allow an
// AudioContext to start inside a user gesture, and every cue here follows a
// click, so the first real cue is also the first legal moment to create it.
function ensureContext() {
  const AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!ctx) {
    ctx = new AudioCtx();
    master = ctx.createGain();
    master.gain.value = masterLevel();
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function scheduleNote(audio, note, cueGain, startAt) {
  const osc = audio.createOscillator();
  const env = audio.createGain();
  const start = startAt + (note.at || 0);
  const end = start + note.dur;

  osc.type = note.type || 'sine';
  osc.frequency.setValueAtTime(note.freq, start);
  if (note.to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, note.to), end);

  // exponentialRamp can't touch zero, hence the tiny floor at both ends.
  const peak = Math.max(0.0002, cueGain * (note.level ?? 1) * OUTPUT_TRIM);
  const attack = Math.min(0.012, note.dur / 3);
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(peak, start + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, end);

  osc.connect(env);
  env.connect(master);
  osc.start(start);
  osc.stop(end + 0.02);
}

// Plays a named cue. Returns whether anything was scheduled, so callers (and
// tests) can tell "muted / unsupported" from "unknown sound name".
export function playSound(name) {
  const spec = SOUNDS[name];
  if (!spec) return false;
  if (masterLevel() === 0) return false;

  const audio = ensureContext();
  if (!audio) return false; // no Web Audio (very old browser): stay silent

  const startAt = audio.currentTime + 0.005;
  spec.notes.forEach(note => scheduleNote(audio, note, spec.gain ?? 1, startAt));
  return true;
}
