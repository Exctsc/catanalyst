# Catanalyst — Progress Log

> Stack: React 19 + Vite 8, plain JS (no TypeScript), no extra UI packages.  
> Run with `npm run dev`.  
> **Verified 2026-08-05:** `npm test` green — 352 assertions, 0 failures across 14 suites, and `npm run build` clean. Every constant, export, and known-bug claim below re-checked against the source; all still accurate. Ports, roll-lock, zoom/pan, and audio are committed as `d5a2b5b`; the vertex/road hit-target enlargement as `b842e32`. The pointer-capture fix that actually made settlements placeable (`BoardViewport.jsx`, `viewport.js`, `tests/viewport.test.mjs`) is uncommitted.

---

## Files Created

### `src/components/HexBoard.jsx`
SVG board renderer. All board constants are local to this file.

- **TILES** — 19 resource strings in 3-4-5-4-3 reading order (index 9 = desert).
- **NUMBERS** — 19 number tokens (`null` for desert), matching standard Catan distribution (2,3,3,4,4,5,5,6,6,–,8,8,9,9,10,10,11,11,12).
- **VERTICES** (IIFE) — 54 unique intersection points computed by walking every hex corner in row-major order and deduplicating by rounded coordinate. Indices 0–53 are the canonical intersection indices used everywhere else.
- Imports **EDGES** and **PORTS** from `gameRules.js` (edge indices shared with `placeRoad`; ports now real data, not placeholders).
- `hexPoints(cx, cy)` — returns SVG polygon point string for a pointy-top hex.
- `Token` component — renders the circular number token with pip dots (pip count = `6 - |7 - n|`; 6 and 8 in red).
- `PORT_STYLE` / `portLabel(type)` — map a port's `type` ('generic' or a resource) to its fill/text colours and label ("3:1" or "2:1 Ore").
- `Port` component — draws the harbour label at the dock position plus two dashed dock lines to the port's real coastal intersection vertices.
- **HIT_RADIUS (16) / HIT_STROKE (18)** — click-target sizes, deliberately much larger than the drawn shapes. What the browser hit-tests is decoupled from what it draws (see the hit-target fix below).
- `edgeEndpoints(edgeIndex, shrink)` — edge line coordinates shrunk toward the midpoint so roads don't cover intersection dots.
- `RoadSlot` component — translucent white clickable line on an empty edge; brightens on hover. The click handler lives on a wrapping `<g>` containing two coincident lines: the visible one (strokeWidth 6, 8 on hover) and a `stroke="transparent"` line at `HIT_STROKE` that only exists to be hit.
- `Road` component — thick player-coloured line with a dark outline for a placed road.
- `RobberMarker` component — dark circle with a white "R", drawn above the number token on the robber's hex (`pointerEvents: none` so it never blocks hex clicks).
- `HexBoard({ placements, roads, cities, robberHex, onIntersectionClick, onEdgeClick, onHexClick })` — the exported component. Accepts:
  - `placements` — array of `{ intersectionIndex, colour }` drawn as coloured dots (r=7) on the board.
  - `roads` — array of `{ edgeIndex, colour }` drawn as coloured road lines.
  - `cities` — array of `{ intersectionIndex, colour }` drawn as 16×16 coloured squares (visually distinct from settlement dots).
  - `robberHex` — hex index to draw the `RobberMarker` on.
  - `onIntersectionClick(i)` — optional; if present, a separate pass of 54 invisible `r=16` circles is rendered **after** every other element (so it sits on top of the road slots) and fires with the vertex index on click. The visible dot/city square carries no handler of its own.
  - `onEdgeClick(e)` — optional; if present, empty edges render as clickable `RoadSlot`s and fire with the edge index on click.
  - `onHexClick(h)` — optional; if present, each hex group (tile + token) becomes clickable and fires with the hex index. Only passed by `App` while the robber is waiting to be moved.

The SVG now renders at its **natural size** (`display: block`, no `maxWidth/maxHeight: 100%` and no centring wrapper div) and takes its viewBox extents from `gameRules`' `BOARD_*` exports. Fitting the board to the window is `BoardViewport`'s job — letting CSS shrink the SVG *as well* would fight the zoom level the user picked.

---

### `src/game/viewport.js`
Pure zoom/pan maths — no DOM, no React, so every rule about where the board may sit is testable in Node.

Coordinate model: the board surface is centred in its frame with `transform: translate(x, y) scale(zoom)` and `transform-origin: 50% 50%`, so `{x: 0, y: 0}` means "centred" and x/y are screen-pixel offsets from there.

- **`MIN_ZOOM` / `MAX_ZOOM`** — 0.5 / 3. **`MIN_VISIBLE`** — 120px of board that must always remain inside the frame.
- `clampZoom(z)` — clamps to the bounds. Only `NaN`/non-numbers fall back to 1; `±Infinity` is a direction and clamps to the matching bound.
- `clampPan(pan, zoom, viewport, content)` — clamps each axis to `±((vSize + cSize*zoom)/2 − MIN_VISIBLE)`, i.e. the point where board and frame stop overlapping. If the whole board is smaller than `MIN_VISIBLE` at that zoom the limit collapses to keeping the board itself onscreen rather than inverting the range.
- `clampView(view, …)` — clamps zoom and pan together; used after a resize, where a pan that was legal in a wide window is not in a narrow one.
- `zoomAt(view, nextZoom, point, …)` — zooms toward a frame-relative point so whatever is under the cursor stays under the cursor.
- `zoomFactorFromWheel(deltaY, ctrlKey)` — `exp(-deltaY * sensitivity)`. **macOS reports a trackpad pinch as a wheel event with `ctrlKey` set** (Chrome and Safari both; there is no separate gesture event), with much smaller deltas per unit of finger travel — so pinch gets its own, higher sensitivity or it feels dead.
- `fitZoom(viewport, content)` — largest zoom that fits the whole board, never magnifying past 1:1. Used for the initial view and Reset, so a small window still shows the entire board the way it did before zooming existed.
- `distance(a, b)` / `midpoint(a, b)` — pinch spread and pinch centre.

---

### `src/components/BoardViewport.jsx`
The pan/zoom frame wrapping `HexBoard`. Holds `view` (`{zoom, x, y}`) in React state and applies it as a CSS transform.

