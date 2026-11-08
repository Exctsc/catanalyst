import { useState, useRef, useEffect } from 'react'
import initialGameState from './game/gameState'
import {
  performRoll, endTurn, placeSettlement, placeRoad, upgradeToCity,
  bankTrade, discardCards, moveRobber, stealResource,
  buyDevCard, playKnight, playRoadBuilding, playYearOfPlenty, playMonopoly,
  portRate,
} from './game/gameActions'
import { BOARD_WIDTH, BOARD_HEIGHT } from './game/gameRules'
import HexBoard from './components/HexBoard'
import BoardViewport from './components/BoardViewport'
import {
  playSound, getAudioSettings, subscribeAudioSettings, setAudioMuted, setAudioVolume,
} from './audio/sounds'
import { soundsForTransition } from './audio/gameSounds'
import './game.css'

const RESOURCES = ['brick', 'wood', 'ore', 'wheat', 'sheep']

// Matches the --res-* CSS vars; used for the resource chips and hand cards.
const RESOURCE_COLOR = {
  brick: '#c1440e', wood: '#228b22', ore: '#8c8c8c', wheat: '#e8b923', sheep: '#7dc855',
}

// Dev card display metadata. `playable: false` cards (Victory Point) are never
// actively played — they count silently toward the owner's own win total.
const DEV_META = {
  knight:       { label: 'Knight',        icon: '⚔️', playable: true },
  roadBuilding: { label: 'Road Building', icon: '🛣️', playable: true },
  yearOfPlenty: { label: 'Year of Plenty', icon: '🌾', playable: true },
  monopoly:     { label: 'Monopoly',      icon: '📈', playable: true },
  victoryPoint: { label: 'Victory Point', icon: '🏆', playable: false },
}
const DEV_ORDER = ['knight', 'roadBuilding', 'yearOfPlenty', 'monopoly', 'victoryPoint']

// Plays the cues implied by each game-state change. The prev→next diff lives in
// audio/gameSounds.js; this hook only handles timing, spacing a multi-cue
// transition (roll → income, build → turn handoff) so the sounds don't collide.
const CUE_SPACING_MS = 220

function useGameSounds(gameState) {
  const previousRef = useRef(gameState)
  useEffect(() => {
    const cues = soundsForTransition(previousRef.current, gameState)
    previousRef.current = gameState
    const timers = []
    cues.forEach((cue, i) => {
      if (i === 0) playSound(cue)
      else timers.push(setTimeout(() => playSound(cue), i * CUE_SPACING_MS))
    })
    return () => timers.forEach(clearTimeout)
  }, [gameState])
}

