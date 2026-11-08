import { useState } from 'react';
import {
  EDGES, VERTICES, HEX_CENTERS, HEX_TO_VERTICES, BOARD_WIDTH, BOARD_HEIGHT, BOARD_MIN_X, BOARD_MIN_Y,
} from '../game/gameRules.js';
import { TerrainArt, SeaAndBeach, Settlement, City, Robber, PortArt, Pier } from './BoardArt.jsx';

const RESOURCE_COLORS = {
  hills:     '#C1440E',
  forest:    '#228B22',
  mountains: '#8C8C8C',
  fields:    '#F4D03F',
  pasture:   '#90EE90',
  desert:    '#DEB887',
};

// HEX_TO_VERTICES lists each hex's corners in angle order, so they trace the
// polygon; `scale` shrinks or grows it about the hex centre (bevel, beach).
function hexPoints(hexIndex, scale = 1) {
  const { cx, cy } = HEX_CENTERS[hexIndex];
  return HEX_TO_VERTICES[hexIndex]
    .map(v => `${cx + (VERTICES[v].x - cx) * scale},${cy + (VERTICES[v].y - cy) * scale}`).join(' ');
}

// Illustration sits above the number token; the desert's fills the hex.
const ART_Y = -24;
const TOKEN_Y = 9;

function Token({ cx, cy, number }) {
  const pips = 6 - Math.abs(7 - number);
  const isRed = number === 6 || number === 8;
  const color = isRed ? '#CC0000' : '#3B1F0E';
  const tokenR = 18;
  const pipR = 1.8;
  const pipSpacing = 4.5;
  const pipY = cy + 8;
  const pipStartX = cx - ((pips - 1) * pipSpacing) / 2;

  return (
    <g>
      <circle cx={cx} cy={cy} r={tokenR} fill="#F5E6C8" stroke="#8B7355" strokeWidth={1.5} />
      <text
        x={cx}
        y={cy - 4}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={15}
        fontWeight="bold"
        fill={color}
      >
        {number}
      </text>
      {Array.from({ length: pips }).map((_, i) => (
        <circle
          key={i}
          cx={pipStartX + i * pipSpacing}
          cy={pipY}
          r={pipR}
          fill={color}
        />
      ))}
    </g>
  );
}

function Port({ port, selected, onClick }) {
  const [A, B] = port.vertices.map(v => VERTICES[v]);
  const name = port.type === 'generic' ? '3:1 harbour (any resource)' : `2:1 ${port.type} harbour`;
  return (
    <g onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined} data-port={port.type}>
      <title>{name}</title>
      <Pier x1={port.x} y1={port.y} x2={A.x} y2={A.y} />
      <Pier x1={port.x} y1={port.y} x2={B.x} y2={B.y} />
      <PortArt x={port.x} y={port.y} type={port.type} selected={selected} />
    </g>
  );
}

// Shrink an edge's endpoints toward its midpoint so roads don't cover intersection dots
// Click-target sizes. The drawn intersection dot is r=4 when empty, which at
// fit-to-frame zoom is far smaller than a mouse can reliably hit, so the thing
// the browser hit-tests is decoupled from the thing it draws. Vertices sit
// ~50 units apart, so r=16 targets stay well clear of each other.
const HIT_RADIUS = 16;
const HIT_STROKE = 18;

function edgeEndpoints(edgeIndex, shrink) {
  const [v1, v2] = EDGES[edgeIndex];
  const a = VERTICES[v1];
  const b = VERTICES[v2];
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  return {
    x1: mx + (a.x - mx) * shrink, y1: my + (a.y - my) * shrink,
    x2: mx + (b.x - mx) * shrink, y2: my + (b.y - my) * shrink,
  };
}

function RoadSlot({ edgeIndex, onEdgeClick, glow = false }) {
  const [hovered, setHovered] = useState(false);
  const { x1, y1, x2, y2 } = edgeEndpoints(edgeIndex, 0.62);
  return (
    <g
      data-edge={edgeIndex}
      onClick={() => onEdgeClick(edgeIndex)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ cursor: 'pointer' }}
    >
      <line
        x1={x1} y1={y1} x2={x2} y2={y2}
        className={glow && !hovered ? 'g-spot' : undefined}
        stroke={hovered ? 'rgba(255,255,255,0.95)' : glow ? '#fff' : 'rgba(255,255,255,0.35)'}
        strokeWidth={hovered || glow ? 8 : 6}
        strokeLinecap="round"
      />
      {/* Hit target only: a 6px line is thin to hit once fitZoom shrinks the
          board, so widen what the browser hit-tests without redrawing it. */}
      <line
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke="transparent"
        strokeWidth={HIT_STROKE}
        strokeLinecap="round"
      />
    </g>
  );
}

function Road({ edgeIndex, colour }) {
  const { x1, y1, x2, y2 } = edgeEndpoints(edgeIndex, 0.72);
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#222" strokeWidth={9} strokeLinecap="round" />
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={colour} strokeWidth={5.5} strokeLinecap="round" />
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fff" strokeOpacity={0.3} strokeWidth={1.6} strokeLinecap="round" />
    </g>
  );
}

// Viewbox extents come from gameRules so the board's pixel size has a single
// definition shared with BoardViewport's pan/zoom limits and the tests.
const VB_W = BOARD_WIDTH;
const VB_H = BOARD_HEIGHT;
const VB_MIN_X = BOARD_MIN_X;
const VB_MIN_Y = BOARD_MIN_Y;

