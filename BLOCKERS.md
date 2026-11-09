# What's left for Tony

Nothing in `FINISH.md` is blocked any more. These are the things only you can do.

## Done after the run: GitHub repo

The private repo `Exctsc/catanalyst` was created and `main` pushed once you approved it (the
autonomous attempt had been refused by the permission classifier). Later commits push with
`git push`.

## For you (from FINISH.md "Human steps")

1. Play it for an hour on a trackpad. Pinch-zoom and drag-vs-click were tuned on a mouse and on
   synthetic trackpad events; a real trackpad is the remaining check.
2. ~~Deploy~~ Done: live at **https://catanalyst.netlify.app** (Netlify project `catanalyst`,
   team `exctsc`). Your team had visitor login
   protection on; it was turned off for this site at your request so anyone with the link can
   open it. Redeploy after changes with `npm run deploy`. Optional: link the GitHub repo in
   Netlify (Project configuration → Build & deploy) for automatic deploys on push, and make the
   repo public if you want the code visible. The free plan adds a "Powered by Netlify" badge in
   the bottom-right corner; the app leaves that corner clear when the badge is present.
3. Record the 60 to 90 second demo. (The README intro and `docs/screenshot.png` are done;
   the intro is written from Tony's own account and worth a read-through.)
4. Get 5 to 10 competitive players to try it and collect quotes.
5. **Online play** works on the live site (a real two-browser game was played there). Your Mac runs **Cloudflare WARP**, which blocks the direct browser-to-browser link completely;
   turn WARP off while hosting or joining. If some friends' networks still block it, the fix is a
   TURN relay (Cloudflare or Metered free tiers, both need an account you'd create) added to the
   Peer options in `src/net/peer.js`.

## Worth a look (not blockers)

- **Board from a screenshot** now reads terrain, numbers and ports; on your Colonist screenshot
  everything came out right. If Colonist changes its art or you try another site, a misread
  terrain shade goes in `REFERENCE` and a misread port icon means re-measuring `ICON_PROFILES`
  (both in `src/game/boardImage.js`). Rotated boards aren't supported.
- **Copy link** in the board editor uses the clipboard API. In the desktop app's preview pane the
  write was refused (no clipboard permission), so the button just stays "Copy link"; the code field
  and "Open link" work everywhere. Check it once in a normal Chrome tab after deploying.
- **Native dropdowns** (board, dice, trade partner, bank trade, editor selects) were exercised by
  setting their values through the browser tool, because the preview pane cannot open a native
  `<select>` popup with real clicks. They are plain `<select>` elements, but a quick manual pass is
  cheap.
- Known limits (hotseat hidden info, Road Building skip, etc.) are listed in
  `CATANALYST_PROGRESS.md` under "Known issues and limits".
