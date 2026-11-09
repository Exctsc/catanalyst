import { useState, useEffect, useRef } from 'react'
import { newGame } from './game/engine'
import { createRng, randomSeed } from './game/rng'
import { generateBoard } from './game/boardGen'
import { decodeBoard } from './game/boardCode'
import { exportGame, importGame, serializeLibrary, parseLibrary, STORAGE_KEY } from './game/saveFile'
import { createRoom, hostAct, hostReceive, hostLeave, hostReclaim, guestReceive, emptyView } from './game/online'
import { hostRoom, joinRoom, cleanRoomCode } from './net/peer'
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

// A ?join=<code> link fills in the room code on Home.
const joinFromUrl = () => cleanRoomCode(new URLSearchParams(window.location.search).get('join'))

const stamp = () => new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })

export default function App() {
  const [linked] = useState(boardFromUrl)
  const [screen, setScreen] = useState(linked.board ? 'editor' : 'home') // 'home' | 'editor' | 'game'
  // Every game this session, newest first: { id, name, game }. Branches are new entries.
  const [library] = useState(loadLibrary)
  const [games, setGames] = useState(library.games)
  const [currentId, setCurrentId] = useState(library.currentId)
  const [importError, setImportError] = useState(null)
  const [screenshot, setScreenshot] = useState(null) // image file handed from Home to the editor
  const [joinCode] = useState(joinFromUrl)
  // Online play. Host: the room lives in a ref (network callbacks need the
  // latest copy at once) and is mirrored into state for rendering.
  const [hosting, setHosting] = useState(null) // { gameId, code, error, seats, names }
  const hostRef = useRef(null) // { link, room, gameId }
  const [guest, setGuest] = useState(null) // { code, name, status, error, view, myId }
  const guestRef = useRef(null) // { link, view }
  useEffect(() => () => { hostRef.current?.link.close(); guestRef.current?.link.close() }, [])

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

  function saveGame(id, game) {
    setGames(list => list.map(g => (g.id === id ? { ...g, game } : g)))
  }

  // GameScreen hands over the validated next game and the actions behind it.
  // When hosting, the room applies them so guests get the same actions.
  function setGame(game, actions) {
    const host = hostRef.current
    if (host && host.gameId === currentId && actions) { hostUpdate(hostAct(host.room, actions)); return }
    saveGame(currentId, game)
  }

  function hostUpdate({ room, out }) {
    const host = hostRef.current
    if (!host) return
    host.room = room
    for (const { to, msg } of out) host.link.send(to, msg)
    saveGame(host.gameId, room.game)
    setHosting(h => h && { ...h, seats: room.seats, names: room.names })
  }

  function startHosting() {
    stopHosting()
    const gameId = currentId
    const room = createRoom(current.game)
    const link = hostRoom({
      onReady: code => setHosting(h => h && { ...h, code, error: null }),
      onMessage: (from, msg) => hostRef.current && hostUpdate(hostReceive(hostRef.current.room, from, msg)),
      onLeave: id => hostRef.current && hostUpdate(hostLeave(hostRef.current.room, id)),
      onError: error => setHosting(h => h && { ...h, error }),
    })
    hostRef.current = { link, room, gameId }
    setHosting({ gameId, code: null, error: null, seats: room.seats, names: room.names })
  }

  function stopHosting() {
    hostRef.current?.link.close()
    hostRef.current = null
    setHosting(null)
  }

  function joinGame(code, name) {
    leaveGuest()
    guestRef.current = { link: null, view: emptyView() }
    setGuest({ code, name, status: 'connecting', error: null, view: emptyView(), myId: null })
    setScreen('guest')
    const link = joinRoom(code, {
      onOpen: myId => { setGuest(g => g && { ...g, status: 'open', myId }); link.send({ t: 'hello', name }) },
      onMessage: msg => {
        if (!guestRef.current) return
        let view = guestReceive(guestRef.current.view, msg)
        if (view.stale) { view = { ...view, stale: false }; link.send({ t: 'resync' }) }
        guestRef.current.view = view
        setGuest(g => g && { ...g, view })
      },
      onClose: () => setGuest(g => g && { ...g, status: 'closed' }),
      onError: error => setGuest(g => g && { ...g, error, status: g.status === 'connecting' ? 'failed' : g.status }),
    })
    guestRef.current.link = link
  }

  function leaveGuest() {
    guestRef.current?.link?.close()
    guestRef.current = null
    setGuest(null)
  }

  function goHome() {
    stopHosting()
    leaveGuest()
    setScreen('home')
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
    stopHosting()
    addGame(`${current.name} ↳ branch at ${at}`, game)
  }

  if (screen === 'guest' && guest) {
    const { view, myId } = guest
    if (view.game) {
      const online = {
        role: 'guest', code: guest.code, status: guest.status, notice: view.error,
        seats: view.seats, names: view.names, myId,
        onClaim: seat => guestRef.current?.link.send({ t: 'claim', seat }),
        onRelease: seat => guestRef.current?.link.send({ t: 'release', seat }),
      }
      return <GameScreen key="guest" game={view.game} setGame={(_, actions) => guestRef.current?.link.send({ t: 'act', actions })} online={online} onHome={goHome} />
    }
    return (
      <div className="g-app">
        <div className="g-home">
          <div className="g-home-card">
            <h1>⬡ Catanalyst</h1>
            <section className="g-side-section">
              <strong>Joining room {guest.code}</strong>
              {guest.error
                ? <ul className="g-errors"><li>{guest.error}</li></ul>
                : <span className="g-dim">{guest.status === 'open' ? 'Connected. Waiting for the host to send the game…' : 'Connecting to the host…'}</span>}
              <div className="g-row">
                {guest.error && <button className="g-btn g-btn-primary" onClick={() => joinGame(guest.code, guest.name)}>Try again</button>}
                <button className="g-btn" onClick={goHome}>Back</button>
              </div>
            </section>
          </div>
        </div>
      </div>
    )
  }

  if (screen === 'editor') {
    return <BoardEditor initialBoard={linked.board ?? current?.game.state.board ?? randomBoard(true)} initialImageFile={screenshot} onStart={startGame} onHome={() => { setScreenshot(null); setScreen('home') }} />
  }
  if (screen === 'game' && current) {
    const online = hosting && hosting.gameId === current.id ? {
      role: 'host', code: hosting.code, error: hosting.error, seats: hosting.seats, names: hosting.names,
      inviteLink: hosting.code && `${window.location.origin}${window.location.pathname}?join=${hosting.code}`,
      onStop: stopHosting,
      onReclaim: seat => hostRef.current && hostUpdate(hostReclaim(hostRef.current.room, seat)),
    } : null
    return <GameScreen key={current.id} game={current.game} setGame={setGame} online={online} onHostOnline={startHosting} onHome={goHome} onBranch={branch} onExport={handleExport} />
  }
  return (
    <Home
      error={linked.error ?? importError}
      games={games}
      joinCode={joinCode}
      onJoin={joinGame}
      onImport={handleImport}
      onResume={id => { setCurrentId(id); setScreen('game') }}
      onDelete={id => {
        setGames(list => list.filter(g => g.id !== id))
        if (id === currentId) setCurrentId(null)
      }}
      onNewGame={({ balanced, ...dice }) => startGame({ board: randomBoard(balanced), ...dice })}
      onEditor={() => { setScreenshot(null); setScreen('editor') }}
      onScreenshot={file => { setScreenshot(file); setScreen('editor') }}
    />
  )
}
