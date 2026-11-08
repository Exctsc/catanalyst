import { useState, useRef, useEffect, useMemo } from 'react'
import { applyAction, replay, turnStarts, branchGame } from '../game/engine'
import { portRate } from '../game/gameActions'
import { parseDiceScript, formatDiceQueue, DICE_LABELS } from '../game/dice'
import {
  openIntersectionPips, playerPips, expectedPerRoll, rollHistogram, incomeBreakdown, GAIN_KEYS, LOSS_KEYS,
} from '../game/analysis'
import { BOARD_WIDTH, BOARD_HEIGHT } from '../game/gameRules'
import HexBoard from './HexBoard'
import BoardViewport from './BoardViewport'
import {
  playSound, getAudioSettings, subscribeAudioSettings, setAudioMuted, setAudioVolume,
} from '../audio/sounds'
import { soundsForTransition } from '../audio/gameSounds'

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

const EMPTY_HAND = { brick: 0, wood: 0, ore: 0, wheat: 0, sheep: 0 }

// Small number inputs, one per key (resources by default), capped at `max[k]` when given.
function CountInputs({ counts, max, onChange, keys = RESOURCES }) {
  return keys.map(r => (
    <label key={r} title={DEV_META[r]?.label ?? r}>
      {DEV_META[r] ? DEV_META[r].icon : <ResourceChip resource={r} size={14} />}
      <input
        type="number"
        min={0}
        max={max ? max[r] : undefined}
        value={counts[r] ?? 0}
        aria-label={DEV_META[r]?.label ?? r}
        onChange={e => {
          const n = Math.max(0, Math.floor(+e.target.value || 0))
          onChange({ ...counts, [r]: max ? Math.min(max[r], n) : n })
        }}
      />
    </label>
  ))
}

// Hotseat trade builder: the current player offers cards to one opponent.
function PlayerTradePanel({ players, currentPlayerIndex, onOffer }) {
  const opponents = players.map((_, i) => i).filter(i => i !== currentPlayerIndex)
  const [to, setTo] = useState(opponents[0])
  const [give, setGive] = useState(EMPTY_HAND)
  const [get, setGet] = useState(EMPTY_HAND)
  return (
    <div className="g-modal-row">
      <span>Offer</span>
      <select value={to} onChange={e => setTo(+e.target.value)} aria-label="Trade partner">
        {opponents.map(i => <option key={i} value={i}>{players[i].name}</option>)}
      </select>
      <strong>give</strong>
      <CountInputs counts={give} max={players[currentPlayerIndex].resources} onChange={setGive} />
      <strong>get</strong>
      <CountInputs counts={get} onChange={setGet} />
      <button className="g-btn g-btn-primary" onClick={() => onOffer(to, give, get)}>Offer</button>
    </div>
  )
}

const SANDBOX_TOOLS = [
  ['settlement', 'Settlement'], ['city', 'City'], ['road', 'Road'], ['robber', 'Robber'], ['remove', 'Remove'],
]

