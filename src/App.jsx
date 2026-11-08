import { useState } from 'react'
import { newGame } from './game/engine'
import { createRng, randomSeed } from './game/rng'
import { generateBoard } from './game/boardGen'
import Home from './components/Home'
import BoardEditor from './components/BoardEditor'
import GameScreen from './components/GameScreen'
import './game.css'

const randomBoard = balanced => generateBoard(createRng(randomSeed()), { balanced })[0]

export default function App() {
  const [screen, setScreen] = useState('home') // 'home' | 'editor' | 'game'
  const [game, setGame] = useState(null)

  function startGame({ board }) {
    setGame(newGame({ seed: randomSeed(), board }))
    setScreen('game')
  }

  if (screen === 'editor') {
    return <BoardEditor initialBoard={game?.state.board ?? randomBoard(true)} onStart={board => startGame({ board })} onHome={() => setScreen('home')} />
  }
  if (screen === 'game' && game) {
    return <GameScreen game={game} setGame={setGame} onHome={() => setScreen('home')} />
  }
  return (
    <Home
      onNewGame={({ balanced }) => startGame({ board: randomBoard(balanced) })}
      onEditor={() => setScreen('editor')}
    />
  )
}
