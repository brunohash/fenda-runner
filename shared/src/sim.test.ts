import assert from 'node:assert/strict'
import { BLOCK_RESPAWN_ENABLED, BLOCK_RESPAWN_TIME_MS, PLAYER_H, PLAYER_W, TILE_SIZE, defaultConfig } from './config.ts'
import { LEVELS, canReachExit } from './levels.ts'
import { Tile, buildDrillRange } from './map.ts'
import { parseClientMessage } from './protocol.ts'
import {
  createPlayer,
  createSim,
  evaluateEnd,
  inspectDig,
  killPlayer,
  standOn,
  stepSim,
  type SimPlayer,
  type SimState,
} from './sim.ts'

let failed = 0

function test(name: string, fn: () => void): void {
  try {
    fn()
    console.log(`ok  ${name}`)
  } catch (error) {
    failed += 1
    console.error(`FAIL ${name}`)
    console.error(error)
  }
}

function boot(overrides: Partial<ReturnType<typeof defaultConfig>> = {}): SimState {
  const sim = createSim(buildDrillRange(), { ...defaultConfig(), ...overrides })
  sim.phase = 'playing'
  sim.countdownMs = 0
  return sim
}

function put(sim: SimState, id: string, col: number, floorRow: number, facing: 1 | -1 = 1): SimPlayer {
  const pose = standOn(col, floorRow)
  const player = createPlayer({ id, name: id, color: '#fff', variant: 0, ...pose, facing })
  sim.players.push(player)
  return player
}

function frames(sim: SimState, count: number): void {
  for (let i = 0; i < count; i++) stepSim(sim, 1000 / 60)
}

test('a intenção DIG não carrega célula', () => {
  const parsed = parseClientMessage({ action: 'DIG', c: 4, r: 9, x: 10, y: 12 })
  assert.deepEqual(parsed, { action: 'DIG' })
  assert.deepEqual(Object.keys(parsed ?? {}), ['action'])
})

test('o buraco não se reconstrói sozinho', () => {
  assert.equal(BLOCK_RESPAWN_ENABLED, false)
  assert.equal(BLOCK_RESPAWN_TIME_MS, 5000)
  assert.equal(defaultConfig().blockRespawnEnabled, false)
})

test('a claraboia sobe até a porta por duas rotas', () => {
  assert.equal(LEVELS.length, 1)
  const map = LEVELS[0]
  assert.equal(map.name, 'Claraboia')
  assert.ok(map.exit)
  assert.ok(map.spawns.every((spawn) => map.exit && spawn.r > map.exit.r))
  assert.equal(map.tiles[map.exit.r][map.exit.c], Tile.Empty)
  assert.equal(map.tiles[map.exit.r + 1][map.exit.c], Tile.Trava)
  assert.equal(canReachExit(map, (c) => c >= 16), true)
  assert.equal(canReachExit(map, (c) => c <= 12), true)
  assert.equal(map.tiles[11][13], Tile.Placa)
  const placas = map.tiles.flat().filter((tile) => tile === Tile.Placa).length
  const ladders = map.tiles.flat().filter((tile) => tile === Tile.Ladder).length
  assert.ok(placas >= 60, `tijolos ${placas}`)
  assert.ok(ladders >= 20, `escadas ${ladders}`)
})

test('parado no painel não cai', () => {
  const sim = boot()
  const player = put(sim, 'a', 5, 2)
  const y = player.y
  frames(sim, 60)
  assert.ok(player.alive)
  assert.ok(Math.abs(player.y - y) < 0.2, `y mudou para ${player.y}`)
  assert.equal(player.onGround, true)
})

test('anda pelo andar sem cair no poço', () => {
  const sim = boot()
  const player = put(sim, 'a', 5, 2, 1)
  const y = player.y
  player.controls.right = true
  frames(sim, 30)
  assert.ok(player.x > standOn(5, 2).x + 80, `andou pouco: ${player.x}`)
  assert.ok(Math.abs(player.y - y) < 6, `caiu enquanto andava: ${player.y}`)
  frames(sim, 40)
  assert.ok(player.y > y + 20, `não caiu ao chegar na escada: ${player.y}`)
  assert.equal(player.alive, true)
})

