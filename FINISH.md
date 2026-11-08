# Catanalyst: Definition of Done

This file is the finish line. The autonomous run works through it top to bottom.
Check a box only when its acceptance criteria hold AND `npm test`, `npm run build`
and `npm run lint` all pass. Commit after every checked box.

## Product in one line

A training tool for competitive Catan players: build any board, set up any position,
control the dice, and replay or branch any game. Hotseat (one screen) is the play mode.
Real-time online multiplayer is deliberately out of scope (Colonist already does it).

## Out of scope (do not build)

- Socket.io, any backend server, accounts, online multiplayer, chat
- AI opponents or a move-suggestion engine
- Mobile-first layout (desktop-first is fine; narrow screens must not crash)
- Cosmetic redesign of the existing game screen. New UI matches `src/game.css`.

---

## Phase 0: Housekeeping

- [x] Untrack tooling files: `git rm --cached` `.claude/settings.local.json`, `.claude/.headroom_wrap_marker.json`, `.serena/project.yml` (they are now in `.gitignore`). Commit.
- [ ] If `gh auth status` succeeds, create a **private** GitHub repo named `catanalyst` and push `main`, then push after every later commit. If `gh` is not installed or not authenticated, skip this item, note it in `BLOCKERS.md`, and continue.
- [x] Remove `socket.io-client` from dependencies and delete the Chat tab, `chatMessages` state and the Socket.io TODO. The sidebar keeps the Game Log.

## Phase 1: Rules complete

- [x] **Single source of board data.** Board layout (tile resources, number tokens, port types and positions) lives in game state, not module constants. Remove the duplicated `TILES`/`NUMBERS` and the duplicated vertex traversal (known bugs #1 and #2): `HexBoard.jsx` renders from `gameRules.js` geometry and from `gameState.board`. All existing tests still pass after updating fixtures.
- [x] **Road blocking** (known bug #3): a road cannot extend from a vertex occupied by an opponent's settlement or city. Tests cover the blocked and own-building cases.
- [x] **Settlement connectivity** (known bug #6): outside setup, a settlement must touch one of the player's roads. Tested.
- [x] **Building supply limits**: 5 settlements, 4 cities, 15 roads per player; upgrading a city returns the settlement piece. Clear error strings. Tested.
- [x] **Player index validation** (known bug #5) on every action. Tested.
- [x] **Turn counter** increments correctly (one full rotation of players = one round; display "Turn N"). Tested.
- [x] **Player-to-player trading (hotseat)**: current player builds an offer (give / get, any counts) to one opponent; the opponent accepts or declines on the same screen. Validates both hands, only after rolling, logged. Tested.

## Phase 2: Training features (the reason this product exists)

Architecture first, because replay depends on it:

- [x] **Deterministic, action-sourced engine.** Every state change goes through one `dispatch(state, action)` reducer over the existing pure action functions. All randomness (dice, steals, dev deck shuffle, random board) comes from a seeded PRNG whose seed and position live in game state. Replaying the same initial state + action list reproduces the identical game. A test plays a full scripted game twice and asserts the states are deep-equal.

Then the features:

- [x] **Board generator**: standard random board, with a "balanced" option (no two 6/8 tokens adjacent, no two identical number tokens adjacent). Tested over many seeds.
- [x] **Board editor**: click a hex to set its resource, set its number token, set each port's type. Validate against standard counts (with a "free mode" toggle to skip validation). Start a game from the edited board.
- [x] **Shareable board codes**: encode a board as a short URL-safe string; `?board=<code>` loads it. Round-trip tested.
- [x] **Dice modes** chosen at game start: Random, Balanced (36-combination deck, reshuffled when it runs low, like Colonist's balanced dice), and Scripted (a queue of totals or die pairs typed in advance, editable mid-game; falls back to Random when empty). Tested.
- [x] **Sandbox / position setup**: from any state, enter an edit mode to place or remove settlements, cities and roads for any player (ignoring costs and rules), set each player's hand and dev cards, move the robber, and choose whose turn it is and whether they have rolled. Exiting edit mode resumes normal rules from that position.
- [x] **Replay viewer**: step back / forward through any game's actions, jump to a turn, and "play from here" to branch a new game at that point (the original is kept).
- [x] **Save, load, export**: autosave the current game to `localStorage` (reads/writes wrapped in try/catch). Export and import a game (board + actions + seed) as a `.json` file. Import validates and rejects malformed files with a clear message.
- [x] **Analysis panel** (sidebar tab):
  - Setup overlay toggle: pip value shown at every open intersection, plus each player's total pips per resource.
  - Expected vs actual: each player's expected resources per roll from current buildings, and a histogram of rolled totals against the 2d6 expectation.
  - Per-player income breakdown: gained from rolls, trades, dev cards; lost to robber and discards.
  The numbers come from pure functions with tests.

## Phase 3: Ship it

- [x] **Home screen**: New Game (random or balanced board, dice mode), Board Editor, Load / Import, plus a two-sentence explanation of who Catanalyst is for.
- [x] **README.md** replaced with a real product README: what it is, who it's for, the problem (casual platforms have no training tools), feature list with a screenshot or GIF path placeholder, how to run locally, tech overview, and a "What I cut and why" section (online multiplayer, AI) with a `<!-- TONY: personal intro here -->` marker for Tony's own words.
- [x] **Netlify config**: `netlify.toml` with `npm run build`, publish `dist`, and an SPA redirect so `?board=` links work. `npm run build && npm run preview` serves a working app.
- [ ] **Final verification in a real browser** (desktop app preview or Chrome): play a full game from setup to a win on a balanced board with Balanced dice; edit a board, share its code, reload from the link; set up a sandbox position; export, import and replay a game, then branch from mid-game. Use clicks that move a few pixels, not zero-travel synthetic clicks (see the pointer-capture lesson in `CATANALYST_PROGRESS.md`). No console errors.
- [ ] `CATANALYST_PROGRESS.md` regenerated to reflect the finished product. `BLOCKERS.md` lists anything left for Tony.

## Human steps after the run (Tony)

1. Play it for an hour on a trackpad.
2. Connect the repo to Netlify, make the GitHub repo public.
3. Fill in the README intro, record a 60 to 90 second demo.
4. Get 5 to 10 competitive players to try it and collect quotes.