// Sandbox editor: pieces are placed by clicking the board with the chosen
// player and tool; hands, dev cards, knights and the turn are set here.
// Every Apply is a recorded sandbox action.
function SandboxPanel({ state, sandbox, setSandbox, onEdit, onDone }) {
  const p = state.players[sandbox.player]
  const devCounts = Object.fromEntries(DEV_ORDER.map(t => [t, p.devCards.filter(c => c.type === t).length]))
  const [hand, setHand] = useState(p.resources)
  const [dev, setDev] = useState(devCounts)
  const [knights, setKnights] = useState(p.knightsPlayed)
  const [turn, setTurn] = useState({ player: state.currentPlayerIndex, rolled: state.dice !== null })
  return (
    <>
      <div className="g-side-section">
        <strong>Sandbox: edit position</strong>
        <div className="g-row">
          {state.players.map((pl, i) => (
            <button
              key={pl.id}
              className={`g-btn${i === sandbox.player ? ' g-btn-primary' : ''}`}
              style={{ borderColor: pl.colour }}
              onClick={() => setSandbox({ ...sandbox, player: i })}
            >
              {pl.name}
            </button>
          ))}
        </div>
        <div className="g-row">
          {SANDBOX_TOOLS.map(([tool, label]) => (
            <button key={tool} className={`g-btn${tool === sandbox.tool ? ' g-btn-primary' : ''}`} onClick={() => setSandbox({ ...sandbox, tool })}>
              {label}
            </button>
          ))}
        </div>
        <span className="g-dim">Click the board to apply. Costs and placement rules are ignored.</span>
      </div>

      <div className="g-side-section">
        <strong style={{ color: p.colour }}>{p.name}: hand</strong>
        <div className="g-modal-row">
          <CountInputs counts={hand} onChange={setHand} />
          <button className="g-btn" onClick={() => onEdit({ op: 'setHand', player: sandbox.player, resources: hand })}>Apply hand</button>
        </div>
      </div>

      <div className="g-side-section">
        <strong style={{ color: p.colour }}>{p.name}: dev cards</strong>
        <div className="g-modal-row">
          <CountInputs counts={dev} onChange={setDev} keys={DEV_ORDER} />
          <label>⚔️ played
            <input type="number" min={0} value={knights} aria-label="Knights played"
              onChange={e => setKnights(Math.max(0, Math.floor(+e.target.value || 0)))} />
          </label>
          <button className="g-btn" onClick={() => onEdit([
            { op: 'setDevCards', player: sandbox.player, counts: dev },
            { op: 'setKnights', player: sandbox.player, count: knights },
          ])}>Apply cards</button>
        </div>
      </div>

      <div className="g-side-section">
        <label className="g-field">To move
          <select value={turn.player} onChange={e => setTurn({ ...turn, player: +e.target.value })}>
            {state.players.map((pl, i) => <option key={pl.id} value={i}>{pl.name}</option>)}
          </select>
        </label>
        <label className="g-field">
          <input type="checkbox" checked={turn.rolled} onChange={e => setTurn({ ...turn, rolled: e.target.checked })} />
          has rolled this turn
        </label>
        <button className="g-btn" onClick={() => onEdit({ op: 'setTurn', ...turn })}>Apply turn</button>
        <button className="g-btn g-btn-primary" onClick={onDone}>Done: resume play</button>
      </div>
    </>
  )
}

// Replay controls: step through every recorded action, jump to a turn, or
// branch a new game from the position on screen.
function ReplayPanel({ at, total, starts, onSeek, onBranch, onExit }) {
  const currentTurn = [...starts].reverse().find(t => t.index <= at)
  return (
    <div className="g-side-section">
      <strong>Replay</strong>
      <span className="g-dim">Action {at} of {total}</span>
      <div className="g-row">
        <button className="g-btn" onClick={() => onSeek(0)} disabled={at === 0} aria-label="First action">⏮</button>
        <button className="g-btn" onClick={() => onSeek(at - 1)} disabled={at === 0} aria-label="Step back">◀</button>
        <button className="g-btn" onClick={() => onSeek(at + 1)} disabled={at === total} aria-label="Step forward">▶</button>
        <button className="g-btn" onClick={() => onSeek(total)} disabled={at === total} aria-label="Last action">⏭</button>
      </div>
      <input type="range" min={0} max={total} value={at} onChange={e => onSeek(+e.target.value)} aria-label="Replay position" />
      <label className="g-field">Jump to
        <select value={currentTurn?.index ?? 0} onChange={e => onSeek(+e.target.value)}>
          {starts.map(t => <option key={t.turn} value={t.index}>{t.turn === 0 ? 'Setup' : `Turn ${t.turn}`}</option>)}
        </select>
      </label>
      <button className="g-btn g-btn-primary" onClick={onBranch}>Play from here (new branch)</button>
      <button className="g-btn" onClick={onExit}>Back to live game</button>
    </div>
  )
}

const INCOME_LABEL = {
  rolls: 'Rolls', setup: 'Setup', trades: 'Trades', devCards: 'Dev cards', stolen: 'Stolen',
  robber: 'Robbed', discards: 'Discards', monopoly: 'Monopoly',
}

