# Catanalyst: Progress Log

> Stack: React 19 + Vite 8, plain JavaScript (no TypeScript), no UI libraries, React is the only
> runtime dependency. `npm run dev` · `npm test` · `npm run build` · `npm run lint`.
>
> **State on 2026-11-08 (end of the finish run):** every item in `FINISH.md` Phases 1–3 is done.
> Phase 0's GitHub repo step is blocked (see `BLOCKERS.md`). `npm test`: 614 assertions, 0
> failures across 29 suites. Build and lint are clean. The full product was verified end to end
> in a real browser with drifting pointer clicks (see "Verification").

---

## What it is

A training tool for competitive Catan players: build any board, set up any position, control the
dice, and replay or branch any game. Hotseat (one screen) is the only play mode. Online
multiplayer, AI and chat are deliberately out of scope.

---

## Architecture

```
src/
  main.jsx, index.css        Vite entry
  App.jsx                    screen switcher (home / editor / game), game library, autosave, import/export, ?board= links
  game.css                   the whole dark theme: CSS variables + every g-* class
  components/
    Home.jsx                 new game (board + dice mode), saved games (resume/delete), board editor, import
    BoardEditor.jsx          per-hex terrain/number, per-port type, validation + free mode, share code, start
    DiceSetup.jsx            dice-mode picker used by Home and the editor
    GameScreen.jsx           the play screen + sandbox panel, replay panel, analysis tab, trade UI
    HexBoard.jsx             SVG board; renders only from gameRules geometry + gameState.board
    BoardViewport.jsx        zoom/pan frame around the board (CSS transform)
  game/                      pure, no React — all tested in Node
    gameRules.js             geometry: vertices, hexes, edges, adjacency, port slots, board extents, standard counts, DEFAULT_BOARD
    gameState.js             createGame(options) → initial state; default export is a fixed-seed game for tests
    gameActions.js           every rule as a pure (state, …) → state | error string
    engine.js                dispatch(state, action), replay, applyAction, newGame, turnStarts, branchGame
    rng.js                   counter-based seeded PRNG (mulberry32) + shuffle + randomSeed (the only Math.random)
    dice.js                  random / balanced / scripted dice, script parsing, setDiceQueue
    boardGen.js              random + balanced board generation, validateBoard, terrain/number/port vocabularies
    boardCode.js             28-char URL-safe board codes
    sandbox.js               position-editor edits as actions, and `resume`
    saveFile.js              export/import format, autosave library (de)serialisation
    analysis.js              pips, expected income, roll histogram, income breakdown
    viewport.js              zoom/pan maths
  audio/                     synthesized Web Audio cues + state-diff → cue mapping
tests/                       *.test.mjs suites (npm test runs each with node) + bot.mjs
netlify.toml                 build, publish dist, SPA redirect
```

### The engine (why replay, branching, autosave and export are cheap)

- **A game is `{ options, actions }`.** `options = { seed, board, diceMode, diceQueue }`.
  `createGame(options)` is pure, so the initial state is reproducible; every later change is a
  plain serialisable action run through `dispatch(state, action)`.
- **`dispatch`** maps `action.type` to the pure functions in `gameActions.js`, `dice.js` and
  `sandbox.js`. It returns the next state, the same state for a no-op (rolling twice), or an
  error string; it never throws on a malformed action. Action types: `roll`, `endTurn`,
  `placeSettlement`, `placeRoad`, `upgradeToCity`, `bankTrade`, `discard`, `moveRobber`, `steal`,
  `buyDevCard`, `playKnight`, `playRoadBuilding`, `skipRoadBuilding`, `playYearOfPlenty`,
  `playMonopoly`, `proposeTrade`, `acceptTrade`, `declineTrade`, `setDiceQueue`, `sandbox`.
- **All randomness is seeded.** `rng.js` is counter-based mulberry32: the n-th draw for a seed is
  a pure function of `(seed, n)`, and `state.rng = { seed, n }`. Dice, steals, the dev deck shuffle
  and random boards all draw from it. Only `randomSeed()` touches `Math.random`, once per new game
  at the UI boundary; `tests/engine.test.mjs` fails if any other game module does.
