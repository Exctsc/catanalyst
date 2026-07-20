import { useState } from 'react'
import initialGameState from './game/gameState'
import {
  rollDice, collectResources, placeSettlement, placeRoad, upgradeToCity,
  bankTrade, startRobber, discardCards, moveRobber, stealResource,
} from './game/gameActions'
import HexBoard from './components/HexBoard'

const RESOURCES = ['brick', 'wood', 'ore', 'wheat', 'sheep']

function DiscardPanel({ player, required, onConfirm }) {
  const [counts, setCounts] = useState({ brick: 0, wood: 0, ore: 0, wheat: 0, sheep: 0 })
  const total = RESOURCES.reduce((sum, r) => sum + counts[r], 0)
  return (
    <div style={{ marginTop: '12px', padding: '10px', border: '1px solid #ccc', borderRadius: '6px', fontSize: '14px', display: 'inline-block' }}>
      <strong style={{ color: player.colour }}>{player.name}</strong> must discard {required} cards:
      {RESOURCES.map(r => (
        <label key={r} style={{ marginLeft: '10px', textTransform: 'capitalize' }}>
          {r}{' '}
          <input
            type="number"
            min={0}
            max={player.resources[r]}
            value={counts[r]}
            onChange={e => setCounts({ ...counts, [r]: Math.max(0, Math.min(player.resources[r], +e.target.value || 0)) })}
            style={{ width: '44px' }}
          />
        </label>
      ))}
      <button
        disabled={total !== required}
        onClick={() => onConfirm(counts)}
        style={{ marginLeft: '12px', padding: '4px 12px', cursor: total === required ? 'pointer' : 'default' }}
      >
        Discard {total}/{required}
      </button>
    </div>
  )
}

