import { useState } from 'react';
import {
  EDGES, PORTS, BOARD_WIDTH, BOARD_HEIGHT, BOARD_MIN_X, BOARD_MIN_Y,
} from '../game/gameRules.js';

const SIZE = 50;
const H_SPACING = SIZE * Math.sqrt(3);
const V_SPACING = SIZE * 1.5;

const RESOURCE_COLORS = {
  hills:     '#C1440E',
  forest:    '#228B22',
  mountains: '#8C8C8C',
  fields:    '#F4D03F',
  pasture:   '#90EE90',
  desert:    '#DEB887',
};

// 19 tiles in 3-4-5-4-3 order; desert at index 9 (centre of middle row)
const TILES = [
  'mountains', 'fields',  'forest',
  'fields',    'hills',   'pasture',  'mountains',
  'fields',    'forest',  'desert',   'forest',   'mountains',
  'hills',     'pasture', 'pasture',  'fields',
  'forest',    'hills',   'pasture',
];

// Standard Catan numbers assigned in reading order, null = desert
const NUMBERS = [2, 3, 3, 4, 4, 5, 5, 6, 6, null, 8, 8, 9, 9, 10, 10, 11, 11, 12];

const ROWS = [3, 4, 5, 4, 3];

// 54 unique intersection vertices derived from the hex grid
const VERTICES = (() => {
  const seen = new Set();
  const verts = [];
  ROWS.forEach((count, row) => {
    const cy = row * V_SPACING;
    for (let i = 0; i < count; i++) {
      const cx = (i - (count - 1) / 2) * H_SPACING;
      for (let k = 0; k < 6; k++) {
        const angle = Math.PI / 6 + (k * Math.PI) / 3;
        const vx = Math.round((cx + SIZE * Math.cos(angle)) * 1000) / 1000;
        const vy = Math.round((cy + SIZE * Math.sin(angle)) * 1000) / 1000;
        const key = `${vx},${vy}`;
        if (!seen.has(key)) {
          seen.add(key);
          verts.push({ x: vx, y: vy });
        }
      }
    }
  });
  return verts;
})();

// Port visual styling keyed by type (data + coastal vertices live in gameRules PORTS)
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

function hexPoints(cx, cy) {
  const pts = [];
  for (let k = 0; k < 6; k++) {
    const angle = Math.PI / 6 + (k * Math.PI) / 3;
    pts.push(`${cx + SIZE * Math.cos(angle)},${cy + SIZE * Math.sin(angle)}`);
  }
  return pts.join(' ');
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

function Port({ port }) {
  const { fill, text } = PORT_STYLE[port.type];
  const label = portLabel(port.type);
  const w = label.length * 6.5 + 10;
  const h = 18;
  const [va, vb] = port.vertices;
  const A = VERTICES[va];
  const B = VERTICES[vb];
  return (
    <g>
      {/* dock lines connecting the harbour to the two coastal intersections it serves */}
      <line x1={port.x} y1={port.y} x2={A.x} y2={A.y} stroke="rgba(150,110,60,0.65)" strokeWidth={2.5} strokeDasharray="3 3" />
      <line x1={port.x} y1={port.y} x2={B.x} y2={B.y} stroke="rgba(150,110,60,0.65)" strokeWidth={2.5} strokeDasharray="3 3" />
      <rect
        x={port.x - w / 2} y={port.y - h / 2}
        width={w} height={h}
        rx={4}
        fill={fill}
        stroke="rgba(0,0,0,0.35)"
        strokeWidth={1}
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
    <line
      x1={x1} y1={y1} x2={x2} y2={y2}
      stroke={hovered ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.35)'}
      strokeWidth={hovered ? 8 : 6}
      strokeLinecap="round"
      onClick={() => onEdgeClick(edgeIndex)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ cursor: 'pointer' }}
    />
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

export default function HexBoard({ placements = [], roads = [], cities = [], robberHex = null, onIntersectionClick, onEdgeClick, onHexClick }) {
  const settlementMap = new Map(placements.map(({ intersectionIndex, colour }) => [intersectionIndex, colour]));
  const roadMap = new Map(roads.map(({ edgeIndex, colour }) => [edgeIndex, colour]));
  const cityMap = new Map(cities.map(({ intersectionIndex, colour }) => [intersectionIndex, colour]));
  const hexes = [];
  let idx = 0;
  ROWS.forEach((count, row) => {
    const y = row * V_SPACING;
    for (let i = 0; i < count; i++) {
      const x = (i - (count - 1) / 2) * H_SPACING;
      hexes.push({ x, y, resource: TILES[idx], number: NUMBERS[idx] });
      idx++;
    }
  });

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
          onClick={onHexClick ? () => onHexClick(i) : undefined}
          style={onHexClick ? { cursor: 'pointer' } : undefined}
        >
          <polygon
            points={hexPoints(x, y)}
            fill={RESOURCE_COLORS[resource]}
            stroke="#333"
            strokeWidth={2}
          />
          {number !== null && <Token cx={x} cy={y} number={number} />}
          {robberHex === i && <RobberMarker cx={x} cy={y} />}
        </g>
      ))}
      {PORTS.map((port, i) => (
        <Port key={i} port={port} />
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
              onClick={onIntersectionClick ? () => onIntersectionClick(i) : undefined}
              style={onIntersectionClick ? { cursor: 'pointer' } : undefined}
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
            onClick={onIntersectionClick ? () => onIntersectionClick(i) : undefined}
            style={onIntersectionClick ? { cursor: 'pointer' } : undefined}
          />
        );
      })}
    </svg>
  );
}