test('cavando à direita abre a placa da frente, não a de baixo', () => {
  const sim = boot()
  const player = put(sim, 'a', 5, 2, 1)
  const look = inspectDig(player, sim.map, 0, 'playing')
  assert.equal(look.status, 'ready')
  assert.equal(look.c, 6)
  assert.equal(look.r, 2)
  player.digQueued = true
  stepSim(sim, 1000 / 60)
  assert.equal(sim.map.tiles[2][6], Tile.Empty)
  assert.equal(sim.map.tiles[2][5], Tile.Placa)
  assert.equal(sim.events.some((e) => e.type === 'dug'), true)
})

test('cavando à esquerda espelha o alvo', () => {
  const sim = boot()
  const player = put(sim, 'a', 5, 2, -1)
  player.digQueued = true
  stepSim(sim, 1000 / 60)
  assert.equal(sim.map.tiles[2][4], Tile.Empty)
  assert.equal(sim.map.tiles[2][5], Tile.Placa)
})

test('não cava no ar, desalinhado, em trava, nem durante a contagem', () => {
  const sim = boot()
  const player = put(sim, 'a', 5, 2, 1)
  player.y -= 8
  player.digQueued = true
  stepSim(sim, 1000 / 60)
  assert.equal(sim.map.tiles[2][6], Tile.Placa)
  assert.equal(sim.events.some((e) => e.type === 'rejected' && e.reason === 'airborne'), true)

  const crooked = boot()
  const body = put(crooked, 'b', 5, 2, 1)
  body.x = 5 * TILE_SIZE + TILE_SIZE - PLAYER_W / 2 - 2
  body.digQueued = true
  stepSim(crooked, 1000 / 60)
  assert.equal(crooked.events.some((event) => event.type === 'dug'), false)

  const anchor = boot()
  const onAnchor = put(anchor, 'c', 10, 2, -1)
  assert.equal(anchor.map.tiles[2][9], Tile.Trava)
  onAnchor.digQueued = true
  stepSim(anchor, 1000 / 60)
  assert.equal(anchor.map.tiles[2][9], Tile.Trava)

  const countdown = boot()
  countdown.phase = 'countdown'
  countdown.countdownMs = 1000
  const waiting = put(countdown, 'd', 5, 2, 1)
  waiting.digQueued = true
  stepSim(countdown, 1000 / 60)
  assert.equal(countdown.map.tiles[2][6], Tile.Placa)
  assert.equal(waiting.digQueued, false)
})

test('cooldown impede o segundo corte imediato', () => {
  const sim = boot()
  const player = put(sim, 'a', 5, 2, 1)
  player.digQueued = true
  stepSim(sim, 1000 / 60)
  sim.map.tiles[2][6] = Tile.Placa
  player.digQueued = true
  stepSim(sim, 1000 / 60)
  assert.equal(sim.map.tiles[2][6], Tile.Placa)
  assert.ok(player.digCooldownMs > 0)
})

test('quem está na placa cortada cai e pousa no andar de baixo', () => {
  const sim = boot()
  const digger = put(sim, 'a', 5, 2, 1)
  const victim = put(sim, 'b', 6, 2, -1)
  const startY = victim.y
  digger.digQueued = true
  frames(sim, 50)
  assert.ok(victim.y > startY + 40, `não caiu: ${victim.y}`)
  assert.equal(victim.alive, true)
  assert.equal(victim.onGround, true)
  const feet = victim.y + PLAYER_H
  const floorRow = Math.round(feet / TILE_SIZE)
  assert.equal(floorRow, 4)
})

test('cair além do último andar elimina', () => {
  const sim = boot()
  const digger = put(sim, 'a', 5, 8, 1)
  const victim = put(sim, 'b', 6, 8, 1)
  digger.digQueued = true
  let steps = 0
  while (victim.alive && steps < 180) {
    stepSim(sim, 1000 / 60)
    steps += 1
  }
  assert.equal(victim.alive, false)
  assert.ok(steps > 15, `morreu cedo demais (${steps} frames)`)
  assert.equal(sim.events.some((e) => e.type === 'death' && e.cause === 'void'), true)
  assert.equal(sim.phase, 'finished')
  assert.deepEqual(sim.result, { tie: false, winnerIds: ['a'] })
})

