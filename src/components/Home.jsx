import { useState } from 'react'
import DiceSetup from './DiceSetup'
import FilePicker from './FilePicker'
import { diceOptions } from '../game/dice'

// Landing screen: start a game, bring in a board, resume or open a game.
export default function Home({ error, games = [], onResume, onDelete, onImport, onNewGame, onEditor, onScreenshot }) {
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

          <section className="g-side-section">
            <strong>Board from a screenshot</strong>
            <span className="g-dim">
              Playing online? Load a screenshot of the board, line it up, and the terrain fills in.
              You add the numbers and ports, then study or play it here.
            </span>
            <FilePicker label="Choose screenshot" accept="image/*" onFile={onScreenshot} />
          </section>

          {games.length > 0 && (
            <section className="g-side-section">
              <strong>Your games</strong>
              {games.map(({ id, name, game }) => (
                <div key={id} className="g-row" style={{ alignItems: 'center', flexWrap: 'nowrap' }}>
                  <span style={{ flex: '1 1 0', minWidth: 0 }}>
                    {name}
                    <span className="g-dim"> · {game.state.winner !== null ? `${game.state.players[game.state.winner].name} won` : game.state.phase === 'setup' ? 'setup' : `turn ${game.state.turn}`}</span>
                  </span>
                  <span className="g-row" style={{ flexShrink: 0 }}>
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
            <strong>Open a Catanalyst game file</strong>
            <span className="g-dim">Games autosave in this browser. To move one to another browser or send it to someone, use Export in the game, then open the .json file here.</span>
            <FilePicker label="Open game file" accept=".json,application/json" onFile={async file => onImport(await file.text())} />
          </section>
        </div>
      </div>
    </div>
  )
}
