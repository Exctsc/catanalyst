import { useState, useRef, useEffect } from 'react'
import initialGameState from './game/gameState'
import {
  performRoll, endTurn, placeSettlement, placeRoad, upgradeToCity,
  bankTrade, discardCards, moveRobber, stealResource,
} from './game/gameActions'
import HexBoard from './components/HexBoard'
import './game.css'

const RESOURCES = ['brick', 'wood', 'ore', 'wheat', 'sheep']

// Matches the --res-* CSS vars; used for the resource chips and hand cards.
const RESOURCE_COLOR = {
  brick: '#c1440e', wood: '#228b22', ore: '#8c8c8c', wheat: '#e8b923', sheep: '#7dc855',
}

function ResourceChip({ resource, size = 16 }) {
  return (
    <span
      title={resource}
      style={{ display: 'inline-block', width: size, height: size, borderRadius: 4, background: RESOURCE_COLOR[resource] }}
    />
  )
}

function DiscardPanel({ player, required, onConfirm }) {
  const [counts, setCounts] = useState({ brick: 0, wood: 0, ore: 0, wheat: 0, sheep: 0 })
  const total = RESOURCES.reduce((sum, r) => sum + counts[r], 0)
  return (
    <div className="g-modal-row">
      <span><strong style={{ color: player.colour }}>{player.name}</strong> must discard {required}:</span>
      {RESOURCES.map(r => (
        <label key={r}>
          <ResourceChip resource={r} size={14} />
          <input
            type="number"
            min={0}
            max={player.resources[r]}
            value={counts[r]}
            onChange={e => setCounts({ ...counts, [r]: Math.max(0, Math.min(player.resources[r], +e.target.value || 0)) })}
          />
        </label>
      ))}
      <button className="g-btn g-btn-primary" disabled={total !== required} onClick={() => onConfirm(counts)}>
        Discard {total}/{required}
      </button>
    </div>
  )
}

function PlayerList({ players, currentPlayerIndex }) {
  return (
    <div className="g-players">
      {players.map((p, i) => {
        const cards = RESOURCES.reduce((sum, r) => sum + p.resources[r], 0)
        return (
          <div key={p.id} className={`g-player${i === currentPlayerIndex ? ' g-player-active' : ''}`}>
            <span className="g-swatch" style={{ background: p.colour }} />
            <span className="g-pname">{p.name}</span>
            <span className="g-pstat" title="resource cards">🃏 {cards}</span>
            <span className="g-pvp" title="victory points">{p.victoryPoints} VP</span>
          </div>
        )
      })}
    </div>
  )
}

function GameLog({ log, players }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [log.length])
  return (
    <div className="g-log" ref={ref}>
      {log.map(entry => {
        const colour = entry.playerIndex === null ? null : players[entry.playerIndex].colour
        return (
          <div
            key={entry.id}
            className={`g-log-entry${entry.playerIndex === null ? ' g-log-system' : ''}`}
            style={colour ? { borderLeftColor: colour } : undefined}
          >
            {entry.text}
          </div>
        )
      })}
    </div>
  )
}

function Chat({ messages, onSend, currentPlayer }) {
  const [draft, setDraft] = useState('')
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [messages.length])

  function send() {
    const text = draft.trim()
    if (!text) return
    onSend(text)
    setDraft('')
  }

  return (
    <div className="g-chat">
      <div className="g-chat-messages" ref={ref}>
        {messages.length === 0 ? (
          <div className="g-chat-empty">No messages yet. Chat is local-only until multiplayer lands.</div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className="g-chat-msg">
              <span className="g-chat-author" style={{ color: m.colour }}>{m.author}:</span> {m.text}
            </div>
          ))
        )}
      </div>
      <div className="g-chat-input">
        <input
          value={draft}
          placeholder={`Message as ${currentPlayer.name}…`}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') send() }}
        />
        <button className="g-btn" onClick={send}>Send</button>
      </div>
    </div>
  )
}