**Why a CSS transform and not a recomputed viewBox:** the browser hit-tests *through* the transform, so every SVG intersection dot, road slot, and hex polygon inside stays click-accurate at any zoom/pan with **no coordinate conversion on our side**. Anything that translated screen→board coordinates by hand would be a bug farm.

- **Desktop** — mouse wheel zooms toward the cursor; the listener is bound manually with `{ passive: false }` because React attaches its own wheel handling passively and `preventDefault` is needed to stop page scroll and browser pinch-zoom. Click-and-drag pans.
- **Touch** — pointer events cover both gestures in one code path: one pointer pans, two pointers pinch-zoom on the distance between them, anchored at their midpoint. Lifting one finger out of a pinch hands the remaining one to panning, re-seeded from its current position so the board doesn't jump. `touch-action: none` stops the browser scrolling or running its own pinch on top.
- **Drag vs click** — a press only becomes a pan after `DRAG_THRESHOLD` (12px, from `viewport.js`) of travel; once it does, a capture-phase `click` listener on the frame swallows the click that ends the drag, so panning across an intersection never places a settlement. Below the threshold it stays a click, so an ordinary press that drifts still places a settlement. `suppressClickRef` is reset at the start of every `pointerdown`, so a gesture that ends without dispatching a click can't leave the flag set and eat the next one.
- **Pointer capture is taken late, and this is load-bearing.** `setPointerCapture` is called only when a gesture crosses the drag threshold, never on `pointerdown`. While capture is held the browser retargets `pointerup` — and the compatibility `mouseup` with it — to the capturing frame, so `click` is dispatched on the nearest common ancestor of the mousedown and mouseup targets (the frame) and an intersection's own `onClick` never runs. Capturing on `pointerdown` therefore broke *every* click that moved even slightly. Taking capture only once a pan is confirmed leaves ordinary clicks alone and still holds the pointer for drags that leave the frame.
- **Controls** — a live zoom percentage plus **+ / − / reset-view** buttons (bottom-right of the board) as the discoverable fallback. +/− anchor on the frame centre; reset returns to `fitZoom`.
- A `ResizeObserver` re-measures the frame and re-clamps the view on resize; the first measure sets the initial `fitZoom` view.

---

### `src/audio/sounds.js`
Synthesized sound effects built entirely from Web Audio oscillators. **No audio files** — nothing to fetch, nothing to bundle, and no sample licensing question.

- **`SOUNDS`** — the cue table. Each cue is `{ gain, notes: [...] }`; each note is `{ freq, dur }` plus optional `at` (offset within the cue), `to` (glide target for a pitch sweep), `type` (waveform), and `level` (per-note gain). Twelve cues: `dice`, `resources`, `settlement`, `road`, `city`, `trade`, `devBuy`, `devPlay`, `robber`, `steal`, `turn`, `win`.
- **`DEFAULT_SETTINGS`** — `{ muted: false, volume: 0.35 }`. Deliberately modest, and `OUTPUT_TRIM` (0.28) scales every note on top: dice rolls and placements fire constantly, and a loud default is the fastest way to make a player mute the game permanently. The `turn` cue is the quietest of all since it fires every single turn, and the only cue allowed to run past 500ms is the once-per-game `win` fanfare.
- `clampVolume` / `parseSettings(raw)` / `serializeSettings(s)` (all pure, all exported) — settings persistence to `localStorage` under `catanalyst.audio`. `parseSettings` is deliberately tolerant: corrupt JSON, a JSON non-object, an out-of-range volume, or a non-boolean `muted` all fall back to (or clamp toward) the defaults rather than throwing or leaving the game silent by accident. Storage reads/writes are wrapped in `try`/`catch` so private-mode or disabled storage degrades to "settings don't survive a reload".
- `getAudioSettings` / `setAudioMuted` / `setAudioVolume` / `subscribeAudioSettings` — the tiny store the header controls bind to. Nudging the slider off zero also unmutes, otherwise the slider looks broken.
- `playSound(name)` — schedules a cue's notes as oscillator+gain envelopes on a lazily-built `AudioContext`. The context is created on **first playback rather than at import time**, because browsers only allow one to start inside a user gesture and every cue follows a click. Returns `false` (never throws) when the cue is unknown, the game is muted, or Web Audio is unavailable.

---

### `src/audio/gameSounds.js`
- **`soundsForTransition(prev, next)`** (pure) — maps a game-state diff to the list of cues it should play. Deriving sounds from prev→next rather than calling `playSound()` inside each click handler means a cue fires exactly when the state really changed: failed actions return an error string and never produce a new state, so they can't make a sound, and knock-on effects the UI never clicked for (resource collection after a roll, the turn handoff at the end of setup, a Knight winning the game) are covered by the same path.
- A win returns `['win']` alone — one fanfare beats stacking it under the placement or dev-card cue that triggered it.
- `city` and `settlement` are mutually exclusive and cities are checked first, because `upgradeToCity` moves a settlement into `cities` and so *decreases* the settlement count.
- `resources` is scoped to the roll transition rather than a bare "someone gained cards" check, since builds and trades also move cards around.

---

### `src/game/gameRules.js`
Pure data module — no React, no side effects. Exports the board graph.

- **VERTICES** — 54 `{x, y}` positions, identical ordering to `HexBoard.jsx`.
- **HEX_CENTERS** — 19 `{cx, cy}` hex centres in tile-index order.
- **VERTEX_TO_HEXES** — `VERTEX_TO_HEXES[v]` is the array of hex indices (1–3) whose corner is vertex `v`. Used by `collectResources`.
- **VERTEX_ADJACENCY** — `VERTEX_ADJACENCY[v]` lists the 2–3 vertex indices that share a hex edge with `v`. Used by the distance rule in `placeSettlement`.
- **HEX_TO_VERTICES** — `HEX_TO_VERTICES[h]` is the 6 vertex indices at the corners of hex `h`. Used to find steal candidates when the robber moves.
- **EDGES** — 72 unique `[v1, v2]` pairs. Array index = `edgeIndex` used in road placement.
- **BOARD_PADDING / BOARD_WIDTH / BOARD_HEIGHT / BOARD_MIN_X / BOARD_MIN_Y** — the SVG viewBox and the board's unscaled pixel size, derived from the same `SIZE`/spacing constants as the geometry above. They live in this pure module (rather than being computed in `HexBoard.jsx`, which now imports them) so `BoardViewport`'s zoom/pan limits and the Node tests can use them without importing JSX.
- **PORTS** — the 9 standard harbours as `{ type, vertices: [a, b], x, y }`: 4 `generic` (3:1) + one 2:1 per resource (`ore`/`wheat`/`brick`/`sheep`/`wood`). `vertices` are the two coastal intersections the port serves (derived from the same VERTICES geometry); `x`/`y` position the dock label. Consumed by both the board renderer and `portRate`.

