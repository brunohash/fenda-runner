import { WebSocket } from 'ws'
import { CHAT_MAX_CHARS, MAX_PLAYERS, PALETTE, defaultConfig } from '../../shared/src/config.ts'
import { normalizeRoomName } from '../../shared/src/characters.ts'
import type { GameMap } from '../../shared/src/types.ts'
import { playableMaps } from './maps.ts'
import { assignRoles, castPower, chooseShaman, type PowerRequest } from '../../shared/src/shaman.ts'
import { cloneMap } from '../../shared/src/map.ts'
import type { ServerMessage } from '../../shared/src/protocol.ts'
import { ESCAPE_COINS } from '../../shared/src/shop.ts'
import {
  createPlayer,
  createSim,
  evaluateEnd,
  facingTowardPlate,
  killPlayer,
  snapshotPlayers,
  spawnPose,
  stepSim,
  type SimState,
} from '../../shared/src/sim.ts'
import type { Controls, Phase } from '../../shared/src/types.ts'
import { idleControls } from '../../shared/src/types.ts'

export interface RoomUser {
  id: string
  nickname: string
  characterId: string
  equipped: string[]
}

interface Member {
  id: string
  userId: string
  name: string
  color: string
  variant: number
  characterId: string
  gear: string[]
  socket: WebSocket | null
  controls: Controls
  digQueued: boolean
}

export class Room {
  readonly key: string
  readonly name: string
  hostId = ''
  members: Member[] = []
  sim: SimState | null = null
  serial = 0
  private seq = 1
  private restartAt = 0
  private phaseCursor = 0
  private pendingShamanId: string | null = null
  practiceMap: GameMap | null = null
  onPractice: ((passed: boolean) => void) | null = null

  constructor(name: string) {
    this.name = name
    this.key = name.toLocaleLowerCase('pt-BR')
  }

  get phase(): 'lobby' | 'countdown' | 'playing' | 'finished' {
    return this.sim?.phase ?? 'lobby'
  }

  get code(): string {
    return this.name
  }

  connected(): Member[] {
    return this.members.filter((member) => member.socket)
  }

  arrive(socket: WebSocket, user: RoomUser): { member: Member; replaced: WebSocket | null } | string {
    const existing = this.members.find((member) => member.userId === user.id)
    if (!existing && this.connected().length >= MAX_PLAYERS) return 'Sala cheia'
    const member = existing ?? this.createMember(user)
    if (!existing) this.members.push(member)
    const replaced = existing?.socket && existing.socket !== socket ? existing.socket : null
    member.name = user.nickname
    member.characterId = user.characterId
    member.gear = [...user.equipped]
    member.socket = socket
    member.controls = idleControls()
    member.digQueued = false
    if (!this.hostId) this.hostId = member.id
    if (!this.sim || this.sim.phase === 'finished') {
      const error = this.begin()
      if (error) return error
    } else {
      this.admit(member)
      const player = this.sim?.players.find((item) => item.id === member.id)
      if (player) player.gear = [...member.gear]
    }
    this.broadcastLobby()
    return { member, replaced }
  }

  begin(): string | null {
    if (this.sim && (this.sim.phase === 'countdown' || this.sim.phase === 'playing')) {
      return 'A partida já está em andamento'
    }
    const present = this.connected()
    if (present.length === 0) return 'Sala vazia'
    const catalog = this.practiceMap ? [this.practiceMap] : playableMaps()
    const map = cloneMap(catalog[this.phaseCursor % catalog.length]!)
    if (!this.practiceMap) this.phaseCursor += 1
    const sim = createSim(map, defaultConfig())
    this.serial += 1
    this.restartAt = 0
    present.forEach((member) => {
      member.controls = idleControls()
      member.digQueued = false
    })
    const shamanId = chooseShaman(
      present.map((member) => member.id),
      this.pendingShamanId,
    )
    this.pendingShamanId = null
    let playerIndex = 0
    for (const member of present) {
      const at = member.id === shamanId ? sim.map.shamanSpawn : null
      this.place(sim, member, at ? 0 : playerIndex, at)
      if (!at) playerIndex += 1
    }
    assignRoles(sim, shamanId)
    this.sim = sim
    if (!this.practiceMap) {
      const notes: { userId: string; field: 'rounds' | 'shamanRounds' }[] = present.map((member) => ({
        userId: member.userId,
        field: 'rounds' as const,
      }))
      const shaman = present.find((member) => member.id === shamanId)
      if (shaman) notes.push({ userId: shaman.userId, field: 'shamanRounds' })
      noteCareer?.(notes)
    }
    this.broadcastMatch()
    this.broadcastSnap()
    return null
  }

