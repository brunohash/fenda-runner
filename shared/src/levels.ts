import { Tile, isSolid } from './map.ts'
import type { GameMap, SpawnPoint } from './types.ts'

const W = 26
const H = 20

/**
 * Claraboia — sobe até a porta.
 * A rota da esquerda é larga e tem o lance da porta preso em bloco estrutural.
 * A da direita é curta, em plataformas menores, e o lance final apoia num tijolo que se cava.
 * A ponte estreita no meio é um atalho: cavar o centro abre um poço até o chão de baixo.
 * Dá para chegar na porta pelas duas rotas sem o Shaman.
 */
function makeLevels(): GameMap[] {
  return [build('claraboia', 'Claraboia', 'copper', (pen) => {
    pen.trava(3, 11, 20)
    pen.exit(13, 2)

    pen.shelf(6, 2, 9)
    pen.shelf(8, 2, 12)
    pen.rivet(8, 10)
    pen.shelf(13, 2, 11)
    pen.shelf(16, 1, 24)
    pen.rivet(16, 8)
    pen.rivet(16, 22)

    pen.shelf(9, 19, 23)
    pen.shelf(14, 16, 23)
    pen.shelf(11, 12, 16)

    pen.shaft(10, 2, 7)
    pen.shaft(4, 7, 12)
    pen.shaft(8, 12, 15)
    pen.shaft(21, 2, 8)
    pen.shaft(18, 8, 13)
    pen.shaft(22, 13, 15)

    pen.spawns(15, [2, 3, 5, 6, 10, 12, 14, 16, 19, 23])
  })]
}

function build(id: string, name: string, skin: string, draw: (pen: Pen) => void): GameMap {
  const tiles = Array.from({ length: H }, () => Array<number>(W).fill(Tile.Empty))
  for (let r = 0; r < H; r++) {
    tiles[r][0] = Tile.Trava
    tiles[r][W - 1] = Tile.Trava
  }
  for (let c = 0; c < W; c++) tiles[0][c] = Tile.Trava
  const spawns: SpawnPoint[] = []
  const pen = new Pen(tiles, spawns)
  draw(pen)
  const map: GameMap = { id, name, authorName: '', skin, width: W, height: H, tiles, spawns, shamanSpawn: null, exit: pen.door }
  assertLevel(map)
  return map
}

class Pen {
  door: SpawnPoint | null = null

  constructor(
    private tiles: number[][],
    private spawnList: SpawnPoint[],
  ) {}

  shelf(r: number, c0: number, c1: number): void {
    for (let c = c0; c <= c1; c++) {
      if (this.tiles[r][c] === Tile.Trava) continue
      this.tiles[r][c] = Tile.Placa
    }
  }

  trava(r: number, c0: number, c1: number): void {
    for (let c = c0; c <= c1; c++) this.tiles[r][c] = Tile.Trava
  }

  shaft(c: number, top: number, bottom: number): void {
    for (let r = top; r <= bottom; r++) this.tiles[r][c] = Tile.Ladder
    const below = this.tiles[bottom + 1]?.[c]
    if (below !== Tile.Placa && below !== Tile.Trava) {
      throw new Error(`Escada sem apoio em ${c},${bottom}`)
    }
  }

  rivet(r: number, c: number): void {
    if (this.tiles[r][c] !== Tile.Placa && this.tiles[r][c] !== Tile.Trava) {
      throw new Error(`Rebite fora de tijolo em ${c},${r}`)
    }
    this.tiles[r][c] = Tile.Trava
  }

  exit(c: number, r: number): void {
    this.tiles[r][c] = Tile.Empty
    this.door = { c, r }
  }

  spawns(r: number, cols: number[]): void {
    for (const c of cols) this.spawnList.push({ c, r })
  }
}

