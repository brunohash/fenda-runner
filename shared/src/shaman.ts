import {
  DESTROY_BLOCK_COST,
  FORTIFY_BLOCK_COST,
  PLACE_BAR_COST,
  PLACE_LADDER_COST,
  PLAYER_H,
  PLAYER_W,
  RESTORE_BLOCK_COST,
  SHAMAN_BAR_COOLDOWN_MS,
  SHAMAN_DESTROY_COOLDOWN_MS,
  SHAMAN_FORTIFY_COOLDOWN_MS,
  SHAMAN_LADDER_COOLDOWN_MS,
  SHAMAN_MAX_MANA,
  SHAMAN_POWER_RANGE,
  SHAMAN_RESTORE_COOLDOWN_MS,
  TILE_SIZE,
} from './config.ts'
import { Tile } from './map.ts'
import { armDestroyBlock, fortifyCell, hitRect, placeBar, placeLadder, restoreCell, type SimPlayer, type SimState } from './sim.ts'
import type { Phase, Role } from './types.ts'

export interface PowerRequest {
  power: string
  c?: number
  r?: number
  targetId?: string
}

export interface PowerDef {
  id: string
  name: string
  summary: string
  manaCost: number
  cooldownMs: number
}

interface ShamanPower extends PowerDef {
  range: number
  validate(sim: SimState, caster: SimPlayer, request: PowerRequest): string | null
  execute(sim: SimState, caster: SimPlayer, request: PowerRequest): void
}

export interface AimContext {
  tiles: number[][]
  holes: { c: number; r: number }[]
  marks: { c: number; r: number }[]
  exit: { c: number; r: number } | null
  bodies: { x: number; y: number; alive: boolean }[]
  caster: {
    x: number
    y: number
    mana: number
    alive: boolean
    role: Role
    powerCooldownMs: { block: number; restore: number; fortify: number; ladder: number; bar: number }
  }
  phase: Phase
  power: string
  c: number
  r: number
}

/**
 * Destroy, Restore, Fortify e Escada. Os próximos poderes entram aqui
 * com validate, execute, mana, cooldown e alcance próprios.
 */
const POWERS: Record<string, ShamanPower> = {
  block: {
    id: 'block',
    name: 'Destruir bloco',
    summary: 'Marca um tijolo. Ele abre depois de um aviso.',
    manaCost: DESTROY_BLOCK_COST,
    cooldownMs: SHAMAN_DESTROY_COOLDOWN_MS,
    range: SHAMAN_POWER_RANGE,
    validate(sim, caster, request) {
      return rejectBlock(sim, caster, request.c, request.r, this.range)
    },
    execute(sim, caster, request) {
      armDestroyBlock(sim, request.c ?? -1, request.r ?? -1, caster.id)
    },
  },
  restore: {
    id: 'restore',
    name: 'Criar bloco',
    summary: 'Coloca um tijolo num vão vazio, se não houver ninguém.',
    manaCost: RESTORE_BLOCK_COST,
    cooldownMs: SHAMAN_RESTORE_COOLDOWN_MS,
    range: SHAMAN_POWER_RANGE,
    validate(sim, caster, request) {
      return rejectRestore(sim, sim.players, caster, request.c, request.r, this.range)
    },
    execute(sim, _caster, request) {
      restoreCell(sim, request.c ?? -1, request.r ?? -1)
    },
  },
  fortify: {
    id: 'fortify',
    name: 'Fortificar bloco',
    summary: 'O tijolo vira estrutura e não pode ser cavado.',
    manaCost: FORTIFY_BLOCK_COST,
    cooldownMs: SHAMAN_FORTIFY_COOLDOWN_MS,
    range: SHAMAN_POWER_RANGE,
    validate(sim, caster, request) {
      return rejectFortify(sim, caster, request.c, request.r, this.range)
    },
    execute(sim, _caster, request) {
      fortifyCell(sim, request.c ?? -1, request.r ?? -1)
    },
  },
  ladder: {
    id: 'ladder',
    name: 'Escada',
    summary: 'Coloca um degrau num vão vazio com apoio.',
    manaCost: PLACE_LADDER_COST,
    cooldownMs: SHAMAN_LADDER_COOLDOWN_MS,
    range: SHAMAN_POWER_RANGE,
    validate(sim, caster, request) {
      return rejectLadder(sim, caster, request.c, request.r, this.range)
    },
    execute(sim, _caster, request) {
      placeLadder(sim, request.c ?? -1, request.r ?? -1)
    },
  },
  bar: {
    id: 'bar',
    name: 'Linha',
    summary: 'Estende uma linha para atravessar pendurado.',
    manaCost: PLACE_BAR_COST,
    cooldownMs: SHAMAN_BAR_COOLDOWN_MS,
    range: SHAMAN_POWER_RANGE,
    validate(sim, caster, request) {
      return rejectBar(sim, caster, request.c, request.r, this.range)
    },
    execute(sim, _caster, request) {
      placeBar(sim, request.c ?? -1, request.r ?? -1)
    },
  },
}