All structures are derived from the same traversal algorithm as `HexBoard.jsx`, so indices are always in sync.

---

### `src/game/gameActions.js`
Pure functions; each returns a new game state or an error string. Imports graph data from `gameRules.js`.

- `log(gameState, playerIndex, text)` (internal) — the single shared log helper. Appends `{ id, playerIndex, text }` to `gameState.log` (`playerIndex: null` = system line). Every action that mutates the game funnels its human-readable entries through this one function; there is no log-writing logic at any call site.
- **`rollDice()`** — returns `{ die1, die2, total, isRobber }` (pure randomness only, no state/log).
- **`performRoll(gameState)`** — the whole roll as one state transition so `App`'s functional update stays atomic against rapid clicks: no-ops unless play phase with `dice === null` and no winner; otherwise rolls, logs `"X rolled a + b = n"`, then either `startRobber()` (on a 7) or `collectResources()`.
- **`endTurn(gameState)`** — no-ops during setup / robber resolution / after a win, **and now also no-ops in play phase until the dice have been rolled** (`dice === null`); otherwise advances `currentPlayerIndex`, clears `dice`, and logs the new player's turn.
- **`collectResources(gameState, diceTotal)`** — for each player × building, looks up adjacent hexes via `VERTEX_TO_HEXES`, awards 1 resource per matching-number hex for settlements, 2 for cities. Hexes occupied by the robber (`gameState.robberHex`) produce nothing. Deducts from bank with `Math.min` guard. No-op on 7. Logs one `"X collected …"` line per player who gained anything.
- **`placeSettlement(gameState, playerIndex, intersectionIndex)`** — validates: correct turn, intersection unoccupied, no adjacent building (distance rule), sufficient resources outside setup. During setup, also enforces the 2-settlement limit and settlement-then-road ordering; the second setup settlement grants 1 resource per adjacent producing hex (bank-capped). Returns updated state or an error string.
- **`placeRoad(gameState, playerIndex, edgeIndex)`** — validates: correct turn, edge within bounds, edge unoccupied, at least one endpoint in the player's network (settlements + cities + existing road endpoints). Deducts 1 brick + 1 wood outside setup. During setup, the road must touch the settlement just placed; placing it completes the setup turn and advances the snake order (or transitions to `phase: 'play'` with player 1 after all 8 turns). Returns updated state or error string.
- **`placeRoad`** also handles **free roads**: while `gameState.roadBuilding` is active (a played Road Building card) the brick+wood cost is skipped and `roadBuilding.remaining` decrements, clearing when spent or when no legal spot remains.
- **`upgradeToCity(gameState, playerIndex, intersectionIndex)`** — validates: correct turn, not setup phase, the player has a settlement at that intersection, 2 wheat + 3 ore available. Moves the settlement into `cities`, deducts resources to the bank. Returns updated state or error string.
- **`portRate(gameState, playerIndex, resource)`** (exported) — the player's best bank rate for giving away `resource`: `2` with the matching 2:1 port, else `3` with any generic 3:1 port, else `4`. A port counts if the player has a settlement **or** city on either of its two coastal vertices.
- **`bankTrade(gameState, playerIndex, give, receive)`** — bank trade at the player's **best available rate** (via `portRate`), not a flat 4:1. Validates: correct turn, play phase, dice already rolled, two different known resources, player holds ≥`rate` of `give`, bank holds ≥1 of `receive`. Deducts `rate` of `give`, adds 1 of `receive`.
- **`startRobber(gameState)`** — called when a 7 is rolled. Players holding >7 cards enter `robber: { stage: 'discard', pending, required }` (required = `floor(total/2)`, computed at roll time); otherwise straight to `{ stage: 'move' }`.
- **`discardCards(gameState, playerIndex, discards)`** — validates the player is pending, holds the named cards, and the discard totals exactly their required count; returns cards to the bank. Last pending discard advances to `{ stage: 'move' }`.
- **`moveRobber(gameState, playerIndex, hexIndex)`** — current player only, `stage: 'move'` only, must pick a *different* hex. Sets `robberHex`; if any opponent with ≥1 card has a settlement/city on that hex, advances to `{ stage: 'steal', candidates }`, otherwise resolution completes (`robber: null`).
- **`stealResource(gameState, playerIndex, victimIndex)`** — takes 1 uniformly-random card from a candidate victim and completes resolution. Opponents with zero cards never appear as candidates, so "no cards → no steal" holds.

