import assert from 'node:assert/strict'
import { Tile } from './map.ts'
import { draftProblems, draftSpawns, draftToMap, normalizeDraft, normalizeShaman, normalizeSpawns, starterTiles, type DraftMap } from './draft.ts'

const base = (): DraftMap => ({
  id: 'a1',
  name: 'Poço',
  authorId: 'u',
  authorName: 'Ana',
  tiles: starterTiles(),
  exit: { c: 4, r: 2 },
  spawns: [{ c: 2, r: 15 }],
  shamanSpawn: null,
  status: 'reprovado',
})

const open = base()
assert.equal(draftProblems(open), null)
assert.ok(draftSpawns(open.tiles, open.exit).length >= 1)
assert.equal(draftToMap(open).exit?.c, 4)
assert.equal(draftToMap(open).authorName, 'Ana')
assert.deepEqual(draftToMap(open).spawns, [{ c: 2, r: 15 }])
assert.equal(draftToMap(open).shamanSpawn, null)
const marked = base()
marked.shamanSpawn = { c: 8, r: 15 }
assert.deepEqual(draftToMap(marked).shamanSpawn, { c: 8, r: 15 })
assert.equal(normalizeShaman(open.tiles, open.exit, { c: 4, r: 2 }), null)

const unspawned = base()
unspawned.spawns = []
assert.equal(draftProblems(unspawned), 'Marque onde os jogadores nascem')
assert.deepEqual(normalizeSpawns(open.tiles, open.exit, [{ c: 4, r: 2 }, { c: 2, r: 15 }, { c: 2, r: 15 }]), [{ c: 2, r: 15 }])

const nameless = base()
nameless.name = ' '
assert.equal(draftProblems(nameless), 'Dê um nome ao mapa')

const noDoor = base()
noDoor.exit = null
assert.equal(draftProblems(noDoor), 'Coloque a porta')

const loose = base()
loose.tiles[3][3] = Tile.Ladder
assert.match(draftProblems(loose) ?? '', /não tem apoio/)

const sealed = normalizeDraft(
  starterTiles().map((row) => row.map(() => Tile.Placa)),
  { c: 0, r: 0 },
)
assert.equal(sealed.tiles[0][0], Tile.Trava)
assert.equal(sealed.tiles[19][3], Tile.Empty)
assert.equal(sealed.exit, null)

console.log('draft ok')