- **`applyAction(game, action)`** appends the action only if the state changed. The UI's `act()`
  takes one action or a list (applied in order before a single `setGame`, so a two-step click such
  as "apply dev cards + knights" can't lose an update).
- **`replay(options, actions)`** returns every intermediate state, or the first failing action.
  The replay viewer, the Analysis tab's history, imports and autosave loading all use it.
- **Determinism is tested by playing.** `tests/bot.mjs` is a deterministic scripted player that
  drives whole games through `dispatch` only. `engine.test` plays a full game to a winner twice
  and asserts the two action lists and final states are deep-equal, and that replaying the
  actions (also after a JSON round trip) rebuilds the identical state.

### Board data

The geometry (vertex/edge/hex positions and indices, port slot positions) lives only in
`gameRules.js`. The per-game layout lives only in `gameState.board = { tiles, numbers, ports }`.
HexBoard draws hex polygons from `HEX_TO_VERTICES` and centres from `HEX_CENTERS`; nothing
re-derives geometry. The robber starts on the desert (or off-board for a free-mode board with
none).

---

## Features

**Rules (base game, 4 players, hotseat)**
- Snake-order setup (1,2,3,4,4,3,2,1), one settlement + connected road per turn, second
  settlement grants starting resources.
- Roll-before-act: building, trading and ending the turn need a roll first; dev cards can be
  played before rolling.
- Production with city ×2, robber hex blocked, bank-capped.
- Robber: discard half (rounded down) over 7 cards, move to a different hex, steal one random card
  (seeded) from an adjacent opponent with cards.
- Placement rules: distance rule; play-phase settlements must touch the owner's road; roads must
  connect and **cannot extend through an opponent's settlement or city**; setup road must touch
  the settlement just placed.
- **Supply limits**: 5 settlements, 4 cities, 15 roads; upgrading returns the settlement piece.
- Bank trades at 4:1, 3:1 (generic port) or 2:1 (resource port).
- **Player-to-player trades**: the current player offers any counts to one opponent after rolling;
  the opponent accepts or declines on the same screen; the offerer can withdraw; both hands are
  re-validated at accept time; End Turn clears a pending offer; all logged.
- Development cards (25-card deck): Knight, Road Building, Year of Plenty, Monopoly, Victory Point
  (hidden, counted toward the owner's 10). One play per turn, not the turn it was bought.
- Largest Army (3+ knights, strictly more), Longest Road (5+, longest trail, broken by opponents'
  buildings), win at 10 VP; every action rejects after a win.
- **Player index validation** on every action ('Invalid player'), plus vertex/edge bounds.
- **Turn counter** = round number, shown as "Turn N" in the header.

**Training features**
- **Board generator**: random, or balanced (no adjacent 6/8, no adjacent equal numbers).
- **Board editor**: click a hex for terrain + number, click a port for its type; validation against
  standard counts with a free-mode toggle; start a game from it.
- **Board codes**: `1` + 27 base64url chars (7 bits per hex, 3 per port); `?board=<code>` opens it
  in the editor; Share section with code field, Copy link and Open link.
- **Dice modes** chosen at start: Random; Balanced (36-combination deck, reshuffled when fewer
  than 13 remain); Scripted (queue of totals or `a+b` pairs, editable mid-game from the sidebar,
  random once empty).
- **Sandbox** ("Edit position"): choose a player and a tool (settlement, city, road, robber,
  remove) and click the board; set any player's hand, dev cards and knights played; choose who is
  to move and whether they have rolled; "Done" resumes normal rules.
- **Replay viewer**: first / back / forward / last, a slider, "Jump to" any turn, "Play from here"
  branches into a new game (original kept), "Back to live game".
- **Save / load / export**: every game autosaves to `localStorage` (`catanalyst.games`, wrapped in
  try/catch); Home lists them with Resume / Delete; Export downloads `.json`; Import validates
  structure and replays every action, rejecting bad files with a specific message.
- **Analysis tab**: pip overlay on every open intersection; pips per resource per player; expected
  cards per roll; histogram of rolled totals against the 2d6 expectation (bars + expectation ticks
  + a numeric table); income breakdown (rolls, setup, trades, dev cards, stolen; robbed, discards,
  Monopoly). Follows the replay position when replaying.

**Shell**
- Home screen with the two-sentence pitch, new game options, saved games, editor, import.
- Zoom and pan: wheel / trackpad pinch / touch pinch, 0.5×–3×, pan limits keep 120px on screen,
  +/−/reset buttons. Drag vs click threshold 12px; pointer capture is taken only once a drag is
  confirmed (see the lesson below).
- Synthesized sound cues (no audio files) with mute + volume persisted in `localStorage`.
- Action log in the sidebar, coloured by player.

---

## Tests (`npm test`)

29 suites, 614 assertions. Original suites: `roads`, `setup`, `cities`, `trade`, `robber`, `win`,
`log`, `devcards`, `largestarmy`, `longestroad`, `turnlock`, `ports`, `viewport`, `sound`. Added in
the finish run: `board` (state-owned layout), `roadblock`, `connectivity`, `supply`,
`playerindex`, `turncounter`, `playertrade`, `engine` (rng, dispatch, full scripted game twice +
replay), `boardgen` (400 seeds; validation), `boardcode` (300 boards round-trip, malformed codes),
`dice` (balanced distribution over 3,600 rolls, scripted queue, mid-game edits replay), `sandbox`,
`replay` (stepping, jump-to-turn, branching), `savefile` (round trip, 13 malformed-file cases,
tolerant library parsing), `analysis`.

Fixture changes made because a rule changed (no assertion was weakened): play-phase settlement
fixtures in `win` and `longestroad` gained a road to the spot (connectivity rule); the city-win
fixture in `win` holds 3 cities + 3 settlements instead of 4 + 1 (4-city cap); `setup` reads tiles
from state instead of a duplicated constant.

---

## Verification (real browser, 2026-11-08)

Driven in the Claude desktop app's browser pane against `npm run dev` (and `npm run preview` for
the Netlify item). Every board click was a drag of 2–3px, never a zero-travel click.

- A full game from setup to a win on a **balanced board with Balanced dice**: Player 1 won at
  turn 7 with 3 cities, 1 settlement and 3 hidden VP cards (109 actions), including rolled 7s,
  discards, steals, a Knight, bank trades and player trades.
- Edited a board (number swap), took its code, reloaded from `?board=`: identical board.
- Sandbox: placed a settlement, road and city for two players, resumed, rolled normally.
- Exported the won game, imported it (identical win), replayed it, jumped to turn 4, stepped,
  branched from there and played on in the branch; both games kept in the list.
- A fresh tab's console had **no errors** through those flows.

### Bugs found and fixed during verification
- **The board shifted ~9px between setup steps.** The status chip ("Place a settlement" vs
  "Place a road") wrapped to two lines next to the new header buttons, changing the header's
  height and re-centring the board, so a click aimed at the previous position missed. The header
  is now one line at any status (chip truncates with an ellipsis, full text in `title`).
- `form_input` on a native `<select>` does update React state; an earlier "it didn't work" was a
  stale screenshot. Screenshots in the pane can lag one frame behind; read the DOM to confirm.

### Lesson kept from earlier: verify input with a press that moves
`BoardViewport` once called `setPointerCapture` on every `pointerdown`. While capture is held the
browser retargets `pointerup` (and the compatibility `mouseup`) to the frame, so `click` lands on
the frame and an intersection's own `onClick` never runs — every real click that moved a pixel
failed while zero-travel synthetic clicks passed. Capture is now taken only once a gesture crosses
`DRAG_THRESHOLD` (12px). The Node suite cannot see this class of bug; only real pointer input can.

---

## Known issues and limits

1. **Hotseat trust model.** One screen, one set of controls; the current player's hand and dev
   cards (including hidden VP cards) are visible to whoever is at the keyboard. Per-player hidden
   information would need per-client state, which is out of scope.
2. **Road Building "Skip" forfeits free roads** (forgiving simplification to avoid soft-locks).
3. **Discard requirement is computed at roll time**; a hand changing mid-discard (impossible via
   the UI, possible via sandbox edits during a pending discard) would leave it stale. Sandbox
   `resume` clears any pending robber step.
4. **Log and action history grow unbounded**; fine for a game, no trimming.
5. **Longest Road is an exact DFS**, exponential in the worst case; fine for ≤15 roads.
6. **Balanced boards use rejection sampling** (~3% of deals pass, ~35 tries); fine in practice.
7. **Autosave rewrites the whole library** on every change; fine for dozens of games.
8. **Zoom/pan isn't persisted and the board has no keyboard control** (buttons are focusable).
9. **Sound cues come from state diffs**, so bank and player trades play their cue explicitly.
10. **Copy link** depends on clipboard permission; when refused (e.g. some embedded browsers) the
    button stays as is, and the code field and Open link still work.
11. The game screen is desktop-first; narrow screens work but are cramped.

---

## Assumptions

**Finish run (2026-11-08)**
- **Turn counter = round number.** `turn` starts at 1 when play begins and advances each time play wraps back to Player 1; setup is not counted (the header shows "Setup" instead). The log marks each new round with `Turn N — …`.
- **Player trades** must have at least one card on each side (no gifts) and may not list the same resource on both sides. Either side can call off a pending offer.
- **Board editor free mode** still rejects shape errors (wrong hex/port count, unknown terrain or port type, a 7 token) but allows any counts, a numbered desert (it produces nothing) and a board with no desert (the robber then starts off-board).
- **`?board=<code>` opens the board in the Board Editor** (not straight into a game), so whoever receives a link can look it over and pick Start. A non-standard shared board opens with free mode already on; an invalid code lands on Home with an error.
- **Balanced dice** draw without replacement from the 36 two-dice combinations and reshuffle the full deck once fewer than 13 remain (the last 12 of each deal stay unseen). Colonist's extra per-player streak adjustments are not modelled.
- **Scripted dice**: a scripted total becomes a fixed pair (`max(1, t−6)` + rest, e.g. 9 → 3+6); an exact pair is typed `3+4`. The queue can be replaced at any time, and the edit is a recorded action so replays match.
- **Sandbox resume always lands in play phase** (setup counters are dropped), clears any pending robber / trade / Road Building step, sets each bank pile to 19 minus what the hands hold, and recomputes Largest Army, Longest Road, VP and the winner from scratch. A sandbox "has rolled" turn has no dice values; the tray shows "rolled". Sandbox placement ignores costs, placement rules and supply limits.
- **Sandbox dev cards** come out of the draw pile when it has that type; removed ones go to the bottom of the pile, so the next draw is unaffected.
- **Replay steps are actions, not turns.** "Jump to" lands on the first state of a turn. "Play from here" adds the branch as a new game and leaves the original as it was.
- **Autosave covers every game in the session** (branches and imports included). A reload lands on Home with the list rather than reopening a game, so `?board=` links still open the editor. A saved entry that no longer replays is dropped instead of breaking the rest.
- **Export/import format**: `{ format: 'catanalyst-game', version: 1, name, options: { seed, board, diceMode, diceQueue }, actions }`. Import fully replays the actions, so an illegal move is rejected with the failing action named.
- **Analysis numbers**: pip totals are structural (the robber is ignored), while "expected cards per roll" skips the robbed hex and ignores bank shortages. Income is attributed by the action that caused each hand change; spending on builds, cards given in trades and sandbox edits are not counted.
- **Native `<select>` dropdowns** were driven with the browser tool's form input during verification (the preview pane cannot drive a native select popup with clicks or keys). Board clicks always used real pointer travel.

**Earlier sessions (still current)**
- The dev deck is the standard 25 (14 Knight, 5 VP, 2 each Road Building / Year of Plenty / Monopoly).
- A Knight uses the robber flow at the move stage (no discard); its Largest Army recompute happens first, so an army-driven win skips the move. Hidden VP cards count toward the win the moment they are drawn.
- Longest Road's tie/handoff rule also strips a holder whose chain drops below 5.
- Buying a dev card is allowed before rolling (only building and trading are gated).
- Panning works from anywhere on the board; a press becomes a pan only past 12px of travel.
- Zoom is 0.5×–3×; initial/reset view is fit-to-frame. A win plays only the win fanfare.
