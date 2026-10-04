export type Phase = 'countdown' | 'playing' | 'finished'
export type Facing = -1 | 1
export type DeathCause = 'void' | 'buried' | 'disconnect'
export type KillCredit = 'PLAYER_DIG' | 'SHAMAN_POWER'
export type Role = 'player' | 'shaman'

export interface Controls {
  left: boolean
  right: boolean
  up: boolean
  down: boolean
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Grid {
  width: number
  height: number
  tiles: number[][]
}

export interface SpawnPoint {
  c: number
  r: number
}

export interface GameMap extends Grid {
  id: string
  name: string
  /** Apelido de quem desenhou o mapa. Vazio na fase de fábrica. */
  authorName: string
  skin: string
  spawns: SpawnPoint[]
  /** Onde o Shaman começa. Vazio usa um nascimento comum. */
  shamanSpawn: SpawnPoint | null
  /** Célula vazia da porta. O piso debaixo dela é estrutural. */
  exit: SpawnPoint | null
}

export interface PlayerSnap {
  id: string
  name: string
  color: string
  variant: number
  characterId: string
  /** Itens equipados. Mudam o desenho, não o corpo. */
  gear: string[]
  role: Role
  mana: number
  x: number
  y: number
  vx: number
  vy: number
  facing: Facing
  alive: boolean
  onGround: boolean
  onLadder: boolean
  onBar: boolean
  digCooldownMs: number
  escaped: boolean
  powerCooldownMs: { block: number; restore: number; fortify: number; ladder: number; bar: number }
}

export interface TileChange {
  c: number
  r: number
  tile: number
  phase: 'open' | 'reforming' | 'solid'
}

export type DigReason =
  | 'airborne'
  | 'unaligned'
  | 'cooldown'
  | 'not_destructible'
  | 'out_of_bounds'
  | 'reach'
  | 'unavailable'

export type SimEvent =
  | { type: 'dug'; playerId: string; c: number; r: number }
  | { type: 'rejected'; playerId: string; reason: DigReason }
  | { type: 'death'; playerId: string; cause: DeathCause; killerId: string | null; credit: KillCredit | null }
  | { type: 'reform'; c: number; r: number }
  | { type: 'restored'; c: number; r: number }
  | { type: 'power'; playerId: string; power: string }
  | { type: 'escaped'; playerId: string }
  | { type: 'door-held'; playerId: string }
  | { type: 'shaman-down'; killerId: string | null; cause: 'killed' | 'self' | 'disconnect' }

export interface MatchResult {
  tie: boolean
  winnerIds: string[]
}

export function idleControls(): Controls {
  return { left: false, right: false, up: false, down: false }
}
