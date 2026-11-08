// Hand-drawn SVG art for the board: terrain illustrations, the sea and beach,
// and the playing pieces. All shapes are drawn around (0, 0) in board units and
// placed with a transform, so they stay sharp at every zoom.

const INK = '#1d1d1d';

function Pines() {
  const tree = (x, y, s) => (
    <g key={x} transform={`translate(${x},${y}) scale(${s})`}>
      <rect x={-1.6} y={5} width={3.2} height={5} rx={0.8} fill="#5d3a1a" />
      <path d="M0,-12 L7.5,-1 L3.8,-1 L9.5,6.5 L-9.5,6.5 L-3.8,-1 L-7.5,-1 Z" fill="#1d5e27" stroke="#0f3a17" strokeWidth={1} strokeLinejoin="round" />
      <path d="M0,-12 L3,-7.5 L-1,-7.5 Z" fill="#3d8c47" />
    </g>
  );
  return <g>{tree(-10, 2, 0.78)}{tree(10, 2, 0.78)}{tree(0, -1, 1)}</g>;
}

function Sheep() {
  return (
    <g>
      <rect x={-6} y={4} width={2} height={6} rx={0.8} fill="#2b2b2b" />
      <rect x={3} y={4} width={2} height={6} rx={0.8} fill="#2b2b2b" />
      <g fill="#fbfbf7" stroke="#6b6b6b" strokeWidth={0.9}>
        <circle cx={-6} cy={0} r={5} />
        <circle cx={6} cy={0} r={5} />
        <circle cx={0} cy={-3} r={5.5} />
        <circle cx={0} cy={3} r={5} />
        <circle cx={-2} cy={0} r={5} stroke="none" />
        <circle cx={3} cy={0} r={5} stroke="none" />
      </g>
      <ellipse cx={11} cy={-2} rx={3.4} ry={4} fill="#2b2b2b" />
      <ellipse cx={9.2} cy={-5} rx={1.6} ry={1} fill="#2b2b2b" transform="rotate(-25 9.2 -5)" />
    </g>
  );
}

function Wheat() {
  const stalk = x => (
    <g key={x} transform={`translate(${x},0)`}>
      <line x1={0} y1={11} x2={0} y2={-6} stroke="#8a6416" strokeWidth={1.3} strokeLinecap="round" />
      {[-9, -5.5, -2, 1.5].map((y, i) => (
        <g key={y}>
          <ellipse cx={-2.2} cy={y + (i % 2) * 0.6} rx={1.6} ry={3} fill="#a87a14" transform={`rotate(-28 -2.2 ${y})`} />
          <ellipse cx={2.2} cy={y + 0.8} rx={1.6} ry={3} fill="#c4921c" transform={`rotate(28 2.2 ${y + 0.8})`} />
        </g>
      ))}
      <ellipse cx={0} cy={-11} rx={1.5} ry={2.8} fill="#c4921c" />
    </g>
  );
  return <g>{stalk(-8)}{stalk(0)}{stalk(8)}</g>;
}

function Bricks() {
  const brick = (x, y, w) => <rect key={`${x},${y}`} x={x} y={y} width={w} height={5.5} rx={0.8} fill="#8f2d0b" stroke="#f1c7a6" strokeWidth={0.9} />;
  return (
    <g>
      {[-15, -5, 5].map(x => brick(x, -9.5, 10))}
      {brick(-15, -4, 5)}{brick(-10, -4, 10)}{brick(0, -4, 10)}{brick(10, -4, 5)}
      {[-15, -5, 5].map(x => brick(x, 1.5, 10))}
    </g>
  );
}

function Peaks() {
  return (
    <g strokeLinejoin="round">
      <path d="M-17,9 L-6,-7 L1,3 L7,-11 L17,9 Z" fill="#5c6166" stroke="#33373b" strokeWidth={1} />
      <path d="M-6,-7 L-3.2,-3 L-5,-3.8 L-7,-2.6 L-8.8,-3 Z" fill="#f7f9fb" />
      <path d="M7,-11 L10.6,-5.2 L8.5,-6.2 L6.5,-4.6 L4.4,-5.6 Z" fill="#f7f9fb" />
      <path d="M7,-11 L1,3 L4,9 L7,-2 Z" fill="#000" opacity={0.15} />
    </g>
  );
}

function Cactus() {
  return (
    <g stroke="#1f4d24" strokeWidth={1} strokeLinejoin="round" fill="#3f8a3e">
      <path d="M-2.5,10 V-9 a2.5,2.5 0 0 1 5,0 V10 Z" />
      <path d="M-2.5,2 H-6 a2,2 0 0 1 -2,-2 V-5 a1.8,1.8 0 0 1 3.6,0 V-1.5 H-2.5" />
      <path d="M2.5,-1 H6 a2,2 0 0 0 2,-2 V-7 a1.8,1.8 0 0 0 -3.6,0 V-4.5 H2.5" />
      <ellipse cx={-11} cy={9} rx={3} ry={1.6} fill="#b08d5b" stroke="none" />
      <ellipse cx={10} cy={8} rx={2.2} ry={1.3} fill="#b08d5b" stroke="none" />
    </g>
  );
}