  setGear(id: string, gear: string[]): void {
    const member = this.members.find((item) => item.id === id)
    if (!member) return
    member.gear = [...gear]
    const player = this.sim?.players.find((item) => item.id === id)
    if (player) player.gear = [...gear]
    if (this.sim) this.broadcastSnap()
  }

  say(id: string, text: string): void {
    const member = this.members.find((item) => item.id === id)
    if (!member) return
    const clean = text.replace(/[\u0000-\u001F]/g, '').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX_CHARS)
    if (!clean) return
    this.sendAll({ action: 'SAID', playerId: member.id, name: member.name, text: clean })
  }

  setInput(id: string, controls: Controls): void {
    const member = this.members.find((item) => item.id === id)
    if (!member) return
    member.controls = controls
  }

  cast(id: string, request: PowerRequest): string | null {
    if (!this.sim) return 'Sem partida'
    return castPower(this.sim, id, request)
  }

  queueDig(id: string): void {
    const member = this.members.find((item) => item.id === id)
    if (!member) return
    member.digQueued = true
  }

  remove(id: string): void {
    const member = this.members.find((item) => item.id === id)
    if (!member) return
    member.socket = null
    if (!this.sim || this.sim.phase === 'finished') {
      this.members = this.members.filter((item) => item.id !== id)
    } else {
      killPlayer(this.sim, id, 'disconnect')
      evaluateEnd(this.sim)
      if ((this.sim.phase as Phase) === 'finished') this.pendingShamanId = this.sim.nextShamanId
      this.broadcastSnap()
      this.finishPractice()
    }
    if (this.hostId === id) {
      const next = this.members.find((item) => item.socket && item.id !== id)
      this.hostId = next?.id ?? this.members[0]?.id ?? ''
    }
    if (this.sim?.phase === 'finished') {
      this.members = this.members.filter((item) => item.id !== id)
    }
    this.broadcastLobby()
  }

  tick(dtMs: number): void {
    if (!this.sim) return
    const phase = this.sim.phase
    for (const member of this.members) {
      const player = this.sim.players.find((item) => item.id === member.id)
      if (!player) continue
      player.controls = member.controls
      player.characterId = member.characterId
      player.gear = member.gear
      if (member.digQueued) {
        player.digQueued = true
        member.digQueued = false
      }
    }
    stepSim(this.sim, dtMs)
    if (!this.practiceMap) this.noteRound(phase)
    if (this.sim.phase === 'finished') this.pendingShamanId = this.sim.nextShamanId
    if (this.practiceMap && phase !== 'finished' && this.sim.phase === 'finished') {
      this.broadcastSnap()
      this.finishPractice()
      return
    }
    const doorClosed =
      phase !== 'finished' &&
      this.sim.phase === 'finished' &&
      this.sim.players.some((player) => player.escaped) &&
      !this.sim.events.some((event) => event.type === 'shaman-down')
    if (doorClosed && this.connected().length > 0) {
      this.payEscapes()
      this.begin()
      return
    }
    if (this.sim.phase === 'finished' && phase !== 'finished') this.restartAt = Date.now() + 5000
    if (this.sim.phase === 'finished' && this.restartAt && Date.now() >= this.restartAt && this.connected().length > 0) {
      this.begin()
      return
    }
    const hot = this.sim.events.length > 0 || this.sim.tileChanges.length > 0 || this.sim.phase !== phase
    if (this.sim.phase === 'finished') {
      if (hot || this.sim.tick % 30 === 0) this.broadcastSnap()
      return
    }
    this.broadcastSnap()
  }

  broadcastLobby(): void {
    this.sendAll({
      action: 'LOBBY',
      code: this.name,
      hostId: this.hostId,
      players: this.connected().map((member) => ({
        id: member.id,
        name: member.name,
        color: member.color,
        variant: member.variant,
        characterId: member.characterId,
      })),
    })
  }

  private createMember(user: RoomUser): Member {
    const variant = this.nextVariant()
    return {
      id: `p${this.seq++}`,
      userId: user.id,
      name: user.nickname,
      color: PALETTE[variant % PALETTE.length],
      variant,
      characterId: user.characterId,
      gear: [...user.equipped],
      socket: null,
      controls: idleControls(),
      digQueued: false,
    }
  }

  private place(sim: SimState, member: Member, index: number, at: { c: number; r: number } | null = null): void {
    const spawn = at ?? sim.map.spawns[index % sim.map.spawns.length]
    if (!spawn) return
    const pose = spawnPose(spawn.c, spawn.r)
    sim.players.push(
      createPlayer({
        id: member.id,
        name: member.name,
        color: member.color,
        variant: member.variant,
        characterId: member.characterId,
        gear: member.gear,
        x: pose.x,
        y: pose.y,
        facing: facingTowardPlate(sim.map, spawn.c, spawn.r + 1),
      }),
    )
  }

  private admit(member: Member): void {
    if (!this.sim) return
    if (!this.sim.players.some((player) => player.id === member.id)) {
      this.place(this.sim, member, this.sim.players.length)
      if (!this.practiceMap) noteCareer?.([{ userId: member.userId, field: 'rounds' }])
    }
    if (member.socket) this.sendMatch(member.socket, member.id)
  }

  private finishPractice(): void {
    if (!this.practiceMap || !this.sim || this.sim.phase !== 'finished' || !this.onPractice) return
    const passed = this.sim.players.some((player) => player.escaped)
    const done = this.onPractice
    this.onPractice = null
    done(passed)
  }

  private payEscapes(): void {
    if (!this.sim || !rewardEscape) return
    for (const event of this.sim.events) {
      if (event.type !== 'escaped') continue
      const member = this.members.find((item) => item.id === event.playerId)
      if (member) rewardEscape(member.userId, ESCAPE_COINS)
    }
  }

  private nextVariant(): number {
    const used = new Set(this.members.map((member) => member.variant))
    for (let i = 0; i < PALETTE.length; i++) if (!used.has(i)) return i
    return this.members.length % PALETTE.length
  }

  inspect(playerId: string): { userId: string; name: string; gear: string[]; role: 'player' | 'shaman' | null } | null {
    const member = this.members.find((item) => item.id === playerId)
    const player = this.sim?.players.find((item) => item.id === playerId)
    if (!member && !player) return null
    return {
      userId: member?.userId ?? '',
      name: player?.name ?? member?.name ?? 'Operador',
      gear: [...(player?.gear ?? member?.gear ?? [])],
      role: player?.role ?? null,
    }
  }

  private noteRound(phase: Phase): void {
    if (!this.sim) return
    const notes: { userId: string; field: 'escapes' | 'wins' | 'falls' }[] = []
    for (const event of this.sim.events) {
      if (event.type === 'escaped') {
        const member = this.members.find((item) => item.id === event.playerId)
        if (member) notes.push({ userId: member.userId, field: 'escapes' })
      }
      if (event.type === 'death' && (event.cause === 'void' || event.cause === 'buried')) {
        const member = this.members.find((item) => item.id === event.playerId)
        if (member) notes.push({ userId: member.userId, field: 'falls' })
      }
    }
    if (phase !== 'finished' && this.sim.phase === 'finished') {
      for (const id of this.sim.result?.winnerIds ?? []) {
        const member = this.members.find((item) => item.id === id)
        if (member) notes.push({ userId: member.userId, field: 'wins' })
      }
    }
    if (notes.length) noteCareer?.(notes)
  }

  private broadcastMatch(): void {
    for (const member of this.connected()) {
      if (member.socket) this.sendMatch(member.socket, member.id)
    }
  }

  private sendMatch(socket: WebSocket, youId: string): void {
    if (!this.sim) return
    const message: ServerMessage = {
      action: 'MATCH',
      serial: this.serial,
      code: this.name,
      mapName: this.sim.map.name,
      authorName: this.sim.map.authorName,
      skin: this.sim.map.skin,
      shamanId: this.sim.shamanId,
      nextShamanId: this.sim.nextShamanId,
      width: this.sim.map.width,
      height: this.sim.map.height,
      tiles: this.sim.map.tiles.map((row) => row.slice()),
      exit: this.sim.map.exit ? { ...this.sim.map.exit } : null,
      youId,
      players: snapshotPlayers(this.sim),
      countdownMs: this.sim.countdownMs,
      timeLeftMs: this.sim.timeLeftMs,
      phase: this.sim.phase,
      rules: {
        blockRespawnEnabled: this.sim.config.blockRespawnEnabled,
        blockRespawnTimeMs: this.sim.config.blockRespawnTimeMs,
        blockReformLeadMs: this.sim.config.blockReformLeadMs,
        matchDurationMs: this.sim.config.matchDurationMs,
      },
    }
    this.send(socket, message)
  }

  private broadcastSnap(): void {
    if (!this.sim) return
    if (!this.practiceMap) this.payEscapes()
    const message: ServerMessage = {
      action: 'SNAP',
      serial: this.serial,
      tick: this.sim.tick,
      phase: this.sim.phase,
      countdownMs: Math.max(0, Math.ceil(this.sim.countdownMs)),
      timeLeftMs: Math.max(0, Math.ceil(this.sim.timeLeftMs)),
      players: snapshotPlayers(this.sim),
      shamanId: this.sim.shamanId,
      nextShamanId: this.sim.nextShamanId,
      grid: this.sim.map.tiles.map((row) => row.slice()),
      marks: this.sim.marks.map((mark) => ({ c: mark.c, r: mark.r })),
      holes: this.sim.holes.map((hole) => ({ c: hole.c, r: hole.r })),
      tiles: this.sim.tileChanges.splice(0, this.sim.tileChanges.length),
      events: this.sim.events.splice(0, this.sim.events.length),
      result: this.sim.result,
      restartInMs: this.restartAt > 0 ? Math.max(0, this.restartAt - Date.now()) : 0,
    }
    this.sendAll(message)
  }

  private sendAll(message: ServerMessage): void {
    for (const member of this.connected()) {
      if (member.socket) this.send(member.socket, message)
    }
  }

  private send(socket: WebSocket, message: ServerMessage): void {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
  }
}

