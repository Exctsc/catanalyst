# Catanalyst — Progress Log

> Stack: React 19 + Vite 8, plain JS (no TypeScript), no extra UI packages.  
> Run with `npm run dev`.

---

## Files Created

### `src/components/HexBoard.jsx`
SVG board renderer. All board constants are local to this file.

- **TILES** — 19 resource strings in 3-4-5-4-3 reading order (index 9 = desert).
- **NUMBERS** — 19 number tokens (`null` for desert), matching standard Catan distribution (2,3,3,4,4,5,5,6,6,–,8,8,9,9,10,10,11,11,12).
- **VERTICES** (IIFE) — 54 unique intersection points computed by walking every hex corner in row-major order and deduplicating by rounded coordinate. Indices 0–53 are the canonical intersection indices used everywhere else.
- **PORTS** — 9 hardcoded `{x, y, label, fill, text}` objects placed around the board edge.
- Imports **EDGES** from `gameRules.js` for road rendering (edge indices shared with `placeRoad`).
- `hexPoints(cx, cy)` — returns SVG polygon point string for a pointy-top hex.
- `Token` component — renders the circular number token with pip dots (pip count = `6 - |7 - n|`; 6 and 8 in red).
- `PortLabel` component — rounded-rect label with coloured background.
- `edgeEndpoints(edgeIndex, shrink)` — edge line coordinates shrunk toward the midpoint so roads don't cover intersection dots.
- `RoadSlot` component — translucent white clickable line on an empty edge; brightens on hover.
- `Road` component — thick player-coloured line with a dark outline for a placed road.
- `RobberMarker` component — dark circle with a white "R", drawn above the number token on the robber's hex (`pointerEvents: none` so it never blocks hex clicks).
- `HexBoard({ placements, roads, cities, robberHex, onIntersectionClick, onEdgeClick, onHexClick })` — the exported component. Accepts:
  - `placements` — array of `{ intersectionIndex, colour }` drawn as coloured dots (r=7) on the board.
  - `roads` — array of `{ edgeIndex, colour }` drawn as coloured road lines.
  - `cities` — array of `{ intersectionIndex, colour }` drawn as 16×16 coloured squares (visually distinct from settlement dots).
  - `robberHex` — hex index to draw the `RobberMarker` on.
  - `onIntersectionClick(i)` — optional; if present, every vertex becomes `cursor:pointer` and fires with the vertex index on click.
  - `onEdgeClick(e)` — optional; if present, empty edges render as clickable `RoadSlot`s and fire with the edge index on click.
  - `onHexClick(h)` — optional; if present, each hex group (tile + token) becomes clickable and fires with the hex index. Only passed by `App` while the robber is waiting to be moved.

---

### `src/game/gameRules.js`
Pure data module — no React, no side effects. Exports the board graph.

- **VERTICES** — 54 `{x, y}` positions, identical ordering to `HexBoard.jsx`.
- **HEX_CENTERS** — 19 `{cx, cy}` hex centres in tile-index order.
- **VERTEX_TO_HEXES** — `VERTEX_TO_HEXES[v]` is the array of hex indices (1–3) whose corner is vertex `v`. Used by `collectResources`.
- **VERTEX_ADJACENCY** — `VERTEX_ADJACENCY[v]` lists the 2–3 vertex indices that share a hex edge with `v`. Used by the distance rule in `placeSettlement`.
- **HEX_TO_VERTICES** — `HEX_TO_VERTICES[h]` is the 6 vertex indices at the corners of hex `h`. Used to find steal candidates when the robber moves.
- **EDGES** — 72 unique `[v1, v2]` pairs. Array index = `edgeIndex` used in road placement.

All structures are derived from the same traversal algorithm as `HexBoard.jsx`, so indices are always in sync.

---

### `src/game/gameActions.js`
Pure functions; each returns a new game state or an error string. Imports graph data from `gameRules.js`.

