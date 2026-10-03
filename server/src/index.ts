import { WebSocket, WebSocketServer } from 'ws'
import { WS_PORT } from '../../shared/src/config.ts'
import { parseClientMessage, type ServerMessage } from '../../shared/src/protocol.ts'
import { loginAccount, registerAccount, setCharacter, userFromToken, type PublicUser } from './accounts.ts'
import { deleteRoomIfEmpty, roomByName, tickRooms, type Room } from './room.ts'

interface Conn {
  socket: WebSocket
  room: Room | null
  playerId: string | null
  user: PublicUser | null
  token: string
  hits: number[]
}

const wss = new WebSocketServer({ port: WS_PORT, host: '0.0.0.0' })
const conns = new Map<WebSocket, Conn>()

wss.on('connection', (socket) => {
  const conn: Conn = { socket, room: null, playerId: null, user: null, token: '', hits: [] }
  conns.set(socket, conn)
  socket.on('message', (data) => {
    if (!allow(conn)) {
      socket.close()
      return
    }
    let raw: unknown
    try {
      raw = JSON.parse(data.toString())
    } catch {
      return
    }
    const message = parseClientMessage(raw)
    if (!message) return
    route(conn, message)
  })
  socket.on('close', () => {
    conns.delete(socket)
    if (conn.socket !== socket) return
    detach(conn)
  })
  socket.on('error', () => socket.close())
})

wss.on('error', (error) => {
  console.error('[fenda] não foi possível abrir o servidor', error)
  process.exit(1)
})

console.log(`[fenda] servidor em ws://localhost:${WS_PORT}`)

let last = performance.now()
let acc = 0
const stepMs = 1000 / 60

function loop(): void {
  const now = performance.now()
  acc += Math.min(100, now - last)
  last = now
  let guard = 0
  while (acc >= stepMs && guard < 5) {
    tickRooms(stepMs)
    acc -= stepMs
    guard += 1
  }
  if (guard >= 5) acc = 0
  setTimeout(loop, 4)
}
loop()

function allow(conn: Conn): boolean {
  const now = Date.now()
  conn.hits.push(now)
  conn.hits = conn.hits.filter((hit) => now - hit < 1000)
  return conn.hits.length < 240
}

function route(conn: Conn, message: NonNullable<ReturnType<typeof parseClientMessage>>): void {
  if (message.action === 'REGISTER') {
    const result = registerAccount(message.nickname, message.email, message.password)
    if ('error' in result) return send(conn.socket, { action: 'ERROR', message: result.error })
    conn.user = result.user
    conn.token = result.token
    sendSession(conn)
    return
  }
  if (message.action === 'LOGIN') {
    const result = loginAccount(message.email, message.password)
    if ('error' in result) return send(conn.socket, { action: 'ERROR', message: result.error })
    conn.user = result.user
    conn.token = result.token
    sendSession(conn)
    return
  }
  if (message.action === 'AUTH') {
    const user = userFromToken(message.token)
    if (!user) return send(conn.socket, { action: 'ERROR', message: 'Sessão expirada. Entre de novo.' })
    conn.user = user
    conn.token = message.token
    sendSession(conn)
    return
  }
  if (!conn.user) return send(conn.socket, { action: 'ERROR', message: 'Entre na sua conta primeiro' })
  if (message.action === 'ENTER') {
    const found = roomByName(message.room)
    if (typeof found === 'string') return send(conn.socket, { action: 'ERROR', message: found })
    leave(conn, false)
    const arrived = found.arrive(conn.socket, conn.user)
    if (typeof arrived === 'string') return send(conn.socket, { action: 'ERROR', message: arrived })
    silence(arrived.replaced)
    conn.room = found
    conn.playerId = arrived.member.id
    console.log(`[fenda] ${conn.user.nickname} em ${found.name}`)
    return
  }
  if (message.action === 'CHARACTER') {
    const updated = setCharacter(conn.user.id, message.id)
    if ('error' in updated) return send(conn.socket, { action: 'ERROR', message: updated.error })
    conn.user = updated
    conn.room?.setCharacter(conn.playerId ?? '', updated.characterId)
    sendSession(conn)
    return
  }
  if (!conn.room || !conn.playerId) return
  if (message.action === 'CHAT') {
    conn.room.say(conn.playerId, message.text)
    return
  }
  if (message.action === 'START') {
    const error = conn.room.begin()
    if (error) send(conn.socket, { action: 'ERROR', message: error })
    return
  }
  if (message.action === 'INPUT') {
    conn.room.setInput(conn.playerId, {
      left: message.left,
      right: message.right,
      up: message.up,
      down: message.down,
    })
    return
  }
  if (message.action === 'DIG') conn.room.queueDig(conn.playerId)
  if (message.action === 'POWER') {
    const reject = conn.room.cast(conn.playerId, message)
    if (reject) send(conn.socket, { action: 'NOTICE', text: reject })
    return
  }
  if (message.action === 'LEAVE') leave(conn, true)
}

function silence(socket: WebSocket | null): void {
  if (!socket) return
  const old = conns.get(socket)
  if (old) {
    old.room = null
    old.playerId = null
    old.socket = socket
  }
  socket.close()
}

function leave(conn: Conn, tell: boolean): void {
  const room = conn.room
  const playerId = conn.playerId
  conn.room = null
  conn.playerId = null
  if (room && playerId) {
    room.remove(playerId)
    deleteRoomIfEmpty(room)
  }
  if (tell) send(conn.socket, { action: 'BYE' })
}

function detach(conn: Conn): void {
  if (!conn.room) return
  leave(conn, false)
}

function sendSession(conn: Conn): void {
  if (!conn.user) return
  send(conn.socket, {
    action: 'SESSION',
    token: conn.token,
    nickname: conn.user.nickname,
    email: conn.user.email,
    characterId: conn.user.characterId,
  })
}

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
}
