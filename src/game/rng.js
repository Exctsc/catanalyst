// Seeded PRNG for every random event in a game. Counter-based mulberry32:
// the n-th draw for a seed is a pure function of (seed, n), so the generator
// is just `{ seed, n }` in game state and replays reproduce it exactly.

export function createRng(seed) {
  return { seed: seed >>> 0, n: 0 };
}

// Uniform [0, 1) and the advanced generator.
export function next(rng) {
  let t = (rng.seed + Math.imul(rng.n + 1, 0x6D2B79F5)) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, { seed: rng.seed, n: rng.n + 1 }];
}

// Integer in [0, k).
export function nextInt(rng, k) {
  const [v, r] = next(rng);
  return [Math.floor(v * k), r];
}

// Fisher-Yates over a copy; returns [shuffled, rng].
export function shuffle(rng, items) {
  const out = [...items];
  let r = rng;
  for (let i = out.length - 1; i > 0; i--) {
    let j;
    [j, r] = nextInt(r, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return [out, r];
}

// A fresh seed for a new game. The only non-deterministic call in the app,
// made once at the UI boundary; the result is stored in the game.
export function randomSeed() {
  return Math.floor(Math.random() * 4294967296) >>> 0;
}
