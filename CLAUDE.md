# Catanalyst: rules for autonomous work

You are finishing Catanalyst without a human watching. `FINISH.md` is the definition of
done; `CATANALYST_PROGRESS.md` documents the current code in detail. Read both before
starting any work, and re-read FINISH.md whenever you resume or after compaction.

## How to work

- Work through `FINISH.md` in order, one unchecked item at a time.
- Game logic stays in pure functions under `src/game/` with Node tests in `tests/`
  (plain `.test.mjs` files run by `npm test`, same style as the existing suites).
  Write the tests with the logic. Never weaken or delete an existing assertion to make
  a change pass unless the rule itself changed, and say so in the commit message.
- Before checking a box: `npm test`, `npm run build` and `npm run lint` all pass.
- Then: tick the box in `FINISH.md`, commit with a short imperative message
  (`git add -A && git commit -m "..."`), and push if a GitHub remote exists.
- For anything with UI, verify it in a real browser against `npm run dev` before
  checking the box. Use clicks that travel a few pixels: zero-travel synthetic clicks
  hid the pointer-capture bug for weeks.

## When stuck

- If the same problem survives 3 genuine attempts, stop, write it to `BLOCKERS.md`
  (what you tried, what you observed, your best guess), leave the box unchecked, and
  move to the next item. Do not loop on visual or geometric tweaking.
- When a requirement is ambiguous, pick the reading a competitive Catan player would
  expect, record it under "Assumptions" in `CATANALYST_PROGRESS.md`, and continue.
  Do not stop to ask.

## Scope guard

- No backend, Socket.io, accounts, AI players or chat. Online play exists (Tony asked for it on
  2026-11-08) and stays serverless: browser-to-browser via PeerJS, protocol in `src/game/online.js`.
- No restyling of existing screens. New UI reuses the variables and classes in
  `src/game.css`.
- No new runtime dependencies unless clearly necessary; prefer small hand-written code.

## Stack

React 19 + Vite 8, plain JavaScript, no TypeScript, no UI libraries.
`npm run dev` (localhost:5173), `npm test`, `npm run build`, `npm run lint`.
