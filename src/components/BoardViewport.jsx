import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  MIN_ZOOM, MAX_ZOOM,
  clampPan, clampView, fitZoom, zoomAt, zoomFactorFromWheel, distance, midpoint,
  exceedsDragThreshold,
} from '../game/viewport.js';

// Zoom applied per click of the +/- buttons.
const BUTTON_STEP = 1.25;

// The "scroll or pinch to zoom" hint shows until someone zooms or pans once.
const HINT_KEY = 'catanalyst.zoomHintSeen';
function hintSeen() {
  try { return window.localStorage.getItem(HINT_KEY) === '1'; } catch { return false; }
}

/**
 * Pan/zoom frame for the board.
 *
 * The board is moved with a CSS transform on a wrapper, which is what keeps
 * click targets correct: the browser hit-tests through the transform, so the
 * SVG intersection dots, road slots, and hex polygons inside stay accurate at
 * every zoom and pan level without any coordinate conversion on our side.
 * (Recomputing the SVG viewBox instead would work too, but anything that
 * translated screen→board coordinates by hand would be a bug farm.)
 *
 * `contentWidth`/`contentHeight` are the board's unscaled pixel size.
 */
export default function BoardViewport({ contentWidth, contentHeight, children }) {
  const frameRef = useRef(null);
  const [view, setView] = useState(() => ({ zoom: 1, x: 0, y: 0 }));
  const [grabbing, setGrabbing] = useState(false);
  const [showHint, setShowHint] = useState(() => !hintSeen());
  const dismissHint = useCallback(() => {
    setShowHint(false);
    try { window.localStorage.setItem(HINT_KEY, '1'); } catch { /* storage unavailable */ }
  }, []);

  // Live frame/content sizes kept in refs so the pointer and wheel handlers can
  // read them without re-subscribing on every render.
  const sizeRef = useRef({ w: 0, h: 0 });
  const contentRef = useRef({ w: contentWidth, h: contentHeight });

  const pointersRef = useRef(new Map()); // pointerId → frame-relative position
  const dragRef = useRef(null);          // { startX, startY, startPan, moved }
  const pinchRef = useRef(null);         // { distance } between the two touches
  const suppressClickRef = useRef(false);
  const initialisedRef = useRef(false);

  const fitView = useCallback(() => ({
    zoom: fitZoom(sizeRef.current, contentRef.current),
    x: 0,
    y: 0,
  }), []);

  // Measure the frame, and re-clamp when it changes size — a pan that was legal
  // in a wide window can be out of bounds in a narrow one.
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    function measure() {
      const rect = frame.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      sizeRef.current = { w: rect.width, h: rect.height };
      if (initialisedRef.current) {
        setView(v => clampView(v, sizeRef.current, contentRef.current));
      } else {
        initialisedRef.current = true;
        setView(fitView());
      }
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [fitView]);

  // Board size is fixed today, but keep the ref in sync (and re-clamp) rather
  // than writing it during render, which would be a ref mutation mid-render.
  useEffect(() => {
    contentRef.current = { w: contentWidth, h: contentHeight };
    setView(v => clampView(v, sizeRef.current, contentRef.current));
  }, [contentWidth, contentHeight]);

  // Wheel needs a non-passive listener to call preventDefault (React attaches
  // its own wheel handling passively), so it's bound manually.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    function onWheel(event) {
      event.preventDefault(); // no page scroll, no browser pinch-zoom
      const rect = frame.getBoundingClientRect();
      const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      // ctrlKey is how macOS reports a trackpad pinch as a wheel event.
      const factor = zoomFactorFromWheel(event.deltaY, event.ctrlKey);
      setView(v => zoomAt(v, v.zoom * factor, point, sizeRef.current, contentRef.current));
      dismissHint();
    }

    frame.addEventListener('wheel', onWheel, { passive: false });
    return () => frame.removeEventListener('wheel', onWheel);
  }, [dismissHint]);

  // Swallow the click that ends a drag, before it reaches the board, so panning
  // across an intersection never places a settlement.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    function onClickCapture(event) {
      if (!suppressClickRef.current) return;
      suppressClickRef.current = false;
      event.stopPropagation();
      event.preventDefault();
    }

    frame.addEventListener('click', onClickCapture, true);
    return () => frame.removeEventListener('click', onClickCapture, true);
  }, []);

  // Capture keeps a drag alive if the pointer leaves the frame, but it must not
  // be taken on pointerdown: while it is held the browser retargets pointerup —
  // and with it the compatibility mouseup — to the capturing frame. `click` is
  // then dispatched on the nearest common ancestor of the mousedown and mouseup
  // targets, i.e. the frame, so an intersection's own onClick never runs. Any
  // real press drifts a pixel or two, so capturing up front broke every click.
  // Taking it only once a gesture is a confirmed pan leaves ordinary clicks
  // untouched and still holds the pointer for the drags that need it.
  function capturePointer(event) {
    try {
      // Throws for an unrecognised pointer id, which must not take the gesture
      // down with it; the drag still works while the pointer stays over the frame.
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Non-fatal.
    }
  }

  function localPoint(event) {
    const rect = frameRef.current.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  // Pointer events cover mouse drag and touch with one code path: a single
  // pointer pans, two pointers pinch (tracking the distance between them).
  function handlePointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    // A new press is always a fresh gesture. Without this, a suppression left
    // over from a gesture that ended without dispatching a click (pointer
    // released outside the window) would silently eat the next real click.
    suppressClickRef.current = false;
    const point = localPoint(event);
    pointersRef.current.set(event.pointerId, point);

    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      pinchRef.current = { distance: distance(a, b) };
      dragRef.current = null;
      suppressClickRef.current = true; // a pinch is never a tap, so capture is safe here
      capturePointer(event);
      setGrabbing(false);
      return;
    }

    if (pointersRef.current.size === 1) {
      dragRef.current = {
        startX: point.x,
        startY: point.y,
        startPan: { x: view.x, y: view.y },
        moved: false,
      };
    }
  }

  function handlePointerMove(event) {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, localPoint(event));

    if (pinchRef.current && pointersRef.current.size >= 2) {
      const [a, b] = [...pointersRef.current.values()];
      const spread = distance(a, b);
      const previous = pinchRef.current.distance;
      if (previous > 0 && spread > 0) {
        pinchRef.current.distance = spread;
        const centre = midpoint(a, b);
        setView(v => zoomAt(v, v.zoom * (spread / previous), centre, sizeRef.current, contentRef.current));
        dismissHint();
      }
      return;
    }

    const drag = dragRef.current;
    if (!drag) return;
    const point = pointersRef.current.get(event.pointerId);
    const dx = point.x - drag.startX;
    const dy = point.y - drag.startY;

    if (!drag.moved) {
      if (!exceedsDragThreshold(dx, dy)) return;
      drag.moved = true;
      capturePointer(event);
      setGrabbing(true);
      dismissHint();
    }
    suppressClickRef.current = true;
    setView(v => ({
      zoom: v.zoom,
      ...clampPan(
        { x: drag.startPan.x + dx, y: drag.startPan.y + dy },
        v.zoom, sizeRef.current, contentRef.current,
      ),
    }));
  }

  function handlePointerUp(event) {
    pointersRef.current.delete(event.pointerId);

    if (pointersRef.current.size < 2) pinchRef.current = null;

    if (pointersRef.current.size === 1) {
      // Lifting one finger out of a pinch hands the remaining one to panning,
      // re-seeded from where it is now so the board doesn't jump.
      const [remaining] = [...pointersRef.current.values()];
      dragRef.current = {
        startX: remaining.x,
        startY: remaining.y,
        startPan: { x: view.x, y: view.y },
        moved: true, // already a gesture, so its release stays click-suppressed
      };
    } else if (pointersRef.current.size === 0) {
      dragRef.current = null;
      setGrabbing(false);
    }
  }

  const zoomByButton = useCallback(factor => {
    setView(v => zoomAt(
      v, v.zoom * factor,
      { x: sizeRef.current.w / 2, y: sizeRef.current.h / 2 }, // anchor on centre
      sizeRef.current, contentRef.current,
    ));
    dismissHint();
  }, [dismissHint]);

  return (
    <div className="g-board-wrap">
      <div
        ref={frameRef}
        className={`g-board-frame${grabbing ? ' g-board-grabbing' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div
          className="g-board-surface"
          style={{
            width: contentWidth,
            height: contentHeight,
            transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.zoom})`,
          }}
        >
          {children}
        </div>
      </div>

      {showHint && (
        <div className="g-board-hint" role="note">
          <span>Scroll or pinch to zoom, drag to move the board, or use the buttons below.</span>
          <button className="g-board-hint-close" onClick={dismissHint} aria-label="Dismiss hint">×</button>
        </div>
      )}

      {/* Zoom buttons for anyone who doesn't scroll or pinch. */}
      <div className="g-board-controls">
        <button
          className="g-zoom-btn"
          onClick={() => zoomByButton(1 / BUTTON_STEP)}
          disabled={view.zoom <= MIN_ZOOM}
          title="Zoom out"
          aria-label="Zoom out"
        >
          −
        </button>
        <span className="g-zoom-level" title="Zoom level">{Math.round(view.zoom * 100)}%</span>
        <button
          className="g-zoom-btn"
          onClick={() => zoomByButton(BUTTON_STEP)}
          disabled={view.zoom >= MAX_ZOOM}
          title="Zoom in"
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          className="g-zoom-btn g-zoom-fit"
          onClick={() => setView(fitView())}
          title="Fit the whole board"
          aria-label="Fit the whole board"
        >
          Fit
        </button>
      </div>
    </div>
  );
}
