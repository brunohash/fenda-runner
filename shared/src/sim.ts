import {
  CLIMB_SPEED,
  DIG_COOLDOWN_MS,
  DOOR_RUSH_MS,
  GRAVITY,
  HIT_W,
  MAX_FALL,
  MOVE_SPEED,
  PLAYER_H,
  PLAYER_W,
  KILL_CREDIT_WINDOW_MS,
  SHAMAN_BLOCK_WARNING_MS,
  SHAMAN_MANA_REGEN,
  SHAMAN_MAX_MANA,
  STEP_UP_PX,
  TILE_SIZE,
  defaultConfig,
  type SimConfig,
} from './config.ts'
import { Tile, isBar, isLadder, isSolid, worldKillY } from './map.ts'
import type {
  Controls,
  DeathCause,
  DigReason,
  Facing,
  KillCredit,
  GameMap,
  Grid,
  MatchResult,
  Phase,
  PlayerSnap,
  Rect,
  Role,
  SimEvent,
  TileChange,
} from './types.ts'
import { idleControls } from './types.ts'

export interface SimPlayer {
  id: string
  name: string
  color: string
  variant: number
  characterId: string
  gear: string[]
  role: Role
  mana: number
  x: number
  y: number
  vx: number
  vy: number
  facing: Facing
  alive: boolean
  escaped: boolean
  onGround: boolean
  onLadder: boolean
  onBar: boolean
  releasingBar: boolean
  doorHeld: boolean
  digCooldownMs: number
  powerCooldownMs: Record<string, number>
  lastRelevant: { sourcePlayerId: string; actionType: KillCredit; blockId: string; atMs: number } | null
  controls: Controls
  digQueued: boolean
}

export interface Hole {
  c: number
  r: number
  destroyedAtMs: number
  phase: 'open' | 'reforming'
  /** Quando presente, este buraco volta neste prazo, independente da escavação. */
  respawnMs?: number
}

export interface ShamanMark {
  c: number
  r: number
  sourceId: string
  blockId: string
  warnUntilMs: number
}

export interface SimState {
  map: GameMap
  config: SimConfig
  players: SimPlayer[]
  holes: Hole[]
  marks: ShamanMark[]
  phase: Phase
  countdownMs: number
  timeLeftMs: number
  elapsedMs: number
  shamanId: string
  nextShamanId: string | null
  result: MatchResult | null
  events: SimEvent[]
  tileChanges: TileChange[]
  tick: number
}

export interface DigInspect {
  status: 'ready' | DigReason
  c?: number
  r?: number
}

interface CellHit {
  c: number
  r: number
  x: number
  y: number
  w: number
  h: number
  tile: number
}

export function createSim(map: GameMap, config: SimConfig = defaultConfig()): SimState {
  return {
    map,
    config,
    players: [],
    holes: [],
    marks: [],
    phase: 'countdown',
    countdownMs: config.countdownMs,
    timeLeftMs: config.matchDurationMs,
    elapsedMs: 0,
    shamanId: '',
    nextShamanId: null,
    result: null,
    events: [],
    tileChanges: [],
    tick: 0,
  }
}

export function createPlayer(opts: {
  id: string
  name: string
  color: string
  variant: number
  characterId?: string
  gear?: string[]
  x: number
  y: number
  facing?: Facing
}): SimPlayer {
  return {
    id: opts.id,
    name: opts.name,
    color: opts.color,
    variant: opts.variant,
    characterId: opts.characterId ?? 'lume',
    gear: opts.gear ? [...opts.gear] : [],
    role: 'player',
    mana: 0,
    x: opts.x,
    y: opts.y,
    vx: 0,
    vy: 0,
    facing: opts.facing ?? 1,
    alive: true,
    escaped: false,
    onGround: false,
    onLadder: false,
    onBar: false,
    releasingBar: false,
    doorHeld: false,
    digCooldownMs: 0,
    powerCooldownMs: { block: 0, restore: 0, fortify: 0, ladder: 0, bar: 0 },
    lastRelevant: null,
    controls: idleControls(),
    digQueued: false,
  }
}

export function standOn(col: number, floorRow: number): { x: number; y: number } {
  return {
    x: col * TILE_SIZE + (TILE_SIZE - PLAYER_W) / 2,
    y: floorRow * TILE_SIZE - PLAYER_H - 0.001,
  }
}

