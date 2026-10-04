import { TILE_SIZE } from './config.ts'
import type { GameMap } from './types.ts'

export const Tile = {
  Empty: 0,
  Trava: 1,
  Placa: 2,
  Ladder: 3,
  Bar: 4,
} as const

export type TileId = (typeof Tile)[keyof typeof Tile]

export function isSolid(tile: number): boolean {
  return tile === Tile.Trava || tile === Tile.Placa
}

export function isLadder(tile: number): boolean {
  return tile === Tile.Ladder
}

export function isBar(tile: number): boolean {
  return tile === Tile.Bar
}

const WIDTH = 24
const HEIGHT = 12
const FLOORS = [2, 4, 6, 8]
const LADDERS = [3, 8, 14, 20]
const SPAWNS = [2, 5, 6, 10, 11, 12, 16, 17, 19, 22]
const SPAWN_ROW = 1
const ANCHORS = new Set(['2,9', '4,15', '6,7', '8,13', '8,18'])

function blank(): number[][] {
  return Array.from({ length: HEIGHT }, () => Array<number>(WIDTH).fill(Tile.Empty))
}

/**
 * Galeria Suspensa — arena original.
 * Quatro andares de painéis cortáveis, travas permanentes e poços de escada.
 * O último andar abre direto para o abismo.
 */
/** Arena pequena e estável, usada pelos testes de movimento. As fases jogáveis estão em levels.ts. */
export function buildDrillRange(): GameMap {
  const tiles = blank()

  for (let r = 0; r < HEIGHT; r++) {
    tiles[r][0] = Tile.Trava
    tiles[r][WIDTH - 1] = Tile.Trava
  }
  for (let c = 0; c < WIDTH; c++) tiles[0][c] = Tile.Trava

  for (const r of FLOORS) {
    for (let c = 1; c < WIDTH - 1; c++) {
      tiles[r][c] = ANCHORS.has(`${r},${c}`) ? Tile.Trava : Tile.Placa
    }
  }

  for (const c of LADDERS) {
    for (let r = SPAWN_ROW; r <= FLOORS[FLOORS.length - 1]; r++) {
      tiles[r][c] = Tile.Ladder
    }
  }

  const spawns = SPAWNS.map((c) => ({ c, r: SPAWN_ROW }))

  const map: GameMap = {
    id: 'galeria',
    name: 'Galeria Suspensa',
    authorName: '',
    skin: 'copper',
    width: WIDTH,
    height: HEIGHT,
    tiles,
    spawns,
    shamanSpawn: null,
    exit: null,
  }
  assertArena(map)
  return map
}

function assertArena(map: GameMap): void {
  if (map.spawns.length !== 10) {
    throw new Error(`A arena precisa de 10 nascimentos, veio ${map.spawns.length}`)
  }
  const ladderCols = new Set(LADDERS)
  for (const spawn of map.spawns) {
    if (spawn.c < 1 || spawn.c >= map.width - 1) throw new Error('Nascimento na parede')
    if (ladderCols.has(spawn.c)) throw new Error('Nascimento em cima da escada')
    const floor = map.tiles[spawn.r + 1]?.[spawn.c]
    if (floor !== Tile.Placa) throw new Error(`Nascimento ${spawn.c} sem placa cortável embaixo`)
  }
  const bottom = map.height - 1
  for (let r = bottom - 2; r <= bottom; r++) {
    for (let c = 1; c < map.width - 1; c++) {
      if (isSolid(map.tiles[r][c])) throw new Error('O abismo não pode ter chão')
    }
  }
}

export function cloneMap(map: GameMap): GameMap {
  return {
    ...map,
    tiles: map.tiles.map((row) => row.slice()),
    spawns: map.spawns.map((s) => ({ ...s })),
    shamanSpawn: map.shamanSpawn ? { ...map.shamanSpawn } : null,
    exit: map.exit ? { ...map.exit } : null,
  }
}

export function worldKillY(height: number): number {
  return height * TILE_SIZE
}
