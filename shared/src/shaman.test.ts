import assert from 'node:assert/strict'
import {
  DESTROY_BLOCK_COST,
  SHAMAN_BLOCK_WARNING_MS,
  SHAMAN_MAX_MANA,
  defaultConfig,
} from './config.ts'
import { Tile } from './map.ts'
import { assignRoles, castPower, chooseShaman } from './shaman.ts'
import { createPlayer, createSim, killPlayer, standOn, stepSim, type SimState } from './sim.ts'

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

function pit(): SimState {
  const width = 8
  const height = 10
  const tiles = Array.from({ length: height }, () => Array<number>(width).fill(Tile.Empty))
  for (let r = 0; r < height; r++) {
    tiles[r][0] = Tile.Trava
    tiles[r][width - 1] = Tile.Trava
  }
  for (let c = 1; c < width - 1; c++) tiles[4][c] = Tile.Placa
  tiles[3][3] = Tile.Ladder
  tiles[2][3] = Tile.Ladder
  const sim = createSim({ id: 't', name: 't', skin: 'copper', width, height, tiles, spawns: [], exit: null }, defaultConfig())
  sim.phase = 'playing'
  sim.countdownMs = 0
  return sim
}

function wide(): SimState {
  const width = 20
  const height = 10
  const tiles = Array.from({ length: height }, () => Array<number>(width).fill(Tile.Empty))
  for (let r = 0; r < height; r++) {
    tiles[r][0] = Tile.Trava
    tiles[r][width - 1] = Tile.Trava
  }
  for (let c = 1; c < width - 1; c++) tiles[4][c] = Tile.Placa
  const sim = createSim({ id: 't', name: 't', skin: 'copper', width, height, tiles, spawns: [], exit: null }, defaultConfig())
  sim.phase = 'playing'
  sim.countdownMs = 0
  return sim
}

function wait(sim: SimState, total: number): void {
  let left = total
  while (left > 0) {
    const step = Math.min(100, left)
    stepSim(sim, step)
    left -= step
  }
}

function add(sim: SimState, id: string, col: number): ReturnType<typeof createPlayer> {
  const player = createPlayer({ id, name: id, color: '#fff', variant: 0, ...standOn(col, 4), facing: 1 })
  sim.players.push(player)
  return player
}

test('a primeira rodada escolhe um shaman entre os conectados', () => {
  assert.equal(chooseShaman(['a', 'b', 'c'], null, () => 0), 'a')
  assert.equal(chooseShaman(['a', 'b'], 'b', () => 0), 'b')
  assert.equal(chooseShaman(['lucas'], 'sumiu', () => 0), 'lucas')
})

test('há exatamente um shaman', () => {
  const sim = pit()
  add(sim, 'ana', 2)
  add(sim, 'bruno', 5)
  assignRoles(sim, 'bruno')
  assert.equal(sim.players.filter((player) => player.role === 'shaman').length, 1)
  assert.equal(sim.shamanId, 'bruno')
  assert.equal(sim.players.find((player) => player.id === 'bruno')?.mana, SHAMAN_MAX_MANA)
})

test('jogador normal não usa poder', () => {
  const sim = pit()
  add(sim, 'ana', 2)
  add(sim, 'bruno', 5)
  assignRoles(sim, 'bruno')
  assert.equal(castPower(sim, 'ana', { power: 'block', c: 4, r: 4 }), 'Só o Shaman pode usar poderes')
  assert.equal(sim.map.tiles[4][4], Tile.Placa)
})

test('o poder marca o bloco e só abre depois do aviso', () => {
  const sim = pit()
  const shaman = add(sim, 'bruno', 2)
  assignRoles(sim, 'bruno')
  assert.equal(castPower(sim, 'bruno', { power: 'block', c: 5, r: 4 }), null)
  assert.equal(sim.map.tiles[4][5], Tile.Placa)
  assert.equal(sim.marks.length, 1)
  assert.equal(shaman.mana, SHAMAN_MAX_MANA - DESTROY_BLOCK_COST)
  assert.ok(shaman.powerCooldownMs.block > 0)
  wait(sim, SHAMAN_BLOCK_WARNING_MS - 50)
  assert.equal(sim.map.tiles[4][5], Tile.Placa)
  wait(sim, 120)
  assert.equal(sim.map.tiles[4][5], Tile.Empty)
  wait(sim, 3000)
  assert.equal(sim.map.tiles[4][5], Tile.Empty)
  shaman.mana = SHAMAN_MAX_MANA
  shaman.powerCooldownMs.block = 0
  assert.equal(castPower(sim, 'bruno', { power: 'restore', c: 5, r: 4 }), null)
  assert.equal(sim.map.tiles[4][5], Tile.Placa)
})