Development cards (all reject during setup / robber / road-building / after a win):
- **`buyDevCard(gameState, playerIndex)`** — costs 1 ore + 1 wheat + 1 sheep, draws the top of `devCardDeck` into the hand as `{ type, newlyBought: true }`. Fails on empty deck or insufficient resources. Multiple buys per turn allowed. The log line is generic ("bought a development card") so the drawn card stays hidden. Recomputes VP (a drawn VP card can win instantly).
- **`playKnight`** — removes one playable knight, increments `knightsPlayed`, recomputes Largest Army, then hands off to the existing robber flow at `{ stage: 'move' }` (no discard step). If Largest Army makes it the 10th point, the win is declared and the robber move is skipped.
- **`playRoadBuilding`** — sets `roadBuilding: { remaining: 2 }` (or consumes the card with a log note if the player has no legal road spot). Placement then goes through the free-road branch of `placeRoad`.
- **`playYearOfPlenty(gameState, playerIndex, [r1, r2])`** — grants 2 chosen resources from the bank, each capped by stock (same or different types).
- **`playMonopoly(gameState, playerIndex, resource)`** — every other player hands over all cards of the named resource.
- `canPlayDevCard` / `removeOneCard` (internal) — shared play guards (turn, one-per-turn via `devCardPlayedThisTurn`, not newly bought) and hand mutation.
- `publicVP` / `vpCardCount` / `recomputeVictory(gameState, actingPlayerIndex)` (internal) — **public VP** = 1/settlement + 2/city + 2 for each award held; this is what every player's `victoryPoints` field (and the shared UI) shows. The **win check** adds hidden Victory Point dev cards on top of the public total, so VP cards count toward the owner's own 10 without being publicly visible.
- `recomputeLargestArmy` (internal) — holder needs 3+ knights and strictly more than the current holder; ties keep it with the holder.
- `longestRoadLength(gameState, playerIndex)` (exported) — longest continuous road as a DFS over the player's road edges (`EDGES`): the longest **trail** (no road segment reused) that cannot pass *through* a vertex occupied by an opponent's settlement/city (own buildings never block). `recomputeLongestRoad` applies the 5+ / strictly-longer / ties-keep-holder rules and also strips the holder if their chain drops below 5.
- `finalizeBuild(gameState, playerIndex)` (internal) — recompute Longest Road (a new road *or* a road-severing settlement can change it), log any handover, then `recomputeVictory`. Called at the end of `placeSettlement`, `placeRoad`, and `upgradeToCity`.
- `isLegalRoad` / `hasLegalRoad` (internal) — free-standing legality check used by Road Building.
- `setupPlayerFor(turnIndex)` (internal) — maps setup turn 0–7 to the snake order 1,2,3,4,4,3,2,1.

Guards: all placement/trade/dev-card actions return `'Game is over'` once `winner` is set, and `'Resolve the robber first'` while `robber` is non-null. In **play phase**, `placeSettlement`/`placeRoad`/`upgradeToCity`/`bankTrade` also return `'Roll the dice first'` while `dice === null` — the one exception being Road Building's free roads, which `placeRoad` still allows pre-roll because `gameState.roadBuilding` is set (a consequence of an allowed dev-card play, not a manual build). Setup phase has no dice gate. Every mutating action also appends a log entry via `log()` (build, starting-resource grant, trade, roll, collection, discard, robber move, steal, dev-card buy/play, army/road handover, turn change, win).

*Note:* `HEX_TILES` and `HEX_NUMBERS` are duplicated here from `HexBoard.jsx` and kept in sync manually.

---

### `src/game/gameState.js`
Exports a single `initialGameState` object representing a fresh 4-player game, as the module's **default** export (`import initialGameState from './gameState.js'` — there is no named export).

| Field | Value |
|---|---|
| `players` | 4 players, all starting empty. Each has `resources`, `settlements`, `roads`, `cities`, `devCards` (`{ type, newlyBought }`), `knightsPlayed` (0), `victoryPoints` (public VP) |
| `currentPlayerIndex` | `0` |
| `phase` | `"setup"` |
| `setup` | `{ turnIndex: 0, settlementsPlaced: [0,0,0,0], roadsPlaced: [0,0,0,0], expecting: 'settlement', lastSettlementIndex: null }` — set to `null` when setup completes |
| `dice` | `null` — holds the `rollDice()` result for the current turn once rolled; cleared by End Turn (this is the once-per-turn roll lock) |
| `robberHex` | `9` (desert) |
| `robber` | `null` — non-null while a rolled 7 (or a played Knight) is being resolved: `{ stage: 'discard', pending, required }` → `{ stage: 'move' }` → `{ stage: 'steal', candidates }` → `null` |
| `bank` | all 5 resources at 19 |
| `devCardDeck` | 25 cards, Fisher-Yates shuffled at load (14 knight, 5 VP, 2 road building, 2 year of plenty, 2 monopoly). Players draw from the end (top) |
| `devCardPlayedThisTurn` | `false` — at most one dev card may be *played* per turn; reset by `endTurn` |
| `roadBuilding` | `null` — `{ remaining: 1\|2 }` while placing free roads from a played Road Building card |
| `longestRoad` | `null` — holder index (needs a 5+ chain) |
| `largestArmy` | `null` — holder index (needs 3+ knights) |
| `winner` | `null` — set to the winning player's index at 10 VP (public VP + hidden VP cards); every action rejects once set |
| `log` | `[{ id, playerIndex, text }]` — append-only event log, seeded with one system line. `playerIndex: null` marks a system entry; otherwise it tags/colours the entry by acting player |
| `turn` | `1` |

---

### `src/App.jsx`
Top-level UI, restructured this session into a Colonist.io-style product layout (styled via `game.css`, no inline debug styling). Holds `gameState`, `message` (transient error toast), the two trade selects, the active sidebar `tab`, `tradeOpen`/`buildOpen` popover toggles, and `chatMessages` (local-only). The dice result lives in `gameState.dice`.

Layout regions inside `.g-app` (flex column, full-height):
- **Header** (`.g-header`) — brand, whose turn (in their colour), phase + turn number, and a right-aligned status chip. The chip mirrors robber/discard/steal state (alert-styled) or the setup prompt.
- **Body** (`.g-body`, flex row): **center** (`.g-center`) holds the `HexBoard` (now sized to its container rather than forcing `100vh`), the error toast, and the win overlay; **right sidebar** (`.g-sidebar`) stacks a **player list** and a **tabbed panel**.
- **Bottom tray** (`.g-tray`) — the current player's five resource cards as coloured chips, then their **own dev card hand** (`DevHand`), then a right-aligned action group: dice readout, Roll Dice (primary), Trade, Build, **Buy Dev (deck count)**, End Turn, plus the contextual robber `DiscardPanel` / steal buttons, the Year of Plenty / Monopoly resource-pick popovers, and the Road Building "place N free roads" banner (with a Skip that forfeits remaining free roads). Trade/Build/dev popovers are mutually exclusive.
- **Turn gating**: a `preRoll` flag (play phase, `dice === null`, no robber/winner) drives `canEndTurn` (needs `dice !== null`) and `canTradeOrBuild`, so **before rolling** End Turn / Trade / Build are disabled and board clicks are rejected by the actions; dev-card Play and Buy Dev stay available. The **Trade popover shows the real per-resource rate**: the "Give N" label reflects `portRate` for the selected resource, and each give-option is annotated `resource (N:1)`.
- A shared `apply(result)` commits state or surfaces the error string as a toast; `handleRoll`/`handleEndTurn` call `performRoll`/`endTurn` inside a functional `setGameState` (atomic against rapid clicks). Playing a Knight or Road Building routes through the existing robber / free-road board interactions.

