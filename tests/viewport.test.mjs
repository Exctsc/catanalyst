import {
  MIN_ZOOM, MAX_ZOOM, MIN_VISIBLE, DEFAULT_VIEW,
  clampZoom, clampPan, clampView, zoomAt, zoomFactorFromWheel, fitZoom, distance, midpoint,
} from '../src/game/viewport.js';
import { BOARD_WIDTH, BOARD_HEIGHT } from '../src/game/gameRules.js';

let pass = 0, fail = 0;
function check(name, cond) {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}`);
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// A typical desktop board area, and the real board size.
const VIEWPORT = { w: 900, h: 640 };
const CONTENT = { w: BOARD_WIDTH, h: BOARD_HEIGHT };

// --- clampZoom -------------------------------------------------------------
check('clampZoom keeps an in-range zoom untouched', clampZoom(1.4) === 1.4);
check('clampZoom floors at MIN_ZOOM', clampZoom(0.01) === MIN_ZOOM);
check('clampZoom caps at MAX_ZOOM', clampZoom(99) === MAX_ZOOM);
check('clampZoom accepts the exact bounds', clampZoom(MIN_ZOOM) === MIN_ZOOM && clampZoom(MAX_ZOOM) === MAX_ZOOM);
check('clampZoom rejects NaN', clampZoom(NaN) === DEFAULT_VIEW.zoom);
check('clampZoom clamps Infinity to a bound rather than resetting', clampZoom(Infinity) === MAX_ZOOM && clampZoom(-Infinity) === MIN_ZOOM);
check('clampZoom rejects undefined', clampZoom(undefined) === DEFAULT_VIEW.zoom);
check('clampZoom rejects negatives', clampZoom(-3) === MIN_ZOOM);

// --- clampPan --------------------------------------------------------------
check('clampPan leaves a centred board alone', (() => {
  const p = clampPan({ x: 0, y: 0 }, 1, VIEWPORT, CONTENT);
  return p.x === 0 && p.y === 0;
})());

check('clampPan leaves a small pan alone', (() => {
  const p = clampPan({ x: 40, y: -25 }, 1, VIEWPORT, CONTENT);
  return p.x === 40 && p.y === -25;
})());

check('clampPan is symmetric about centre', (() => {
  const a = clampPan({ x: 1e6, y: 1e6 }, 1, VIEWPORT, CONTENT);
  const b = clampPan({ x: -1e6, y: -1e6 }, 1, VIEWPORT, CONTENT);
  return near(a.x, -b.x) && near(a.y, -b.y);
})());

check('clampPan rejects NaN offsets', (() => {
  const p = clampPan({ x: NaN, y: NaN }, 1, VIEWPORT, CONTENT);
  return p.x === 0 && p.y === 0;
})());

// The core guarantee: however hard you drag, MIN_VISIBLE px of board remain.
function visibleExtent(pan, zoom, vSize, cSize) {
  const scaled = cSize * zoom;
  const left = vSize / 2 - scaled / 2 + pan;
  return Math.min(vSize, left + scaled) - Math.max(0, left);
}

check('a huge drag still leaves MIN_VISIBLE px of board on screen', (() => {
  return [0.5, 1, 1.7, 3].every(zoom => {
    const p = clampPan({ x: 99999, y: -99999 }, zoom, VIEWPORT, CONTENT);
    const vx = visibleExtent(p.x, zoom, VIEWPORT.w, CONTENT.w);
    const vy = visibleExtent(p.y, zoom, VIEWPORT.h, CONTENT.h);
    return near(vx, MIN_VISIBLE, 1e-6) && near(vy, MIN_VISIBLE, 1e-6);
  });
})());

check('the board can never be panned fully off screen at any zoom', (() => {
  const zooms = [MIN_ZOOM, 0.75, 1, 1.5, 2.25, MAX_ZOOM];
  const attempts = [-1e6, -5000, -900, 900, 5000, 1e6];
  return zooms.every(zoom => attempts.every(raw => {
    const p = clampPan({ x: raw, y: raw }, zoom, VIEWPORT, CONTENT);
    return visibleExtent(p.x, zoom, VIEWPORT.w, CONTENT.w) > 0
        && visibleExtent(p.y, zoom, VIEWPORT.h, CONTENT.h) > 0;
  }));
})());

check('a board smaller than MIN_VISIBLE stays wholly visible instead of inverting', (() => {
  const tiny = { w: 60, h: 40 };
  const p = clampPan({ x: 1e6, y: 1e6 }, 1, VIEWPORT, tiny);
  // Limit collapses to (viewport + content)/2 - content, i.e. the board's far
  // edge just touches the frame edge — never a negative (inverted) range.
  return near(p.x, (VIEWPORT.w + tiny.w) / 2 - tiny.w) && p.x > 0;
})());

check('clampPan limit grows with zoom (more board to explore)', (() => {
  const a = clampPan({ x: 1e6, y: 0 }, 1, VIEWPORT, CONTENT).x;
  const b = clampPan({ x: 1e6, y: 0 }, 2, VIEWPORT, CONTENT).x;
  return b > a;
})());

// --- clampView -------------------------------------------------------------
check('clampView clamps zoom and pan together', (() => {
  const v = clampView({ zoom: 50, x: 1e6, y: 1e6 }, VIEWPORT, CONTENT);
  const max = clampPan({ x: 1e6, y: 1e6 }, MAX_ZOOM, VIEWPORT, CONTENT);
  return v.zoom === MAX_ZOOM && near(v.x, max.x) && near(v.y, max.y);
})());

check('clampView pulls an out-of-bounds pan back after a shrink', (() => {
  const wide = clampPan({ x: 1e6, y: 0 }, 1, { w: 1600, h: 640 }, CONTENT);
  const narrow = clampView({ zoom: 1, ...wide }, { w: 500, h: 640 }, CONTENT);
  return narrow.x < wide.x;
})());

// --- zoomAt ----------------------------------------------------------------
// The point under the cursor must not move. Screen position of a board point,
// relative to the frame centre, is `boardPoint * zoom + pan`.
function screenOf(boardPoint, view) {
  return boardPoint * view.zoom + view.x;
}
function boardPointUnder(screenX, view) {
  return (screenX - view.x) / view.zoom;
}

check('zoomAt keeps the cursor anchored while zooming in', (() => {
  const view = { zoom: 1, x: 0, y: 0 };
  const point = { x: 700, y: 200 }; // off-centre, in frame pixels
  const sx = point.x - VIEWPORT.w / 2;
  const board = boardPointUnder(sx, view);
  const next = zoomAt(view, 2, point, VIEWPORT, CONTENT);
  return next.zoom === 2 && near(screenOf(board, next), sx, 1e-6);
})());

check('zoomAt keeps the cursor anchored while zooming out', (() => {
  const view = { zoom: 2.5, x: 60, y: -40 };
  const point = { x: 240, y: 500 };
  const sx = point.x - VIEWPORT.w / 2;
  const board = boardPointUnder(sx, view);
  const next = zoomAt(view, 1.25, point, VIEWPORT, CONTENT);
  return near(screenOf(board, next), sx, 1e-6);
})());

check('zoomAt anchored on the centre leaves a centred board centred', (() => {
  const next = zoomAt({ zoom: 1, x: 0, y: 0 }, 2, { x: VIEWPORT.w / 2, y: VIEWPORT.h / 2 }, VIEWPORT, CONTENT);
  return next.zoom === 2 && near(next.x, 0) && near(next.y, 0);
})());

check('zoomAt respects the zoom bounds', (() => {
  const centre = { x: VIEWPORT.w / 2, y: VIEWPORT.h / 2 };
  const inHard = zoomAt({ zoom: 1, x: 0, y: 0 }, 999, centre, VIEWPORT, CONTENT);
  const outHard = zoomAt({ zoom: 1, x: 0, y: 0 }, 0.001, centre, VIEWPORT, CONTENT);
  return inHard.zoom === MAX_ZOOM && outHard.zoom === MIN_ZOOM;
})());

check('zoomAt output is always within the pan limits', (() => {
  const corners = [{ x: 0, y: 0 }, { x: VIEWPORT.w, y: 0 }, { x: 0, y: VIEWPORT.h }, { x: VIEWPORT.w, y: VIEWPORT.h }];
  return corners.every(point => [0.2, 1, 3, 12].every(target => {
    const next = zoomAt({ zoom: 1, x: 0, y: 0 }, target, point, VIEWPORT, CONTENT);
    const limit = clampPan({ x: 1e6, y: 1e6 }, next.zoom, VIEWPORT, CONTENT);
    return Math.abs(next.x) <= limit.x + 1e-6 && Math.abs(next.y) <= limit.y + 1e-6;
  }));
})());

check('repeated zoom in then out returns to the starting view', (() => {
  const point = { x: 610, y: 300 };
  let v = { zoom: 1, x: 0, y: 0 };
  for (let i = 0; i < 4; i++) v = zoomAt(v, v.zoom * 1.25, point, VIEWPORT, CONTENT);
  for (let i = 0; i < 4; i++) v = zoomAt(v, v.zoom / 1.25, point, VIEWPORT, CONTENT);
  return near(v.zoom, 1, 1e-9) && near(v.x, 0, 1e-6) && near(v.y, 0, 1e-6);
})());

// --- zoomFactorFromWheel ---------------------------------------------------
check('scrolling up (negative delta) zooms in', zoomFactorFromWheel(-100, false) > 1);
check('scrolling down (positive delta) zooms out', zoomFactorFromWheel(100, false) < 1);
check('a zero delta is a no-op factor', zoomFactorFromWheel(0, false) === 1);
check('opposite deltas are exact reciprocals', near(zoomFactorFromWheel(-80, false) * zoomFactorFromWheel(80, false), 1, 1e-12));
// Mac trackpad pinch: ctrlKey=true, small deltas — needs the higher sensitivity.
check('ctrlKey (trackpad pinch) is more sensitive than a wheel notch', zoomFactorFromWheel(-10, true) > zoomFactorFromWheel(-10, false));
check('a small pinch delta still moves the zoom meaningfully', zoomFactorFromWheel(-10, true) > 1.05);
check('the factor is always positive, so zoom never flips sign', [-1e4, -50, 0, 50, 1e4].every(d => zoomFactorFromWheel(d, false) > 0));

// --- fitZoom ---------------------------------------------------------------
check('fitZoom never magnifies past 1:1 in a large frame', fitZoom({ w: 4000, h: 3000 }, CONTENT) === 1);
check('fitZoom shrinks to fit a small frame', (() => {
  const z = fitZoom({ w: 300, h: 640 }, CONTENT);
  return near(z, 300 / CONTENT.w) && z < 1;
})());
check('fitZoom uses the tighter of the two axes', (() => {
  // Very wide, short frame: height is the binding constraint.
  const z = fitZoom({ w: 5000, h: 400 }, CONTENT);
  return near(z, 400 / CONTENT.h) && z < 1;
})());
check('fitZoom respects MIN_ZOOM in an extremely small frame', fitZoom({ w: 10, h: 10 }, CONTENT) === MIN_ZOOM);
check('fitZoom falls back to 1 before the frame is measured', fitZoom({ w: 0, h: 0 }, CONTENT) === DEFAULT_VIEW.zoom);
check('the real board fits a default desktop centre at 1:1', fitZoom(VIEWPORT, CONTENT) === 1);

// --- geometry helpers (pinch tracking) ------------------------------------
check('distance measures pinch spread', distance({ x: 0, y: 0 }, { x: 3, y: 4 }) === 5);
check('distance of a point to itself is 0', distance({ x: 7, y: 7 }, { x: 7, y: 7 }) === 0);
check('midpoint finds the pinch centre', (() => {
  const m = midpoint({ x: 0, y: 10 }, { x: 40, y: 30 });
  return m.x === 20 && m.y === 20;
})());
check('a widening pinch produces a >1 zoom ratio', (() => {
  const before = distance({ x: 100, y: 300 }, { x: 200, y: 300 });
  const after = distance({ x: 60, y: 300 }, { x: 260, y: 300 });
  return after / before === 2;
})());

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