test('escada não segura: cai, sobe ou desce', () => {
  const sim = boot()
  const pose = standOn(8, 4)
  const player = createPlayer({
    id: 'a',
    name: 'a',
    color: '#fff',
    variant: 0,
    x: pose.x + 8,
    y: pose.y - 20,
    facing: 1,
  })
  sim.players.push(player)
  const start = player.y
  frames(sim, 20)
  assert.ok(player.y > start + 20, `não caiu na escada: ${player.y}`)
  assert.equal(player.alive, true)

  player.y = start
  player.vy = 0
  player.controls.up = true
  frames(sim, 20)
  assert.ok(player.y < start - 15, `não subiu: ${player.y}`)

  const climbed = player.y
  player.controls.up = false
  player.controls.down = true
  frames(sim, 20)
  assert.ok(player.y > climbed + 20, `não desceu: ${player.y}`)
})

test('toque em S no chão cava e não derruba no mesmo frame', () => {
  const sim = boot()
  const player = put(sim,  'a', 5, 2, 1)
  const y = player.y
  player.controls.down = true
  player.digQueued = true
  stepSim(sim, 1000 / 60)
  assert.equal(sim.map.tiles[2][6], Tile.Empty)
  assert.ok(Math.abs(player.y - y) < 1)
})

test('o buraco da escavação continua aberto', () => {
  const sim = boot()
  const player = put(sim, 'a', 5, 2, 1)
  player.digQueued = true
  frames(sim, 360)
  assert.equal(sim.map.tiles[2][6], Tile.Empty)
  assert.equal(sim.holes.length, 1)
})

test('com respawn o painel volta e sela quem estiver dentro', () => {
  const sim = boot({ blockRespawnEnabled: true, blockRespawnTimeMs: 400, blockReformLeadMs: 80 })
  const player = put(sim, 'a', 5, 2, 1)
  player.digQueued = true
  stepSim(sim, 1000 / 60)
  const hole = sim.holes[0]
  assert.ok(hole)
  hole.destroyedAtMs = sim.elapsedMs - sim.config.blockRespawnTimeMs
  player.x = hole.c * TILE_SIZE + (TILE_SIZE - PLAYER_W) / 2
  player.y = hole.r * TILE_SIZE + 6
  player.vy = 0
  stepSim(sim, 1000 / 60)
  assert.equal(sim.map.tiles[hole.r][hole.c], Tile.Placa)
  assert.equal(player.alive, false)
  assert.equal(sim.events.some((e) => e.type === 'death' && e.cause === 'buried'), true)
})

test('tempo esgotado com dois vivos é empate; com um, vitória', () => {
  const tied = boot()
  put(tied, 'a', 5, 2)
  put(tied, 'b', 10, 2)
  tied.timeLeftMs = 10
  stepSim(tied, 1000 / 60)
  assert.equal(tied.phase, 'finished')
  assert.equal(tied.result?.tie, true)
  assert.deepEqual(tied.result?.winnerIds.sort(), ['a', 'b'])

  const solo = boot()
  put(solo, 'a', 5, 2)
  solo.timeLeftMs = 10
  stepSim(solo, 1000 / 60)
  assert.deepEqual(solo.result, { tie: false, winnerIds: ['a'] })
})

test('desconexão do penúltimo encerra a partida', () => {
  const sim = boot()
  put(sim, 'a', 5, 2)
  put(sim, 'b', 10, 2)
  killPlayer(sim, 'b', 'disconnect')
  evaluateEnd(sim)
  assert.deepEqual(sim.result, { tie: false, winnerIds: ['a'] })
})