- The board is wrapped in **`BoardViewport`** (sized from `BOARD_WIDTH`/`BOARD_HEIGHT`), which owns zoom/pan; `App` itself is unaware of the view state.
- **`useGameSounds(gameState)`** — an effect that diffs prev→next via `soundsForTransition` and plays the resulting cues, spacing a multi-cue transition (roll → income, build → turn handoff) by `CUE_SPACING_MS` (220ms) so they don't collide. A ref seeded with the initial state keeps it from firing on mount.
- **Bank trade is the one cue not derived from the diff**: it only shuffles cards between a hand and the bank, which is indistinguishable from paying a build cost, so `handleBankTrade` plays `'trade'` itself when `apply()` reports success.
- The header's right-hand group (`.g-header-right`) now holds the status chip plus **`AudioControls`**.

Components in this file: `AudioControls`, `ResourceChip`, `DiscardPanel`, `PlayerList`, `DevHand`, `GameLog`, `Chat`.

- **`AudioControls`** — mute toggle (🔊/🔇, `aria-pressed`) and a volume slider, mirroring the `sounds.js` store via `subscribeAudioSettings`. Settings persist across reloads through `localStorage`.

- **`PlayerList`** — one row per player: colour swatch, name, **Largest Army (⚔️) / Longest Road (🛣️) badges** on the holder, resource-card count, and public VP; the current player's row is highlighted. Deliberately shows only *public* VP — hidden Victory Point dev cards never appear here.
- **`DevHand`** — the current player's own dev cards grouped by type with counts. Playable action cards (Knight / Road Building / Year of Plenty / Monopoly) get a Play button, disabled when a card was already played this turn or the copy is newly bought; Victory Point cards show a `+VP` tag and are never playable. Only ever renders the current player's hand, so opponents' cards stay private.
- **`GameLog`** — renders `gameState.log` newest-at-bottom, each entry left-bordered in the acting player's colour (system lines italic/dim), auto-scrolling to the newest entry via a `useEffect` on `log.length`.
- **`Chat`** — local-only message list + input (author = current player, colour-coded). **UI only: there is no backend, messages never leave the browser.** Marked with `// TODO: wire to Socket.io once multiplayer backend exists` in `handleSendChat`.

---

### `src/game.css`
Cohesive dark product theme for the game screen (imported by `App.jsx`). Defines CSS variables for panels/borders/text/accent and the five resource colours, overrides the Vite scaffold's `#root` constraints (fixed width / centered text) so the app fills the viewport, and styles every region (`.g-header` + `.g-header-right`, `.g-body`, `.g-sidebar`, `.g-players` + award `.g-badge`, `.g-tabs`, `.g-log`, `.g-chat`, `.g-tray`, `.g-card`, `.g-devhand`/`.g-devcard`, `.g-btn`, popovers, discard/steal rows, win overlay, the board viewport `.g-board-wrap`/`.g-board-frame`/`.g-board-surface` + `.g-board-controls`, and `.g-audio`).

`.g-board-frame` carries `overflow: hidden`, `cursor: grab` (→ `grabbing` while panning), and `touch-action: none` — without the last one the browser would scroll the page or run its own pinch-zoom on top of ours.

---

### `tests/`
Node test suites over the pure game modules (`npm test` runs them all; each exits non-zero on failure): `roads`, `setup`, `cities`, `trade`, `robber`, `win`, `log`, `devcards`, `largestarmy`, `longestroad`, `turnlock`, `ports`, `viewport`, `sound` — **341 assertions total**. Highlights: `devcards` covers buy/draw/cost, newly-bought lockout, one-per-turn, each card effect, and the hidden-VP win path; `largestarmy` covers the 3-knight threshold and strict-exceed / tie handoff; `longestroad` covers straight chains, branch (longest-trail, not total segments), opponent-settlement breaks, own-settlement no-break, and the 5+/tie/transfer award rules; `turnlock` covers the roll-before-end-turn gate, pre-roll build/trade blocking, the dev-card exceptions, and that the gate never bites in setup — the whole 8-turn snake order is driven with `dice === null`, asserting every placement for all 4 players succeeds and setup still completes into play phase; `ports` covers rate resolution (2:1 / 3:1 / 4:1, either coastal vertex, city grants) and that `bankTrade` spends the resolved rate. Play-phase fixtures across the suites set a non-null `dice` to represent a post-roll turn.

