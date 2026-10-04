import { Tile, isSolid } from './map.ts'
import type { GameMap, SpawnPoint } from './types.ts'

export const DRAFT_W = 26
export const DRAFT_H = 20
export const DRAFT_ABYSS = 3

export type DraftStatus = 'reprovado' | 'aprovado'

export interface DraftMap {
  id: string
  name: string
  authorId: string
  authorName: string
  tiles: number[][]
  exit: SpawnPoint | null
  spawns: SpawnPoint[]
  shamanSpawn: SpawnPoint | null
  status: DraftStatus
}

const INTERIOR_BOTTOM = DRAFT_H - DRAFT_ABYSS - 1

export function starterTiles(): number[][] {
  const tiles = Array.from({ length: DRAFT_H }, () => Array<number>(DRAFT_W).fill(Tile.Empty))
  for (let r = 0; r < DRAFT_H; r++) {
    tiles[r][0] = Tile.Trava
    tiles[r][DRAFT_W - 1] = Tile.Trava
  }
  for (let c = 0; c < DRAFT_W; c++) tiles[0][c] = Tile.Trava
  for (let c = 1; c < DRAFT_W - 1; c++) tiles[INTERIOR_BOTTOM][c] = Tile.Placa
  return tiles
}

export function normalizeDraft(tiles: number[][], exit: SpawnPoint | null): { tiles: number[][]; exit: SpawnPoint | null } {
  const next = starterTiles().map((row, r) => row.map((cell, c) => (lockedCell(c, r) ? cell : Tile.Empty)))
  for (let r = 1; r <= INTERIOR_BOTTOM; r++) {
    for (let c = 1; c < DRAFT_W - 1; c++) {
      const tile = tiles[r]?.[c]
      next[r][c] = tile === Tile.Trava || tile === Tile.Placa || tile === Tile.Ladder || tile === Tile.Bar ? tile : Tile.Empty
    }
  }
  const door = exit && inside(exit.c, exit.r) ? { c: exit.c, r: exit.r } : null
  if (door) next[door.r][door.c] = Tile.Empty
  return { tiles: next, exit: door }
}

export function draftProblems(draft: Pick<DraftMap, 'name' | 'tiles' | 'exit' | 'spawns'>): string | null {
  const name = draft.name.trim()
  if (name.length < 2) return 'Dê um nome ao mapa'
  if (!draft.exit) return 'Coloque a porta'
  if (!inside(draft.exit.c, draft.exit.r)) return 'A porta ficou fora da área'
  if (draft.tiles[draft.exit.r]?.[draft.exit.c] !== Tile.Empty) return 'A porta precisa de um vão vazio'
  for (let r = 1; r <= INTERIOR_BOTTOM; r++) {
    for (let c = 1; c < DRAFT_W - 1; c++) {
      if (draft.tiles[r][c] !== Tile.Ladder) continue
      const below = draft.tiles[r + 1]?.[c]
      if (below !== Tile.Ladder && !isSolid(below ?? Tile.Empty)) return `A escada em ${c},${r} não tem apoio`
    }
  }
  if (normalizeSpawns(draft.tiles, draft.exit, draft.spawns).length === 0) return 'Marque onde os jogadores nascem'
  return null
}

export function canSpawn(tiles: number[][], exit: SpawnPoint | null, c: number, r: number): boolean {
  if (!inside(c, r)) return false
  if (exit && exit.c === c && exit.r === r) return false
  const tile = tiles[r]?.[c]
  if (tile !== Tile.Empty && tile !== Tile.Ladder) return false
  const below = tiles[r + 1]?.[c]
  return below === Tile.Placa || below === Tile.Trava || below === Tile.Ladder
}

export function normalizeSpawns(tiles: number[][], exit: SpawnPoint | null, spawns: SpawnPoint[] | null | undefined): SpawnPoint[] {
  const kept: SpawnPoint[] = []
  for (const spawn of spawns ?? []) {
    if (!spawn || !Number.isInteger(spawn.c) || !Number.isInteger(spawn.r)) continue
    if (!canSpawn(tiles, exit, spawn.c, spawn.r)) continue
    if (kept.some((item) => item.c === spawn.c && item.r === spawn.r)) continue
    kept.push({ c: spawn.c, r: spawn.r })
    if (kept.length === 10) break
  }
  return kept
}

export function normalizeShaman(tiles: number[][], exit: SpawnPoint | null, spawn: SpawnPoint | null | undefined): SpawnPoint | null {
  if (!spawn || !Number.isInteger(spawn.c) || !Number.isInteger(spawn.r)) return null
  return canSpawn(tiles, exit, spawn.c, spawn.r) ? { c: spawn.c, r: spawn.r } : null
}

export function draftSpawns(tiles: number[][], exit: SpawnPoint | null): SpawnPoint[] {
  for (let r = INTERIOR_BOTTOM; r >= 1; r--) {
    const found: SpawnPoint[] = []
    for (let c = 1; c < DRAFT_W - 1; c++) {
      if (exit && exit.c === c && exit.r === r) continue
      const tile = tiles[r]?.[c]
      if (tile !== Tile.Empty && tile !== Tile.Ladder) continue
      const below = tiles[r + 1]?.[c]
      if (below !== Tile.Placa && below !== Tile.Trava && below !== Tile.Ladder) continue
      found.push({ c, r })
    }
    if (found.length === 0) continue
    if (found.length <= 10) return found
    const step = found.length / 10
    return Array.from({ length: 10 }, (_, index) => found[Math.min(found.length - 1, Math.floor(index * step))])
  }
  return []
}

export function draftToMap(draft: DraftMap): GameMap {
  const shaped = normalizeDraft(draft.tiles, draft.exit)
  return {
    id: `mapa-${draft.id}`,
    name: draft.name.trim(),
    authorName: draft.authorName.trim() || 'Operador',
    skin: 'copper',
    width: DRAFT_W,
    height: DRAFT_H,
    tiles: shaped.tiles,
    spawns: normalizeSpawns(shaped.tiles, shaped.exit, draft.spawns),
    shamanSpawn: normalizeShaman(shaped.tiles, shaped.exit, draft.shamanSpawn),
    exit: shaped.exit,
  }
}

export function lockedCell(c: number, r: number): boolean {
  return c === 0 || c === DRAFT_W - 1 || r === 0 || r > INTERIOR_BOTTOM
}

function inside(c: number, r: number): boolean {
  return c > 0 && c < DRAFT_W - 1 && r > 0 && r <= INTERIOR_BOTTOM
}
