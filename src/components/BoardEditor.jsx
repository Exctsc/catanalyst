import { useState, useEffect } from 'react'
import { BOARD_WIDTH, BOARD_HEIGHT, BOARD_MIN_X, BOARD_MIN_Y, TILE_TO_RESOURCE, EDGES, COAST_RING, portSlot } from '../game/gameRules'
import { detectTerrains, detectNumbers, detectPorts, alignFromHexes, toImagePixel } from '../game/boardImage'
import { generateBoard, validateBoard, TERRAINS, NUMBER_TOKENS, PORT_TYPES } from '../game/boardGen'
import { createRng, randomSeed } from '../game/rng'
import { encodeBoard, boardLink } from '../game/boardCode'
import DiceSetup from './DiceSetup'
import { diceOptions } from '../game/dice'
import HexBoard from './HexBoard'
import BoardViewport from './BoardViewport'
import FilePicker from './FilePicker'

const terrainLabel = t => (TILE_TO_RESOURCE[t] ? `${t} (${TILE_TO_RESOURCE[t]})` : t)
const portLabel = t => (t === 'generic' ? '3:1 any' : `2:1 ${t}`)

const CENTER_X = BOARD_MIN_X + BOARD_WIDTH / 2
const CENTER_Y = BOARD_MIN_Y + BOARD_HEIGHT / 2

// Load an image file into { href, image, width, height } (its natural pixel size).
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const href = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => resolve({ href, image, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight })
    image.onerror = () => { URL.revokeObjectURL(href); reject(new Error('That file is not an image this browser can read.')) }
    image.src = href
  })
}

// Screenshot tracing. The image sits under a see-through board; the user
// clicks the centre of the top-left hex, then the bottom-right hex, in the
// screenshot. That pins the image to the board, and the terrain is read off it.
const TRACE_STEPS = {
  top: 'Click the middle of the top-left hex in your screenshot.',
  bottom: 'Now click the middle of the bottom-right hex.',
  done: 'Terrain, numbers and ports read. Check them against your screenshot.',
}

function TracePanel({ trace, onLoad, onRealign, onRemove }) {
  if (!trace) {
    return (
      <div className="g-side-section">
        <strong>Board from a screenshot</strong>
        <span className="g-dim">Load a screenshot of an online game and click two hexes to line it up: terrain, numbers and ports fill in.</span>
        <FilePicker label="Choose screenshot" accept="image/*" onFile={onLoad} />
      </div>
    )
  }
  return (
    <div className="g-side-section">
      <strong>{trace.step === 'done' ? 'Screenshot read' : 'Line up the screenshot'}</strong>
      <span className={trace.step === 'done' ? 'g-ok' : undefined}>{TRACE_STEPS[trace.step]}</span>
      {trace.step === 'done' && !trace.portsRead && (
        <span className="g-errors">Ports could not be found in this screenshot: click each port to set it.</span>
      )}
      {trace.step === 'done' && trace.unread > 0 && (
        <span className="g-errors">{trace.unread} number{trace.unread > 1 ? 's' : ''} could not be read: click {trace.unread > 1 ? 'those hexes' : 'that hex'} to set {trace.unread > 1 ? 'them' : 'it'}.</span>
      )}
      {trace.step !== 'done' && <span className="g-dim">Zoom with the wheel or the + button if the hexes are small.</span>}
      <div className="g-row">
        {trace.step === 'done' && <button className="g-btn" onClick={onRealign}>Line up again</button>}
        <button className="g-btn" onClick={onRemove}>Remove image</button>
      </div>
    </div>
  )
}

// Whole image shown inside the board area to start with.
function fitPlacement(naturalWidth, naturalHeight) {
  const width = Math.min(BOARD_WIDTH, BOARD_HEIGHT * (naturalWidth / naturalHeight))
  const height = width * (naturalHeight / naturalWidth)
  return { x: CENTER_X - width / 2, y: CENTER_Y - height / 2, width }
}

const withHeight = (p, trace) => ({ ...p, height: p.width * (trace.naturalHeight / trace.naturalWidth) })