// Mute toggle + volume slider. Settings live in the audio module (and
// localStorage), so this component just mirrors them.
function AudioControls() {
  const [settings, setSettings] = useState(getAudioSettings)
  useEffect(() => subscribeAudioSettings(setSettings), [])

  const silent = settings.muted || settings.volume === 0
  return (
    <div className="g-audio">
      <button
        className="g-audio-btn"
        onClick={() => setAudioMuted(!settings.muted)}
        title={settings.muted ? 'Unmute sound' : 'Mute sound'}
        aria-label={settings.muted ? 'Unmute sound' : 'Mute sound'}
        aria-pressed={settings.muted}
      >
        {silent ? '🔇' : '🔊'}
      </button>
      <input
        className="g-audio-slider"
        type="range"
        min={0}
        max={100}
        value={Math.round(settings.volume * 100)}
        onChange={e => setAudioVolume(Number(e.target.value) / 100)}
        title={`Volume ${Math.round(settings.volume * 100)}%`}
        aria-label="Volume"
      />
    </div>
  )
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

function PlayerList({ players, currentPlayerIndex, largestArmy, longestRoad }) {
  return (
    <div className="g-players">
      {players.map((p, i) => {
        const cards = RESOURCES.reduce((sum, r) => sum + p.resources[r], 0)
        return (
          <div key={p.id} className={`g-player${i === currentPlayerIndex ? ' g-player-active' : ''}`}>
            <span className="g-swatch" style={{ background: p.colour }} />
            <span className="g-pname">{p.name}</span>
            {largestArmy === i && <span className="g-badge" title="Largest Army">⚔️</span>}
            {longestRoad === i && <span className="g-badge" title="Longest Road">🛣️</span>}
            <span className="g-pstat" title="resource cards">🃏 {cards}</span>
            <span className="g-pvp" title="victory points">{p.victoryPoints} VP</span>
          </div>
        )
      })}
    </div>
  )
}

// The current player's own development cards. Only ever shows the player whose
// turn it is — other players' hands (including hidden VP cards) stay private.
function DevHand({ player, canPlay, onPlay }) {
  const counts = {}
  const newlyByType = {}
  player.devCards.forEach(c => {
    counts[c.type] = (counts[c.type] || 0) + 1
    if (c.newlyBought) newlyByType[c.type] = (newlyByType[c.type] || 0) + 1
  })
  const types = DEV_ORDER.filter(t => counts[t])
  if (types.length === 0) return <div className="g-devhand g-devhand-empty">No dev cards</div>
  return (
    <div className="g-devhand">
      {types.map(t => {
        const meta = DEV_META[t]
        const playableNow = meta.playable && canPlay && counts[t] - (newlyByType[t] || 0) > 0
        return (
          <div key={t} className="g-devcard" title={meta.label}>
            <span className="g-devcard-icon">{meta.icon}</span>
            <span className="g-devcard-count">{counts[t]}</span>
            <span className="g-devcard-label">{meta.label}</span>
            {meta.playable
              ? <button className="g-devcard-play" disabled={!playableNow} onClick={() => onPlay(t)}>Play</button>
              : <span className="g-devcard-vp">+VP</span>}
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

export default function App() {
  const [gameState, setGameState] = useState(initialGameState)
  const [message, setMessage] = useState(null)
  const [tradeGive, setTradeGive] = useState('brick')
  const [tradeReceive, setTradeReceive] = useState('wood')
  const [tab, setTab] = useState('log')
  const [tradeOpen, setTradeOpen] = useState(false)
  const [buildOpen, setBuildOpen] = useState(false)
  const [devPanel, setDevPanel] = useState(null) // null | 'yearOfPlenty' | 'monopoly'
  const [yopA, setYopA] = useState('brick')
  const [yopB, setYopB] = useState('wood')
  const [monoPick, setMonoPick] = useState('brick')

  useGameSounds(gameState)

  const currentPlayer = gameState.players[gameState.currentPlayerIndex]
  const isSetup = gameState.phase === 'setup'
  const robber = gameState.robber
  const roadBuilding = gameState.roadBuilding
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

  // Runs a pure action, then either shows its error string as a transient toast
  // or commits the returned state. Returns whether it succeeded.
  function apply(result) {
    if (typeof result === 'string') { setMessage(result); return false }
    setGameState(result)
    setMessage(null)
    return true
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

  // The one cue not derived from the state diff: a bank trade only shuffles
  // cards between a hand and the bank, which is indistinguishable from paying
  // a build cost, so it's announced from the handler that knows what happened.
  function handleBankTrade() {
    if (apply(bankTrade(gameState, gameState.currentPlayerIndex, tradeGive, tradeReceive))) playSound('trade')
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

  function handleBuyDev() {
    apply(buyDevCard(gameState, gameState.currentPlayerIndex))
  }

  function handlePlayDev(type) {
    if (type === 'knight') { apply(playKnight(gameState, gameState.currentPlayerIndex)); return }
    if (type === 'roadBuilding') { apply(playRoadBuilding(gameState, gameState.currentPlayerIndex)); return }
    setDevPanel(type) // yearOfPlenty / monopoly need a resource choice first
  }

  function handlePlayYearOfPlenty() {
    if (apply(playYearOfPlenty(gameState, gameState.currentPlayerIndex, [yopA, yopB]))) setDevPanel(null)
  }

  function handlePlayMonopoly() {
    if (apply(playMonopoly(gameState, gameState.currentPlayerIndex, monoPick))) setDevPanel(null)
  }

  function handleEndTurn() {
    setMessage(null)
    setTradeOpen(false)
    setBuildOpen(false)
    setDevPanel(null)
    setGameState(prev => endTurn(prev))
  }

  // Header status chip: reflects robber/discard/road-building state or the setup prompt.
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
  } else if (roadBuilding) {
    status = `${currentPlayer.name}: place ${roadBuilding.remaining} free road${roadBuilding.remaining > 1 ? 's' : ''}`
    statusAlert = true
  } else if (isSetup) {
    status = `Place a ${gameState.setup.expecting}`
  }

  // In play phase, dice must be rolled before building/trading/ending the turn.
  // Dev cards remain playable pre-roll, so canPlayDev is not gated on the roll.
  const preRoll = gameState.phase === 'play' && gameState.dice === null && !robber && winner === null
  const canRoll = !isSetup && gameState.dice === null && winner === null && !robber && !roadBuilding
  const canEndTurn = !isSetup && !robber && !roadBuilding && winner === null && gameState.dice !== null
  const canBuyDev = !isSetup && !robber && !roadBuilding && winner === null
  const canTradeOrBuild = !isSetup && !preRoll
  const canPlayDev = gameState.phase === 'play' && !gameState.devCardPlayedThisTurn && !robber && !roadBuilding && winner === null
  const showActions = !robber && !winner && !roadBuilding

  return (
    <div className="g-app">
      <header className="g-header">
        <span className="g-brand">⬡ Catanalyst</span>
        <span className="g-turn" style={{ color: currentPlayer.colour }}>{currentPlayer.name}'s turn</span>
        <span className="g-phase">· {gameState.phase} phase · turn {gameState.turn}</span>
        <div className="g-header-right">
          {status && <span className={`g-status${statusAlert ? ' g-status-alert' : ''}`}>{status}</span>}
          <AudioControls />
        </div>
      </header>

      <div className="g-body">
        <main className="g-center">
          {message && <div className="g-toast">{message}</div>}
          <BoardViewport contentWidth={BOARD_WIDTH} contentHeight={BOARD_HEIGHT}>
            <HexBoard
              board={gameState.board}
              placements={placements}
              roads={roadPlacements}
              cities={cityPlacements}
              robberHex={gameState.robberHex}
              onIntersectionClick={handleIntersectionClick}
              onEdgeClick={handleEdgeClick}
              onHexClick={robber?.stage === 'move' ? handleHexClick : undefined}
            />
          </BoardViewport>
          {winner && (
            <div className="g-winner">
              <div className="g-winner-card" style={{ background: winner.colour }}>
                🏆 {winner.name} wins!
              </div>
            </div>
          )}
        </main>

        <aside className="g-sidebar">
          <PlayerList
            players={gameState.players}
            currentPlayerIndex={gameState.currentPlayerIndex}
            largestArmy={gameState.largestArmy}
            longestRoad={gameState.longestRoad}
          />
          <div className="g-tabs">
            <div className="g-tabbar">
              <button className={`g-tab${tab === 'log' ? ' g-tab-active' : ''}`} onClick={() => setTab('log')}>
                Game Log
              </button>
            </div>
            {tab === 'log' && <GameLog log={gameState.log} players={gameState.players} />}
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

        {!isSetup && <DevHand player={currentPlayer} canPlay={canPlayDev} onPlay={handlePlayDev} />}

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

          {roadBuilding && (
            <div className="g-modal-row">
              <strong style={{ color: currentPlayer.colour }}>
                Place {roadBuilding.remaining} free road{roadBuilding.remaining > 1 ? 's' : ''}
              </strong>
              <span style={{ color: 'var(--g-text-dim)' }}>— click a road slot on the board</span>
              <button className="g-btn" onClick={() => setGameState(prev => ({ ...prev, roadBuilding: null }))}>Skip</button>
            </div>
          )}

          {devPanel === 'yearOfPlenty' && showActions && (
            <div className="g-popover">
              <span>Year of Plenty — take 2:</span>
              <select value={yopA} onChange={e => setYopA(e.target.value)}>
                {RESOURCES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <select value={yopB} onChange={e => setYopB(e.target.value)}>
                {RESOURCES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <button className="g-btn g-btn-primary" onClick={handlePlayYearOfPlenty}>Take</button>
              <button className="g-btn" onClick={() => setDevPanel(null)}>Cancel</button>
            </div>
          )}

          {devPanel === 'monopoly' && showActions && (
            <div className="g-popover">
              <span>Monopoly — name a resource:</span>
              <select value={monoPick} onChange={e => setMonoPick(e.target.value)}>
                {RESOURCES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <button className="g-btn g-btn-primary" onClick={handlePlayMonopoly}>Claim all</button>
              <button className="g-btn" onClick={() => setDevPanel(null)}>Cancel</button>
            </div>
          )}

          {tradeOpen && showActions && !preRoll && (
            <div className="g-popover">
              <span>Give {portRate(gameState, gameState.currentPlayerIndex, tradeGive)}</span>
              <select value={tradeGive} onChange={e => setTradeGive(e.target.value)}>
                {RESOURCES.map(r => (
                  <option key={r} value={r}>
                    {r} ({portRate(gameState, gameState.currentPlayerIndex, r)}:1)
                  </option>
                ))}
              </select>
              <span>for 1</span>
              <select value={tradeReceive} onChange={e => setTradeReceive(e.target.value)}>
                {RESOURCES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <button className="g-btn g-btn-primary" onClick={handleBankTrade}>Trade</button>
            </div>
          )}

          {buildOpen && showActions && (
            <div className="g-popover">
              <span>Road: 1 brick + 1 wood · Settlement: brick+wood+wheat+sheep · City: 2 wheat + 3 ore · Dev card: ore+wheat+sheep.</span>
              <span style={{ color: 'var(--g-text-dim)' }}>Click the board to build.</span>
            </div>
          )}

          {showActions && (
            <>
              <button className="g-btn g-btn-primary" onClick={handleRoll} disabled={!canRoll}>Roll Dice</button>
              <button className="g-btn" onClick={() => { setTradeOpen(o => !o); setBuildOpen(false); setDevPanel(null) }} disabled={!canTradeOrBuild}>Trade</button>
              <button className="g-btn" onClick={() => { setBuildOpen(o => !o); setTradeOpen(false); setDevPanel(null) }} disabled={!canTradeOrBuild}>Build</button>
              <button className="g-btn" onClick={handleBuyDev} disabled={!canBuyDev}>Buy Dev ({gameState.devCardDeck.length})</button>
              <button className="g-btn" onClick={handleEndTurn} disabled={!canEndTurn}>End Turn</button>
            </>
          )}
        </div>
      </footer>
    </div>
  )
}
