import { useState } from 'react'
import { BOARD_WIDTH, BOARD_HEIGHT, TILE_TO_RESOURCE } from '../game/gameRules'
import { generateBoard, validateBoard, TERRAINS, NUMBER_TOKENS, PORT_TYPES } from '../game/boardGen'
import { createRng, randomSeed } from '../game/rng'
import { encodeBoard, boardLink } from '../game/boardCode'
import DiceSetup from './DiceSetup'
import { diceOptions } from '../game/dice'
import HexBoard from './HexBoard'
import BoardViewport from './BoardViewport'

const terrainLabel = t => (TILE_TO_RESOURCE[t] ? `${t} (${TILE_TO_RESOURCE[t]})` : t)
const portLabel = t => (t === 'generic' ? '3:1 any' : `2:1 ${t}`)

// Click a hex to set its terrain and number, click a port to set its type.
// Start is blocked until the board matches standard counts, unless free mode.
export default function BoardEditor({ initialBoard, onStart, onHome }) {
  const [board, setBoard] = useState(initialBoard)
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
  const shuffleBoard = balanced => edit(() => generateBoard(createRng(randomSeed()), { balanced })[0])

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
            <HexBoard
              board={board}
              robberHex={board.tiles.indexOf('desert')}
              onHexClick={index => setSelected({ kind: 'hex', index })}
              onPortClick={index => setSelected({ kind: 'port', index })}
              selectedHex={selected.kind === 'hex' ? selected.index : null}
              selectedPort={selected.kind === 'port' ? selected.index : null}
            />
          </BoardViewport>
        </main>

        <aside className="g-sidebar">
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