The two new suites cover the logic that is testable outside the DOM:
- **`viewport`** (41) — zoom clamping incl. `NaN`/`±Infinity`; pan limits (symmetry, the guarantee that `MIN_VISIBLE` px survive any drag at every zoom, the small-board case that would otherwise invert the range); `clampView` pulling a pan back after a shrink; `zoomAt` keeping the cursor anchored in and out, respecting bounds, staying inside the pan limits from every frame corner, and round-tripping exactly over 4 zoom-in/zoom-out cycles; wheel-factor sign, reciprocity, and the higher `ctrlKey` trackpad-pinch sensitivity; `fitZoom` axis selection and bounds; pinch `distance`/`midpoint`.
- **`sound`** (56) — cue-table integrity (every event named in the brief has a cue; audible frequencies, positive durations, in-range gains, real waveforms; frequent cues stay short and `turn` is the quietest); `clampVolume`; `parseSettings`/`serializeSettings` round-tripping and surviving null/empty/corrupt/non-object/out-of-range input; `playSound` degrading quietly with no Web Audio (the Node path, same as a very old browser); and `soundsForTransition` for every transition — roll, roll-with-income vs roll-with-none, income outside a roll, settlement, road, setup settlement+road, city-not-settlement on upgrade, dev buy/play, robber move, steal completion vs entering the steal stage, silent discard stage, turn handoff ordering last, and win returning the fanfare alone.

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
- [x] Bank trading at the player's best rate: 2:1 with the matching resource port, 3:1 with a generic port, else 4:1; the trade UI shows the actual rate per resource
- [x] Ports: standard 9-harbour layout (4×3:1 + one 2:1 per resource) on real coastal intersections, rendered with dock lines; a settlement/city on either coastal vertex grants the rate
- [x] Roll-before-act enforcement: in play phase, End Turn / building / bank trading are blocked until the dice are rolled (dev-card play still allowed pre-roll, including its knock-on free roads / robber move)
- [x] Robber: discard-half (rounded down) for every player over 7 cards, prompted individually with exact-count enforcement
- [x] Robber: current player moves it to a different hex by clicking the board; marker rendered; robbed hex produces nothing
- [x] Robber: steal 1 random card from a chosen adjacent opponent (cardless opponents excluded; none adjacent → no steal)
- [x] Victory points tracked live: public VP = 1/settlement + 2/city + 2 per award; the win check also adds hidden VP dev cards
- [x] Win at 10 VP: overlay banner in winner's colour, all rolls/trades/placements/dev-cards locked out
- [x] Action log: every meaningful action produces a human-readable, player-coloured entry via one shared `log()` helper; rendered in a scrollable, auto-scrolling sidebar panel and persisted in `gameState.log`
- [x] Restructured game screen: header (turn/phase/status) · center board · right sidebar (player list + Game Log/Chat tabs) · bottom tray (resource hand + dev card hand + Roll/Trade/Build/Buy Dev/End Turn), styled cohesively via `game.css`
- [x] Chat tab — local-only placeholder UI (message list + input), **pending the Socket.io backend**
- [x] Development cards: buy (1 ore + 1 wheat + 1 sheep) drawing from a shuffled pile; one play per turn; no play the turn a card is bought; Knight (robber move, no discard), Road Building (2 free roads), Year of Plenty (2 free from bank), Monopoly (take all of a type), Victory Point (hidden, auto-counted)
- [x] Largest Army: 3+ knights and strictly more than the holder → 2 VP, ⚔️ badge in the sidebar
- [x] Longest Road: real graph traversal for the longest 5+ chain (breaks at opponent buildings) → 2 VP, 🛣️ badge; recomputed after every road/settlement placement
- [x] Board zoom & pan: mouse wheel / trackpad pinch (`ctrlKey` wheel) zooms toward the cursor, drag pans, two-finger pinch zooms on touch, with 0.5×–3× bounds and pan limits that always keep 120px of board on screen
- [x] Zoom in / zoom out / reset-view buttons with a live zoom percentage, as a discoverable fallback next to the board
- [x] Click targets stay accurate at every zoom and pan level (CSS transform → the browser hit-tests through it); a drag never fires a click, so panning across an intersection can't place a settlement
- [x] Synthesized sound effects via Web Audio oscillators — no audio files — for dice roll, resource collection, settlement/road/city placement, bank trade, dev card buy/play, robber move, steal, turn change, and win
- [x] Mute toggle + volume slider in the header, persisted across reloads via `localStorage`, at a modest default volume
- [x] Node test suites in `tests/` (`npm test`): 341 assertions across roads/setup/cities/trade/robber/win/log/devcards/largestarmy/longestroad/turnlock/ports/viewport/sound

---

## Not Yet Built

- [ ] Turn counter incrementing (`turn` field always stays at 1)
- [ ] Player-to-player trading (bank/port trades are done; no player-to-player offers yet)
- [ ] Building-supply limits (5 settlements / 4 cities / 15 roads per player are not enforced)
- [ ] **Multiplayer chat** — the Chat tab is local-only UI; it needs the Socket.io backend to actually send/receive between clients (marked with a `// TODO: wire to Socket.io` in `App.jsx`)

---

## Known Bugs

1. **Tile data duplicated across files.** `TILES`/`NUMBERS` in `HexBoard.jsx` and `HEX_TILES`/`HEX_NUMBERS` in `gameActions.js` are manually kept in sync. A change to the board layout in one place will silently break resource collection.

2. **VERTICES computed twice independently.** `HexBoard.jsx` runs its own IIFE; `gameRules.js` runs an equivalent traversal. They produce identical output today, but diverge if one file's rounding constant or traversal order is edited without updating the other. (The board's *extents* are no longer duplicated — `BOARD_WIDTH`/`BOARD_HEIGHT`/`BOARD_MIN_X`/`BOARD_MIN_Y` now live only in `gameRules.js` — but `SIZE`/`H_SPACING`/`V_SPACING` and the vertex traversal itself are still duplicated.)

3. **`placeRoad` road-blocking rule missing.** In standard Catan an opponent's settlement severs road connectivity — a road cannot be extended through it. `placeRoad` only checks that one endpoint is in the player's network and does not check for blocking settlements.

4. **`socket.io-client` installed but unused.** It is listed as a production dependency in `package.json` (presumably from the project scaffold) but nothing imports it.

5. **Player index not validated in action functions.** `placeSettlement`, `placeRoad`, and `upgradeToCity` do not check that `playerIndex` is a valid index into `gameState.players`, so an out-of-range value would produce a runtime error instead of a clean error string.

6. **Play-phase settlements skip the road-connectivity rule.** Outside setup, `placeSettlement` checks resources and the distance rule but not that the intersection touches one of the player's roads (standard Catan requires it).

7. **Hotseat trust model.** All four players share one screen and one set of controls; "only the current player can act" means the shared buttons act *as* the current player. Turn/robber/winner enforcement lives in the pure actions, but nothing stops a player at the keyboard from acting on another's turn — real per-player enforcement needs the Socket.io backend.

8. **Discard requirement is bank-agnostic in one edge case.** `discardCards` adds discarded cards back to the bank without a cap (fine — bank totals are conserved), but `startRobber` computes `required` once at roll time; if a player's hand somehow changed mid-discard-stage (not currently possible through the UI), the stored requirement would be stale.

9. **Chat is UI-only.** The Chat tab renders and stores messages in local component state (`chatMessages`), never sending them anywhere. It is a placeholder until the Socket.io backend exists — do not mistake it for working multiplayer chat. (Marked in code with `// TODO: wire to Socket.io once multiplayer backend exists`.)

10. **Log grows unbounded.** `gameState.log` is append-only with no cap; a very long game accumulates entries indefinitely (fine for a session, but no trimming/virtualisation yet).

