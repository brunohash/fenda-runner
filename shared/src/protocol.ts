import { CHAT_MAX_CHARS } from './config.ts'
import { DRAFT_H, DRAFT_W, type DraftStatus } from './draft.ts'
import type { Controls, MatchResult, Phase, PlayerSnap, Role, SimEvent, SpawnPoint, TileChange } from './types.ts'

/** O cliente pede o corte. Não escolhe a célula. */
export type DigAction = { action: 'DIG' }

export type ClientMessage =
  | { action: 'REGISTER'; nickname: string; email: string; password: string }
  | { action: 'LOGIN'; email: string; password: string }
  | { action: 'AUTH'; token: string }
  | { action: 'ENTER'; room: string }
  | { action: 'CHAT'; text: string }
  | { action: 'CREATE'; name: string }
  | { action: 'JOIN'; code: string; name: string }
  | { action: 'START' }
  | { action: 'LEAVE' }
  | { action: 'LOGOUT' }
  | { action: 'MAPS' }
  | { action: 'SAVE_MAP'; id: string; name: string; tiles: number[][]; exit: SpawnPoint | null; spawns: SpawnPoint[]; shamanSpawn: SpawnPoint | null }
  | { action: 'TEST_MAP'; id: string }
  | ({ action: 'INPUT' } & Controls)
  | { action: 'POWER'; power: string; c?: number; r?: number; targetId?: string }
  | { action: 'BUY'; id: string }
  | { action: 'EQUIP'; id: string }
  | { action: 'INSPECT'; playerId: string }
  | DigAction

export interface RulesPayload {
  blockRespawnEnabled: boolean
  blockRespawnTimeMs: number
  blockReformLeadMs: number
  matchDurationMs: number
}

export interface LobbyPlayer {
  id: string
  name: string
  color: string
  variant: number
  characterId: string
}

export interface DraftCard {
  id: string
  name: string
  authorName: string
  status: DraftStatus
  mine: boolean
  tiles: number[][]
  exit: SpawnPoint | null
  spawns: SpawnPoint[]
  shamanSpawn: SpawnPoint | null
}

export interface WalletView {
  coins: number
  owned: string[]
  equipped: string[]
}

export interface PlayerCard {
  playerId: string
  name: string
  gear: string[]
  role: Role | null
  coins: number
  rounds: number
  escapes: number
  wins: number
  falls: number
  shamanRounds: number
}

export interface SessionProfile extends WalletView {
  token: string
  nickname: string
  email: string
  characterId: string
}

export type ServerMessage =
  | ({ action: 'SESSION' } & SessionProfile)
  | ({ action: 'WALLET' } & WalletView)
  | { action: 'WELCOME'; playerId: string; code: string; hostId: string }
  | { action: 'LOBBY'; code: string; hostId: string; players: LobbyPlayer[] }
  | { action: 'SAID'; playerId: string; name: string; text: string }
  | { action: 'NOTICE'; text: string }
  | { action: 'ERROR'; message: string }
  | { action: 'BYE' }
  | { action: 'LOGGED_OUT' }
  | { action: 'MAP_LIST'; maps: DraftCard[] }
  | { action: 'MAP_SAVED'; map: DraftCard }
  | { action: 'MAP_RESULT'; id: string; status: DraftStatus; text: string }
  | {
      action: 'MATCH'
      serial: number
      code: string
      mapName: string
      authorName: string
      skin: string
      shamanId: string
      nextShamanId: string | null
      width: number
      height: number
      tiles: number[][]
      exit: { c: number; r: number } | null
      youId: string
      players: PlayerSnap[]
      countdownMs: number
      timeLeftMs: number
      phase: Phase
      rules: RulesPayload
    }
  | {
      action: 'SNAP'
      serial: number
      tick: number
      phase: Phase
      countdownMs: number
      timeLeftMs: number
      players: PlayerSnap[]
      shamanId: string
      nextShamanId: string | null
      /** Mapa completo. Um snap perdido não pode deixar bloco desenhado sem colisão. */
      grid: number[][]
      /** Blocos que o Shaman já escolheu e que ainda estão no aviso. */
      marks: { c: number; r: number }[]
      holes: { c: number; r: number }[]
      tiles: TileChange[]
      events: SimEvent[]
      result: MatchResult | null
      /** Tempo até a sala inteira entrar na rodada seguinte. */
      restartInMs: number
    }
  | ({ action: 'CARD' } & PlayerCard)