test('mana regenera a 10 por segundo, e mana insuficiente bloqueia', () => {
  const sim = pit()
  const shaman = add(sim, 'bruno', 2)
  assignRoles(sim, 'bruno')
  shaman.mana = 10
  assert.equal(castPower(sim, 'bruno', { power: 'block', c: 5, r: 4 }), 'Mana insuficiente')
  assert.equal(sim.map.tiles[4][5], Tile.Placa)
  shaman.mana = 0
  for (let i = 0; i < 60; i++) stepSim(sim, 1000 / 60)
  assert.ok(shaman.mana > 9 && shaman.mana < 11, `mana ${shaman.mana}`)
})

test('cooldown do poder não trava a escavação, e o contrário também', () => {
  const sim = pit()
  const shaman = add(sim, 'bruno', 2)
  assignRoles(sim, 'bruno')
  shaman.digCooldownMs = 700
  assert.equal(castPower(sim, 'bruno', { power: 'block', c: 5, r: 4 }), null)
  shaman.digCooldownMs = 0
  shaman.digQueued = true
  stepSim(sim, 1000 / 60)
  assert.equal(sim.map.tiles[4][3], Tile.Empty)
  assert.equal(sim.map.tiles[4][2], Tile.Placa)
  shaman.mana = SHAMAN_MAX_MANA
  assert.equal(castPower(sim, 'bruno', { power: 'block', c: 6, r: 4 }), 'Poder em recarga')
})

test('a escavação do shaman não gasta mana', () => {
  const sim = pit()
  const shaman = add(sim, 'bruno', 2)
  assignRoles(sim, 'bruno')
  shaman.digQueued = true
  stepSim(sim, 1000 / 60)
  assert.equal(sim.map.tiles[4][3], Tile.Empty)
  assert.equal(shaman.mana, SHAMAN_MAX_MANA)
  assert.equal(shaman.powerCooldownMs.block, 0)
})

test('alvo fora do alcance é recusado', () => {
  const sim = wide()
  add(sim, 'bruno', 2)
  assignRoles(sim, 'bruno')
  assert.equal(castPower(sim, 'bruno', { power: 'block', c: 16, r: 4 }), 'Alvo fora do alcance')
  assert.equal(sim.map.tiles[4][16], Tile.Placa)
  assert.equal(sim.marks.length, 0)
})

test('o mesmo bloco não pode ser marcado duas vezes', () => {
  const sim = pit()
  const shaman = add(sim, 'bruno', 2)
  assignRoles(sim, 'bruno')
  assert.equal(castPower(sim, 'bruno', { power: 'block', c: 5, r: 4 }), null)
  shaman.mana = SHAMAN_MAX_MANA
  shaman.powerCooldownMs.block = 0
  assert.equal(castPower(sim, 'bruno', { power: 'block', c: 5, r: 4 }), 'Esse bloco já está marcado')
  assert.equal(shaman.mana, SHAMAN_MAX_MANA)
  assert.equal(sim.marks.length, 1)
  assert.equal(sim.map.tiles[4][5], Tile.Placa)
})

test('shaman morto e poder desconhecido são recusados', () => {
  const sim = pit()
  const shaman = add(sim, 'bruno', 2)
  assignRoles(sim, 'bruno')
  shaman.alive = false
  assert.equal(castPower(sim, 'bruno', { power: 'block', c: 5, r: 4 }), 'Você foi eliminado')
  shaman.alive = true
  assert.equal(castPower(sim, 'bruno', { power: 'push', c: 5, r: 4 }), 'Poder desconhecido')
  assert.equal(sim.marks.length, 0)
})

test('duas solicitações não gastam a mesma mana duas vezes', () => {
  const sim = pit()
  const shaman = add(sim, 'bruno', 2)
  assignRoles(sim, 'bruno')
  shaman.mana = DESTROY_BLOCK_COST
  assert.equal(castPower(sim, 'bruno', { power: 'block', c: 4, r: 4 }), null)
  assert.equal(castPower(sim, 'bruno', { power: 'block', c: 5, r: 4 }), 'Mana insuficiente')
  assert.equal(shaman.mana, 0)
  assert.equal(sim.map.tiles[4][5], Tile.Placa)
  assert.equal(sim.marks.length, 1)
})

