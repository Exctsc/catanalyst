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

const stamp = () => new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })

export default function App() {
  const [linked] = useState(boardFromUrl)
  const [screen, setScreen] = useState(linked.board ? 'editor' : 'home') // 'home' | 'editor' | 'game'
  // Every game this session, newest first: { id, name, game }. Branches are new entries.
  const [games, setGames] = useState([])
  const [currentId, setCurrentId] = useState(null)
  const current = games.find(g => g.id === currentId) ?? null

  function addGame(name, game) {
    const id = `${Date.now()}-${games.length}`
    setGames(list => [{ id, name, game }, ...list])
    setCurrentId(id)
    setScreen('game')
  }

  function startGame({ board, diceMode, diceQueue }) {
    addGame(`Game · ${stamp()}`, newGame({ seed: randomSeed(), board, diceMode, diceQueue }))
  }

  function setGame(game) {
    setGames(list => list.map(g => (g.id === currentId ? { ...g, game } : g)))
  }

  function branch(game, position) {
    const at = position.phase === 'setup' ? 'setup' : `turn ${position.turn}`
    addGame(`${current.name} ↳ branch at ${at}`, game)
  }

  if (screen === 'editor') {
    return <BoardEditor initialBoard={linked.board ?? current?.game.state.board ?? randomBoard(true)} onStart={startGame} onHome={() => setScreen('home')} />
  }
  if (screen === 'game' && current) {
    return <GameScreen key={current.id} game={current.game} setGame={setGame} onHome={() => setScreen('home')} onBranch={branch} />
  }
  return (
    <Home
      error={linked.error}
      games={games}
      onResume={id => { setCurrentId(id); setScreen('game') }}
      onNewGame={({ balanced, ...dice }) => startGame({ board: randomBoard(balanced), ...dice })}
      onEditor={() => setScreen('editor')}
    />
  )
}
