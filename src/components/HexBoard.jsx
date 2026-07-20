import { useState } from 'react';
import { EDGES } from '../game/gameRules.js';

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

// 9 ports: 5 resource 2:1 + 4 generic 3:1, hardcoded around the board edge
const PORTS = [
  { x:  -80, y:  -92, label: '3:1',       fill: '#E0E0E0', text: '#444' },
  { x:   80, y:  -92, label: '2:1 Ore',   fill: '#8C8C8C', text: 'white' },
  { x:  242, y:   60, label: '3:1',       fill: '#E0E0E0', text: '#444' },
  { x:  242, y:  195, label: '2:1 Wheat', fill: '#F4D03F', text: '#333' },
  { x:  165, y:  378, label: '2:1 Brick', fill: '#C1440E', text: 'white' },
  { x:    0, y:  390, label: '3:1',       fill: '#E0E0E0', text: '#444' },
  { x: -165, y:  378, label: '2:1 Sheep', fill: '#90EE90', text: '#333' },
  { x: -242, y:  195, label: '2:1 Wood',  fill: '#228B22', text: 'white' },
  { x: -242, y:   60, label: '3:1',       fill: '#E0E0E0', text: '#444' },
];

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

function PortLabel({ x, y, label, fill, text }) {
  const w = label.length * 6.5 + 10;
  const h = 18;
  return (
    <g>
      <rect
        x={x - w / 2} y={y - h / 2}
        width={w} height={h}
        rx={4}
        fill={fill}
        stroke="rgba(0,0,0,0.35)"
        strokeWidth={1}
      />
      <text
        x={x} y={y}
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

const PAD = 65;
const VB_W = 5 * H_SPACING + 2 * PAD;
const VB_H = 4 * V_SPACING + 2 * SIZE + 2 * PAD;
const VB_MIN_X = -2.5 * H_SPACING - PAD;
const VB_MIN_Y = -SIZE - PAD;

export default function HexBoard({ placements = [], roads = [], cities = [], onIntersectionClick, onEdgeClick }) {
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

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <svg
        width={VB_W}
        height={VB_H}
        viewBox={`${VB_MIN_X} ${VB_MIN_Y} ${VB_W} ${VB_H}`}
      >
        {hexes.map(({ x, y, resource, number }, i) => (
          <g key={i}>
            <polygon
              points={hexPoints(x, y)}
              fill={RESOURCE_COLORS[resource]}
              stroke="#333"
              strokeWidth={2}
            />
            {number !== null && <Token cx={x} cy={y} number={number} />}
          </g>
        ))}
        {PORTS.map((port, i) => (
          <PortLabel key={i} {...port} />
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
    </div>
  );
}