export default function HexBoard({ board, underlay = null, hexOpacity = 1, pipLabels = null, placements = [], roads = [], cities = [], robberHex = null, highlightVertices, highlightEdges, onIntersectionClick, onEdgeClick, onHexClick, onPortClick, selectedHex = null, selectedPort = null }) {
  const settlementMap = new Map(placements.map(({ intersectionIndex, colour }) => [intersectionIndex, colour]));
  const roadMap = new Map(roads.map(({ edgeIndex, colour }) => [edgeIndex, colour]));
  const cityMap = new Map(cities.map(({ intersectionIndex, colour }) => [intersectionIndex, colour]));
  // Legal spots to glow. Given an edge list, only those edges get road slots.
  const glowEdges = highlightEdges ? new Set(highlightEdges) : null;
  const hexes = HEX_CENTERS.map(({ cx, cy }, i) => ({
    x: cx, y: cy, resource: board.tiles[i], number: board.numbers[i],
  }));

  // Rendered at its natural size with no max-width fitting: scaling is the
  // job of the enclosing BoardViewport's transform, and letting CSS shrink the
  // SVG as well would fight the zoom level the user picked.
  return (
    <svg
      width={VB_W}
      height={VB_H}
      viewBox={`${VB_MIN_X} ${VB_MIN_Y} ${VB_W} ${VB_H}`}
      style={{ display: 'block', overflow: 'visible' }}
    >
      {hexOpacity === 1 && <SeaAndBeach hexes={hexes} hexPoints={hexPoints} />}
      {/* Board editor tracing: a screenshot drawn under the hexes, in board units. */}
      {underlay && (
        <image href={underlay.href} x={underlay.x} y={underlay.y} width={underlay.width} height={underlay.height} preserveAspectRatio="none" pointerEvents="none" />
      )}
      {hexes.map(({ x, y, resource, number }, i) => {
        // While tracing a screenshot, its own art and tokens show through instead.
        const art = hexOpacity === 1;
        return (
          <g
            key={i}
            data-hex={i}
            onClick={onHexClick ? () => onHexClick(i) : undefined}
            style={onHexClick ? { cursor: 'pointer' } : undefined}
          >
            <polygon
              points={hexPoints(i)}
              fill={RESOURCE_COLORS[resource]}
              fillOpacity={hexOpacity}
              stroke={selectedHex === i || !art ? '#fff' : 'rgba(0,0,0,0.45)'}
              strokeWidth={selectedHex === i ? 4 : 2}
            />
            {art && <polygon points={hexPoints(i, 0.86)} fill="none" stroke="#fff" strokeOpacity={0.22} strokeWidth={2} pointerEvents="none" />}
            {art && robberHex !== i && (
              number !== null
                ? <TerrainArt terrain={resource} x={x} y={y + ART_Y} scale={1.2} />
                : <TerrainArt terrain={resource} x={x} y={y} scale={1.8} />
            )}
            {art && number !== null && <Token cx={x} cy={y + TOKEN_Y} number={number} />}
            {robberHex === i && <Robber x={x} y={number !== null ? y + ART_Y + 2 : y} />}
          </g>
        );
      })}
      {board.ports.map((port, i) => (
        <Port key={i} port={port} selected={selectedPort === i} onClick={onPortClick ? () => onPortClick(i) : undefined} />
      ))}
      {EDGES.map((_, edgeIndex) => {
        const colour = roadMap.get(edgeIndex);
        if (colour) return <Road key={edgeIndex} edgeIndex={edgeIndex} colour={colour} />;
        if (!onEdgeClick || (glowEdges && !glowEdges.has(edgeIndex))) return null;
        return <RoadSlot key={edgeIndex} edgeIndex={edgeIndex} onEdgeClick={onEdgeClick} glow={!!glowEdges} />;
      })}
      {VERTICES.map(({ x, y }, i) => {
        const cityColour = cityMap.get(i);
        if (cityColour) return <City key={i} x={x} y={y} colour={cityColour} />;
        const colour = settlementMap.get(i);
        if (colour) return <Settlement key={i} x={x} y={y} colour={colour} />;
        return <circle key={i} cx={x} cy={y} r={4} fill="white" stroke="#333" strokeWidth={1.5} pointerEvents="none" />;
      })}
      {highlightVertices && highlightVertices.map(v => (
        <circle
          key={`spot-${v}`}
          className="g-spot"
          cx={VERTICES[v].x} cy={VERTICES[v].y}
          r={settlementMap.has(v) ? 14 : 8}
          fill={settlementMap.has(v) ? 'none' : 'rgba(255,255,255,0.55)'}
          stroke="#fff" strokeWidth={2.5}
          pointerEvents="none"
        />
      ))}
      {/* Analysis overlay: pip value at each open intersection. Never clickable. */}
      {pipLabels && pipLabels.map(({ vertex, pips }) => (
        <g key={`pip-${vertex}`} pointerEvents="none">
          <circle cx={VERTICES[vertex].x} cy={VERTICES[vertex].y} r={10} fill="#15181f" stroke="#e7e9ee" strokeWidth={1} />
          <text x={VERTICES[vertex].x} y={VERTICES[vertex].y} textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight="bold" fill="#e7e9ee">
            {pips}
          </text>
        </g>
      ))}
      {/* Hit targets only — no fill, drawn last so they sit above every visual
          (including the road slots, which keep their clear middle section). */}
      {onIntersectionClick && VERTICES.map(({ x, y }, i) => (
        <circle
          key={`hit-${i}`}
          data-vertex={i}
          cx={x} cy={y}
          r={HIT_RADIUS}
          fill="transparent"
          onClick={() => onIntersectionClick(i)}
          style={{ cursor: 'pointer' }}
        />
      ))}
    </svg>
  );
}
