# What's left for Tony

Nothing in `FINISH.md` is blocked any more. These are the things only you can do.

## Done after the run: GitHub repo

The private repo `Exctsc/catanalyst` was created and `main` pushed once you approved it (the
autonomous attempt had been refused by the permission classifier). Later commits push with
`git push`.

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