11. **Hidden VP dev cards aren't truly hidden (hotseat).** Victory Point dev cards are kept out of the public `victoryPoints` field and the sidebar, and only count toward the owner's own win check — but the shared-screen model still shows the current player's whole hand in the tray, and a player reaching 10 via VP cards is announced by the win banner. True hidden-hand enforcement (each player only sees their own cards, opponents can't infer VP totals) needs the Socket.io backend with per-client state; this is a placeholder until then, and shares the root cause of issue #7. *Assumption:* the win check counts VP cards immediately on draw, so a purchased VP card can end the game the instant it completes 10 points.

12. **Road Building "Skip" forfeits free roads.** If a player plays Road Building and can't or doesn't want to place both roads, the Skip button (and End Turn) clears `roadBuilding` and the unused free road is lost. Standard Catan would require placing all legal free roads; this is a forgiving simplification to avoid soft-locks.

13. **Zoom/pan state is not persisted.** Unlike the audio settings, the view resets to fit-to-frame on every reload. Intentional (a fresh look at the whole board is a reasonable default) but worth knowing if per-player view memory is ever wanted.

14. **No keyboard control for zoom/pan.** The +/−/reset buttons are focusable and operable, but there is no keyboard panning or `+`/`-` shortcut, and the board itself is not focusable. A keyboard-only player can still play — every intersection, edge, and hex is clickable, not reachable by tab — so this compounds the pre-existing fact that the SVG board has no keyboard or screen-reader affordances at all.

15. **Sound cues can't distinguish some same-shape transitions.** `soundsForTransition` reads a state diff, so a bank trade is indistinguishable from paying a build cost (hence the one explicit `playSound('trade')` call in `App`), and a Year of Plenty / Monopoly card gain deliberately doesn't fire the income cue because that is scoped to roll transitions. If player-to-player trading lands, it will need the same explicit treatment as the bank trade.

16. ~~**`suppressClickRef` is only ever cleared by a click that actually arrives.**~~ **Closed.** The flag is now reset at the top of `handlePointerDown`, so a gesture that ends without dispatching a `click` can no longer leave it set and swallow the next legitimate one.

17. **Longest-road search is exponential in the worst case.** `longestRoadLength` is an exact DFS over road trails. Fine for a real board (each player ≤ 15 roads), but a pathological dense subgraph would be slow; no memoisation/pruning beyond the visited-edge set.

*Resolved 2026-08-05 — "settlements cannot be placed at all" (root cause: pointer capture taken on `pointerdown`):* the reported symptom was that clicking an intersection produced no settlement, no error toast, and no log entry — on a fresh board, first click, with no pan or zoom.

**Root cause.** `handlePointerDown` called `setPointerCapture` on the frame for *every* press. While capture is held the browser retargets `pointerup`, and the compatibility `mouseup` with it, to the capturing element. `click` is then dispatched on the nearest common ancestor of the mousedown and mouseup targets — the frame `<div>` — so the intersection circle's own `onClick` never ran. Any press that moved even slightly was destroyed this way, which is every real click made by a human hand. Zero-movement synthetic clicks were unaffected, which is exactly why automated checks kept passing while the game was unusable.

The captured event trace, before and after the fix, on the same vertex with 10px of travel:

```
before:  pointerdown → circle   pointerup → DIV      click → DIV      settlements: 0
after:   pointerdown → circle   pointerup → circle   click → circle   settlements: 1
```

**The fix (`BoardViewport.jsx`).** Capture is now taken by `capturePointer()` only when a gesture crosses the drag threshold (and on the second pointer of a pinch, which is never a tap), never on `pointerdown`. Ordinary clicks therefore never have capture active and resolve to the element under the pointer; real drags still acquire it the moment they become pans, so a drag that leaves the frame keeps working. Verified: an 80px drag starting on a vertex reported `cap=true` at `pointerup`, panned the board 80px, and placed nothing.

**Two contributing factors, fixed alongside:**
- `DRAG_THRESHOLD` was **5px**, tight enough that ordinary hand jitter — especially a trackpad press — was classified as a pan and had its click deliberately swallowed. Now **12px**, and moved into `viewport.js` so the Node suite can pin it (`exceedsDragThreshold`).
- The clickable vertex was an `r=4` dot, a **3.0px radius** target at fit-to-frame zoom; press and release a few pixels apart landed on different elements, so `click` resolved to an ancestor. The `r=16` transparent hit targets in `HexBoard.jsx` (**12.2px** on screen) keep both ends of a normal press on the same element. Necessary, but on its own not sufficient — this was committed as `b842e32` and did **not** fix the bug.

**Three hypotheses were disconfirmed before the real cause was found; recorded so they aren't re-tried:** (a) *the roll-before-act gate leaking into setup* — no: `gameActions.js:246` already reads `phase === 'play' && dice === null`, and `placeSettlement(initialGameState, 0, 0)` succeeds in isolation; (b) *a stale `suppressClickRef`* — no: it reproduces on a fresh board, and the flag is only set by a drag or pinch; (c) *undersized hit targets alone* — no: with `r=16` targets and a 12px threshold, a 10px press still failed until capture was deferred, with the board never panning and the flag never set. The lesson worth keeping: **verify input bugs with a press that moves**, because a zero-travel synthetic click exercises neither the capture path nor the drag threshold.

Regression coverage: `turnlock` drives all 8 setup placements with `dice === null` for all 4 players. Note that this is a rendering/hit-testing bug, so the Node suite cannot catch it — the pure-function path was never broken.

*Verified in Chrome this session (zoom/pan + audio):* driven live against `npm run dev`, not just unit-tested.
- **Click accuracy under zoom/pan** — at every stop of a full zoom sweep (fit, 156%, 182%, 287%, 300% max, 50% min, via both mouse-wheel and `ctrlKey` trackpad-pinch events) and after panning, a hit-test at each element's on-screen centre resolved back to that same element for **all 54 intersections and all 72 edges** that were inside the frame. Confirmed end-to-end with real OS-level mouse input: a real click at 156% zoom landed exactly on the intended road slot and placed the road.
- **Drag vs click** — a real 220×90px drag *starting directly on an intersection dot* panned the board by exactly that delta and placed nothing (log and settlement count unchanged, no error toast).
- **Pan limits** — synthetic drags of ±9,000–20,000px in all four diagonals clamped to exactly 120px of board still visible on each axis, matching `MIN_VISIBLE` and the unit tests.
- **Sound** — instrumenting `createOscillator` showed the cues firing with exactly their specced notes: the dice cue's 4 notes (260/230/200/320 Hz) followed by the income arpeggio (523/659/784 Hz) on a paying roll, and the 2-note turn cue (440/587 Hz) on End Turn, correctly staggered. Muting scheduled **zero** oscillators; unmuting restored them; volume and mute both survived a page reload (`{"muted":true,"volume":0.7}` restored, with the button and slider reflecting it). No console errors.