export const POWER_DEFS: PowerDef[] = Object.values(POWERS).map((power) => ({
  id: power.id,
  name: power.name,
  summary: power.summary,
  manaCost: power.manaCost,
  cooldownMs: power.cooldownMs,
}))

export function chooseShaman(ids: string[], preferred: string | null, random: () => number = Math.random): string {
  if (preferred && ids.includes(preferred)) return preferred
  const index = Math.min(ids.length - 1, Math.floor(random() * ids.length))
  return ids[Math.max(0, index)]
}

export function assignRoles(sim: SimState, shamanId: string): void {
  let shamans = 0
  for (const player of sim.players) {
    const shaman = player.id === shamanId
    player.role = shaman ? 'shaman' : 'player'
    player.mana = shaman ? SHAMAN_MAX_MANA : 0
    player.powerCooldownMs = { block: 0, restore: 0, fortify: 0, ladder: 0, bar: 0 }
    player.lastRelevant = null
    if (shaman) shamans += 1
  }
  sim.shamanId = shamanId
  sim.nextShamanId = null
  if (shamans !== 1) throw new Error('A rodada precisa de exatamente um Shaman')
}

/** Checagem e gasto acontecem juntos, no mesmo turno do servidor. */
export function castPower(sim: SimState, casterId: string, request: PowerRequest): string | null {
  const caster = sim.players.find((player) => player.id === casterId)
  if (!caster || caster.role !== 'shaman') return 'Só o Shaman pode usar poderes'
  if (!caster.alive) return 'Você foi eliminado'
  if (sim.phase !== 'playing') return 'A rodada não está em andamento'
  const power = POWERS[request.power]
  if (!power) return 'Poder desconhecido'
  if (caster.mana < power.manaCost) return 'Mana insuficiente'
  if ((caster.powerCooldownMs[power.id] ?? 0) > 0) return 'Poder em recarga'
  const reject = power.validate(sim, caster, request)
  if (reject) return reject
  caster.mana -= power.manaCost
  caster.powerCooldownMs[power.id] = power.cooldownMs
  power.execute(sim, caster, request)
  sim.events.push({ type: 'power', playerId: caster.id, power: power.id })
  return null
}

/** A mesma regra do servidor, para o contorno do mouse. null = alvo válido. */
export function previewPower(ctx: AimContext): string | null {
  const power = POWERS[ctx.power]
  if (!power) return 'Poder desconhecido'
  if (ctx.caster.role !== 'shaman' || !ctx.caster.alive) return 'Só o Shaman pode usar poderes'
  if (ctx.phase !== 'playing') return 'A rodada não está em andamento'
  if (ctx.caster.mana < power.manaCost) return 'Mana insuficiente'
  const cooldown = ctx.caster.powerCooldownMs[power.id as keyof AimContext['caster']['powerCooldownMs']] ?? 0
  if (cooldown > 0) return 'Poder em recarga'
  const view: Pick<SimState, 'map' | 'holes' | 'marks'> = {
    map: { id: '', name: '', authorName: '', skin: '', width: 0, height: 0, tiles: ctx.tiles, spawns: [], shamanSpawn: null, exit: ctx.exit },
    holes: ctx.holes.map((hole) => ({ ...hole, destroyedAtMs: 0, phase: 'open' as const })),
    marks: ctx.marks.map((mark) => ({ ...mark, sourceId: '', blockId: '', warnUntilMs: 0 })),
  }
  const caster = { x: ctx.caster.x, y: ctx.caster.y } as SimPlayer
  if (power.id === 'restore') return rejectRestore(view as SimState, ctx.bodies, caster, ctx.c, ctx.r, power.range)
  if (power.id === 'fortify') return rejectFortify(view as SimState, caster, ctx.c, ctx.r, power.range)
  if (power.id === 'ladder') return rejectLadder(view as SimState, caster, ctx.c, ctx.r, power.range)
  if (power.id === 'bar') return rejectBar(view as SimState, caster, ctx.c, ctx.r, power.range)
  return rejectBlock(view as SimState, caster, ctx.c, ctx.r, power.range)
}

