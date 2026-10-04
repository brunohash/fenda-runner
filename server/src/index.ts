import { WebSocket, WebSocketServer } from 'ws'
import { WS_PORT } from '../../shared/src/config.ts'
import { parseClientMessage, type ServerMessage } from '../../shared/src/protocol.ts'
import { loginAccount, registerAccount, buyForUser, equipForUser, grantCoins, closeSession, userFromToken, careerOf, recordCareer, type PublicUser } from './accounts.ts'
import { Room, deleteRoomIfEmpty, dropPractice, roomByName, setCareerRecord, setEscapeReward, tickRooms, trackPractice } from './room.ts'
import { approveDraft, getDraft, saveDraft, visibleDrafts } from './maps.ts'
import { draftProblems } from '../../shared/src/draft.ts'
import { draftToMap } from '../../shared/src/draft.ts'

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

setEscapeReward((userId, coins) => {
  const user = grantCoins(userId, coins)
  if (!user) return
  for (const conn of conns.values()) {
    if (conn.user?.id !== userId) continue
    conn.user = user
    send(conn.socket, { action: 'NOTICE', text: `Você ganhou ${coins} moedas.` })
    sendWallet(conn)
  }
})

setCareerRecord((notes) => recordCareer(notes))

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
  if (message.action === 'LOGOUT') {
    if (conn.token) closeSession(conn.token)
    leave(conn, false)
    conn.user = null
    conn.token = ''
    send(conn.socket, { action: 'LOGGED_OUT' })
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
  if (message.action === 'BUY' || message.action === 'EQUIP') {
    const updated = message.action === 'BUY' ? buyForUser(conn.user.id, message.id) : equipForUser(conn.user.id, message.id)
    if ('error' in updated) return send(conn.socket, { action: 'NOTICE', text: updated.error })
    conn.user = updated
    if (conn.playerId) conn.room?.setGear(conn.playerId, updated.equipped)
    sendWallet(conn)
    return
  }
  if (message.action === 'MAPS') {
    send(conn.socket, { action: 'MAP_LIST', maps: visibleDrafts(conn.user.id) })
    return
  }
  if (message.action === 'SAVE_MAP') {
    const saved = saveDraft(conn.user, message)
    if ('error' in saved) return send(conn.socket, { action: 'NOTICE', text: saved.error })
    send(conn.socket, { action: 'MAP_SAVED', map: { ...saved, mine: true } })
    send(conn.socket, { action: 'MAP_LIST', maps: visibleDrafts(conn.user.id) })
    return
  }
  if (message.action === 'TEST_MAP') {
    beginTest(conn, message.id)
    return
  }
  if (!conn.room || !conn.playerId) return
  if (message.action === 'CHAT') {
    conn.room.say(conn.playerId, message.text)
    return
  }
  if (message.action === 'INSPECT') {
    const view = conn.room.inspect(message.playerId)
    if (!view) return
    const account = view.userId ? careerOf(view.userId) : null
    send(conn.socket, {
      action: 'CARD',
      playerId: message.playerId,
      name: account?.nickname || view.name,
      gear: view.gear.length ? view.gear : (account?.equipped ?? []),
      role: view.role,
      coins: account?.coins ?? 0,
      rounds: account?.career.rounds ?? 0,
      escapes: account?.career.escapes ?? 0,
      wins: account?.career.wins ?? 0,
      falls: account?.career.falls ?? 0,
      shamanRounds: account?.career.shamanRounds ?? 0,
    })
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

function beginTest(conn: Conn, id: string): void {
  if (!conn.user) return
  const draft = getDraft(id)
  if (!draft || draft.authorId !== conn.user.id) {
    send(conn.socket, { action: 'NOTICE', text: 'Esse mapa não é seu.' })
    return
  }
  const problem = draftProblems(draft)
  if (problem) {
    send(conn.socket, { action: 'NOTICE', text: problem })
    return
  }
  leave(conn, false)
  const room = new Room('ensaio')
  room.practiceMap = draftToMap(draft)
  room.onPractice = (passed) => {
    dropPractice(room)
    if (passed) approveDraft(id)
    const status = passed || getDraft(id)?.status === 'aprovado' ? 'aprovado' : 'reprovado'
    send(conn.socket, {
      action: 'MAP_RESULT',
      id,
      status,
      text: passed
        ? 'Aprovado. O mapa entrou nas fases.'
        : 'Reprovado. A fase só entra no jogo se você chegar na porta.',
    })
    if (conn.user) send(conn.socket, { action: 'MAP_LIST', maps: visibleDrafts(conn.user.id) })
  }
  trackPractice(room)
  const arrived = room.arrive(conn.socket, conn.user)
  if (typeof arrived === 'string') {
    dropPractice(room)
    send(conn.socket, { action: 'NOTICE', text: arrived })
    return
  }
  conn.room = room
  conn.playerId = arrived.member.id
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
    coins: conn.user.coins,
    owned: conn.user.owned,
    equipped: conn.user.equipped,
  })
}

function sendWallet(conn: Conn): void {
  if (!conn.user) return
  send(conn.socket, {
    action: 'WALLET',
    coins: conn.user.coins,
    owned: conn.user.owned,
    equipped: conn.user.equipped,
  })
}

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
}
