import { useState } from 'react'
import DiceSetup from './DiceSetup'
import FilePicker from './FilePicker'
import { diceOptions } from '../game/dice'
import { cleanRoomCode } from '../net/peer'

const NAME_KEY = 'catanalyst.name'
const savedName = () => { try { return window.localStorage.getItem(NAME_KEY) ?? '' } catch { return '' } }

// Landing screen: start a game, bring in a board, resume or open a game.
export default function Home({ error, games = [], joinCode = '', onJoin, onResume, onDelete, onImport, onNewGame, onEditor, onScreenshot }) {
  const [name, setName] = useState(savedName)
  const [code, setCode] = useState(joinCode)
  const join = () => {
    try { window.localStorage.setItem(NAME_KEY, name.trim()) } catch { /* storage unavailable */ }
    onJoin(code, name.trim() || 'Guest')
  }
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
            <strong>Play online with friends</strong>
            <span className="g-dim">
              To host, start or open a game, set up the position you want, then press Play online in the
              game and send your friends the link. To join, enter the host's room code.
            </span>
            <form className="g-row" onSubmit={e => { e.preventDefault(); if (code.length === 6) join() }}>
              <label className="g-field">Your name
                <input type="text" value={name} maxLength={24} onChange={e => setName(e.target.value)} placeholder="Guest" />
              </label>
              <label className="g-field">Room code
                <input type="text" value={code} onChange={e => setCode(cleanRoomCode(e.target.value))} placeholder="ABC123" autoFocus={!!joinCode} />
              </label>
              <button className="g-btn g-btn-primary" type="submit" disabled={code.length !== 6}>Join game</button>
            </form>
          </section>

          <section className="g-side-section">
            <strong>Board from a screenshot</strong>
            <span className="g-dim">
              Playing online? Load a screenshot of the board and click two hexes to line it up: the
              terrain, numbers and ports fill in, ready to study or play here.
            </span>
            <FilePicker label="Choose screenshot" accept="image/*" onFile={onScreenshot} />
          </section>

          {games.length > 0 && (
            <section className="g-side-section">
              <strong>Your games</strong>
              {games.map(({ id, name, game }) => (
                <div key={id} className="g-row g-game-row">
                  <span className="g-game-name">
                    {name}
                    <span className="g-dim"> · {game.state.winner !== null ? `${game.state.players[game.state.winner].name} won` : game.state.phase === 'setup' ? 'setup' : `turn ${game.state.turn}`}</span>
                  </span>
                  <span className="g-row g-game-buttons">
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

          <p className="g-home-footer">
            Catanalyst is open source: <a href="https://github.com/Exctsc/catanalyst" target="_blank" rel="noreferrer">view the code on GitHub</a>.
          </p>
        </div>
      </div>
    </div>
  )
}
