import { CHAT_MAX_CHARS } from './config.ts'
import type { Controls, MatchResult, Phase, PlayerSnap, SimEvent, TileChange } from './types.ts'

/** O cliente pede o corte. Não escolhe a célula. */
export type DigAction = { action: 'DIG' }

export type ClientMessage =
  | { action: 'REGISTER'; nickname: string; email: string; password: string }
  | { action: 'LOGIN'; email: string; password: string }
  | { action: 'AUTH'; token: string }
  | { action: 'ENTER'; room: string }
  | { action: 'CHARACTER'; id: string }
  | { action: 'CHAT'; text: string }
  | { action: 'CREATE'; name: string }
  | { action: 'JOIN'; code: string; name: string }
  | { action: 'START' }
  | { action: 'LEAVE' }
  | ({ action: 'INPUT' } & Controls)
  | { action: 'POWER'; power: string; c?: number; r?: number; targetId?: string }
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

export interface SessionProfile {
  token: string
  nickname: string
  email: string
  characterId: string
}

export type ServerMessage =
  | ({ action: 'SESSION' } & SessionProfile)
  | { action: 'WELCOME'; playerId: string; code: string; hostId: string }
  | { action: 'LOBBY'; code: string; hostId: string; players: LobbyPlayer[] }
  | { action: 'SAID'; playerId: string; name: string; text: string }
  | { action: 'NOTICE'; text: string }
  | { action: 'ERROR'; message: string }
  | { action: 'BYE' }
  | {
      action: 'MATCH'
      serial: number
      code: string
      mapName: string
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
    case 'CHARACTER':
      return { action: 'CHARACTER', id: text(raw.id, 24) }
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