const ICON = { forest: Pines, pasture: Sheep, fields: Wheat, hills: Bricks, mountains: Peaks, desert: Cactus };

// A terrain's illustration centred at (x, y).
export function TerrainArt({ terrain, x, y, scale = 1 }) {
  const Icon = ICON[terrain];
  return Icon ? <g transform={`translate(${x},${y}) scale(${scale})`} pointerEvents="none"><Icon /></g> : null;
}

// A sand beach under the land hexes; the sea is the board frame's background.
export function SeaAndBeach({ hexes, hexPoints }) {
  return (
    <g pointerEvents="none">
      {hexes.map((_, i) => (
        <polygon key={i} points={hexPoints(i, 1.14)} fill="#e6cf98" stroke="#e6cf98" strokeWidth={4} strokeLinejoin="round" />
      ))}
    </g>
  );
}

// A settlement: a little house in the owner's colour.
export function Settlement({ x, y, colour }) {
  return (
    <g transform={`translate(${x},${y})`} pointerEvents="none">
      <path d="M-7.5,7.5 V-1 L0,-8.5 L7.5,-1 V7.5 Z" fill={colour} stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />
      <path d="M0,-8.5 L7.5,-1 L5.5,-1 L0,-6.3 Z" fill="#fff" opacity={0.3} />
      <rect x={-1.7} y={2.2} width={3.4} height={5.3} fill={INK} opacity={0.75} />
    </g>
  );
}

// A city: a tall house beside a wider hall.
export function City({ x, y, colour }) {
  return (
    <g transform={`translate(${x},${y})`} pointerEvents="none">
      <path d="M-12,9 V-3 L-5.5,-10.5 L1,-3 V-0.5 H12 V9 Z" fill={colour} stroke={INK} strokeWidth={1.7} strokeLinejoin="round" />
      <path d="M-5.5,-10.5 L1,-3 L-1,-3 L-5.5,-8.2 Z" fill="#fff" opacity={0.3} />
      <rect x={-7.2} y={1} width={3.4} height={8} fill={INK} opacity={0.75} />
      <rect x={4} y={2.5} width={2.6} height={2.6} fill={INK} opacity={0.6} />
      <rect x={8} y={2.5} width={2.6} height={2.6} fill={INK} opacity={0.6} />
    </g>
  );
}

// The robber: a dark pawn.
export function Robber({ x, y }) {
  return (
    <g transform={`translate(${x},${y})`} pointerEvents="none">
      <ellipse cx={0} cy={10} rx={8} ry={2.4} fill="#000" opacity={0.25} />
      <path d="M-7,10 Q-6.5,-1 -2.6,-3 Q0,-4.2 2.6,-3 Q6.5,-1 7,10 Z" fill="#2a2d33" stroke="#d6d9de" strokeWidth={1} />
      <circle cx={0} cy={-7} r={4.6} fill="#2a2d33" stroke="#d6d9de" strokeWidth={1} />
      <circle cx={-1.5} cy={-8.4} r={1.3} fill="#fff" opacity={0.35} />
    </g>
  );
}

const RESOURCE_TERRAIN = { brick: 'hills', wood: 'forest', ore: 'mountains', wheat: 'fields', sheep: 'pasture' };

// A resource drawn as its terrain's picture, for cards and buttons.
export function ResourceIcon({ resource, size = 28 }) {
  return (
    <svg width={size} height={size * 0.75} viewBox="-20 -15 40 30" aria-hidden="true">
      <TerrainArt terrain={RESOURCE_TERRAIN[resource]} x={0} y={0} />
    </svg>
  );
}

// --- action bar icons, drawn in a 40×40 box centred on (0, 0)

export function TradeIcon() {
  return (
    <g strokeLinejoin="round">
      <rect x={-16} y={-15} width={14} height={19} rx={2} fill="#9fd08a" stroke={INK} strokeWidth={1.2} transform="rotate(-8 -9 -5)" />
      <rect x={2} y={-4} width={14} height={19} rx={2} fill="#e39b78" stroke={INK} strokeWidth={1.2} transform="rotate(8 9 5)" />
      <g fill="none" stroke="#f3f3f3" strokeWidth={2.2} strokeLinecap="round">
        <path d="M1,-15 Q12,-16 13,-9" />
        <path d="M-1,15 Q-12,16 -13,9" />
      </g>
      <path d="M9.5,-10 L16.5,-10 L13,-5 Z M-16.5,10 L-9.5,10 L-13,5 Z" fill="#f3f3f3" />
    </g>
  );
}

