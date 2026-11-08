// Pure zoom/pan maths for the board viewport.
//
// No DOM and no React in here on purpose: every rule that decides *where the
// board is allowed to be* lives in this file so it can be tested in Node
// (tests/viewport.test.mjs) instead of only by hand in a browser.
//
// Coordinate model: the board surface is centred in its frame and carries
// `transform: translate(x, y) scale(zoom)` with `transform-origin: 50% 50%`.
// So `{ x: 0, y: 0 }` means "board centred in the frame", and x/y are pixel
// offsets from that centred position, measured in *screen* pixels (already
// post-scale, which is why translate is written before scale).
//
// `viewport` is the frame's pixel size `{ w, h }`; `content` is the board's
// unscaled pixel size `{ w, h }`.

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 3;

// How much of the board must stay inside the frame on each axis. Pan is
// clamped so the board can always be grabbed again — it can never be flung
// completely out of sight.
export const MIN_VISIBLE = 120;

export const DEFAULT_VIEW = { zoom: 1, x: 0, y: 0 };

// Only NaN and non-numbers fall back to the default; ±Infinity is a direction,
// so it clamps to the corresponding bound like any other out-of-range value.
export function clampZoom(zoom) {
  if (typeof zoom !== 'number' || Number.isNaN(zoom)) return DEFAULT_VIEW.zoom;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

// Largest allowed |offset| on one axis. Derived from the requirement that the
// board and the frame keep overlapping by MIN_VISIBLE px: with the board
// centred, its half-extent is (cSize * zoom) / 2, so the overlap runs out at
// (vSize + scaled) / 2. If the whole board is smaller than MIN_VISIBLE at this
// zoom, keep the board itself fully visible rather than inverting the range.
function panLimit(vSize, cSize, zoom) {
  const scaled = cSize * zoom;
  const keep = Math.min(MIN_VISIBLE, scaled);
  return Math.max(0, (vSize + scaled) / 2 - keep);
}

export function clampPan(pan, zoom, viewport, content) {
  const maxX = panLimit(viewport.w, content.w, zoom);
  const maxY = panLimit(viewport.h, content.h, zoom);
  const x = typeof pan.x === 'number' && !Number.isNaN(pan.x) ? pan.x : 0;
  const y = typeof pan.y === 'number' && !Number.isNaN(pan.y) ? pan.y : 0;
  return {
    x: Math.min(maxX, Math.max(-maxX, x)),
    y: Math.min(maxY, Math.max(-maxY, y)),
  };
}

// Clamp a whole view at once — used after a resize, where a previously legal
// pan can fall outside the new frame's limits.
export function clampView(view, viewport, content) {
  const zoom = clampZoom(view.zoom);
  return { zoom, ...clampPan(view, zoom, viewport, content) };
}

// Zoom toward a point (frame-relative pixels) so whatever is under the cursor
// stays under the cursor. A content point sits on screen at `c * zoom + pan`
// (relative to the frame centre); solving that for an unchanged screen
// position across a zoom change gives the pan below.
export function zoomAt(view, nextZoom, point, viewport, content) {
  const zoom = clampZoom(nextZoom);
  const sx = point.x - viewport.w / 2;
  const sy = point.y - viewport.h / 2;
  const ratio = zoom / view.zoom;
  const pan = {
    x: sx - (sx - view.x) * ratio,
    y: sy - (sy - view.y) * ratio,
  };
  return { zoom, ...clampPan(pan, zoom, viewport, content) };
}

// Wheel delta → zoom multiplier.
//
// On macOS a trackpad pinch is delivered as a wheel event with `ctrlKey` set
// (Chrome and Safari both do this; there is no separate gesture event). Those
// deltas are much smaller per unit of finger travel than a real wheel notch,
// so pinch gets its own sensitivity or it feels dead.
export function zoomFactorFromWheel(deltaY, ctrlKey) {
  const sensitivity = ctrlKey ? 0.01 : 0.0022;
  return Math.exp(-deltaY * sensitivity);
}

// Zoom that fits the whole board in the frame, magnifying in a big window
// and shrinking in a small one. Used for the initial view and the Fit button.
export function fitZoom(viewport, content) {
  if (!viewport.w || !viewport.h || !content.w || !content.h) return DEFAULT_VIEW.zoom;
  return clampZoom(Math.min(viewport.w / content.w, viewport.h / content.h));
}

// How far a press has to travel before it counts as a pan rather than a click.
// This is hand-jitter tolerance, not a UI preference: a press on a trackpad
// routinely drifts well past the ~5px a mouse does, and every pixel of drift
// under this limit still has to place a settlement. Panning is a gesture of
// tens of pixels, so a generous limit costs nothing on that side.
export const DRAG_THRESHOLD = 12;

export function exceedsDragThreshold(dx, dy) {
  return Math.hypot(dx, dy) >= DRAG_THRESHOLD;
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