// Click a hex to set its terrain and number, click a port to set its type.
// Start is blocked until the board matches standard counts, unless free mode.
export default function BoardEditor({ initialBoard, initialImageFile = null, onStart, onHome }) {
  const [board, setBoard] = useState(initialBoard)
  const [trace, setTrace] = useState(null)
  const [traceError, setTraceError] = useState(null)
  const [selected, setSelected] = useState({ kind: 'hex', index: 0 })
  // A shared non-standard board opens in free mode rather than looking broken.
  const [free, setFree] = useState(() => validateBoard(initialBoard).length > 0)
  const [copied, setCopied] = useState(false)
  const [dice, setDice] = useState({ diceMode: 'balanced', script: '' })
  const options = diceOptions(dice)
  const errors = validateBoard(board, { free })
  const link = boardLink(board, `${window.location.origin}${window.location.pathname}`)

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      setCopied(false) // clipboard blocked: the link is still selectable in the field
    }
  }

  const setHex = patch => edit(b => ({
    ...b,
    tiles: 'tile' in patch ? b.tiles.map((t, i) => (i === selected.index ? patch.tile : t)) : b.tiles,
    numbers: 'number' in patch ? b.numbers.map((n, i) => (i === selected.index ? patch.number : n)) : b.numbers,
  }))
  const edit = fn => { setCopied(false); setBoard(fn) }
  const setPort = type => edit(b => ({ ...b, ports: b.ports.map((p, i) => (i === selected.index ? { ...p, type } : p)) }))

  // Slide the selected port to the next free coastal edge (dir 1 or -1).
  function movePort(dir) {
    const port = board.ports[selected.index]
    const others = new Set(board.ports.filter((_, i) => i !== selected.index).flatMap(p => p.vertices))
    const at = COAST_RING.findIndex(e => EDGES[e].includes(port.vertices[0]) && EDGES[e].includes(port.vertices[1]))
    for (let step = 1; step < COAST_RING.length; step++) {
      const edge = COAST_RING[(at + dir * step + COAST_RING.length) % COAST_RING.length]
      if (EDGES[edge].some(v => others.has(v))) continue
      edit(b => ({ ...b, ports: b.ports.map((p, i) => (i === selected.index ? { ...portSlot(edge), type: p.type } : p)) }))
      return
    }
  }
  const shuffleBoard = balanced => edit(() => generateBoard(createRng(randomSeed()), { balanced })[0])

  const lining = trace !== null && trace.step !== 'done'
  const startTrace = img => setTrace({ ...img, placement: fitPlacement(img.naturalWidth, img.naturalHeight), step: 'top' })

  async function loadTrace(file) {
    try {
      startTrace(await loadImage(file))
      setTraceError(null)
    } catch (e) {
      setTraceError(e.message)
    }
  }

  // A screenshot picked on Home arrives as a file; load it once on open.
  useEffect(() => {
    if (!initialImageFile) return
    let live = true
    loadImage(initialImageFile)
      .then(img => { if (live) startTrace(img) })
      .catch(e => { if (live) setTraceError(e.message) })
    return () => { live = false }
  }, [initialImageFile])

  // A click on the board while lining up: where it lands in the image's pixels.
  // getScreenCTM includes the viewport's zoom/pan transform.
  function handleTraceClick(e) {
    const svg = e.currentTarget.querySelector('svg')
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse())
    const q = toImagePixel(pt, trace.placement, trace.naturalWidth)
    if (trace.step === 'top') { setTrace({ ...trace, q0: q, step: 'bottom' }); return }
    const placement = alignFromHexes(trace.q0, q, trace.naturalWidth)
    setTrace({ ...trace, placement, step: 'done', ...detect(placement) })
  }

  // Read every pixel once, then read each hex's terrain and number token.
  // Returns how many non-desert hexes had no readable number.
  function detect(placement) {
    const canvas = document.createElement('canvas')
    canvas.width = trace.naturalWidth
    canvas.height = trace.naturalHeight
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(trace.image, 0, 0)
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const getPixel = (px, py) => {
      if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) return null
      const i = (py * canvas.width + px) * 4
      return [data[i], data[i + 1], data[i + 2]]
    }
    const tiles = detectTerrains(getPixel, placement, trace.naturalWidth, board.tiles)
    const read = detectNumbers(getPixel, placement, trace.naturalWidth)
    const ports = detectPorts(getPixel, placement, trace.naturalWidth)
    const numbers = tiles.map((t, i) => (t === 'desert' ? null : read[i]))
    edit(b => ({ ...b, tiles, numbers, ports: ports ?? b.ports }))
    return { unread: numbers.filter((n, i) => n === null && tiles[i] !== 'desert').length, portsRead: ports !== null }
  }

  return (
    <div className="g-app">
      <header className="g-header">
        <button className="g-brand" onClick={onHome} title="Home">⬡ Catanalyst</button>
        <span className="g-turn">Board Editor</span>
        <span className="g-phase">· click a hex or a port to edit it</span>
      </header>

      <div className="g-body">
        <main className="g-center">
          <BoardViewport contentWidth={BOARD_WIDTH} contentHeight={BOARD_HEIGHT}>
            <div onClick={lining ? handleTraceClick : undefined} style={lining ? { cursor: 'crosshair' } : undefined}>
              <HexBoard
                board={board}
                underlay={trace && { href: trace.href, ...withHeight(trace.placement, trace) }}
                hexOpacity={trace ? 0.3 : 1}
                robberHex={board.tiles.indexOf('desert')}
                onHexClick={lining ? undefined : index => setSelected({ kind: 'hex', index })}
                onPortClick={lining ? undefined : index => setSelected({ kind: 'port', index })}
                selectedHex={!lining && selected.kind === 'hex' ? selected.index : null}
                selectedPort={!lining && selected.kind === 'port' ? selected.index : null}
              />
            </div>
          </BoardViewport>
        </main>

        <aside className="g-sidebar">
          <TracePanel
            trace={trace}
            onLoad={loadTrace}
            onRealign={() => startTrace(trace)}
            onRemove={() => setTrace(null)}
          />
          {traceError && <ul className="g-errors g-side-section"><li>{traceError}</li></ul>}
          <div className="g-side-section">
            {selected.kind === 'hex' ? (
              <>
                <strong>Hex {selected.index + 1}</strong>
                <label className="g-field">Terrain
                  <select value={board.tiles[selected.index]} onChange={e => setHex({ tile: e.target.value })}>
                    {TERRAINS.map(t => <option key={t} value={t}>{terrainLabel(t)}</option>)}
                  </select>
                </label>
                <label className="g-field">Number
                  <select
                    value={board.numbers[selected.index] ?? ''}
                    onChange={e => setHex({ number: e.target.value === '' ? null : Number(e.target.value) })}
                  >
                    <option value="">none</option>
                    {NUMBER_TOKENS.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
              </>
            ) : (
              <>
                <strong>Port {selected.index + 1}</strong>
                <label className="g-field">Type
                  <select value={board.ports[selected.index].type} onChange={e => setPort(e.target.value)}>
                    {PORT_TYPES.map(t => <option key={t} value={t}>{portLabel(t)}</option>)}
                  </select>
                </label>
                <div className="g-row">
                  <button className="g-btn" onClick={() => movePort(-1)} aria-label="Move port back along the coast">◀ Move</button>
                  <button className="g-btn" onClick={() => movePort(1)} aria-label="Move port on along the coast">Move ▶</button>
                </div>
              </>
            )}
          </div>

          <div className="g-side-section">
            <label className="g-field">
              <input type="checkbox" checked={free} onChange={e => setFree(e.target.checked)} />
              Free mode (skip standard counts)
            </label>
            {errors.length === 0
              ? <span className="g-ok">Board is valid</span>
              : <ul className="g-errors">{errors.map(e => <li key={e}>{e}</li>)}</ul>}
          </div>

          <div className="g-side-section">
            <strong>Share</strong>
            <label className="g-field">Code
              <input type="text" readOnly value={encodeBoard(board)} onFocus={e => e.target.select()} aria-label="Board code" />
            </label>
            <div className="g-row">
              <button className="g-btn" onClick={copyLink}>{copied ? 'Link copied' : 'Copy link'}</button>
              <a className="g-btn" href={link}>Open link</a>
            </div>
          </div>

          <div className="g-side-section">
            <div className="g-row">
              <button className="g-btn" onClick={() => shuffleBoard(false)}>Random</button>
              <button className="g-btn" onClick={() => shuffleBoard(true)}>Balanced</button>
            </div>
            <DiceSetup value={dice} onChange={setDice} />
            <button className="g-btn g-btn-primary" disabled={errors.length > 0 || typeof options === 'string'} onClick={() => onStart({ board, ...options })}>
              Start game on this board
            </button>
          </div>
        </aside>
      </div>
    </div>
  )
}