// Per-player numbers by resource, one row per player.
function ResourceTable({ players, rows, format = n => n }) {
  return (
    <table className="g-table">
      <thead>
        <tr><th />{RESOURCES.map(r => <th key={r} title={r}><ResourceChip resource={r} size={12} /></th>)}<th>Σ</th></tr>
      </thead>
      <tbody>
        {players.map((p, i) => (
          <tr key={p.id}>
            <th style={{ borderLeft: `3px solid ${p.colour}` }}>{p.name.replace('Player ', 'P')}</th>
            {RESOURCES.map(r => <td key={r}>{format(rows[i][r])}</td>)}
            <td>{format(RESOURCES.reduce((sum, r) => sum + rows[i][r], 0))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// Rolled totals as bars, the 2d6 expectation as a tick on each bar.
function RollHistogram({ bins }) {
  const W = 280, H = 120, pad = 18, slot = (W - pad) / bins.length
  const max = Math.max(1, ...bins.map(b => Math.max(b.actual, b.expected)))
  const y = v => H - pad - (v / max) * (H - pad - 6)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Rolled totals against the 2d6 expectation">
      <line x1={pad} x2={W} y1={H - pad} y2={H - pad} stroke="var(--g-border)" strokeWidth={1} />
      {bins.map((b, i) => {
        const x = pad + i * slot + 1, w = slot - 2
        return (
          <g key={b.total}>
            <title>{`${b.total}: rolled ${b.actual}, expected ${b.expected.toFixed(1)}`}</title>
            <rect x={x} y={0} width={w} height={H} fill="transparent" />
            {b.actual > 0 && <path d={`M${x},${H - pad} V${y(b.actual) + 4} q0,-4 4,-4 h${w - 8} q4,0 4,4 V${H - pad} Z`} fill="var(--g-accent-2)" />}
            <line x1={x} x2={x + w} y1={y(b.expected)} y2={y(b.expected)} stroke="var(--g-text)" strokeWidth={2} />
            <text x={x + w / 2} y={H - 5} textAnchor="middle" fontSize={9} fill="var(--g-text-dim)">{b.total}</text>
          </g>
        )
      })}
    </svg>
  )
}

function AnalysisPanel({ state, history, showPips, onTogglePips }) {
  const bins = rollHistogram(history.states, history.actions)
  const rolls = bins.reduce((n, b) => n + b.actual, 0)
  const income = incomeBreakdown(history.states, history.actions)
  return (
    <div className="g-analysis">
      <div className="g-side-section">
        <label className="g-field">
          <input type="checkbox" checked={showPips} onChange={e => onTogglePips(e.target.checked)} />
          Show pips on open intersections
        </label>
        <strong>Pips per resource</strong>
        <ResourceTable players={state.players} rows={playerPips(state)} />
      </div>
      <div className="g-side-section">
        <strong>Expected cards per roll</strong>
        <ResourceTable players={state.players} rows={expectedPerRoll(state)} format={n => n.toFixed(2)} />
      </div>
      <div className="g-side-section">
        <strong>Rolls: actual vs 2d6 ({rolls} rolls)</strong>
        <div className="g-legend">
          <span><i className="g-legend-bar" /> rolled</span>
          <span><i className="g-legend-tick" /> expected</span>
        </div>
        <RollHistogram bins={bins} />
        <table className="g-table">
          <tbody>
            <tr><th>Total</th>{bins.map(b => <td key={b.total}>{b.total}</td>)}</tr>
            <tr><th>Rolled</th>{bins.map(b => <td key={b.total}>{b.actual}</td>)}</tr>
            <tr><th>Exp.</th>{bins.map(b => <td key={b.total}>{b.expected.toFixed(1)}</td>)}</tr>
          </tbody>
        </table>
      </div>
      <div className="g-side-section">
        <strong>Income (cards)</strong>
        <table className="g-table">
          <thead>
            <tr><th />{GAIN_KEYS.map(k => <th key={k}>+{INCOME_LABEL[k]}</th>)}{LOSS_KEYS.map(k => <th key={k}>−{INCOME_LABEL[k]}</th>)}</tr>
          </thead>
          <tbody>
            {state.players.map((p, i) => (
              <tr key={p.id}>
                <th style={{ borderLeft: `3px solid ${p.colour}` }}>{p.name.replace('Player ', 'P')}</th>
                {GAIN_KEYS.map(k => <td key={k}>{income[i].gained[k]}</td>)}
                {LOSS_KEYS.map(k => <td key={k}>{income[i].lost[k]}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function describeBundle(bundle) {
  return Object.entries(bundle).map(([r, n]) => `${n} ${r}`).join(' + ')
}

// Scripted dice: show and replace the queue of upcoming rolls mid-game.
function ScriptedDice({ queue, onSet }) {
  const [draft, setDraft] = useState(formatDiceQueue(queue))
  const parsed = parseDiceScript(draft)
  return (
    <div className="g-side-section">
      <strong>Scripted dice</strong>
      <span className="g-dim">Next: {queue.length ? formatDiceQueue(queue) : 'random (queue empty)'}</span>
      <label className="g-field">Rolls
        <input type="text" value={draft} onChange={e => setDraft(e.target.value)} placeholder="e.g. 6 8 3+4" aria-label="Scripted rolls" />
      </label>
      {typeof parsed === 'string' && <ul className="g-errors"><li>{parsed}</li></ul>}
      <button className="g-btn" disabled={typeof parsed === 'string'} onClick={() => onSet(parsed)}>Set queue</button>
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

// The play screen. `game` is the engine record { options, actions, state };
// every change is handed back through setGame.
export default function GameScreen({ game, setGame, onHome, onBranch, onExport }) {
  const [sandbox, setSandbox] = useState(null) // null | { player, tool }
  const [replayAt, setReplayAt] = useState(null) // null = live, else action index on screen
  const replaying = replayAt !== null
  const replayStates = useMemo(
    () => (replaying ? replay(game.options, game.actions).states : null),
    [replaying, game.options, game.actions],
  )
  const replayStarts = useMemo(() => (replayStates ? turnStarts(replayStates) : []), [replayStates])
  // While replaying, everything below renders the historical position read-only.
  const gameState = replaying ? replayStates[replayAt] : game.state
  const [showPips, setShowPips] = useState(false)
  const [message, setMessage] = useState(null)
  const [tradeGive, setTradeGive] = useState('brick')
  const [tradeReceive, setTradeReceive] = useState('wood')
  const [tab, setTab] = useState('log')
  // Replayed history for the Analysis tab, cut at the replay position if any.
  const history = useMemo(() => {
    if (tab !== 'analysis') return null
    const states = replayStates ?? replay(game.options, game.actions).states
    const at = replaying ? replayAt : game.actions.length
    return { states: states.slice(0, at + 1), actions: game.actions.slice(0, at) }
  }, [tab, replayStates, replaying, replayAt, game.options, game.actions])
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
  const offer = gameState.tradeOffer
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

  // Every change goes through the engine as a recorded action. An error string
  // becomes a transient toast. Returns whether the action(s) applied.
  // Several actions from one click are applied in order before committing.
  function act(actions) {
    let next = game
    for (const action of [].concat(actions)) {
      next = applyAction(next, action)
      if (typeof next === 'string') { setMessage(next); return false }
    }
    setGame(next)
    setMessage(null)
    return true
  }
  const me = gameState.currentPlayerIndex

  function handleRoll() {
    act({ type: 'roll' })
  }

  function sandboxEdit(edits) {
    return act([].concat(edits).map(edit => ({ type: 'sandbox', edit })))
  }

  function handleIntersectionClick(intersectionIndex) {
    if (sandbox) {
      if (sandbox.tool === 'settlement' || sandbox.tool === 'city') sandboxEdit({ op: 'setBuilding', vertex: intersectionIndex, player: sandbox.player, kind: sandbox.tool })
      else if (sandbox.tool === 'remove') sandboxEdit({ op: 'setBuilding', vertex: intersectionIndex, player: null, kind: null })
      return
    }
    const ownSettlement = currentPlayer.settlements.some(s => s.intersectionIndex === intersectionIndex)
    act({ type: gameState.phase !== 'setup' && ownSettlement ? 'upgradeToCity' : 'placeSettlement', player: me, vertex: intersectionIndex })
  }

  function handleEdgeClick(edgeIndex) {
    if (sandbox) {
      if (sandbox.tool === 'road') sandboxEdit({ op: 'setRoad', edge: edgeIndex, player: sandbox.player })
      else if (sandbox.tool === 'remove') sandboxEdit({ op: 'setRoad', edge: edgeIndex, player: null })
      return
    }
    act({ type: 'placeRoad', player: me, edge: edgeIndex })
  }

  // The one cue not derived from the state diff: a bank trade only shuffles
  // cards between a hand and the bank, which is indistinguishable from paying
  // a build cost, so it's announced from the handler that knows what happened.
  function handleBankTrade() {
    if (act({ type: 'bankTrade', player: me, give: tradeGive, receive: tradeReceive })) playSound('trade')
  }

  function handleOffer(to, give, get) {
    act({ type: 'proposeTrade', player: me, to, give, get })
  }

  // Player trades only move cards between hands, like a bank trade, so the
  // cue is played here rather than derived from the state diff.
  function handleAcceptTrade() {
    if (act({ type: 'acceptTrade', player: gameState.tradeOffer.to })) { playSound('trade'); setTradeOpen(false) }
  }

  function handleDiscard(playerIndex, counts) {
    act({ type: 'discard', player: playerIndex, cards: counts })
  }

  function handleHexClick(hexIndex) {
    if (sandbox) { sandboxEdit({ op: 'setRobber', hex: hexIndex }); return }
    act({ type: 'moveRobber', player: me, hex: hexIndex })
  }

  function handleSteal(victimIndex) {
    act({ type: 'steal', player: me, victim: victimIndex })
  }

  function handleBuyDev() {
    act({ type: 'buyDevCard', player: me })
  }

  function handlePlayDev(type) {
    if (type === 'knight') { act({ type: 'playKnight', player: me }); return }
    if (type === 'roadBuilding') { act({ type: 'playRoadBuilding', player: me }); return }
    setDevPanel(type) // yearOfPlenty / monopoly need a resource choice first
  }

  function handlePlayYearOfPlenty() {
    if (act({ type: 'playYearOfPlenty', player: me, picks: [yopA, yopB] })) setDevPanel(null)
  }

  function handlePlayMonopoly() {
    if (act({ type: 'playMonopoly', player: me, resource: monoPick })) setDevPanel(null)
  }

  function handleEndTurn() {
    setMessage(null)
    setTradeOpen(false)
    setBuildOpen(false)
    setDevPanel(null)
    act({ type: 'endTurn' })
  }

  function finishSandbox() {
    if (sandboxEdit({ op: 'resume' })) setSandbox(null)
  }

  // Header status chip: reflects robber/discard/road-building state or the setup prompt.
  let status = null
  let statusAlert = false
  if (replaying) {
    status = `Replay: action ${replayAt} of ${game.actions.length}`
    statusAlert = true
  } else if (sandbox) {
    status = 'Sandbox: editing position'
    statusAlert = true
  } else if (robber?.stage === 'discard') {
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
  const showActions = !robber && !winner && !roadBuilding && !sandbox && !replaying
  const interactive = !replaying

  return (
    <div className="g-app">
      <header className="g-header">
        <button className="g-brand" onClick={onHome} title="Home">⬡ Catanalyst</button>
        <span className="g-turn" style={{ color: currentPlayer.colour }}>{currentPlayer.name}'s turn</span>
        <span className="g-phase">· {isSetup ? 'Setup' : `Turn ${gameState.turn}`} · {DICE_LABELS[gameState.diceMode].split(' (')[0]} dice</span>
        <div className="g-header-right">
          {status && <span className={`g-status${statusAlert ? ' g-status-alert' : ''}`}>{status}</span>}
          {!sandbox && !replaying && (
            <>
              <button className="g-btn" onClick={onExport}>Export</button>
              <button className="g-btn" onClick={() => { setReplayAt(game.actions.length); setTradeOpen(false); setBuildOpen(false); setDevPanel(null) }}>
                Replay
              </button>
              <button className="g-btn" onClick={() => { setSandbox({ player: gameState.currentPlayerIndex, tool: 'settlement' }); setTradeOpen(false); setBuildOpen(false); setDevPanel(null) }}>
                Edit position
              </button>
            </>
          )}
          <AudioControls />
        </div>
      </header>

      <div className="g-body">
        <main className="g-center">
          {message && <div className="g-toast">{message}</div>}
          <BoardViewport contentWidth={BOARD_WIDTH} contentHeight={BOARD_HEIGHT}>
            <HexBoard
              board={gameState.board}
              pipLabels={showPips ? openIntersectionPips(gameState) : null}
              placements={placements}
              roads={roadPlacements}
              cities={cityPlacements}
              robberHex={gameState.robberHex}
              onIntersectionClick={interactive ? handleIntersectionClick : undefined}
              onEdgeClick={interactive ? handleEdgeClick : undefined}
              onHexClick={interactive && (sandbox ? sandbox.tool === 'robber' : robber?.stage === 'move') ? handleHexClick : undefined}
            />
          </BoardViewport>
          {winner && !sandbox && !replaying && (
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
          {replaying && (
            <ReplayPanel
              at={replayAt}
              total={game.actions.length}
              starts={replayStarts}
              onSeek={i => setReplayAt(Math.max(0, Math.min(game.actions.length, i)))}
              onBranch={() => {
                const branch = branchGame(game, replayAt)
                if (typeof branch === 'string') { setMessage(branch); return }
                setReplayAt(null)
                onBranch(branch, replayStates[replayAt])
              }}
              onExit={() => setReplayAt(null)}
            />
          )}
          {sandbox && (
            <SandboxPanel
              key={`${sandbox.player}:${game.actions.length}`}
              state={gameState}
              sandbox={sandbox}
              setSandbox={setSandbox}
              onEdit={sandboxEdit}
              onDone={finishSandbox}
            />
          )}
          {gameState.diceMode === 'scripted' && !sandbox && !replaying && (
            <ScriptedDice
              key={formatDiceQueue(gameState.diceQueue)}
              queue={gameState.diceQueue}
              onSet={queue => act({ type: 'setDiceQueue', queue })}
            />
          )}
          <div className="g-tabs">
            <div className="g-tabbar">
              <button className={`g-tab${tab === 'log' ? ' g-tab-active' : ''}`} onClick={() => setTab('log')}>
                Game Log
              </button>
              <button className={`g-tab${tab === 'analysis' ? ' g-tab-active' : ''}`} onClick={() => setTab('analysis')}>
                Analysis
              </button>
            </div>
            {tab === 'log' && <GameLog log={gameState.log} players={gameState.players} />}
            {tab === 'analysis' && history && (
              <AnalysisPanel state={gameState} history={history} showPips={showPips} onTogglePips={setShowPips} />
            )}
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

        {!isSetup && !sandbox && !replaying && <DevHand player={currentPlayer} canPlay={canPlayDev} onPlay={handlePlayDev} />}

        <div className="g-actions">
          {gameState.dice && (
            <span className="g-dice">
              🎲 {gameState.dice.total === null ? 'rolled' : `${gameState.dice.die1} + ${gameState.dice.die2} = ${gameState.dice.total}`}
              {gameState.dice.isRobber && <span className="g-dice-robber">Robber!</span>}
            </span>
          )}

          {robber?.stage === 'discard' && interactive && (
            <DiscardPanel
              key={robber.pending[0]}
              player={gameState.players[robber.pending[0]]}
              required={robber.required[robber.pending[0]]}
              onConfirm={counts => handleDiscard(robber.pending[0], counts)}
            />
          )}

          {robber?.stage === 'steal' && interactive && (
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

          {roadBuilding && interactive && (
            <div className="g-modal-row">
              <strong style={{ color: currentPlayer.colour }}>
                Place {roadBuilding.remaining} free road{roadBuilding.remaining > 1 ? 's' : ''}
              </strong>
              <span style={{ color: 'var(--g-text-dim)' }}>— click a road slot on the board</span>
              <button className="g-btn" onClick={() => act({ type: 'skipRoadBuilding', player: me })}>Skip</button>
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

          {offer && interactive && (
            <div className="g-modal-row">
              <span>
                <strong style={{ color: gameState.players[offer.from].colour }}>{gameState.players[offer.from].name}</strong>
                {' offers '}
                <strong style={{ color: gameState.players[offer.to].colour }}>{gameState.players[offer.to].name}</strong>
                {`: ${describeBundle(offer.give)} for ${describeBundle(offer.get)}`}
              </span>
              <button className="g-btn g-btn-primary" onClick={handleAcceptTrade}>
                {gameState.players[offer.to].name}: Accept
              </button>
              <button className="g-btn" onClick={() => act({ type: 'declineTrade', player: offer.to })}>Decline</button>
              <button className="g-btn" onClick={() => act({ type: 'declineTrade', player: offer.from })}>Withdraw</button>
            </div>
          )}

          {tradeOpen && showActions && !preRoll && !offer && (
            <PlayerTradePanel
              key={gameState.currentPlayerIndex}
              players={gameState.players}
              currentPlayerIndex={gameState.currentPlayerIndex}
              onOffer={handleOffer}
            />
          )}

          {tradeOpen && showActions && !preRoll && (
            <div className="g-popover">
              <strong>Bank</strong>
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
