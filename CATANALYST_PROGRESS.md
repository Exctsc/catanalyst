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
- `hexPoints(cx, cy)` — returns SVG polygon point string for a pointy-top hex.
- `Token` component — renders the circular number token with pip dots (pip count = `6 - |7 - n|`; 6 and 8 in red).
- `PortLabel` component — rounded-rect label with coloured background.
- `HexBoard({ placements, onIntersectionClick })` — the exported component. Accepts:
  - `placements` — array of `{ intersectionIndex, colour }` drawn as coloured dots (r=7) on the board.
  - `onIntersectionClick(i)` — optional; if present, every vertex becomes `cursor:pointer` and fires with the vertex index on click.

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
- **`placeSettlement(gameState, playerIndex, intersectionIndex)`** — validates: correct turn, intersection unoccupied, no adjacent building (distance rule), sufficient resources outside setup. Returns updated state or an error string.
- **`placeRoad(gameState, playerIndex, edgeIndex)`** — validates: correct turn, edge within bounds, edge unoccupied, at least one endpoint in the player's network (settlements + cities + existing road endpoints). Deducts 1 brick + 1 wood outside setup. Returns updated state or error string.

*Note:* `HEX_TILES` and `HEX_NUMBERS` are duplicated here from `HexBoard.jsx` and kept in sync manually.

---

### `src/game/gameState.js`
Exports a single `initialGameState` object representing a fresh 4-player game.

| Field | Value |
|---|---|
| `players` | 4 players; Player 1 has 2 test settlements at intersections 0 and 12 |
| `currentPlayerIndex` | `0` |
| `phase` | `"setup"` |
| `dice` | `null` |
| `robberHex` | `9` (desert) |
| `bank` | all 5 resources at 19 |
| `devCardDeck` | 25 cards, Fisher-Yates shuffled at load (14 knight, 5 VP, 2 road building, 2 year of plenty, 2 monopoly) |
| `longestRoad` | `null` |
| `largestArmy` | `null` |
| `turn` | `1` |

Player 1 test settlements:
- Intersection **0** (−H/2, 25) — adjacent to hexes 0 (mountains #2), 1 (fields #3), 4 (hills #4). Produces ore on roll 2, wheat on roll 3, brick on roll 4.
- Intersection **12** (H, −50) — adjacent to hex 2 (forest #3) only. Produces wood on roll 3.

---

### `src/App.jsx`
Top-level UI. Holds `gameState` and `diceResult` in React state.

- Displays current player name, turn number, and phase.
- **Roll Dice** button — calls `rollDice()`, then `collectResources()` if not a 7. Shows result inline; displays "Robber!" in red on a 7.
- **End Turn** button — increments `currentPlayerIndex` mod 4, clears dice result and messages.
- Intersection click handler — in setup phase, calls `placeSettlement()`; shows inline error messages on failure.
- Resource table — all 4 players × 5 resources, updates live after every roll.
- Passes `placements` and `onIntersectionClick` down to `HexBoard`.

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

---

## Not Yet Built

- [ ] Road rendering on the board (roads tracked in state, not visualised)
- [ ] Road placement UI (no way to call `placeRoad` from the interface)
- [ ] City placement (upgrade a settlement to a city for double production)
- [ ] City visualisation on the board
- [ ] Robber mechanic (roll 7 shows text but doesn't move the robber or trigger discard)
- [ ] Dev card drawing, playing, and effects (deck is shuffled and stored; no UI exists)
- [ ] Victory point tracking (field exists, never updated)
- [ ] Win condition check (first to 10 VP wins)
- [ ] Longest Road award (tracked as `null`, never computed)
- [ ] Largest Army award (tracked as `null`, never computed)
- [ ] Setup phase structure (standard Catan: each player places 2 settlements + 2 roads in snake order; second settlement gives free resources from adjacent hexes)
- [ ] Phase transition from `"setup"` to `"play"` (game stays in setup indefinitely)
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

4. **Roll Dice works in setup phase.** There is no guard preventing a player from rolling dice (and collecting resources) while `phase === "setup"`. In standard Catan, dice are only rolled during the play phase.

5. **Unlimited settlements in setup.** There is no upper bound enforced on how many settlements a player can place during setup. Standard Catan allows exactly 2 per player.

6. **`socket.io-client` installed but unused.** It is listed as a production dependency in `package.json` (presumably from the project scaffold) but nothing imports it.

7. **Player index not validated in action functions.** `placeSettlement` and `placeRoad` do not check that `playerIndex` is a valid index into `gameState.players`, so an out-of-range value would produce a runtime error instead of a clean error string.
