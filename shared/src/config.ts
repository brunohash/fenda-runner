export const TILE_SIZE = 48
export const PLAYER_W = 26
export const PLAYER_H = 34
/** Caixa de colisão mais estreita que o desenho, para descer escadas sem prender na borda. */
export const HIT_W = 18

export const MOVE_SPEED = 210
export const CLIMB_SPEED = 150
export const GRAVITY = 1300
export const MAX_FALL = 560
export const STEP_UP_PX = 8

export const DIG_COOLDOWN_MS = 700
export const MATCH_DURATION_MS = 3 * 60 * 1000
export const COUNTDOWN_MS = 3000
export const MAX_PLAYERS = 10
export const CHAT_MAX_CHARS = 48
export const BUBBLE_MAX_CHARS = 32
export const WS_PORT = 8787

/**
 * Buraco aberto fica aberto. Só o poder Restaurar do Shaman devolve o tijolo.
 * O relógio abaixo só vale se este flag for ligado de propósito.
 */
export const BLOCK_RESPAWN_ENABLED = false
export const BLOCK_RESPAWN_TIME_MS = 5000
export const BLOCK_REFORM_LEAD_MS = 700

export const SHAMAN_MAX_MANA = 100
export const SHAMAN_MANA_REGEN = 10
export const DESTROY_BLOCK_COST = 20
export const RESTORE_BLOCK_COST = 15
export const FORTIFY_BLOCK_COST = 25
export const SHAMAN_DESTROY_COOLDOWN_MS = 1000
export const SHAMAN_RESTORE_COOLDOWN_MS = 800
export const SHAMAN_FORTIFY_COOLDOWN_MS = 1200
export const SHAMAN_BLOCK_WARNING_MS = 800
/** Distância do centro do Shaman ao centro do bloco. */
export const SHAMAN_POWER_RANGE = 5 * TILE_SIZE
export const KILL_CREDIT_WINDOW_MS = 5000

export const PALETTE = [
  '#3DDCFF',
  '#FF5D73',
  '#FFE14A',
  '#7CFF6B',
  '#C084FC',
  '#FF8A3D',
  '#8EB6FF',
  '#FF6AD5',
  '#F4F0E6',
  '#5DFFC8',
] as const

export interface SimConfig {
  blockRespawnEnabled: boolean
  blockRespawnTimeMs: number
  blockReformLeadMs: number
  matchDurationMs: number
  digCooldownMs: number
  countdownMs: number
}

export function defaultConfig(): SimConfig {
  return {
    blockRespawnEnabled: BLOCK_RESPAWN_ENABLED,
    blockRespawnTimeMs: BLOCK_RESPAWN_TIME_MS,
    blockReformLeadMs: BLOCK_REFORM_LEAD_MS,
    matchDurationMs: MATCH_DURATION_MS,
    digCooldownMs: DIG_COOLDOWN_MS,
    countdownMs: COUNTDOWN_MS,
  }
}
