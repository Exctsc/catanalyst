import { useState } from 'react'
import initialGameState from './game/gameState'
import { rollDice, collectResources, placeSettlement, placeRoad, upgradeToCity } from './game/gameActions'
import HexBoard from './components/HexBoard'

const RESOURCES = ['brick', 'wood', 'ore', 'wheat', 'sheep']

export default function App() {
  const [gameState, setGameState] = useState(initialGameState)
  const [diceResult, setDiceResult] = useState(null)
  const [message, setMessage] = useState(null)

  const currentPlayer = gameState.players[gameState.currentPlayerIndex]
  const isSetup = gameState.phase === 'setup'

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
    const result = rollDice()
    setDiceResult(result)
    setMessage(null)
    if (!result.isRobber) {
      setGameState(prev => collectResources(prev, result.total))
    }
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

  function handleEndTurn() {
    setGameState(prev => ({
      ...prev,
      currentPlayerIndex: (prev.currentPlayerIndex + 1) % prev.players.length,
    }))
    setDiceResult(null)
    setMessage(null)
  }

  return (
    <div style={{ fontFamily: 'sans-serif' }}>
      <div style={{ padding: '16px' }}>
        <p style={{ margin: '0 0 12px' }}>
          <strong>Turn {gameState.turn}</strong> — {currentPlayer.name}'s turn
          <span style={{ marginLeft: '10px', fontSize: '13px', color: '#666' }}>
            ({gameState.phase} phase{isSetup ? ` — place a ${gameState.setup.expecting}` : ''})
          </span>
        </p>

        <button onClick={handleRoll} disabled={isSetup} style={{ padding: '8px 16px', fontSize: '16px', cursor: isSetup ? 'default' : 'pointer' }}>
          Roll Dice
        </button>
        <button onClick={handleEndTurn} disabled={isSetup} style={{ marginLeft: '10px', padding: '8px 16px', fontSize: '16px', cursor: isSetup ? 'default' : 'pointer' }}>
          End Turn
        </button>

        {diceResult && (
          <span style={{ marginLeft: '16px', fontSize: '16px' }}>
            🎲 {diceResult.die1} + {diceResult.die2} = <strong>{diceResult.total}</strong>
            {diceResult.isRobber && (
              <span style={{ marginLeft: '10px', color: 'red', fontWeight: 'bold' }}>Robber!</span>
            )}
          </span>
        )}

        {message && (
          <span style={{ marginLeft: '12px', color: 'red', fontSize: '14px' }}>{message}</span>
        )}

        <table style={{ marginTop: '16px', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', paddingRight: '16px' }}>Player</th>
              {RESOURCES.map(r => (
                <th key={r} style={{ paddingRight: '12px', textTransform: 'capitalize' }}>{r}</th>
              ))}
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <HexBoard
        placements={placements}
        roads={roadPlacements}
        cities={cityPlacements}
        onIntersectionClick={handleIntersectionClick}
        onEdgeClick={handleEdgeClick}
      />
    </div>
  )
}