/** Caminho só andando e subindo escada. `skipLadder` tira um lado para provar a outra rota. */
export function canReachExit(map: GameMap, skipLadder?: (c: number) => boolean): boolean {
  if (!map.exit) return false
  const stand = (c: number, r: number) => {
    const tile = map.tiles[r]?.[c]
    if (tile === undefined || tile === Tile.Trava || tile === Tile.Placa) return false
    if (tile === Tile.Ladder && skipLadder?.(c)) return false
    const below = map.tiles[r + 1]?.[c]
    return tile === Tile.Ladder || below === Tile.Placa || below === Tile.Trava
  }
  const seen = new Set<string>()
  const queue = map.spawns.map((spawn) => ({ ...spawn }))
  const goal = `${map.exit.c},${map.exit.r}`
  while (queue.length) {
    const cur = queue.pop()!
    const key = `${cur.c},${cur.r}`
    if (seen.has(key)) continue
    seen.add(key)
    if (key === goal) return true
    const around = [
      { c: cur.c - 1, r: cur.r },
      { c: cur.c + 1, r: cur.r },
    ]
    if (map.tiles[cur.r][cur.c] === Tile.Ladder) {
      around.push({ c: cur.c, r: cur.r - 1 }, { c: cur.c, r: cur.r + 1 })
    }
    for (const next of around) {
      if (stand(next.c, next.r)) queue.push(next)
    }
  }
  return false
}

function assertLevel(map: GameMap): void {
  if (map.spawns.length !== 10) throw new Error(`${map.name}: ${map.spawns.length} nascimentos`)
  if (!map.exit) throw new Error(`${map.name}: sem porta`)
  const door = map.exit
  if (map.tiles[door.r][door.c] !== Tile.Empty) throw new Error(`${map.name}: a porta ocupa um bloco`)
  for (let c = door.c - 2; c <= door.c + 2; c++) {
    if (map.tiles[door.r + 1]?.[c] !== Tile.Trava) throw new Error(`${map.name}: varanda frágil em ${c}`)
  }
  for (const spawn of map.spawns) {
    if (spawn.r <= door.r) throw new Error(`${map.name}: nascimento acima da porta`)
    if (map.tiles[spawn.r][spawn.c] !== Tile.Empty) throw new Error(`${map.name}: nascimento ocupado ${spawn.c}`)
    if (map.tiles[spawn.r + 1]?.[spawn.c] !== Tile.Placa) throw new Error(`${map.name}: nascimento sem tijolo ${spawn.c}`)
  }
  const abyss = map.height - 3
  for (let r = abyss; r < map.height; r++) {
    for (let c = 1; c < map.width - 1; c++) {
      if (map.tiles[r][c] !== Tile.Empty) throw new Error(`${map.name}: sólido no abismo ${c},${r}`)
    }
  }
  for (let r = 0; r < map.height; r++) {
    for (let c = 0; c < map.width; c++) {
      if (map.tiles[r][c] !== Tile.Ladder) continue
      const below = map.tiles[r + 1]?.[c]
      if (below !== Tile.Ladder && !isSolid(below ?? Tile.Empty)) {
        throw new Error(`${map.name}: degrau solto ${c},${r}`)
      }
    }
  }
  if (!canReachExit(map)) throw new Error(`${map.name}: a porta não tem caminho`)
  if (!canReachExit(map, (c) => c >= 16)) throw new Error(`${map.name}: a rota da esquerda não chega`)
  if (!canReachExit(map, (c) => c <= 12)) throw new Error(`${map.name}: a rota da direita não chega`)
  const placas = map.tiles.flat().filter((tile) => tile === Tile.Placa).length
  const ladders = map.tiles.flat().filter((tile) => tile === Tile.Ladder).length
  if (placas < 60) throw new Error(`${map.name}: poucos tijolos (${placas})`)
  if (ladders < 20) throw new Error(`${map.name}: poucas escadas (${ladders})`)
}

export const LEVELS: GameMap[] = makeLevels()
