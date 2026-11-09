// Browser-to-browser connections for online play (WebRTC via PeerJS). The
// free PeerJS server only introduces the browsers; game messages then go
// directly between them. The protocol itself is in game/online.js.
import Peer from 'peerjs'

const PREFIX = 'catanalyst-room-'
const CODE_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // no 0/O or 1/I/L

export const newRoomCode = () => Array.from({ length: 6 }, () => CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)]).join('')
export const cleanRoomCode = text => String(text ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)

const ERRORS = {
  'peer-unavailable': 'No game is open with that code. Check it with the host.',
  'unavailable-id': 'That room code is in use.',
  network: 'Lost the connection to the matchmaking server.',
  'server-error': 'The matchmaking server could not be reached.',
  'socket-error': 'The matchmaking server could not be reached.',
  'browser-incompatible': 'This browser does not support direct connections.',
  webrtc: 'The direct connection failed. A strict network (school, work) can block it.',
}
const describe = err => ERRORS[err?.type] ?? `Connection problem (${err?.type ?? 'unknown'}).`

// Heartbeat: both sides ping every few seconds, and silence means the other
// browser is gone (a closed laptop or killed tab never says goodbye).
const PING_MS = 4000
const SILENCE_MS = 15000
const PING = { t: 'ping' }

// Opens a room. Calls onReady(code), onMessage(guestId, msg), onLeave(guestId), onError(text).
export function hostRoom({ onReady, onMessage, onLeave, onError }) {
  let peer, tries = 0
  const conns = new Map() // guestId -> { conn, seen }
  const drop = id => {
    const entry = conns.get(id)
    if (!entry) return
    conns.delete(id)
    entry.conn.close()
    onLeave(id)
  }
  const open = () => {
    const code = newRoomCode()
    peer = new Peer(PREFIX + code, { debug: 0 })
    peer.on('open', () => onReady(code))
    // Losing the matchmaking server only stops new guests joining; rejoin it.
    peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect() })
    peer.on('connection', conn => {
      conn.on('open', () => conns.set(conn.peer, { conn, seen: Date.now() }))
      conn.on('data', msg => {
        const entry = conns.get(conn.peer)
        if (entry) entry.seen = Date.now()
        if (msg?.t !== 'ping') onMessage(conn.peer, msg)
      })
      conn.on('close', () => drop(conn.peer))
      conn.on('error', () => drop(conn.peer))
    })
    peer.on('error', err => {
      if (err.type === 'unavailable-id' && tries++ < 3) { peer.destroy(); open(); return }
      if (err.type === 'peer-unavailable') return // a guest vanished mid-connect
      onError(describe(err))
    })
  }
  open()
  const beat = setInterval(() => {
    for (const [id, { conn, seen }] of conns) {
      if (Date.now() - seen > SILENCE_MS) drop(id)
      else if (conn.open) conn.send(PING)
    }
  }, PING_MS)
  return {
    send(to, msg) {
      for (const entry of to === '*' ? conns.values() : [conns.get(to)]) if (entry?.conn.open) entry.conn.send(msg)
    },
    close() { clearInterval(beat); peer.destroy() },
  }
}

const CONNECT_TIMEOUT_MS = 20000
const BLOCKED = "Couldn't reach the host's browser. A VPN (such as Cloudflare WARP) or a strict school or work network can block direct connections: turn the VPN off on both computers, or try another network."

// Joins a room. Calls onOpen(myId), onMessage(msg), onClose(), onError(text).
export function joinRoom(code, { onOpen, onMessage, onClose, onError }) {
  const peer = new Peer({ debug: 0 })
  let conn = null
  let opened = false, closed = false, seen = 0
  const close = () => { if (!closed) { closed = true; clearInterval(beat); onClose() } }
  const timer = setTimeout(() => { if (!opened) { onError(BLOCKED); peer.destroy() } }, CONNECT_TIMEOUT_MS)
  const beat = setInterval(() => {
    if (!opened || closed) return
    if (Date.now() - seen > SILENCE_MS) close()
    else if (conn.open) conn.send(PING)
  }, PING_MS)
  peer.on('open', id => {
    conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' })
    conn.on('open', () => { opened = true; seen = Date.now(); clearTimeout(timer); onOpen(id) })
    conn.on('data', msg => { seen = Date.now(); if (msg?.t !== 'ping') onMessage(msg) })
    conn.on('close', close)
  })
  peer.on('error', err => { clearTimeout(timer); onError(describe(err)) })
  return {
    send(msg) { if (conn?.open) conn.send(msg) },
    close() { clearTimeout(timer); clearInterval(beat); closed = true; peer.destroy() },
  }
}
