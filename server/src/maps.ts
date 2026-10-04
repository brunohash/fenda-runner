import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { draftProblems, draftSpawns, draftToMap, normalizeDraft, normalizeShaman, normalizeSpawns, type DraftMap, type DraftStatus } from '../../shared/src/draft.ts'
import { LEVELS } from '../../shared/src/levels.ts'
import type { GameMap, SpawnPoint } from '../../shared/src/types.ts'

const MAX_PER_AUTHOR = 8
const file = path.join(process.cwd(), 'server', 'data', 'maps.json')

let drafts: DraftMap[] = []

function load(): void {
  if (!existsSync(file)) return
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as DraftMap[]
    if (!Array.isArray(parsed)) return
    drafts = parsed.flatMap((draft) => {
      if (!draft || typeof draft.id !== 'string' || typeof draft.name !== 'string') return []
      const shaped = normalizeDraft(draft.tiles ?? [], draft.exit ?? null)
      const status: DraftStatus = draft.status === 'aprovado' ? 'aprovado' : 'reprovado'
      const explicit = Array.isArray(draft.spawns)
      const spawns = normalizeSpawns(shaped.tiles, shaped.exit, explicit ? draft.spawns : [])
      return [{
        id: draft.id,
        name: draft.name,
        authorId: typeof draft.authorId === 'string' ? draft.authorId : '',
        authorName: typeof draft.authorName === 'string' ? draft.authorName : 'Operador',
        tiles: shaped.tiles,
        exit: shaped.exit,
        spawns: explicit ? spawns : spawns.length > 0 ? spawns : draftSpawns(shaped.tiles, shaped.exit),
        shamanSpawn: normalizeShaman(shaped.tiles, shaped.exit, draft.shamanSpawn ?? null),
        status,
      }]
    })
  } catch {
    drafts = []
  }
}

function saveFile(): void {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(drafts, null, 2))
}

load()

export interface DraftCard extends DraftMap {
  mine: boolean
}

export function visibleDrafts(userId: string): DraftCard[] {
  return drafts
    .filter((draft) => draft.status === 'aprovado' || draft.authorId === userId)
    .map((draft) => ({
      ...draft,
      tiles: draft.tiles.map((row) => row.slice()),
      exit: draft.exit ? { ...draft.exit } : null,
      spawns: draft.spawns.map((spawn) => ({ ...spawn })),
      shamanSpawn: draft.shamanSpawn ? { ...draft.shamanSpawn } : null,
      mine: draft.authorId === userId,
    }))
}

export function getDraft(id: string): DraftMap | null {
  return drafts.find((draft) => draft.id === id) ?? null
}

export function saveDraft(
  author: { id: string; nickname: string },
  input: { id: string; name: string; tiles: number[][]; exit: SpawnPoint | null; spawns: SpawnPoint[]; shamanSpawn: SpawnPoint | null },
): DraftMap | { error: string } {
  const name = input.name.trim().replace(/\s+/g, ' ').slice(0, 24)
  const shaped = normalizeDraft(input.tiles, input.exit)
  const existing = input.id ? drafts.find((draft) => draft.id === input.id) : undefined
  if (existing && existing.authorId !== author.id) return { error: 'Esse mapa não é seu' }
  if (!existing && drafts.filter((draft) => draft.authorId === author.id).length >= MAX_PER_AUTHOR) {
    return { error: 'Você já tem 8 mapas' }
  }
  const draft: DraftMap = {
    id: existing?.id ?? randomBytes(4).toString('hex'),
    name,
    authorId: author.id,
    authorName: author.nickname,
    tiles: shaped.tiles,
    exit: shaped.exit,
    spawns: normalizeSpawns(shaped.tiles, shaped.exit, input.spawns),
    shamanSpawn: normalizeShaman(shaped.tiles, shaped.exit, input.shamanSpawn),
    status: 'reprovado',
  }
  if (!existing) drafts.push(draft)
  else Object.assign(existing, draft)
  saveFile()
  return draft
}

export function approveDraft(id: string): DraftMap | null {
  const draft = drafts.find((item) => item.id === id)
  if (!draft) return null
  draft.status = 'aprovado'
  saveFile()
  return draft
}

export function playableMaps(): GameMap[] {
  const custom = drafts.filter((draft) => draft.status === 'aprovado' && !draftProblems(draft)).map((draft) => draftToMap(draft))
  return [...LEVELS, ...custom]
}