const rooms = new Map<string, Room>()
const practiceRooms = new Set<Room>()
let rewardEscape: ((userId: string, coins: number) => void) | null = null
let noteCareer: ((notes: { userId: string; field: 'rounds' | 'escapes' | 'wins' | 'falls' | 'shamanRounds' }[]) => void) | null = null

export function setEscapeReward(fn: (userId: string, coins: number) => void): void {
  rewardEscape = fn
}

export function setCareerRecord(fn: (notes: { userId: string; field: 'rounds' | 'escapes' | 'wins' | 'falls' | 'shamanRounds' }[]) => void): void {
  noteCareer = fn
}

export function roomByName(raw: string): Room | string {
  const name = normalizeRoomName(raw)
  if (!name) return 'O nome da sala precisa ter entre 2 e 24 letras ou números'
  const key = name.toLocaleLowerCase('pt-BR')
  let room = rooms.get(key)
  if (!room) {
    room = new Room(name)
    rooms.set(key, room)
  }
  return room
}

export function deleteRoomIfEmpty(room: Room): void {
  if (room.connected().length > 0) return
  if (rooms.get(room.key) === room) rooms.delete(room.key)
}

export function trackPractice(room: Room): void {
  practiceRooms.add(room)
}

export function dropPractice(room: Room): void {
  practiceRooms.delete(room)
}

export function tickRooms(dtMs: number): void {
  for (const room of rooms.values()) room.tick(dtMs)
  for (const room of practiceRooms) room.tick(dtMs)
}
