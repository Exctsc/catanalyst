import { useState } from 'react'
import { newGame } from './game/engine'
import { createRng, randomSeed } from './game/rng'
import { generateBoard } from './game/boardGen'
import { decodeBoard } from './game/boardCode'
import Home from './components/Home'
import BoardEditor from './components/BoardEditor'
import GameScreen from './components/GameScreen'
import './game.css'

const randomBoard = balanced => generateBoard(createRng(randomSeed()), { balanced })[0]

// A ?board=<code> link opens that board in the editor.
function boardFromUrl() {
  const code = new URLSearchParams(window.location.search).get('board')
  if (code === null) return { board: null, error: null }
  const board = decodeBoard(code)
  return board ? { board, error: null } : { board: null, error: 'That board link is not valid.' }
}

export default function App() {
  const [linked] = useState(boardFromUrl)
  const [screen, setScreen] = useState(linked.board ? 'editor' : 'home') // 'home' | 'editor' | 'game'
  const [game, setGame] = useState(null)

  function startGame({ board }) {
    setGame(newGame({ seed: randomSeed(), board }))
    setScreen('game')
  }

  if (screen === 'editor') {
    return <BoardEditor initialBoard={linked.board ?? game?.state.board ?? randomBoard(true)} onStart={board => startGame({ board })} onHome={() => setScreen('home')} />
  }
  if (screen === 'game' && game) {
    return <GameScreen game={game} setGame={setGame} onHome={() => setScreen('home')} />
  }
  return (
    <Home
      error={linked.error}
      onNewGame={({ balanced }) => startGame({ board: randomBoard(balanced) })}
      onEditor={() => setScreen('editor')}
    />
  )
}