*One thing worth knowing:* the `AudioContext` can only start inside a **trusted** user gesture, so the very first cue of a session is the first real click a player makes. Synthetic/scripted clicks won't unlock audio (they will still schedule cues once it *is* running) — relevant if this is ever driven by an automated test.

*Fixed in the roll-lock + ports session:* the earlier "ports rendered but confer no benefit" gap is resolved — ports are now real data driving both the board and bank-trade rates. No behavioural regressions; the only test churn was adding a non-null `dice` to play-phase fixtures now that building/trading requires having rolled.

*Assumptions made this session (zoom/pan + audio):* **Panning is allowed from anywhere on the board, not only from empty space.** The task said "drag on empty board space", but the board is almost entirely covered by click targets (54 intersections, 72 road slots, 19 hexes), so an empty-space-only rule would leave very little draggable area. A 5px movement threshold that turns a press into a pan and then swallows the trailing click achieves the same intent — clicks still work, drags never misfire — and matches how Colonist behaves. Pinch is implemented with **pointer** events rather than raw `touchstart`/`touchmove`; it still tracks the distance between the two touch points as specified, but keeps mouse-drag and touch-drag on one code path. Zoom bounds are 0.5×–3× and the initial/reset view is *fit-to-frame* rather than a hard 1.0, so a small window still shows the whole board as it did before this session. Sound cues are derived from a **state diff** rather than fired inside click handlers (so a rejected action is silent) — the sole exception is the bank trade, which is indistinguishable from a build cost in a diff. A win plays only the win fanfare, suppressing the placement/dev-card cue that caused it.

*Assumptions made in a prior session (roll-lock + ports):* the roll-first gate blocks exactly the four actions the task named (settlement/road/city build + bank trade); **buying** a dev card is *not* gated pre-roll (the task scoped the block to building/trading and only called out dev-card *play* as the exception — buying is left available, matching that literal scope). Road Building's free roads are exempt from the gate via the `roadBuilding` flag, so a pre-roll Road Building still works. Port-to-vertex assignment was derived by matching each existing placeholder dock position to its nearest coastal edge, giving the standard 4×3:1 + 5×2:1 layout; the label dock positions are unchanged, now with dashed lines to the two served intersections.

*Assumptions from prior sessions (still current):* the deck keeps the standard 25-card split (2 Monopoly, not the "1 Monopoly" in an earlier request, which would total 24 and contradict "25-card deck"); a played Knight reuses the `robber` state machine straight at `stage: 'move'` (no discard) and its Largest Army recompute happens before the robber moves, so an army-driven win skips the move; hidden VP cards count toward the win immediately on draw (see known issue #11); the Longest Road tie/handoff rule also strips a holder whose chain drops below 5.

---

## Assumptions (finish run, 2026-11-08)

- **Turn counter = round number.** `turn` starts at 1 when play begins and advances each time play wraps back to Player 1; setup is not counted (the header shows "Setup" instead). The log marks each new round with `Turn N — …`.
- **Player trades** must have at least one card on each side (no gifts) and may not list the same resource on both sides. The offer is a pending `tradeOffer` in state; the recipient accepts or declines, the offerer can withdraw, both hands are re-checked at accept time, and End Turn clears any pending offer.
- **Board editor free mode** still rejects shape errors (wrong hex/port count, unknown terrain or port type, a 7 token) but allows any counts, a numbered desert (it produces nothing) and a board with no desert (the robber then starts off-board).
- **Native `<select>` dropdowns** were driven with the browser tool's form input during verification: the preview pane cannot drive a native select popup with clicks or keys. Board clicks always used real pointer travel.
- **`?board=<code>` opens the board in the Board Editor** (not straight into a game), so whoever receives a link can look it over and pick Start. A non-standard shared board opens with free mode already on; an invalid code lands on Home with an error.
- **Balanced dice** draw without replacement from the 36 two-dice combinations and reshuffle the full deck once fewer than 13 remain (the last 12 of each deal stay unseen, which keeps the tail of a deal from being predictable). Colonist's extra per-player streak adjustments are not modelled.
- **Scripted dice**: a scripted total becomes a fixed pair (`max(1, t−6)` + rest, e.g. 9 → 3+6); an exact pair is typed `3+4`. The queue can be replaced at any time, including on another player's turn, and the edit is a recorded action so replays match.
- **Sandbox resume always lands in play phase** (setup counters are dropped), clears any pending robber / trade / Road Building step, sets each bank pile to 19 minus what the hands hold, and recomputes Largest Army, Longest Road, VP and the winner from scratch (a holder who no longer qualifies loses the award). A sandbox "has rolled" turn has no dice values; the tray shows "rolled". Sandbox placement ignores supply limits too.
- **Sandbox dev cards** come out of the draw pile when it has that type, and removed ones go to the bottom of the pile, so the next draw is unaffected.
- **Replay steps are actions, not turns**: the viewer moves one recorded action at a time (every placement, roll, trade, sandbox edit); "Jump to" lands on the first state of a turn. "Play from here" adds the branch as a new game in the games list and leaves the original as it was.
- **Autosave covers every game in the session**, not only the open one (branches and imports included), stored as options + actions under `catanalyst.games` and rebuilt by replay on load. A reload lands on Home with the list rather than reopening a game automatically, so `?board=` links still open the editor. A saved entry that no longer replays is dropped instead of breaking the rest.
- **Export/import format**: `{ format: 'catanalyst-game', version: 1, name, options: { seed, board, diceMode, diceQueue }, actions }`. Import fully replays the actions, so a file that is structurally fine but contains an illegal move is rejected with the failing action named.