export default function App() {
  const [gameState, setGameState] = useState(initialGameState)
  const [message, setMessage] = useState(null)
  const [tradeGive, setTradeGive] = useState('brick')
  const [tradeReceive, setTradeReceive] = useState('wood')

  const currentPlayer = gameState.players[gameState.currentPlayerIndex]
  const isSetup = gameState.phase === 'setup'
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

  function handleRoll() {
    setMessage(null)
    // Single functional update so rapid clicks can't roll or collect twice:
    // once prev.dice is set, further queued updates are no-ops until End Turn.
    setGameState(prev => {
      if (prev.phase !== 'play' || prev.dice !== null || prev.winner !== null) return prev
      const result = rollDice()
      const rolled = { ...prev, dice: result }
      if (result.isRobber) return startRobber(rolled)
      return collectResources(rolled, result.total)
    })
  }

  function handleIntersectionClick(intersectionIndex) {
    // In play phase, clicking your own settlement upgrades it to a city;
    // any other intersection attempts a settlement build.
    const ownSettlement = currentPlayer.settlements.some(s => s.intersectionIndex === intersectionIndex)
    const result = gameState.phase !== 'setup' && ownSettlement
      ? upgradeToCity(gameState, gameState.currentPlayerIndex, intersectionIndex)
      : placeSettlement(gameState, gameState.currentPlayerIndex, intersectionIndex)
    if (typeof result === 'string') { setMessage(result); return }
    setGameState(result)
    setMessage(null)
  }

  function handleEdgeClick(edgeIndex) {
    const result = placeRoad(gameState, gameState.currentPlayerIndex, edgeIndex)
    if (typeof result === 'string') { setMessage(result); return }
    setGameState(result)
    setMessage(null)
  }

  function handleBankTrade() {
    const result = bankTrade(gameState, gameState.currentPlayerIndex, tradeGive, tradeReceive)
    if (typeof result === 'string') { setMessage(result); return }
    setGameState(result)
    setMessage(null)
  }

  function handleDiscard(playerIndex, counts) {
    const result = discardCards(gameState, playerIndex, counts)
    if (typeof result === 'string') { setMessage(result); return }
    setGameState(result)
    setMessage(null)
  }

  function handleHexClick(hexIndex) {
    const result = moveRobber(gameState, gameState.currentPlayerIndex, hexIndex)
    if (typeof result === 'string') { setMessage(result); return }
    setGameState(result)
    setMessage(null)
  }

  function handleSteal(victimIndex) {
    const result = stealResource(gameState, gameState.currentPlayerIndex, victimIndex)
    if (typeof result === 'string') { setMessage(result); return }
    setGameState(result)
    setMessage(null)
  }

  function handleEndTurn() {
    setGameState(prev => {
      if (prev.phase !== 'play' || prev.robber !== null || prev.winner !== null) return prev
      return {
        ...prev,
        currentPlayerIndex: (prev.currentPlayerIndex + 1) % prev.players.length,
        dice: null,
      }
    })
    setMessage(null)
  }

  return (
    <div style={{ fontFamily: 'sans-serif' }}>
      <div style={{ padding: '16px' }}>
        {winner && (
          <div style={{
            marginBottom: '12px', padding: '14px 20px', borderRadius: '8px',
            background: winner.colour, color: 'white', fontSize: '22px', fontWeight: 'bold',
          }}>
            🏆 {winner.name} wins!
          </div>
        )}
        <p style={{ margin: '0 0 12px' }}>
          <strong>Turn {gameState.turn}</strong> — {currentPlayer.name}'s turn
          <span style={{ marginLeft: '10px', fontSize: '13px', color: '#666' }}>
            ({gameState.phase} phase{isSetup ? ` — place a ${gameState.setup.expecting}` : ''})
          </span>
        </p>

        <button
          onClick={handleRoll}
          disabled={isSetup || gameState.dice !== null || winner !== null}
          style={{ padding: '8px 16px', fontSize: '16px', cursor: isSetup || gameState.dice !== null || winner !== null ? 'default' : 'pointer' }}
        >
          Roll Dice
        </button>
        <button
          onClick={handleEndTurn}
          disabled={isSetup || gameState.robber !== null || winner !== null}
          style={{ marginLeft: '10px', padding: '8px 16px', fontSize: '16px', cursor: isSetup || gameState.robber !== null || winner !== null ? 'default' : 'pointer' }}
        >
          End Turn
        </button>

        {gameState.dice && (
          <span style={{ marginLeft: '16px', fontSize: '16px' }}>
            🎲 {gameState.dice.die1} + {gameState.dice.die2} = <strong>{gameState.dice.total}</strong>
            {gameState.dice.isRobber && (
              <span style={{ marginLeft: '10px', color: 'red', fontWeight: 'bold' }}>Robber!</span>
            )}
          </span>
        )}

        {message && (
          <span style={{ marginLeft: '12px', color: 'red', fontSize: '14px' }}>{message}</span>
        )}

        {!isSetup && (
          <div style={{ marginTop: '12px', fontSize: '14px' }}>
            <strong>Bank trade (4:1):</strong>
            <span style={{ marginLeft: '8px' }}>give 4</span>
            <select value={tradeGive} onChange={e => setTradeGive(e.target.value)} style={{ margin: '0 6px' }}>
              {RESOURCES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <span>for 1</span>
            <select value={tradeReceive} onChange={e => setTradeReceive(e.target.value)} style={{ margin: '0 6px' }}>
              {RESOURCES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <button onClick={handleBankTrade} style={{ padding: '4px 12px', cursor: 'pointer' }}>
              Trade
            </button>
          </div>
        )}

        {gameState.robber?.stage === 'discard' && (
          <DiscardPanel
            key={gameState.robber.pending[0]}
            player={gameState.players[gameState.robber.pending[0]]}
            required={gameState.robber.required[gameState.robber.pending[0]]}
            onConfirm={counts => handleDiscard(gameState.robber.pending[0], counts)}
          />
        )}

        {gameState.robber?.stage === 'move' && (
          <div style={{ marginTop: '12px', color: '#B03A2E', fontWeight: 'bold', fontSize: '14px' }}>
            {currentPlayer.name}: click a hex to move the robber
          </div>
        )}

        {gameState.robber?.stage === 'steal' && (
          <div style={{ marginTop: '12px', fontSize: '14px' }}>
            <strong>{currentPlayer.name}: steal 1 random card from</strong>
            {gameState.robber.candidates.map(i => (
              <button
                key={i}
                onClick={() => handleSteal(i)}
                style={{ marginLeft: '8px', padding: '4px 12px', cursor: 'pointer', color: gameState.players[i].colour, fontWeight: 'bold' }}
              >
                {gameState.players[i].name}
              </button>
            ))}
          </div>
        )}

        <table style={{ marginTop: '16px', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', paddingRight: '16px' }}>Player</th>
              {RESOURCES.map(r => (
                <th key={r} style={{ paddingRight: '12px', textTransform: 'capitalize' }}>{r}</th>
              ))}
              <th style={{ paddingRight: '12px' }}>VP</th>
            </tr>
          </thead>
          <tbody>
            {gameState.players.map(player => (
              <tr key={player.id}>
                <td style={{ paddingRight: '16px', color: player.colour, fontWeight: 'bold' }}>
                  {player.name}
                </td>
                {RESOURCES.map(r => (
                  <td key={r} style={{ textAlign: 'center', paddingRight: '12px' }}>
                    {player.resources[r]}
                  </td>
                ))}
                <td style={{ textAlign: 'center', paddingRight: '12px', fontWeight: 'bold' }}>
                  {player.victoryPoints}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <HexBoard
        placements={placements}
        roads={roadPlacements}
        cities={cityPlacements}
        robberHex={gameState.robberHex}
        onIntersectionClick={handleIntersectionClick}
        onEdgeClick={handleEdgeClick}
        onHexClick={gameState.robber?.stage === 'move' ? handleHexClick : undefined}
      />
    </div>
  )
}