test('escada cai quando o bloco de apoio some', () => {
  const width = 8
  const height = 8
  const tiles = Array.from({ length: height }, () => Array<number>(width).fill(Tile.Empty))
  for (let r = 0; r < height; r++) {
    tiles[r][0] = Tile.Trava
    tiles[r][width - 1] = Tile.Trava
  }
  tiles[5][2] = Tile.Placa
  tiles[5][3] = Tile.Placa
  tiles[4][3] = Tile.Ladder
  tiles[3][3] = Tile.Ladder
  tiles[2][3] = Tile.Ladder
  tiles[5][5] = Tile.Trava
  tiles[4][5] = Tile.Ladder
  tiles[3][5] = Tile.Ladder
  const sim = createSim({ id: 't', name: 't', authorName: '', skin: 'copper', width, height, tiles, spawns: [], shamanSpawn: null, exit: null }, defaultConfig())
  sim.phase = 'playing'
  sim.countdownMs = 0
  const digger = createPlayer({ id: 'a', name: 'a', color: '#fff', variant: 0, ...standOn(2, 5), facing: 1 })
  const climber = createPlayer({
    id: 'b',
    name: 'b',
    color: '#fff',
    variant: 1,
    x: 3 * TILE_SIZE + (TILE_SIZE - PLAYER_W) / 2,
    y: 2 * TILE_SIZE,
    facing: 1,
  })
  sim.players.push(digger, climber)
  const y = climber.y
  digger.digQueued = true
  stepSim(sim, 1000 / 60)
  assert.equal(sim.map.tiles[5][3], Tile.Empty)
  assert.equal(sim.map.tiles[4][3], Tile.Empty)
  assert.equal(sim.map.tiles[3][3], Tile.Empty)
  assert.equal(sim.map.tiles[2][3], Tile.Empty)
  assert.equal(sim.map.tiles[4][5], Tile.Ladder)
  frames(sim, 20)
  assert.ok(climber.y > y + 20, `quem estava na escada não caiu: ${climber.y}`)
})

test('a linha segura, atravessa e solta', () => {
  const width = 12
  const height = 14
  const tiles = Array.from({ length: height }, () => Array<number>(width).fill(Tile.Empty))
  for (let r = 0; r < height; r++) {
    tiles[r][0] = Tile.Trava
    tiles[r][width - 1] = Tile.Trava
  }
  for (let c = 0; c < width; c++) tiles[0][c] = Tile.Trava
  for (let c = 1; c < width - 1; c++) tiles[11][c] = Tile.Placa
  for (let c = 2; c <= 6; c++) tiles[4][c] = Tile.Bar
  const sim = createSim({ id: 'y', name: 'y', authorName: '', skin: 'moss', width, height, tiles, spawns: [], shamanSpawn: null, exit: null }, defaultConfig())
  sim.phase = 'playing'
  sim.countdownMs = 0
  const rider = createPlayer({
    id: 'a',
    name: 'a',
    color: '#fff',
    variant: 0,
    x: standOn(3, 11).x,
    y: 4 * TILE_SIZE - 70,
    facing: 1,
  })
  sim.players.push(rider)
  for (let i = 0; i < 180 && !(rider.onBar && Math.abs(rider.y - 4 * TILE_SIZE) < 1); i++) stepSim(sim, 1000 / 60)
  assert.equal(rider.onBar, true)
  assert.ok(Math.abs(rider.y - 4 * TILE_SIZE) < 1, `não grudou na linha: ${rider.y}`)
  const walker = createPlayer({
    id: 'b',
    name: 'b',
    color: '#fff',
    variant: 1,
    x: standOn(4, 11).x,
    y: 4 * TILE_SIZE,
    facing: 1,
  })
  sim.players.push(walker)
  frames(sim, 2)
  assert.equal(walker.onBar, true)
  walker.controls.right = true
  for (let i = 0; i < 160 && walker.onBar; i++) stepSim(sim, 1000 / 60)
  assert.equal(walker.onBar, false)
  const dropped = walker.y
  frames(sim, 10)
  assert.ok(walker.y > dropped + 8, `não caiu no fim da linha: ${walker.y}`)
  walker.controls.right = false
  const hung = rider.x
  rider.controls.right = true
  frames(sim, 20)
  assert.ok(rider.x > hung + 40, `não atravessou: ${rider.x}`)
  assert.equal(rider.onBar, true)
  rider.controls.right = false
  rider.controls.down = true
  frames(sim, 8)
  rider.controls.down = false
  frames(sim, 12)
  assert.equal(rider.onBar, false)
  assert.ok(rider.y > 4 * TILE_SIZE + 20, `não soltou a linha: ${rider.y}`)
  assert.equal(rider.alive, true)
})

if (failed > 0) {
  console.error(`\n${failed} teste(s) falharam`)
  process.exit(1)
}
console.log('\ntudo certo')