export function DevCardIcon() {
  return (
    <g>
      <rect x={-11} y={-15} width={22} height={30} rx={3} fill="#5b4bb7" stroke={INK} strokeWidth={1.3} />
      <rect x={-8} y={-12} width={16} height={24} rx={2} fill="none" stroke="#d9a441" strokeWidth={1.2} />
      <text x={0} y={1} textAnchor="middle" dominantBaseline="central" fontSize={16} fontWeight={700} fill="#f6e7c1">?</text>
    </g>
  );
}

export function RoadIcon({ colour }) {
  return (
    <g transform="rotate(35)">
      <rect x={-4} y={-17} width={8} height={34} rx={2} fill={colour} stroke={INK} strokeWidth={1.4} />
      <rect x={-2.5} y={-15} width={2} height={30} rx={1} fill="#fff" opacity={0.3} />
    </g>
  );
}

const PIPS = {
  1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

// One die face, 2·r wide, centred on (x, y).
export function Die({ value, x = 0, y = 0, r = 10, rotate = 0 }) {
  return (
    <g transform={`translate(${x},${y}) rotate(${rotate})`}>
      <rect x={-r} y={-r} width={2 * r} height={2 * r} rx={r * 0.28} fill="#fbfaf5" stroke={INK} strokeWidth={r * 0.12} />
      {(PIPS[value] ?? []).map(([px, py], i) => (
        <circle key={i} cx={px * r * 0.5} cy={py * r * 0.5} r={r * 0.17} fill={value === 1 ? '#c0392b' : INK} />
      ))}
    </g>
  );
}

export function DiceIcon() {
  return <g><Die value={5} x={-6} y={-5} r={9} rotate={-10} /><Die value={3} x={7} y={6} r={9} rotate={12} /></g>;
}

export function HourglassIcon() {
  return (
    <g strokeLinejoin="round">
      <rect x={-11} y={-17} width={22} height={4} rx={1.5} fill="#7a5230" stroke={INK} strokeWidth={1.1} />
      <rect x={-11} y={13} width={22} height={4} rx={1.5} fill="#7a5230" stroke={INK} strokeWidth={1.1} />
      <path d="M-8,-13 L8,-13 Q8,-4 1.5,0 Q8,4 8,13 L-8,13 Q-8,4 -1.5,0 Q-8,-4 -8,-13 Z" fill="#dff1fb" stroke={INK} strokeWidth={1.1} />
      <path d="M-5,-8 L5,-8 Q3,-3 0,-1 Q-3,-3 -5,-8 Z M0,3 L5.5,11 L-5.5,11 Z" fill="#e2b85a" />
    </g>
  );
}

// --- harbours

const PORT_BG = { brick: '#C1440E', wood: '#228B22', ore: '#8C8C8C', wheat: '#F4D03F', sheep: '#90EE90', generic: '#f3e6c4' };

function Anchor() {
  return (
    <g fill="none" stroke="#2b3a4a" strokeWidth={2} strokeLinecap="round">
      <circle cx={0} cy={-8} r={2.2} />
      <line x1={0} y1={-5.8} x2={0} y2={7} />
      <line x1={-4.5} y1={-3} x2={4.5} y2={-3} />
      <path d="M-8,1 Q-7,7.5 0,7.5 Q7,7.5 8,1" />
    </g>
  );
}

// A wooden pier from the harbour to one of the coastal corners it serves.
export function Pier({ x1, y1, x2, y2 }) {
  return (
    <g pointerEvents="none" strokeLinecap="round">
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#5b3a1e" strokeWidth={5.5} />
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#b9854c" strokeWidth={3.2} />
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#5b3a1e" strokeWidth={3.2} strokeDasharray="0.8 5" />
    </g>
  );
}

// A harbour medallion: the resource's picture (or an anchor for 3:1) over its rate.
export function PortArt({ x, y, type, selected = false }) {
  const generic = type === 'generic';
  return (
    <g transform={`translate(${x},${y}) scale(1.25)`}>
      <circle r={19} fill="#000" opacity={0.25} cy={1.5} />
      <circle r={18} fill={PORT_BG[type]} stroke={selected ? '#fff' : '#f7f1e1'} strokeWidth={selected ? 4 : 2.5} />
      <g transform="translate(0,-4)">
        {generic ? <g transform="scale(0.85)"><Anchor /></g> : <TerrainArt terrain={RESOURCE_TERRAIN[type]} x={0} y={0} scale={0.6} />}
      </g>
      <rect x={-12} y={5.5} width={24} height={11} rx={5.5} fill="#fbf6e8" stroke="#5b3a1e" strokeWidth={0.8} />
      <text y={11.2} textAnchor="middle" dominantBaseline="central" fontSize={9.5} fontWeight={700} fill="#3b2a18">
        {generic ? '3:1' : '2:1'}
      </text>
    </g>
  );
}