export function spawnPose(col: number, spawnRow: number): { x: number; y: number } {
  return standOn(col, spawnRow + 1)
}

/** Prefere olhar para uma placa cortável, não para escada ou parede. */
export function facingTowardPlate(map: Grid, col: number, floorRow: number): Facing {
  const right = map.tiles[floorRow]?.[col + 1] === Tile.Placa
  const left = map.tiles[floorRow]?.[col - 1] === Tile.Placa
  if (right && !left) return 1
  if (left && !right) return -1
  return right ? 1 : -1
}

export function hitRect(p: { x: number; y: number }): Rect {
  const inset = (PLAYER_W - HIT_W) / 2
  return { x: p.x + inset, y: p.y, w: HIT_W, h: PLAYER_H }
}

function cells(rect: Rect, map: Grid, pred: (tile: number) => boolean): CellHit[] {
  const out: CellHit[] = []
  const c0 = Math.floor(rect.x / TILE_SIZE)
  const c1 = Math.floor((rect.x + rect.w - 1e-3) / TILE_SIZE)
  const r0 = Math.floor(rect.y / TILE_SIZE)
  const r1 = Math.floor((rect.y + rect.h - 1e-3) / TILE_SIZE)
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (c < 0 || r < 0 || c >= map.width || r >= map.height) continue
      const tile = map.tiles[r][c]
      if (!pred(tile)) continue
      out.push({
        c,
        r,
        x: c * TILE_SIZE,
        y: r * TILE_SIZE,
        w: TILE_SIZE,
        h: TILE_SIZE,
        tile,
      })
    }
  }
  return out
}

function supportSensor(p: { x: number; y: number }): Rect {
  const body = hitRect(p)
  return { x: body.x + 1, y: body.y + body.h + 0.2, w: Math.max(1, body.w - 2), h: 1.4 }
}

function isSupported(p: { x: number; y: number }, map: Grid): boolean {
  return cells(supportSensor(p), map, isSolid).length > 0
}

function overlapsLadder(p: { x: number; y: number }, map: Grid): boolean {
  return cells(hitRect(p), map, isLadder).length > 0
}

function handSensor(p: { x: number; y: number }): Rect {
  const body = hitRect(p)
  return { x: body.x, y: body.y, w: body.w, h: 8 }
}

function barAtHands(p: { x: number; y: number }, map: Grid): number | null {
  const hits = cells(handSensor(p), map, isBar)
  if (!hits.length) return null
  return Math.min(...hits.map((hit) => hit.r))
}

/**
 * Alvo da escavação, no espírito da referência de movimento:
 * o bloco à frente e um nível abaixo — nunca o piso em que se está.
 *
 * playerGridX / playerGridY são a coluna de apoio e a linha do corpo
 * (logo acima desse piso), não um arredondamento solto do centro.
 * Olhando à direita: (playerGridX + 1, playerGridY + 1)
 * Olhando à esquerda: (playerGridX - 1, playerGridY + 1)
 */
export function inspectDig(
  body: { x: number; y: number; facing: Facing; alive: boolean },
  map: Grid,
  digCooldownMs: number,
  phase: Phase,
): DigInspect {
  if (!body.alive || phase !== 'playing') return { status: 'unavailable' }

  const center = body.x + PLAYER_W / 2
  const feet = body.y + PLAYER_H
  const supports = cells(supportSensor(body), map, isSolid)
  if (!supports.length) return { status: 'airborne' }

  let support = supports[0]
  let best = Infinity
  for (const hit of supports) {
    const mid = hit.x + hit.w / 2
    const dist = Math.abs(mid - center)
    if (dist < best) {
      best = dist
      support = hit
    }
  }

  const tileCenter = support.x + TILE_SIZE / 2
  const playerGridX = support.c
  const playerGridY = support.r - 1
  const facing: Facing = body.facing === -1 ? -1 : 1
  const c = playerGridX + facing
  const r = playerGridY + 1

  if (Math.abs(center - tileCenter) > TILE_SIZE * 0.3) {
    return { status: 'unaligned', c, r }
  }
  const overlapLeft = Math.max(body.x, support.x)
  const overlapRight = Math.min(body.x + PLAYER_W, support.x + support.w)
  if (overlapRight - overlapLeft < PLAYER_W * 0.55) {
    return { status: 'unaligned', c, r }
  }
  if (r !== support.r || Math.abs(c - playerGridX) !== 1) return { status: 'reach' }
  if (c < 0 || r < 0 || c >= map.width || r >= map.height) return { status: 'out_of_bounds' }

  const tileCx = c * TILE_SIZE + TILE_SIZE / 2
  const tileTop = r * TILE_SIZE
  if (Math.abs(tileCx - center) > TILE_SIZE * 1.55) return { status: 'reach' }
  if (Math.abs(tileTop - feet) > TILE_SIZE * 0.65) return { status: 'reach' }

  if (map.tiles[r][c] !== Tile.Placa) return { status: 'not_destructible', c, r }
  if (digCooldownMs > 0) return { status: 'cooldown', c, r }
  return { status: 'ready', c, r }
}