test('poder depois do fim da rodada não executa', () => {
  const sim = pit()
  add(sim, 'bruno', 2)
  assignRoles(sim, 'bruno')
  sim.phase = 'finished'
  assert.equal(castPower(sim, 'bruno', { power: 'block', c: 4, r: 4 }), 'A rodada não está em andamento')
})

test('jogador derruba o shaman e vira o próximo', () => {
  const sim = pit()
  const digger = add(sim, 'lucas', 4)
  add(sim, 'bruno', 5)
  assignRoles(sim, 'bruno')
  digger.digQueued = true
  stepSim(sim, 1000 / 60)
  assert.equal(sim.map.tiles[4][5], Tile.Empty)
  let steps = 0
  while (sim.phase === 'playing' && steps < 180) {
    stepSim(sim, 1000 / 60)
    steps += 1
  }
  assert.equal(sim.phase, 'finished')
  assert.equal(sim.nextShamanId, 'lucas')
  assert.equal(sim.events.some((event) => event.type === 'shaman-down' && event.cause === 'killed'), true)
  const death = sim.events.find((event) => event.type === 'death' && event.playerId === 'bruno')
  assert.ok(death && death.type === 'death')
  if (death?.type === 'death') {
    assert.equal(death.killerId, 'lucas')
    assert.equal(death.credit, 'PLAYER_DIG')
  }
})

test('shaman que cai sozinho não entrega o cargo', () => {
  const sim = pit()
  const shaman = add(sim, 'bruno', 2)
  add(sim, 'ana', 5)
  assignRoles(sim, 'bruno')
  sim.map.tiles[4][2] = Tile.Empty
  shaman.y = standOn(2, 4).y
  let steps = 0
  while (sim.phase === 'playing' && steps < 180) {
    stepSim(sim, 1000 / 60)
    steps += 1
  }
  assert.equal(sim.phase, 'finished')
  assert.equal(sim.nextShamanId, null)
  assert.equal(sim.events.some((event) => event.type === 'shaman-down' && event.cause === 'self'), true)
})

test('desconexão do shaman não escolhe um jogador offline', () => {
  const sim = pit()
  add(sim, 'bruno', 2)
  add(sim, 'ana', 5)
  assignRoles(sim, 'bruno')
  killPlayer(sim, 'bruno', 'disconnect')
  assert.equal(sim.nextShamanId, null)
  assert.equal(sim.phase, 'finished')
  const connected = ['ana']
  assert.equal(chooseShaman(connected, sim.nextShamanId, () => 0), 'ana')
  assert.ok(!connected.includes('bruno'))
})

test('o poder do shaman atribui a queda de quem estava no bloco', () => {
  const sim = pit()
  add(sim, 'bruno', 2)
  const alvo = add(sim, 'ana', 5)
  add(sim, 'caio', 6)
  assignRoles(sim, 'bruno')
  assert.equal(castPower(sim, 'bruno', { power: 'block', c: 5, r: 4 }), null)
  wait(sim, SHAMAN_BLOCK_WARNING_MS - 40)
  assert.equal(alvo.alive, true)
  assert.equal(sim.map.tiles[4][5], Tile.Placa)
  let steps = 0
  while (alvo.alive && sim.phase === 'playing' && steps < 240) {
    stepSim(sim, 1000 / 60)
    steps += 1
  }
  assert.equal(alvo.alive, false)
  const death = sim.events.find((event) => event.type === 'death' && event.playerId === 'ana')
  assert.ok(death && death.type === 'death')
  if (death?.type === 'death') {
    assert.equal(death.killerId, 'bruno')
    assert.equal(death.credit, 'SHAMAN_POWER')
    assert.equal(death.cause, 'void')
  }
  assert.equal(sim.phase, 'playing')
})

test('eliminação de um jogador comum não troca o shaman', () => {
  const sim = pit()
  add(sim, 'bruno', 2)
  const mouse = add(sim, 'ana', 5)
  add(sim, 'caio', 6)
  assignRoles(sim, 'bruno')
  sim.map.tiles[4][5] = Tile.Empty
  mouse.y = standOn(5, 4).y
  let steps = 0
  while (mouse.alive && steps < 180) {
    stepSim(sim, 1000 / 60)
    steps += 1
  }
  assert.equal(mouse.alive, false)
  assert.equal(sim.phase, 'playing')
  assert.equal(sim.shamanId, 'bruno')
  assert.equal(sim.players.find((player) => player.id === 'bruno')?.role, 'shaman')
})