- **`rollDice()`** — returns `{ die1, die2, total, isRobber }`.
- **`collectResources(gameState, diceTotal)`** — for each player × building, looks up adjacent hexes via `VERTEX_TO_HEXES`, awards 1 resource per matching-number hex for settlements, 2 for cities. Hexes occupied by the robber (`gameState.robberHex`) produce nothing. Deducts from bank with `Math.min` guard. No-op on 7.
- **`placeSettlement(gameState, playerIndex, intersectionIndex)`** — validates: correct turn, intersection unoccupied, no adjacent building (distance rule), sufficient resources outside setup. During setup, also enforces the 2-settlement limit and settlement-then-road ordering; the second setup settlement grants 1 resource per adjacent producing hex (bank-capped). Returns updated state or an error string.
- **`placeRoad(gameState, playerIndex, edgeIndex)`** — validates: correct turn, edge within bounds, edge unoccupied, at least one endpoint in the player's network (settlements + cities + existing road endpoints). Deducts 1 brick + 1 wood outside setup. During setup, the road must touch the settlement just placed; placing it completes the setup turn and advances the snake order (or transitions to `phase: 'play'` with player 1 after all 8 turns). Returns updated state or error string.
- **`upgradeToCity(gameState, playerIndex, intersectionIndex)`** — validates: correct turn, not setup phase, the player has a settlement at that intersection, 2 wheat + 3 ore available. Moves the settlement into `cities`, deducts resources to the bank. Returns updated state or error string.
- **`bankTrade(gameState, playerIndex, give, receive)`** — 4:1 trade with the bank. Validates: correct turn, play phase, two different known resources, player holds ≥4 of `give`, bank holds ≥1 of `receive`. Usable any time on the player's turn (before or after rolling).
- **`startRobber(gameState)`** — called when a 7 is rolled. Players holding >7 cards enter `robber: { stage: 'discard', pending, required }` (required = `floor(total/2)`, computed at roll time); otherwise straight to `{ stage: 'move' }`.
- **`discardCards(gameState, playerIndex, discards)`** — validates the player is pending, holds the named cards, and the discard totals exactly their required count; returns cards to the bank. Last pending discard advances to `{ stage: 'move' }`.
- **`moveRobber(gameState, playerIndex, hexIndex)`** — current player only, `stage: 'move'` only, must pick a *different* hex. Sets `robberHex`; if any opponent with ≥1 card has a settlement/city on that hex, advances to `{ stage: 'steal', candidates }`, otherwise resolution completes (`robber: null`).
- **`stealResource(gameState, playerIndex, victimIndex)`** — takes 1 uniformly-random card from a candidate victim and completes resolution. Opponents with zero cards never appear as candidates, so "no cards → no steal" holds.
- `updateVictory(gameState, playerIndex)` (internal) — recomputes that player's `victoryPoints` (1 per settlement, 2 per city) and sets `winner` at ≥10. Called at the end of `placeSettlement` and `upgradeToCity`.
- `setupPlayerFor(turnIndex)` (internal) — maps setup turn 0–7 to the snake order 1,2,3,4,4,3,2,1.

Guards: all placement/trade actions return `'Game is over'` once `winner` is set, and `'Resolve the robber first'` while `robber` is non-null.

*Note:* `HEX_TILES` and `HEX_NUMBERS` are duplicated here from `HexBoard.jsx` and kept in sync manually.

---

### `src/game/gameState.js`
Exports a single `initialGameState` object representing a fresh 4-player game.

| Field | Value |
|---|---|
| `players` | 4 players, all starting empty (test settlements removed — the setup phase now places real ones) |
| `currentPlayerIndex` | `0` |
| `phase` | `"setup"` |
| `setup` | `{ turnIndex: 0, settlementsPlaced: [0,0,0,0], roadsPlaced: [0,0,0,0], expecting: 'settlement', lastSettlementIndex: null }` — set to `null` when setup completes |
| `dice` | `null` — holds the `rollDice()` result for the current turn once rolled; cleared by End Turn (this is the once-per-turn roll lock) |
| `robberHex` | `9` (desert) |
| `robber` | `null` — non-null while a rolled 7 is being resolved: `{ stage: 'discard', pending, required }` → `{ stage: 'move' }` → `{ stage: 'steal', candidates }` → `null` |
| `bank` | all 5 resources at 19 |
| `devCardDeck` | 25 cards, Fisher-Yates shuffled at load (14 knight, 5 VP, 2 road building, 2 year of plenty, 2 monopoly) |
| `longestRoad` | `null` |
| `largestArmy` | `null` |
| `winner` | `null` — set to the winning player's index at 10 VP; every action rejects once set |
| `turn` | `1` |