export function killPlayer(sim: SimState, id: string, cause: DeathCause): void {
  const player = sim.players.find((p) => p.id === id)
  if (!player || !player.alive) return
  player.alive = false
  player.vx = 0
  player.vy = 0
  player.digQueued = false
  player.controls = idleControls()
  const credited = cause === 'disconnect' ? null : creditOf(sim, player)
  sim.events.push({
    type: 'death',
    playerId: id,
    cause,
    killerId: credited?.killerId ?? null,
    credit: credited?.credit ?? null,
  })
  if (player.role !== 'shaman' || (sim.phase !== 'playing' && sim.phase !== 'countdown')) return
  const killerId = credited?.killerId ?? null
  sim.nextShamanId = killerId
  sim.events.push({
    type: 'shaman-down',
    killerId,
    cause: cause === 'disconnect' ? 'disconnect' : killerId ? 'killed' : 'self',
  })
  sim.phase = 'finished'
  const alive = sim.players.filter((item) => item.alive)
  if (killerId) sim.result = { tie: false, winnerIds: [killerId] }
  else if (alive.length === 1) sim.result = { tie: false, winnerIds: [alive[0].id] }
  else sim.result = { tie: true, winnerIds: alive.map((item) => item.id) }
}

export function evaluateEnd(sim: SimState): void {
  if (sim.phase !== 'playing') return
  const alive = sim.players.filter((p) => p.alive)
  if (sim.map.exit) {
    if (alive.length === 0) finishByExit(sim)
    return
  }
  if (alive.length === 0) {
    sim.phase = 'finished'
    sim.result = { tie: true, winnerIds: [] }
    return
  }
  if (sim.players.length >= 2 && alive.length === 1) {
    sim.phase = 'finished'
    sim.result = { tie: false, winnerIds: [alive[0].id] }
  }
  sealShaman(sim)
}

function finishByExit(sim: SimState): void {
  const escaped = sim.players.filter((player) => player.escaped)
  sim.phase = 'finished'
  if (escaped.length === 1) sim.result = { tie: false, winnerIds: [escaped[0].id] }
  else sim.result = { tie: true, winnerIds: escaped.map((player) => player.id) }
  sealShaman(sim)
}

function finishTimeout(sim: SimState): void {
  const alive = sim.players.filter((p) => p.alive)
  const escaped = sim.players.filter((player) => player.escaped)
  sim.phase = 'finished'
  sim.timeLeftMs = 0
  if (sim.map.exit && escaped.length > 0) {
    sim.result = { tie: escaped.length !== 1, winnerIds: escaped.map((player) => player.id) }
  } else if (alive.length === 1) sim.result = { tie: false, winnerIds: [alive[0].id] }
  else sim.result = { tie: true, winnerIds: alive.map((p) => p.id) }
  sealShaman(sim)
}