function parseDraft(raw: Record<string, unknown>): ClientMessage | null {
  const tiles = parseTiles(raw.tiles)
  if (!tiles) return null
  const exit = parseExit(raw.exit)
  if (raw.exit != null && !exit) return null
  return { action: 'SAVE_MAP', id: text(raw.id, 16), name: text(raw.name, 24), tiles, exit, spawns: parseSpawns(raw.spawns), shamanSpawn: parseExit(raw.shamanSpawn) }
}

function parseTiles(value: unknown): number[][] | null {
  if (!Array.isArray(value) || value.length !== DRAFT_H) return null
  const tiles: number[][] = []
  for (const row of value) {
    if (!Array.isArray(row) || row.length !== DRAFT_W) return null
    const line: number[] = []
    for (const cell of row) {
      if (cell !== 0 && cell !== 1 && cell !== 2 && cell !== 3 && cell !== 4) return null
      line.push(cell)
    }
    tiles.push(line)
  }
  return tiles
}

function parseExit(value: unknown): SpawnPoint | null {
  if (!isRecord(value)) return null
  if (!Number.isInteger(value.c) || !Number.isInteger(value.r)) return null
  return { c: value.c as number, r: value.r as number }
}

function parseSpawns(value: unknown): SpawnPoint[] {
  if (!Array.isArray(value)) return []
  const spawns: SpawnPoint[] = []
  for (const item of value) {
    const point = parseExit(item)
    if (!point) continue
    spawns.push(point)
    if (spawns.length === 10) break
  }
  return spawns
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function bool(value: unknown): boolean {
  return value === true
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : ''
}

export function sanitizeName(input: unknown, fallback: string): string {
  const raw = typeof input === 'string' ? input : ''
  const clean = raw.replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 16)
  return clean || fallback
}

export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (!isRecord(raw) || typeof raw.action !== 'string') return null
  switch (raw.action) {
    case 'DIG':
      return { action: 'DIG' }
    case 'REGISTER':
      return {
        action: 'REGISTER',
        nickname: text(raw.nickname, 16),
        email: text(raw.email, 80),
        password: text(raw.password, 72),
      }
    case 'LOGIN':
      return { action: 'LOGIN', email: text(raw.email, 80), password: text(raw.password, 72) }
    case 'AUTH':
      return { action: 'AUTH', token: text(raw.token, 80) }
    case 'ENTER':
      return { action: 'ENTER', room: text(raw.room, 24) }
    case 'CHAT':
      return { action: 'CHAT', text: text(raw.text, CHAT_MAX_CHARS) }
    case 'POWER':
      return {
        action: 'POWER',
        power: text(raw.power, 24),
        c: Number.isInteger(raw.c) ? (raw.c as number) : undefined,
        r: Number.isInteger(raw.r) ? (raw.r as number) : undefined,
        targetId: typeof raw.targetId === 'string' ? raw.targetId.slice(0, 24) : undefined,
      }
    case 'BUY':
      return { action: 'BUY', id: text(raw.id, 24) }
    case 'EQUIP':
      return { action: 'EQUIP', id: text(raw.id, 24) }
    case 'INSPECT':
      return { action: 'INSPECT', playerId: text(raw.playerId, 24) }
    case 'CREATE':
      return { action: 'CREATE', name: typeof raw.name === 'string' ? raw.name : '' }
    case 'JOIN':
      return {
        action: 'JOIN',
        code: typeof raw.code === 'string' ? raw.code : '',
        name: typeof raw.name === 'string' ? raw.name : '',
      }
    case 'START':
      return { action: 'START' }
    case 'LEAVE':
      return { action: 'LEAVE' }
    case 'LOGOUT':
      return { action: 'LOGOUT' }
    case 'MAPS':
      return { action: 'MAPS' }
    case 'SAVE_MAP':
      return parseDraft(raw)
    case 'TEST_MAP':
      return { action: 'TEST_MAP', id: text(raw.id, 16) }
    case 'INPUT':
      return {
        action: 'INPUT',
        left: bool(raw.left),
        right: bool(raw.right),
        up: bool(raw.up),
        down: bool(raw.down),
      }
    default:
      return null
  }
}