---

### `src/App.jsx`
Top-level UI. Holds `gameState`, `message`, and the two trade selects in React state (the dice result lives in `gameState.dice`, not local state).

- Displays current player name, turn number, and phase; during setup also shows what the current player must place ("place a settlement" / "place a road").
- **Roll Dice** button — the entire roll happens inside one functional `setGameState` that no-ops if `phase !== 'play'`, dice are already set, or the game is won — so rapid clicking cannot roll or collect twice. On a 7 it calls `startRobber()`; otherwise `collectResources()`. Disabled during setup, after rolling, and after a win.
- **End Turn** button — advances `currentPlayerIndex` and clears `dice`, also guarded inside the functional update (no-op during setup/robber resolution/after a win, in addition to being disabled).
- **Bank trade (4:1) row** — give/receive selects + Trade button calling `bankTrade()`; hidden during setup.
- **Robber UI** (rendered by `gameState.robber.stage`): `DiscardPanel` (per-resource number inputs; confirm enabled only at the exact required count; keyed per player so inputs reset between discarders) → "click a hex to move the robber" hint with `onHexClick` passed to the board → steal buttons, one per candidate opponent.
- **Winner banner** — "🏆 Player X wins!" in the winner's colour, shown once `gameState.winner` is set.
- Intersection click handler — in setup phase calls `placeSettlement()`; in play phase, clicking the current player's own settlement calls `upgradeToCity()`, any other intersection attempts `placeSettlement()`. Inline error messages on failure.
- Edge click handler — calls `placeRoad()` in both phases; inline error messages on failure.
- Resource table — all 4 players × 5 resources + a live VP column.
- Passes `placements`, `roads`, `cities`, `robberHex`, `onIntersectionClick`, `onEdgeClick`, and (during the move stage) `onHexClick` down to `HexBoard`.

---

### `tests/`
Node test suites over the pure game modules (`npm test` runs them all; each exits non-zero on failure): `roads`, `setup`, `cities`, `trade`, `robber`, `win` — 136 assertions total.

---

## Features Working

- [x] Full 19-hex board rendered in correct 3-4-5-4-3 honeycomb layout
- [x] All 6 resource types coloured correctly (hills/brick, forest/wood, mountains/ore, fields/wheat, pasture/sheep, desert)
- [x] Number tokens on all non-desert hexes with correct Catan distribution
- [x] Pip dots on tokens (count = `6 − |7 − n|`); 6 and 8 in red
- [x] 9 port labels around the board edge (4 × 3:1, 1 each of 2:1 brick/wood/ore/wheat/sheep)
- [x] 54 intersection dots rendered at correct vertex positions
- [x] Settlement placement via intersection click (setup phase only), with distance rule and occupation validation enforced
- [x] Settlements displayed as coloured circles in the placing player's colour
- [x] Dice rolling (two d6, sum, robber detection on 7)
- [x] Resource collection: settlements on adjacent hexes produce the matching resource; cities produce 2; bank capped
- [x] Resource table (all 4 players, all 5 resources) updates live after each roll
- [x] End Turn cycles through all 4 players
- [x] `placeRoad()` logic fully implemented and validated in `gameActions.js`
- [x] Full board graph in `gameRules.js`: 54 vertices, 72 edges, adjacency lists, hex-to-vertex mapping
- [x] Road placement UI: clickable/hoverable edge slots, roads rendered as player-coloured lines, connectivity + cost enforced
- [x] Setup phase: snake order (1,2,3,4,4,3,2,1), exactly 1 settlement + 1 connected road per setup turn, 2 of each per player, auto-advance
- [x] Second setup settlement grants starting resources from adjacent hexes (first grants nothing)
- [x] Phase transition from `"setup"` to `"play"` after all 8 setup turns, starting with player 1
- [x] Roll Dice / End Turn disabled during setup
- [x] City upgrades: click your own settlement in play phase, costs 2 wheat + 3 ore, graceful failure if short
- [x] Cities rendered as coloured squares (settlements remain circles); cities produce 2 on matching rolls
- [x] Once-per-turn dice lock: roll stored in `gameState.dice`, atomic against rapid clicking, cleared on End Turn
- [x] Bank trading 4:1, any time on your turn in play phase, graceful failure
- [x] Robber: discard-half (rounded down) for every player over 7 cards, prompted individually with exact-count enforcement
- [x] Robber: current player moves it to a different hex by clicking the board; marker rendered; robbed hex produces nothing
- [x] Robber: steal 1 random card from a chosen adjacent opponent (cardless opponents excluded; none adjacent → no steal)
- [x] Victory points (1/settlement, 2/city) tracked live in the table
- [x] Win at 10 VP: banner in winner's colour, all rolls/trades/placements locked out
- [x] Node test suites in `tests/` (`npm test`): 136 assertions across roads/setup/cities/trade/robber/win