function performDigs(sim: SimState): void {
  for (const player of sim.players) {
    if (!player.digQueued) continue
    player.digQueued = false
    const look = inspectDig(player, sim.map, player.digCooldownMs, sim.phase)
    if (look.status !== 'ready' || look.c === undefined || look.r === undefined) {
      if (look.status !== 'unavailable' && look.status !== 'ready') {
        sim.events.push({ type: 'rejected', playerId: player.id, reason: look.status })
      }
      continue
    }
    if (sim.map.tiles[look.r][look.c] !== Tile.Placa) {
      sim.events.push({ type: 'rejected', playerId: player.id, reason: 'not_destructible' })
      continue
    }
    destroyCell(sim, look.c, look.r, player.id, 'PLAYER_DIG')
    player.digCooldownMs = sim.config.digCooldownMs
    sim.events.push({ type: 'dug', playerId: player.id, c: look.c, r: look.r })
    sim.holes.push({
      c: look.c,
      r: look.r,
      destroyedAtMs: sim.elapsedMs,
      phase: 'open',
    })
  }
}

function creditOf(sim: SimState, victim: SimPlayer): { killerId: string; credit: KillCredit } | null {
  const mark = victim.lastRelevant
  if (!mark) return null
  if (sim.elapsedMs - mark.atMs > KILL_CREDIT_WINDOW_MS) return null
  if (mark.actionType !== 'PLAYER_DIG' && mark.actionType !== 'SHAMAN_POWER') return null
  if (!sim.players.some((player) => player.id === mark.sourcePlayerId)) return null
  return { killerId: mark.sourcePlayerId, credit: mark.actionType }
}

function sealShaman(sim: SimState): void {
  if (sim.phase !== 'finished') return
  const shaman = sim.players.find((player) => player.role === 'shaman' && (player.alive || player.escaped))
  if (shaman) sim.nextShamanId = shaman.id
}

function blame(sim: SimState, victim: SimPlayer, sourceId: string, actionType: KillCredit, blockId: string): void {
  if (!victim.alive || victim.id === sourceId) return
  victim.lastRelevant = { sourcePlayerId: sourceId, actionType, blockId, atMs: sim.elapsedMs }
}

function playersTouching(sim: SimState, c: number, r: number): SimPlayer[] {
  const tile: Rect = { x: c * TILE_SIZE, y: r * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE }
  return sim.players.filter(
    (player) => player.alive && (rectsOverlap(hitRect(player), tile) || rectsOverlap(supportSensor(player), tile)),
  )
}

/** Remove o bloco ou a escada e marca quem pode cair por causa disso. */
export function destroyCell(
  sim: SimState,
  c: number,
  r: number,
  sourceId: string,
  actionType: KillCredit,
): boolean {
  const tile = sim.map.tiles[r]?.[c]
  if (tile !== Tile.Placa && tile !== Tile.Ladder) return false
  const doomed = [{ c, r }]
  for (let row = r - 1; row >= 0 && sim.map.tiles[row][c] === Tile.Ladder; row--) doomed.push({ c, r: row })
  const victims = new Set<SimPlayer>()
  for (const cell of doomed) for (const player of playersTouching(sim, cell.c, cell.r)) victims.add(player)
  for (const cell of doomed) {
    sim.map.tiles[cell.r][cell.c] = Tile.Empty
    sim.tileChanges.push({ c: cell.c, r: cell.r, tile: Tile.Empty, phase: 'open' })
  }
  dropLadders(sim, c)
  const blockId = `${c},${r}`
  for (const victim of victims) blame(sim, victim, sourceId, actionType, blockId)
  return true
}

/** Coloca um tijolo num vão vazio. Se havia buraco, ele fecha. Não cobre quem está no vão. */
export function restoreCell(sim: SimState, c: number, r: number): boolean {
  if (sim.map.exit?.c === c && sim.map.exit?.r === r) return false
  if (sim.map.tiles[r]?.[c] !== Tile.Empty) return false
  const tile: Rect = { x: c * TILE_SIZE, y: r * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE }
  if (sim.players.some((player) => player.alive && rectsOverlap(hitRect(player), tile))) return false
  const index = sim.holes.findIndex((hole) => hole.c === c && hole.r === r)
  if (index >= 0) sim.holes.splice(index, 1)
  sim.map.tiles[r][c] = Tile.Placa
  sim.tileChanges.push({ c, r, tile: Tile.Placa, phase: 'solid' })
  sim.events.push({ type: 'restored', c, r })
  return true
}