function rejectBlock(sim: Pick<SimState, 'map' | 'marks' | 'holes'>, caster: { x: number; y: number }, c?: number, r?: number, range = SHAMAN_POWER_RANGE): string | null {
  if (c === undefined || r === undefined) return 'Alvo fora do alcance'
  if (blockDistance(caster, c, r) > range) return 'Alvo fora do alcance'
  if (isExit(sim, c, r)) return 'A porta não pode ser alterada'
  if (sim.map.tiles[r]?.[c] !== Tile.Placa) return 'Esse bloco não pode ser removido'
  const taken = sim.marks.some((mark) => mark.c === c && mark.r === r) || sim.holes.some((hole) => hole.c === c && hole.r === r)
  if (taken) return 'Esse bloco já está marcado'
  return null
}

function rejectRestore(
  sim: Pick<SimState, 'map'>,
  bodies: { x: number; y: number; alive: boolean }[],
  caster: { x: number; y: number },
  c?: number,
  r?: number,
  range = SHAMAN_POWER_RANGE,
): string | null {
  if (c === undefined || r === undefined) return 'Alvo fora do alcance'
  if (blockDistance(caster, c, r) > range) return 'Alvo fora do alcance'
  if (isExit(sim, c, r)) return 'A porta não pode ser alterada'
  if (sim.map.tiles[r]?.[c] !== Tile.Empty) return 'Não há espaço aqui'
  if (bodies.some((body) => body.alive && bodyInCell(body, c, r))) return 'Tem alguém nesse vão'
  return null
}

function bodyInCell(body: { x: number; y: number }, c: number, r: number): boolean {
  const person = hitRect(body)
  const tile = { x: c * TILE_SIZE, y: r * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE }
  return person.x < tile.x + tile.w && person.x + person.w > tile.x && person.y < tile.y + tile.h && person.y + person.h > tile.y
}

function rejectFortify(sim: Pick<SimState, 'map' | 'marks'>, caster: { x: number; y: number }, c?: number, r?: number, range = SHAMAN_POWER_RANGE): string | null {
  if (c === undefined || r === undefined) return 'Alvo fora do alcance'
  if (blockDistance(caster, c, r) > range) return 'Alvo fora do alcance'
  if (isExit(sim, c, r)) return 'A porta não pode ser alterada'
  if (sim.map.tiles[r]?.[c] !== Tile.Placa) return 'Esse bloco já é estrutura'
  if (sim.marks.some((mark) => mark.c === c && mark.r === r)) return 'Esse bloco já está marcado'
  return null
}

function rejectBar(sim: Pick<SimState, 'map'>, caster: { x: number; y: number }, c?: number, r?: number, range = SHAMAN_POWER_RANGE): string | null {
  if (c === undefined || r === undefined) return 'Alvo fora do alcance'
  if (blockDistance(caster, c, r) > range) return 'Alvo fora do alcance'
  if (isExit(sim, c, r)) return 'A porta não pode ser alterada'
  if (sim.map.tiles[r]?.[c] !== Tile.Empty) return 'Não há espaço aqui'
  return null
}

function rejectLadder(sim: Pick<SimState, 'map'>, caster: { x: number; y: number }, c?: number, r?: number, range = SHAMAN_POWER_RANGE): string | null {
  if (c === undefined || r === undefined) return 'Alvo fora do alcance'
  if (blockDistance(caster, c, r) > range) return 'Alvo fora do alcance'
  if (isExit(sim, c, r)) return 'A porta não pode ser alterada'
  if (sim.map.tiles[r]?.[c] !== Tile.Empty) return 'Não há espaço aqui'
  const below = sim.map.tiles[r + 1]?.[c]
  if (below !== Tile.Ladder && below !== Tile.Placa && below !== Tile.Trava) return 'A escada não tem apoio'
  return null
}

function isExit(sim: Pick<SimState, 'map'>, c: number, r: number): boolean {
  return sim.map.exit?.c === c && sim.map.exit?.r === r
}

function blockDistance(player: { x: number; y: number }, c: number, r: number): number {
  const dx = player.x + PLAYER_W / 2 - (c * TILE_SIZE + TILE_SIZE / 2)
  const dy = player.y + PLAYER_H / 2 - (r * TILE_SIZE + TILE_SIZE / 2)
  return Math.hypot(dx, dy)
}
