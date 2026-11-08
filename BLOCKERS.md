# Blockers and what's left for Tony

Items from `FINISH.md` that the autonomous run could not finish, and the things only you can do.

## Blocked: Phase 0, create the private GitHub repo and push

- **Tried:** `gh auth status` succeeds (logged in as `Exctsc`). `gh repo view Exctsc/catanalyst`
  confirmed no repo exists yet. `gh repo create catanalyst --private --source=. --remote=origin --push`
  was refused by the Claude Code permission classifier (flagged as data exfiltration), so no repo was
  created and nothing was pushed. That box stays unchecked in `FINISH.md`.
- **Not retried** by other means on purpose: the denial is a permission decision, not a bug.
- **To do:** create the repo and push everything (all work is committed on `main`):

  ```bash
  gh repo create catanalyst --private --source=. --remote=origin --push
  ```

## For you (from FINISH.md "Human steps")

1. Play it for an hour on a trackpad. Pinch-zoom and drag-vs-click were tuned on a mouse and on
   synthetic trackpad events; a real trackpad is the remaining check.
2. Connect the repo to Netlify (`netlify.toml` is ready: `npm run build`, publish `dist`, SPA
   redirect for `?board=` links), then make the GitHub repo public.
3. Fill in the README intro at `<!-- TONY: personal intro here -->`, add a screenshot at
   `docs/screenshot.png` (or a GIF), and record the 60 to 90 second demo.
4. Get 5 to 10 competitive players to try it and collect quotes.

## Worth a look (not blockers)

- **Copy link** in the board editor uses the clipboard API. In the desktop app's preview pane the
  write was refused (no clipboard permission), so the button just stays "Copy link"; the code field
  and "Open link" work everywhere. Check it once in a normal Chrome tab after deploying.
- **Native dropdowns** (board, dice, trade partner, bank trade, editor selects) were exercised by
  setting their values through the browser tool, because the preview pane cannot open a native
  `<select>` popup with real clicks. They are plain `<select>` elements, but a quick manual pass is
  cheap.
- Known limits (hotseat hidden info, Road Building skip, etc.) are listed in
  `CATANALYST_PROGRESS.md` under "Known issues and limits".
