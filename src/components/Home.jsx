import { useState } from 'react'
import DiceSetup from './DiceSetup'
import { diceOptions } from '../game/dice'

// Landing screen: start a game, open the board editor, or load one.
export default function Home({ error, games = [], onResume, onDelete, onImport, onNewGame, onEditor }) {
  const [balanced, setBalanced] = useState(true)
  const [dice, setDice] = useState({ diceMode: 'balanced', script: '' })
  const options = diceOptions(dice)
  return (
    <div className="g-app">
      <div className="g-home">
        <div className="g-home-card">
          <h1>⬡ Catanalyst</h1>
          <p>
            Catanalyst is a training tool for competitive Catan players who want to study positions,
            not just play them. Build any board, set up any position, control the dice, and replay or
            branch any game on one shared screen.
          </p>
          {error && <ul className="g-errors"><li>{error}</li></ul>}

          <section className="g-side-section">
            <strong>New game</strong>
            <label className="g-field">Board
              <select value={balanced ? 'balanced' : 'random'} onChange={e => setBalanced(e.target.value === 'balanced')}>
                <option value="balanced">Balanced (no touching 6/8 or equal numbers)</option>
                <option value="random">Random</option>
              </select>
            </label>
            <DiceSetup value={dice} onChange={setDice} />
            <button className="g-btn g-btn-primary" disabled={typeof options === 'string'} onClick={() => onNewGame({ balanced, ...options })}>
              Start new game
            </button>
          </section>

          {games.length > 0 && (
            <section className="g-side-section">
              <strong>Your games</strong>
              {games.map(({ id, name, game }) => (
                <div key={id} className="g-row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>
                    {name}
                    <span className="g-dim"> · {game.state.winner !== null ? `${game.state.players[game.state.winner].name} won` : game.state.phase === 'setup' ? 'setup' : `turn ${game.state.turn}`}</span>
                  </span>
                  <span className="g-row">
                    <button className="g-btn" onClick={() => onResume(id)}>Resume</button>
                    <button className="g-btn" onClick={() => onDelete(id)} aria-label={`Delete ${name}`}>Delete</button>
                  </span>
                </div>
              ))}
            </section>
          )}

          <section className="g-side-section">
            <strong>Board editor</strong>
            <span className="g-dim">Set every hex, number token and port, then start a game on it.</span>
            <button className="g-btn" onClick={onEditor}>Open board editor</button>
          </section>

          <section className="g-side-section">
            <strong>Load / import</strong>
            <span className="g-dim">Games autosave in this browser (listed above). Import a game exported as .json from any browser.</span>
            <label className="g-field">
              <input
                type="file"
                accept=".json,application/json"
                aria-label="Import game file"
                onChange={async e => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (file) onImport(await file.text())
                }}
              />
            </label>
          </section>
        </div>
      </div>
    </div>
  )
}