/** Coloca um degrau num vão vazio, se houver bloco, estrutura ou escada embaixo. */
export function placeLadder(sim: SimState, c: number, r: number): boolean {
  if (sim.map.exit?.c === c && sim.map.exit?.r === r) return false
  if (sim.map.tiles[r]?.[c] !== Tile.Empty) return false
  const below = sim.map.tiles[r + 1]?.[c]
  if (below !== Tile.Ladder && below !== Tile.Placa && below !== Tile.Trava) return false
  const hole = sim.holes.findIndex((item) => item.c === c && item.r === r)
  if (hole >= 0) sim.holes.splice(hole, 1)
  sim.map.tiles[r][c] = Tile.Ladder
  sim.tileChanges.push({ c, r, tile: Tile.Ladder, phase: 'solid' })
  return true
}

/** Estende uma linha num vão vazio. A pessoa se pendura e atravessa. */
export function placeBar(sim: SimState, c: number, r: number): boolean {
  if (sim.map.exit?.c === c && sim.map.exit?.r === r) return false
  if (sim.map.tiles[r]?.[c] !== Tile.Empty) return false
  sim.map.tiles[r][c] = Tile.Bar
  sim.tileChanges.push({ c, r, tile: Tile.Bar, phase: 'solid' })
  return true
}

/** Transforma tijolo cortável em bloco estrutural até o fim da rodada. */
export function fortifyCell(sim: SimState, c: number, r: number): boolean {
  if (sim.map.tiles[r]?.[c] !== Tile.Placa) return false
  if (sim.marks.some((mark) => mark.c === c && mark.r === r)) return false
  sim.map.tiles[r][c] = Tile.Trava
  sim.tileChanges.push({ c, r, tile: Tile.Trava, phase: 'solid' })
  return true
}

/** O poder só marca. O bloco continua sólido até o aviso acabar. */
export function armDestroyBlock(sim: SimState, c: number, r: number, sourceId: string): void {
  sim.marks.push({
    c,
    r,
    sourceId,
    blockId: `${c},${r}`,
    warnUntilMs: sim.elapsedMs + SHAMAN_BLOCK_WARNING_MS,
  })
}

/** A escada só existe apoiada. Sem bloco ou outro degrau embaixo, o lance inteiro cai. */
function dropLadders(sim: SimState, c: number): void {
  for (let r = sim.map.height - 2; r >= 0; r--) {
    if (sim.map.tiles[r][c] !== Tile.Ladder) continue
    const below = sim.map.tiles[r + 1]?.[c]
    if (below === Tile.Ladder || below === Tile.Placa || below === Tile.Trava) continue
    sim.map.tiles[r][c] = Tile.Empty
    sim.tileChanges.push({ c, r, tile: Tile.Empty, phase: 'open' })
  }
}

function advanceMarks(sim: SimState): void {
  for (let i = sim.marks.length - 1; i >= 0; i--) {
    const mark = sim.marks[i]
    if (sim.elapsedMs < mark.warnUntilMs) continue
    sim.marks.splice(i, 1)
    if (sim.map.tiles[mark.r]?.[mark.c] !== Tile.Placa) continue
    if (!destroyCell(sim, mark.c, mark.r, mark.sourceId, 'SHAMAN_POWER')) continue
    sim.holes.push({
      c: mark.c,
      r: mark.r,
      destroyedAtMs: sim.elapsedMs,
      phase: 'open',
    })
  }
}