---

## Not Yet Built

- [ ] Dev card drawing, playing, and effects (deck is shuffled and stored; no UI exists)
- [ ] Longest Road award (tracked as `null`, never computed; no VP source beyond settlements/cities yet)
- [ ] Largest Army award (tracked as `null`, never computed)
- [ ] Turn counter incrementing (`turn` field always stays at 1)
- [ ] Port trades (2:1/3:1 port labels are rendered but confer no trading benefit) and player-to-player trades

---

## Known Bugs

1. **Tile data duplicated across files.** `TILES`/`NUMBERS` in `HexBoard.jsx` and `HEX_TILES`/`HEX_NUMBERS` in `gameActions.js` are manually kept in sync. A change to the board layout in one place will silently break resource collection.

2. **VERTICES computed twice independently.** `HexBoard.jsx` runs its own IIFE; `gameRules.js` runs an equivalent traversal. They produce identical output today, but diverge if one file's rounding constant or traversal order is edited without updating the other.

3. **`placeRoad` road-blocking rule missing.** In standard Catan an opponent's settlement severs road connectivity — a road cannot be extended through it. `placeRoad` only checks that one endpoint is in the player's network and does not check for blocking settlements.

4. **`socket.io-client` installed but unused.** It is listed as a production dependency in `package.json` (presumably from the project scaffold) but nothing imports it.

5. **Player index not validated in action functions.** `placeSettlement`, `placeRoad`, and `upgradeToCity` do not check that `playerIndex` is a valid index into `gameState.players`, so an out-of-range value would produce a runtime error instead of a clean error string.

6. **Play-phase settlements skip the road-connectivity rule.** Outside setup, `placeSettlement` checks resources and the distance rule but not that the intersection touches one of the player's roads (standard Catan requires it).

7. **Hotseat trust model.** All four players share one screen and one set of controls; "only the current player can act" means the shared buttons act *as* the current player. Turn/robber/winner enforcement lives in the pure actions, but nothing stops a player at the keyboard from acting on another's turn — real per-player enforcement needs the Socket.io backend.

8. **Discard requirement is bank-agnostic in one edge case.** `discardCards` adds discarded cards back to the bank without a cap (fine — bank totals are conserved), but `startRobber` computes `required` once at roll time; if a player's hand somehow changed mid-discard-stage (not currently possible through the UI), the stored requirement would be stale.

*Fixed since last update:* unlimited dice rolls per turn / roll-again after collecting (dice now locked in `gameState.dice`, atomic against rapid clicks), `gameState.dice` never written, End Turn racing past game-over or robber resolution (guarded inside the state updater, not just the disabled attribute).

*Assumptions made this session:* robber resolution is modelled as a `gameState.robber` state machine (discard → move → steal) mirroring the `setup` object pattern; discards are prompted one player at a time in player-index order on the shared screen; the win check runs only after settlement placement and city upgrade (the only point sources in scope); test suites moved from the session scratchpad into a permanent `tests/` directory wired to `npm test`.