function gate(): SimState {
  const width = 8
  const height = 8
  const tiles = Array.from({ length: height }, () => Array<number>(width).fill(Tile.Empty))
  for (let c = 0; c < width; c++) tiles[0][c] = Tile.Trava
  for (let r = 0; r < height; r++) {
    tiles[r][0] = Tile.Trava
    tiles[r][width - 1] = Tile.Trava
  }
  tiles[2][2] = Tile.Trava
  tiles[2][3] = Tile.Trava
  tiles[2][4] = Tile.Trava
  tiles[5][2] = Tile.Placa
  tiles[5][3] = Tile.Placa
  tiles[5][4] = Tile.Placa
  tiles[3][3] = Tile.Ladder
  tiles[4][3] = Tile.Ladder
  const sim = createSim(
    { id: 'porta', name: 'porta', skin: 'moss', width, height, tiles, spawns: [], exit: { c: 3, r: 1 } },
    defaultConfig(),
  )
  sim.phase = 'playing'
  sim.countdownMs = 0
  return sim
}

test('entrar na porta encerra a rodada de quem está sozinho', () => {
  const sim = gate()
  const player = createPlayer({ id: 'bruno', name: 'bruno', color: '#fff', variant: 0, ...standOn(3, 2) })
  sim.players.push(player)
  assignRoles(sim, 'bruno')
  stepSim(sim, 1000 / 60)
  assert.equal(player.escaped, true)
  assert.equal(player.alive, false)
  assert.equal(sim.phase, 'finished')
  assert.deepEqual(sim.result?.winnerIds, ['bruno'])
  assert.equal(sim.events.some((event) => event.type === 'escaped' && event.playerId === 'bruno'), true)
})

test('um escape não encerra a rodada enquanto outro ainda corre', () => {
  const sim = gate()
  const shaman = createPlayer({ id: 'bruno', name: 'bruno', color: '#fff', variant: 0, ...standOn(3, 2) })
  const outro = createPlayer({ id: 'ana', name: 'ana', color: '#fff', variant: 1, ...standOn(4, 5) })
  sim.players.push(shaman, outro)
  assignRoles(sim, 'bruno')
  stepSim(sim, 1000 / 60)
  assert.equal(shaman.escaped, true)
  assert.equal(outro.alive, true)
  assert.equal(sim.phase, 'playing')
})

test('fortificar impede cavar e o poder remoto', () => {
  const sim = pit()
  const shaman = add(sim, 'bruno', 2)
  add(sim, 'ana', 4)
  assignRoles(sim, 'bruno')
  assert.equal(castPower(sim, 'bruno', { power: 'fortify', c: 5, r: 4 }), null)
  assert.equal(sim.map.tiles[4][5], Tile.Trava)
  const ana = sim.players.find((player) => player.id === 'ana')!
  ana.digQueued = true
  stepSim(sim, 1000 / 60)
  assert.equal(sim.map.tiles[4][5], Tile.Trava)
  shaman.mana = SHAMAN_MAX_MANA
  shaman.powerCooldownMs.fortify = 0
  assert.equal(castPower(sim, 'bruno', { power: 'block', c: 5, r: 4 }), 'Esse bloco não pode ser removido')
})

test('restaurar só fecha um buraco', () => {
  const sim = pit()
  const shaman = add(sim, 'bruno', 2)
  assignRoles(sim, 'bruno')
  shaman.digQueued = true
  stepSim(sim, 1000 / 60)
  assert.equal(sim.map.tiles[4][3], Tile.Empty)
  assert.equal(castPower(sim, 'bruno', { power: 'restore', c: 4, r: 4 }), 'Não há buraco aqui')
  assert.equal(castPower(sim, 'bruno', { power: 'restore', c: 3, r: 4 }), null)
  assert.equal(sim.map.tiles[4][3], Tile.Placa)
  assert.equal(sim.holes.some((hole) => hole.c === 3 && hole.r === 4), false)
})

if (failed > 0) {
  console.error(`\n${failed} teste(s) falharam`)
  process.exit(1)
}
console.log('\ntudo certo')