function updateHoles(sim: SimState): void {
  const lead = sim.config.blockReformLeadMs
  for (let i = sim.holes.length - 1; i >= 0; i--) {
    const hole = sim.holes[i]
    if (hole.respawnMs === undefined && !sim.config.blockRespawnEnabled) continue
    const total = hole.respawnMs ?? sim.config.blockRespawnTimeMs
    const age = sim.elapsedMs - hole.destroyedAtMs
    if (hole.phase === 'open' && age >= total - lead) {
      hole.phase = 'reforming'
      sim.tileChanges.push({ c: hole.c, r: hole.r, tile: Tile.Empty, phase: 'reforming' })
      sim.events.push({ type: 'reform', c: hole.c, r: hole.r })
    }
    if (age >= total) {
      sim.map.tiles[hole.r][hole.c] = Tile.Placa
      sim.tileChanges.push({ c: hole.c, r: hole.r, tile: Tile.Placa, phase: 'solid' })
      sim.events.push({ type: 'restored', c: hole.c, r: hole.r })
      const tile: Rect = { x: hole.c * TILE_SIZE, y: hole.r * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE }
      for (const player of sim.players) {
        if (!player.alive) continue
        if (rectsOverlap(hitRect(player), tile)) killPlayer(sim, player.id, 'buried')
      }
      sim.holes.splice(i, 1)
    }
  }
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

function resolveX(p: SimPlayer, map: Grid): void {
  let hits = cells(hitRect(p), map, isSolid)
  if (!hits.length) return

  const feet = p.y + PLAYER_H
  const top = Math.min(...hits.map((h) => h.y))
  const sink = feet - top
  if (sink > 0 && sink <= STEP_UP_PX) {
    const before = p.y
    p.y -= sink + 0.001
    if (!cells(hitRect(p), map, isSolid).length) return
    p.y = before
  }

  for (let i = 0; i < 4; i++) {
    hits = cells(hitRect(p), map, isSolid)
    if (!hits.length) return
    const hit = hits[0]
    const pushLeft = p.x + (PLAYER_W - HIT_W) / 2 + HIT_W - hit.x
    const pushRight = hit.x + hit.w - (p.x + (PLAYER_W - HIT_W) / 2)
    if (pushLeft < pushRight) p.x -= pushLeft
    else p.x += pushRight
  }
  p.vx = 0
}

function resolveY(p: SimPlayer, map: Grid): 'floor' | 'ceil' | null {
  const hits = cells(hitRect(p), map, isSolid)
  if (!hits.length) return null
  const body = hitRect(p)
  if (p.vy > 0) {
    const top = Math.min(...hits.map((h) => h.y))
    p.y -= body.y + body.h - top + 0.001
    p.vy = 0
    return 'floor'
  }
  if (p.vy < 0) {
    const bottom = Math.max(...hits.map((h) => h.y + h.h))
    p.y += bottom - body.y + 0.001
    p.vy = 0
    return 'ceil'
  }
  const hit = hits[0]
  const penDown = body.y + body.h - hit.y
  const penUp = hit.y + hit.h - body.y
  if (penDown < penUp) p.y -= penDown + 0.001
  else p.y += penUp + 0.001
  return null
}

function movePlayer(sim: SimState, player: SimPlayer, dt: number, suppressDown: boolean): void {
  if (!player.alive) return
  const input = player.controls
  if (input.left && !input.right) player.vx = -MOVE_SPEED
  else if (input.right && !input.left) player.vx = MOVE_SPEED
  else player.vx = 0

  player.x += player.vx * dt
  resolveX(player, sim.map)

  const ladder = overlapsLadder(player, sim.map)
  const ground = isSupported(player, sim.map)
  const descend = input.down && !suppressDown
  const barRow = barAtHands(player, sim.map)
  if (barRow === null) player.releasingBar = false
  else if (descend && !(ladder && input.up)) player.releasingBar = true
  const hang = barRow !== null && !player.releasingBar && !(ladder && (input.up || descend))

  if (ladder && input.up) player.vy = -CLIMB_SPEED
  else if (ladder && descend) player.vy = CLIMB_SPEED
  else if (hang && barRow !== null) {
    player.y = barRow * TILE_SIZE
    player.vy = 0
  } else if (ground) player.vy = 0
  else player.vy = Math.min(MAX_FALL, player.vy + GRAVITY * dt)

  player.y += player.vy * dt
  const landed = resolveY(player, sim.map)
  player.onGround = landed === 'floor' || isSupported(player, sim.map)
  player.onLadder = overlapsLadder(player, sim.map)
  player.onBar = barAtHands(player, sim.map) !== null && !player.releasingBar
  if (player.onGround && player.vy > 0) player.vy = 0

  reachExit(sim, player)
  if (!player.alive) return
  const center = player.x + PLAYER_W / 2
  if (player.y + PLAYER_H >= worldKillY(sim.map.height) || center < 0 || center > sim.map.width * TILE_SIZE) {
    killPlayer(sim, player.id, 'void')
  }
}

function othersRemain(sim: SimState, player: SimPlayer): boolean {
  return sim.players.some((other) => other.id !== player.id && other.alive && !other.escaped)
}

function reachExit(sim: SimState, player: SimPlayer): void {
  const door = sim.map.exit
  if (!door || sim.phase !== 'playing' || !player.alive || player.escaped) return
  const rect: Rect = { x: door.c * TILE_SIZE, y: door.r * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE }
  if (!rectsOverlap(hitRect(player), rect)) {
    player.doorHeld = false
    return
  }
  if (player.role === 'shaman' && othersRemain(sim, player)) {
    if (!player.doorHeld) {
      player.doorHeld = true
      sim.events.push({ type: 'door-held', playerId: player.id })
    }
    return
  }
  player.doorHeld = false
  const opening = !sim.players.some((other) => other.escaped)
  player.escaped = true
  player.alive = false
  player.vx = 0
  player.vy = 0
  player.digQueued = false
  player.controls = idleControls()
  sim.events.push({ type: 'escaped', playerId: player.id })
  if (opening && sim.timeLeftMs > DOOR_RUSH_MS) sim.timeLeftMs = DOOR_RUSH_MS
}

function stepOnce(sim: SimState, dtMs: number): void {
  const dt = dtMs / 1000
  sim.tick += 1

  if (sim.phase === 'countdown') {
    sim.countdownMs -= dtMs
    for (const player of sim.players) player.digQueued = false
    if (sim.countdownMs <= 0) {
      sim.countdownMs = 0
      sim.phase = 'playing'
    }
    return
  }

  if (sim.phase === 'finished') {
    for (const player of sim.players) {
      player.digQueued = false
      player.vx = 0
      player.vy = 0
    }
    return
  }

  sim.elapsedMs += dtMs
  sim.timeLeftMs -= dtMs
  if (sim.timeLeftMs <= 0) {
    finishTimeout(sim)
    return
  }

  for (const player of sim.players) {
    if (!player.alive) continue
    player.digCooldownMs = Math.max(0, player.digCooldownMs - dtMs)
    for (const key of Object.keys(player.powerCooldownMs)) {
      player.powerCooldownMs[key] = Math.max(0, player.powerCooldownMs[key] - dtMs)
    }
    if (player.role === 'shaman') player.mana = Math.min(SHAMAN_MAX_MANA, player.mana + SHAMAN_MANA_REGEN * dt)
    if (player.controls.left && !player.controls.right) player.facing = -1
    else if (player.controls.right && !player.controls.left) player.facing = 1
  }

  const suppress = new Map<string, boolean>()
  for (const player of sim.players) suppress.set(player.id, player.digQueued)
  performDigs(sim)
  advanceMarks(sim)
  updateHoles(sim)
  for (const player of sim.players) movePlayer(sim, player, dt, suppress.get(player.id) === true)
  evaluateEnd(sim)
}

export function stepSim(sim: SimState, dtMs: number): void {
  let left = Math.min(Math.max(dtMs, 0), 100)
  const slice = 1000 / 60
  let guard = 0
  while (left > 0 && guard < 6) {
    const step = Math.min(slice, left)
    stepOnce(sim, step)
    left -= step
    guard += 1
  }
}

export function snapshotPlayers(sim: SimState): PlayerSnap[] {
  return sim.players.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    variant: p.variant,
    characterId: p.characterId,
    gear: [...p.gear],
    role: p.role,
    mana: Math.round(p.mana),
    x: round2(p.x),
    y: round2(p.y),
    vx: round2(p.vx),
    vy: round2(p.vy),
    facing: p.facing,
    alive: p.alive,
    onGround: p.onGround,
    onLadder: p.onLadder,
    onBar: p.onBar,
    digCooldownMs: Math.round(p.digCooldownMs),
    escaped: p.escaped,
    powerCooldownMs: {
      block: Math.round(p.powerCooldownMs.block ?? 0),
      restore: Math.round(p.powerCooldownMs.restore ?? 0),
      fortify: Math.round(p.powerCooldownMs.fortify ?? 0),
      ladder: Math.round(p.powerCooldownMs.ladder ?? 0),
      bar: Math.round(p.powerCooldownMs.bar ?? 0),
    },
  }))
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export { DIG_COOLDOWN_MS }
