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
- `HexBoard({ placements, roads, cities, onIntersectionClick, onEdgeClick })` — the exported component. Accepts:
  - `placements` — array of `{ intersectionIndex, colour }` drawn as coloured dots (r=7) on the board.
  - `roads` — array of `{ edgeIndex, colour }` drawn as coloured road lines.
  - `cities` — array of `{ intersectionIndex, colour }` drawn as 16×16 coloured squares (visually distinct from settlement dots).
  - `onIntersectionClick(i)` — optional; if present, every vertex becomes `cursor:pointer` and fires with the vertex index on click.
  - `onEdgeClick(e)` — optional; if present, empty edges render as clickable `RoadSlot`s and fire with the edge index on click.

---

### `src/game/gameRules.js`
Pure data module — no React, no side effects. Exports the board graph.

- **VERTICES** — 54 `{x, y}` positions, identical ordering to `HexBoard.jsx`.
- **HEX_CENTERS** — 19 `{cx, cy}` hex centres in tile-index order.
- **VERTEX_TO_HEXES** — `VERTEX_TO_HEXES[v]` is the array of hex indices (1–3) whose corner is vertex `v`. Used by `collectResources`.
- **VERTEX_ADJACENCY** — `VERTEX_ADJACENCY[v]` lists the 2–3 vertex indices that share a hex edge with `v`. Used by the distance rule in `placeSettlement`.
- **EDGES** — 72 unique `[v1, v2]` pairs. Array index = `edgeIndex` used in road placement.

All four structures are derived from the same traversal algorithm as `HexBoard.jsx`, so indices are always in sync.

---

### `src/game/gameActions.js`
Pure functions; each returns a new game state or an error string. Imports graph data from `gameRules.js`.

- **`rollDice()`** — returns `{ die1, die2, total, isRobber }`.
- **`collectResources(gameState, diceTotal)`** — for each player × settlement, looks up adjacent hexes via `VERTEX_TO_HEXES`, awards 1 resource per matching-number hex (2 if a city occupies the same intersection). Deducts from bank with `Math.min` guard. No-op on 7.
- **`placeSettlement(gameState, playerIndex, intersectionIndex)`** — validates: correct turn, intersection unoccupied, no adjacent building (distance rule), sufficient resources outside setup. During setup, also enforces the 2-settlement limit and settlement-then-road ordering; the second setup settlement grants 1 resource per adjacent producing hex (bank-capped). Returns updated state or an error string.
- **`placeRoad(gameState, playerIndex, edgeIndex)`** — validates: correct turn, edge within bounds, edge unoccupied, at least one endpoint in the player's network (settlements + cities + existing road endpoints). Deducts 1 brick + 1 wood outside setup. During setup, the road must touch the settlement just placed; placing it completes the setup turn and advances the snake order (or transitions to `phase: 'play'` with player 1 after all 8 turns). Returns updated state or error string.
- **`upgradeToCity(gameState, playerIndex, intersectionIndex)`** — validates: correct turn, not setup phase, the player has a settlement at that intersection, 2 wheat + 3 ore available. Moves the settlement into `cities`, deducts resources to the bank. Returns updated state or error string.
- `setupPlayerFor(turnIndex)` (internal) — maps setup turn 0–7 to the snake order 1,2,3,4,4,3,2,1.

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
| `dice` | `null` |
| `robberHex` | `9` (desert) |
| `bank` | all 5 resources at 19 |
| `devCardDeck` | 25 cards, Fisher-Yates shuffled at load (14 knight, 5 VP, 2 road building, 2 year of plenty, 2 monopoly) |
| `longestRoad` | `null` |
| `largestArmy` | `null` |
| `turn` | `1` |

---

### `src/App.jsx`
Top-level UI. Holds `gameState` and `diceResult` in React state.

- Displays current player name, turn number, and phase; during setup also shows what the current player must place ("place a settlement" / "place a road").
- **Roll Dice** button — calls `rollDice()`, then `collectResources()` if not a 7. Shows result inline; displays "Robber!" in red on a 7. Disabled during setup.
- **End Turn** button — increments `currentPlayerIndex` mod 4, clears dice result and messages. Disabled during setup (setup advances automatically after each road).
- Intersection click handler — in setup phase calls `placeSettlement()`; in play phase, clicking the current player's own settlement calls `upgradeToCity()`, any other intersection attempts `placeSettlement()`. Inline error messages on failure.
- Edge click handler — calls `placeRoad()` in both phases; inline error messages on failure.
- Resource table — all 4 players × 5 resources, updates live after every roll.
- Passes `placements`, `roads`, `cities`, `onIntersectionClick`, and `onEdgeClick` down to `HexBoard`.

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

---

## Not Yet Built

- [ ] Robber mechanic (roll 7 shows text but doesn't move the robber or trigger discard)
- [ ] Dev card drawing, playing, and effects (deck is shuffled and stored; no UI exists)
- [ ] Victory point tracking (field exists, never updated — settlements/cities/awards don't add VP yet)
- [ ] Win condition check (first to 10 VP wins)
- [ ] Longest Road award (tracked as `null`, never computed)
- [ ] Largest Army award (tracked as `null`, never computed)
- [ ] Turn counter incrementing (`turn` field always stays at 1)
- [ ] `gameState.dice` field is never written (dice result lives only in local React state)
- [ ] Trading (bank trades, port trades, player-to-player trades)
- [ ] Stealing (robber move should allow stealing a random resource from a neighbour)
- [ ] Discard rule on 7 (players with >7 cards must discard half)

---

## Known Bugs

1. **Tile data duplicated across files.** `TILES`/`NUMBERS` in `HexBoard.jsx` and `HEX_TILES`/`HEX_NUMBERS` in `gameActions.js` are manually kept in sync. A change to the board layout in one place will silently break resource collection.

2. **VERTICES computed twice independently.** `HexBoard.jsx` runs its own IIFE; `gameRules.js` runs an equivalent traversal. They produce identical output today, but diverge if one file's rounding constant or traversal order is edited without updating the other.

3. **`placeRoad` road-blocking rule missing.** In standard Catan an opponent's settlement severs road connectivity — a road cannot be extended through it. `placeRoad` only checks that one endpoint is in the player's network and does not check for blocking settlements.

4. **`socket.io-client` installed but unused.** It is listed as a production dependency in `package.json` (presumably from the project scaffold) but nothing imports it.

5. **Player index not validated in action functions.** `placeSettlement`, `placeRoad`, and `upgradeToCity` do not check that `playerIndex` is a valid index into `gameState.players`, so an out-of-range value would produce a runtime error instead of a clean error string.

6. **Play-phase settlements skip the road-connectivity rule.** Outside setup, `placeSettlement` checks resources and the distance rule but not that the intersection touches one of the player's roads (standard Catan requires it).

*Fixed since last update:* Roll Dice in setup (buttons now disabled), unlimited setup settlements (2-per-player limit enforced).
