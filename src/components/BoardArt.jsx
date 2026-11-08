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
