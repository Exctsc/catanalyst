import { useState, useEffect } from 'react'
import { newGame } from './game/engine'
import { createRng, randomSeed } from './game/rng'
import { generateBoard } from './game/boardGen'
import { decodeBoard } from './game/boardCode'
import { exportGame, importGame, serializeLibrary, parseLibrary, STORAGE_KEY } from './game/saveFile'
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

// Autosave: every game in the session lives in localStorage. Storage can be
// unavailable (private mode, quota, disabled), which only costs persistence.
// ponytail: the whole library is rewritten on each change; fine for dozens of
// games, switch to per-game keys if it ever gets slow.
function loadLibrary() {
  try {
    return parseLibrary(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    return { games: [], currentId: null }
  }
}

function download(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

const stamp = () => new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })

export default function App() {
  const [linked] = useState(boardFromUrl)
  const [screen, setScreen] = useState(linked.board ? 'editor' : 'home') // 'home' | 'editor' | 'game'
  // Every game this session, newest first: { id, name, game }. Branches are new entries.
  const [library] = useState(loadLibrary)
  const [games, setGames] = useState(library.games)
  const [currentId, setCurrentId] = useState(library.currentId)
  const [importError, setImportError] = useState(null)

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, serializeLibrary(games, currentId))
    } catch {
      // storage unavailable: keep playing without persistence
    }
  }, [games, currentId])
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

  function handleImport(text) {
    const result = importGame(text)
    if (typeof result === 'string') { setImportError(result); return }
    setImportError(null)
    addGame(result.name, result.game)
  }

  function handleExport() {
    const safe = current.name.replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '').toLowerCase()
    download(`catanalyst-${safe || 'game'}.json`, exportGame(current.game, current.name))
  }

  function branch(game, position) {
    const at = position.phase === 'setup' ? 'setup' : `turn ${position.turn}`
    addGame(`${current.name} ↳ branch at ${at}`, game)
  }

  if (screen === 'editor') {
    return <BoardEditor initialBoard={linked.board ?? current?.game.state.board ?? randomBoard(true)} onStart={startGame} onHome={() => setScreen('home')} />
  }
  if (screen === 'game' && current) {
    return <GameScreen key={current.id} game={current.game} setGame={setGame} onHome={() => setScreen('home')} onBranch={branch} onExport={handleExport} />
  }
  return (
    <Home
      error={linked.error ?? importError}
      games={games}
      onImport={handleImport}
      onResume={id => { setCurrentId(id); setScreen('game') }}
      onNewGame={({ balanced, ...dice }) => startGame({ board: randomBoard(balanced), ...dice })}
      onEditor={() => setScreen('editor')}
    />
  )
}
