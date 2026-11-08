import { useState } from 'react'

// Landing screen: start a game, open the board editor, or load one.
export default function Home({ error, onNewGame, onEditor }) {
  const [balanced, setBalanced] = useState(true)
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
            <button className="g-btn g-btn-primary" onClick={() => onNewGame({ balanced })}>Start new game</button>
          </section>

          <section className="g-side-section">
            <strong>Board editor</strong>
            <span className="g-dim">Set every hex, number token and port, then start a game on it.</span>
            <button className="g-btn" onClick={onEditor}>Open board editor</button>
          </section>
        </div>
      </div>
    </div>
  )
}
