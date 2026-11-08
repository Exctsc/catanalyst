import { useState } from 'react';
import {
  EDGES, VERTICES, HEX_CENTERS, HEX_TO_VERTICES, BOARD_WIDTH, BOARD_HEIGHT, BOARD_MIN_X, BOARD_MIN_Y,
} from '../game/gameRules.js';

const RESOURCE_COLORS = {
  hills:     '#C1440E',
  forest:    '#228B22',
  mountains: '#8C8C8C',
  fields:    '#F4D03F',
  pasture:   '#90EE90',
  desert:    '#DEB887',
};

// Port visual styling keyed by type (port data lives in gameState.board.ports)
const PORT_STYLE = {
  generic: { fill: '#E0E0E0', text: '#444' },
  brick:   { fill: '#C1440E', text: 'white' },
  wood:    { fill: '#228B22', text: 'white' },
  ore:     { fill: '#8C8C8C', text: 'white' },
  wheat:   { fill: '#F4D03F', text: '#333' },
  sheep:   { fill: '#90EE90', text: '#333' },
};
function portLabel(type) {
  return type === 'generic' ? '3:1' : `2:1 ${type[0].toUpperCase()}${type.slice(1)}`;
}

// HEX_TO_VERTICES lists each hex's corners in angle order, so they trace the polygon.
function hexPoints(hexIndex) {
  return HEX_TO_VERTICES[hexIndex].map(v => `${VERTICES[v].x},${VERTICES[v].y}`).join(' ');
}

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
        fontSize={13}
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
  const { fill, text } = PORT_STYLE[port.type];
  const label = portLabel(port.type);
  const w = label.length * 6.5 + 10;
  const h = 18;
  const [va, vb] = port.vertices;
  const A = VERTICES[va];
  const B = VERTICES[vb];
  return (
    <g onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
      {/* dock lines connecting the harbour to the two coastal intersections it serves */}
      <line x1={port.x} y1={port.y} x2={A.x} y2={A.y} stroke="rgba(150,110,60,0.65)" strokeWidth={2.5} strokeDasharray="3 3" />
      <line x1={port.x} y1={port.y} x2={B.x} y2={B.y} stroke="rgba(150,110,60,0.65)" strokeWidth={2.5} strokeDasharray="3 3" />
      <rect
        x={port.x - w / 2} y={port.y - h / 2}
        width={w} height={h}
        rx={4}
        fill={fill}
        stroke={selected ? '#fff' : 'rgba(0,0,0,0.35)'}
        strokeWidth={selected ? 3 : 1}
      />
      <text
        x={port.x} y={port.y}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={10}
        fontWeight="bold"
        fill={text}
      >
        {label}
      </text>
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

function RoadSlot({ edgeIndex, onEdgeClick }) {
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
        stroke={hovered ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.35)'}
        strokeWidth={hovered ? 8 : 6}
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
    </g>
  );
}

// Viewbox extents come from gameRules so the board's pixel size has a single
// definition shared with BoardViewport's pan/zoom limits and the tests.
const VB_W = BOARD_WIDTH;
const VB_H = BOARD_HEIGHT;
const VB_MIN_X = BOARD_MIN_X;
const VB_MIN_Y = BOARD_MIN_Y;

function RobberMarker({ cx, cy }) {
  return (
    <g pointerEvents="none">
      <circle cx={cx} cy={cy - 30} r={10} fill="#2C3E50" stroke="white" strokeWidth={1.5} />
      <text
        x={cx} y={cy - 30}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={11}
        fontWeight="bold"
        fill="white"
      >
        R
      </text>
    </g>
  );
}

export default function HexBoard({ board, pipLabels = null, placements = [], roads = [], cities = [], robberHex = null, onIntersectionClick, onEdgeClick, onHexClick, onPortClick, selectedHex = null, selectedPort = null }) {
  const settlementMap = new Map(placements.map(({ intersectionIndex, colour }) => [intersectionIndex, colour]));
  const roadMap = new Map(roads.map(({ edgeIndex, colour }) => [edgeIndex, colour]));
  const cityMap = new Map(cities.map(({ intersectionIndex, colour }) => [intersectionIndex, colour]));
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
      style={{ display: 'block' }}
    >
      {hexes.map(({ x, y, resource, number }, i) => (
        <g
          key={i}
          data-hex={i}
          onClick={onHexClick ? () => onHexClick(i) : undefined}
          style={onHexClick ? { cursor: 'pointer' } : undefined}
        >
          <polygon
            points={hexPoints(i)}
            fill={RESOURCE_COLORS[resource]}
            stroke={selectedHex === i ? '#fff' : '#333'}
            strokeWidth={selectedHex === i ? 4 : 2}
          />
          {number !== null && <Token cx={x} cy={y} number={number} />}
          {robberHex === i && <RobberMarker cx={x} cy={y} />}
        </g>
      ))}
      {board.ports.map((port, i) => (
        <Port key={i} port={port} selected={selectedPort === i} onClick={onPortClick ? () => onPortClick(i) : undefined} />
      ))}
      {EDGES.map((_, edgeIndex) => {
        const colour = roadMap.get(edgeIndex);
        if (colour) return <Road key={edgeIndex} edgeIndex={edgeIndex} colour={colour} />;
        if (!onEdgeClick) return null;
        return <RoadSlot key={edgeIndex} edgeIndex={edgeIndex} onEdgeClick={onEdgeClick} />;
      })}
      {VERTICES.map(({ x, y }, i) => {
        const cityColour = cityMap.get(i);
        if (cityColour) {
          const s = 16;
          return (
            <rect
              key={i}
              x={x - s / 2} y={y - s / 2}
              width={s} height={s}
              rx={2}
              fill={cityColour}
              stroke="white"
              strokeWidth={2}
            />
          );
        }
        const colour = settlementMap.get(i);
        return (
          <circle
            key={i}
            cx={x} cy={y}
            r={colour ? 7 : 4}
            fill={colour || 'white'}
            stroke={colour ? 'white' : '#333'}
            strokeWidth={colour ? 2 : 1.5}
          />
        );
      })}
      {/* Analysis overlay: pip value at each open intersection. Never clickable. */}
      {pipLabels && pipLabels.map(({ vertex, pips }) => (
        <g key={`pip-${vertex}`} pointerEvents="none">
          <circle cx={VERTICES[vertex].x} cy={VERTICES[vertex].y} r={9} fill="#15181f" stroke="#e7e9ee" strokeWidth={1} />
          <text x={VERTICES[vertex].x} y={VERTICES[vertex].y} textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight="bold" fill="#e7e9ee">
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