export default function App() {
  const [gameState, setGameState] = useState(initialGameState)
  const [message, setMessage] = useState(null)
  const [tradeGive, setTradeGive] = useState('brick')
  const [tradeReceive, setTradeReceive] = useState('wood')
  const [tab, setTab] = useState('log')
  const [tradeOpen, setTradeOpen] = useState(false)
  const [buildOpen, setBuildOpen] = useState(false)
  const [chatMessages, setChatMessages] = useState([])

  const currentPlayer = gameState.players[gameState.currentPlayerIndex]
  const isSetup = gameState.phase === 'setup'
  const robber = gameState.robber
  const winner = gameState.winner !== null ? gameState.players[gameState.winner] : null

  const placements = gameState.players.flatMap(player =>
    player.settlements.map(s => ({ intersectionIndex: s.intersectionIndex, colour: player.colour }))
  )
  const roadPlacements = gameState.players.flatMap(player =>
    player.roads.map(r => ({ edgeIndex: r.edgeIndex, colour: player.colour }))
  )
  const cityPlacements = gameState.players.flatMap(player =>
    player.cities.map(c => ({ intersectionIndex: c.intersectionIndex, colour: player.colour }))
  )

  // Every board/action handler runs a pure action, then either shows its error
  // string as a transient toast or commits the returned state.
  function apply(result) {
    if (typeof result === 'string') { setMessage(result); return }
    setGameState(result)
    setMessage(null)
  }

  function handleRoll() {
    setMessage(null)
    setGameState(prev => performRoll(prev))
  }

  function handleIntersectionClick(intersectionIndex) {
    const ownSettlement = currentPlayer.settlements.some(s => s.intersectionIndex === intersectionIndex)
    apply(gameState.phase !== 'setup' && ownSettlement
      ? upgradeToCity(gameState, gameState.currentPlayerIndex, intersectionIndex)
      : placeSettlement(gameState, gameState.currentPlayerIndex, intersectionIndex))
  }

  function handleEdgeClick(edgeIndex) {
    apply(placeRoad(gameState, gameState.currentPlayerIndex, edgeIndex))
  }

  function handleBankTrade() {
    apply(bankTrade(gameState, gameState.currentPlayerIndex, tradeGive, tradeReceive))
  }

  function handleDiscard(playerIndex, counts) {
    apply(discardCards(gameState, playerIndex, counts))
  }

  function handleHexClick(hexIndex) {
    apply(moveRobber(gameState, gameState.currentPlayerIndex, hexIndex))
  }

  function handleSteal(victimIndex) {
    apply(stealResource(gameState, gameState.currentPlayerIndex, victimIndex))
  }

  function handleEndTurn() {
    setMessage(null)
    setTradeOpen(false)
    setBuildOpen(false)
    setGameState(prev => endTurn(prev))
  }

  // TODO: wire to Socket.io once multiplayer backend exists.
  // Local-only placeholder: messages are appended to component state and never
  // leave the browser. No network, no persistence, no other clients.
  function handleSendChat(text) {
    setChatMessages(prev => [...prev, { author: currentPlayer.name, colour: currentPlayer.colour, text }])
  }

  // Header status chip: reflects robber/discard state or the setup prompt.
  let status = null
  let statusAlert = false
  if (robber?.stage === 'discard') {
    const p = gameState.players[robber.pending[0]]
    status = `${p.name} must discard ${robber.required[robber.pending[0]]} cards`
    statusAlert = true
  } else if (robber?.stage === 'move') {
    status = `${currentPlayer.name}: move the robber`
    statusAlert = true
  } else if (robber?.stage === 'steal') {
    status = `${currentPlayer.name}: choose who to rob`
    statusAlert = true
  } else if (isSetup) {
    status = `Place a ${gameState.setup.expecting}`
  }

  const canRoll = !isSetup && gameState.dice === null && winner === null && !robber
  const canEndTurn = !isSetup && !robber && winner === null

  return (
    <div className="g-app">
      <header className="g-header">
        <span className="g-brand">⬡ Catanalyst</span>
        <span className="g-turn" style={{ color: currentPlayer.colour }}>{currentPlayer.name}'s turn</span>
        <span className="g-phase">· {gameState.phase} phase · turn {gameState.turn}</span>
        {status && <span className={`g-status${statusAlert ? ' g-status-alert' : ''}`}>{status}</span>}
      </header>

      <div className="g-body">
        <main className="g-center">
          {message && <div className="g-toast">{message}</div>}
          <HexBoard
            placements={placements}
            roads={roadPlacements}
            cities={cityPlacements}
            robberHex={gameState.robberHex}
            onIntersectionClick={handleIntersectionClick}
            onEdgeClick={handleEdgeClick}
            onHexClick={robber?.stage === 'move' ? handleHexClick : undefined}
          />
          {winner && (
            <div className="g-winner">
              <div className="g-winner-card" style={{ background: winner.colour }}>
                🏆 {winner.name} wins!
              </div>
            </div>
          )}
        </main>

        <aside className="g-sidebar">
          <PlayerList players={gameState.players} currentPlayerIndex={gameState.currentPlayerIndex} />
          <div className="g-tabs">
            <div className="g-tabbar">
              <button className={`g-tab${tab === 'log' ? ' g-tab-active' : ''}`} onClick={() => setTab('log')}>
                Game Log
              </button>
              <button className={`g-tab${tab === 'chat' ? ' g-tab-active' : ''}`} onClick={() => setTab('chat')}>
                Chat
              </button>
            </div>
            {tab === 'log'
              ? <GameLog log={gameState.log} players={gameState.players} />
              : <Chat messages={chatMessages} onSend={handleSendChat} currentPlayer={currentPlayer} />}
          </div>
        </aside>
      </div>

      <footer className="g-tray">
        <div className="g-hand">
          {RESOURCES.map(r => (
            <div key={r} className="g-card">
              <span className="g-card-chip" style={{ background: RESOURCE_COLOR[r] }} />
              <span className="g-card-count">{currentPlayer.resources[r]}</span>
              <span className="g-card-label">{r}</span>
            </div>
          ))}
        </div>

        <div className="g-actions">
          {gameState.dice && (
            <span className="g-dice">
              🎲 {gameState.dice.die1} + {gameState.dice.die2} = {gameState.dice.total}
              {gameState.dice.isRobber && <span className="g-dice-robber">Robber!</span>}
            </span>
          )}

          {robber?.stage === 'discard' && (
            <DiscardPanel
              key={robber.pending[0]}
              player={gameState.players[robber.pending[0]]}
              required={robber.required[robber.pending[0]]}
              onConfirm={counts => handleDiscard(robber.pending[0], counts)}
            />
          )}

          {robber?.stage === 'steal' && (
            <div className="g-modal-row">
              <strong>Steal 1 card from:</strong>
              {robber.candidates.map(i => (
                <button
                  key={i}
                  className="g-btn"
                  style={{ color: gameState.players[i].colour, fontWeight: 700 }}
                  onClick={() => handleSteal(i)}
                >
                  {gameState.players[i].name}
                </button>
              ))}
            </div>
          )}

          {tradeOpen && !isSetup && !robber && !winner && (
            <div className="g-popover">
              <span>Give 4</span>
              <select value={tradeGive} onChange={e => setTradeGive(e.target.value)}>
                {RESOURCES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <span>for 1</span>
              <select value={tradeReceive} onChange={e => setTradeReceive(e.target.value)}>
                {RESOURCES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <button className="g-btn g-btn-primary" onClick={handleBankTrade}>Trade</button>
            </div>
          )}

          {buildOpen && !isSetup && (
            <div className="g-popover">
              <span>Road: 1 brick + 1 wood · Settlement: brick+wood+wheat+sheep · City: 2 wheat + 3 ore.</span>
              <span style={{ color: 'var(--g-text-dim)' }}>Click the board to build.</span>
            </div>
          )}

          {!robber && !winner && (
            <>
              <button className="g-btn g-btn-primary" onClick={handleRoll} disabled={!canRoll}>Roll Dice</button>
              <button className="g-btn" onClick={() => { setTradeOpen(o => !o); setBuildOpen(false) }} disabled={isSetup}>Trade</button>
              <button className="g-btn" onClick={() => { setBuildOpen(o => !o); setTradeOpen(false) }} disabled={isSetup}>Build</button>
              <button className="g-btn" onClick={handleEndTurn} disabled={!canEndTurn}>End Turn</button>
            </>
          )}
        </div>
      </footer>
    </div>
  )
}
