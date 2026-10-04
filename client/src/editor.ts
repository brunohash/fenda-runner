import { canSpawn, DRAFT_H, DRAFT_W, draftProblems, lockedCell, normalizeShaman, normalizeSpawns, starterTiles } from '@shared/draft.ts'
import { Tile } from '@shared/map.ts'
import type { DraftCard } from '@shared/protocol.ts'
import type { SpawnPoint } from '@shared/types.ts'

type Tool = 'placa' | 'trava' | 'ladder' | 'linha' | 'door' | 'spawn' | 'shaman' | 'erase'
type DraftStatus = 'reprovado' | 'aprovado'

export interface EditorPayload {
  id: string
  name: string
  tiles: number[][]
  exit: SpawnPoint | null
  spawns: SpawnPoint[]
  shamanSpawn: SpawnPoint | null
}

const TOOLS: { id: Tool; label: string; key: string }[] = [
  { id: 'placa', label: 'Tijolo', key: '1' },
  { id: 'trava', label: 'Estrutural', key: '2' },
  { id: 'ladder', label: 'Escada', key: '3' },
  { id: 'linha', label: 'Linha', key: '4' },
  { id: 'door', label: 'Porta', key: '5' },
  { id: 'spawn', label: 'Nascer', key: '6' },
  { id: 'shaman', label: 'Shaman', key: '7' },
  { id: 'erase', label: 'Apagar', key: '8' },
]

export function mountEditor(hooks: {
  save: (draft: EditorPayload) => void
  test: (draft: EditorPayload) => void
  close: () => void
}): {
  setMaps: (maps: DraftCard[]) => void
  saved: (map: DraftCard) => void
  mark: (id: string, status: DraftStatus) => void
  banner: (text: string) => void
} {
  const root = document.querySelector<HTMLElement>('#editor')!
  const nameInput = document.querySelector<HTMLInputElement>('#editor-name')!
  const state = document.querySelector<HTMLElement>('#editor-state')!
  const banner = document.querySelector<HTMLElement>('#editor-banner')!
  const tools = document.querySelector<HTMLElement>('#editor-tools')!
  const grid = document.querySelector<HTMLElement>('#editor-grid')!
  const list = document.querySelector<HTMLElement>('#editor-maps')!
  const save = document.querySelector<HTMLButtonElement>('#editor-save')!
  const test = document.querySelector<HTMLButtonElement>('#editor-test')!

  let maps: DraftCard[] = []
  let tiles = starterTiles()
  let exit: SpawnPoint | null = null
  let spawns: SpawnPoint[] = []
  let shamanSpawn: SpawnPoint | null = null
  let id = ''
  let status: DraftStatus = 'reprovado'
  let locked = false
  let tool: Tool = 'placa'
  let drawing = false

  const cells: HTMLElement[] = []
  for (let r = 0; r < DRAFT_H; r++) {
    for (let c = 0; c < DRAFT_W; c++) {
      const cell = document.createElement('div')
      cell.className = 'cell'
      cell.dataset.c = String(c)
      cell.dataset.r = String(r)
      cells.push(cell)
      grid.append(cell)
    }
  }

  tools.replaceChildren(
    ...TOOLS.map((item) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.dataset.tool = item.id
      button.textContent = `${item.key} ${item.label}`
      button.addEventListener('click', () => {
        tool = item.id
        paintTools()
      })
      return button
    }),
  )

  grid.addEventListener('pointerdown', (event) => {
    if (!(event.target instanceof HTMLElement)) return
    drawing = true
    grid.setPointerCapture(event.pointerId)
    paintAt(event.target)
  })
  grid.addEventListener('pointerover', (event) => {
    if (!drawing || tool === 'spawn' || tool === 'shaman' || !(event.target instanceof HTMLElement)) return
    paintAt(event.target)
  })
  grid.addEventListener('pointerup', () => {
    drawing = false
  })
  grid.addEventListener('pointercancel', () => {
    drawing = false
  })

  document.querySelector('#editor-new')!.addEventListener('click', () => loadBlank())
  save.addEventListener('click', () => hooks.save(payload()))
  test.addEventListener('click', () => {
    const draft = payload()
    const problem = draftProblems({ name: draft.name, tiles: draft.tiles, exit: draft.exit, spawns: draft.spawns })
    if (problem) {
      banner.textContent = problem
      return
    }
    hooks.test(draft)
  })
  document.querySelector('#editor-close')!.addEventListener('click', () => hooks.close())

  window.addEventListener('keydown', (event) => {
    if (root.hidden || event.target instanceof HTMLInputElement) return
    const found = TOOLS.find((item) => item.key === event.key)
    if (!found) return
    tool = found.id
    paintTools()
  })

  paintAll()
  paintTools()
  paintBadge()
  paintList()

  return {
    setMaps(next) {
      maps = next
      const open = maps.find((map) => map.id === id)
      if (open) status = open.status
      paintList()
      paintBadge()
    },
    saved(map) {
      id = map.id
      status = map.status
      const index = maps.findIndex((item) => item.id === map.id)
      if (index >= 0) maps[index] = map
      else maps.unshift(map)
      paintList()
      paintBadge()
    },
    mark(nextId, nextStatus) {
      status = nextId === id ? nextStatus : status
      const found = maps.find((map) => map.id === nextId)
      if (found) found.status = nextStatus
      paintList()
      paintBadge()
    },
    banner(text) {
      banner.textContent = text
    },
  }

  function payload(): EditorPayload {
    return {
      id,
      name: nameInput.value.trim(),
      tiles: tiles.map((row) => row.slice()),
      exit: exit ? { ...exit } : null,
      spawns: spawns.map((spawn) => ({ ...spawn })),
      shamanSpawn: shamanSpawn ? { ...shamanSpawn } : null,
    }
  }

  function loadBlank(): void {
    id = ''
    status = 'reprovado'
    locked = false
    tiles = starterTiles()
    exit = null
    spawns = []
    shamanSpawn = null
    nameInput.value = ''
    banner.textContent = ''
    paintAll()
    paintBadge()
    paintList()
  }

  function load(map: DraftCard): void {
    id = map.id
    status = map.status
    locked = !map.mine
    tiles = map.tiles.map((row) => row.slice())
    exit = map.exit ? { ...map.exit } : null
    spawns = (map.spawns ?? []).map((spawn) => ({ ...spawn }))
    shamanSpawn = map.shamanSpawn ? { ...map.shamanSpawn } : null
    nameInput.value = map.name
    banner.textContent = map.mine
      ? map.status === 'aprovado'
        ? 'Salvar tira este mapa da rotação até você chegar na porta de novo.'
        : ''
      : 'Só dá para alterar um mapa que você criou.'
    paintAll()
    paintBadge()
    paintList()
  }

  function paintAt(target: HTMLElement): void {
    if (locked) return
    const c = Number(target.dataset.c)
    const r = Number(target.dataset.r)
    if (!Number.isInteger(c) || !Number.isInteger(r) || lockedCell(c, r)) return
    if (tool === 'spawn') {
      placeSpawn(c, r)
    } else if (tool === 'shaman') {
      placeShaman(c, r)
    } else if (tool === 'door') {
      exit = { c, r }
      tiles[r][c] = Tile.Empty
    } else {
      if (exit && exit.c === c && exit.r === r) exit = null
      if (tool === 'erase') {
        spawns = spawns.filter((spawn) => spawn.c !== c || spawn.r !== r)
        if (shamanSpawn && shamanSpawn.c === c && shamanSpawn.r === r) shamanSpawn = null
      }
      tiles[r][c] = tool === 'placa' ? Tile.Placa : tool === 'trava' ? Tile.Trava : tool === 'ladder' ? Tile.Ladder : tool === 'linha' ? Tile.Bar : Tile.Empty
    }
    if (exit) tiles[exit.r][exit.c] = Tile.Empty
    spawns = normalizeSpawns(tiles, exit, spawns)
    shamanSpawn = normalizeShaman(tiles, exit, shamanSpawn)
    if (tool !== 'spawn' && tool !== 'shaman') banner.textContent = ''
    paintAll()
  }

  function placeSpawn(c: number, r: number): void {
    const spot = canSpawn(tiles, exit, c, r)
      ? { c, r }
      : (tiles[r]?.[c] === Tile.Placa || tiles[r]?.[c] === Tile.Trava) && canSpawn(tiles, exit, c, r - 1)
        ? { c, r: r - 1 }
        : null
    if (!spot) {
      banner.textContent = 'O nascimento fica no vão, em cima de um bloco ou escada'
      return
    }
    const index = spawns.findIndex((spawn) => spawn.c === spot.c && spawn.r === spot.r)
    if (index >= 0) {
      spawns.splice(index, 1)
      banner.textContent = ''
      return
    }
    if (spawns.length >= 10) {
      banner.textContent = 'No máximo 10 nascimentos'
      return
    }
    spawns.push(spot)
    banner.textContent = ''
  }

  function placeShaman(c: number, r: number): void {
    const spot = canSpawn(tiles, exit, c, r)
      ? { c, r }
      : (tiles[r]?.[c] === Tile.Placa || tiles[r]?.[c] === Tile.Trava) && canSpawn(tiles, exit, c, r - 1)
        ? { c, r: r - 1 }
        : null
    if (!spot) {
      banner.textContent = 'O Shaman começa no vão, em cima de um bloco ou escada'
      return
    }
    if (shamanSpawn && shamanSpawn.c === spot.c && shamanSpawn.r === spot.r) {
      shamanSpawn = null
      banner.textContent = ''
      return
    }
    shamanSpawn = spot
    banner.textContent = ''
  }

  function paintAll(): void {
    cells.forEach((cell, index) => {
      const c = index % DRAFT_W
      const r = Math.floor(index / DRAFT_W)
      const tile = tiles[r]?.[c] ?? Tile.Empty
      cell.className = 'cell'
      if (lockedCell(c, r)) cell.classList.add('locked')
      if (r > DRAFT_H - 4) cell.classList.add('abyss')
      if (exit && exit.c === c && exit.r === r) cell.classList.add('door')
      else if (tile === Tile.Placa) cell.classList.add('placa')
      else if (tile === Tile.Trava) cell.classList.add('trava')
      else if (tile === Tile.Ladder) cell.classList.add('ladder')
      else if (tile === Tile.Bar) cell.classList.add('linha')
      if (spawns.some((spawn) => spawn.c === c && spawn.r === r)) cell.classList.add('spawn')
      if (shamanSpawn && shamanSpawn.c === c && shamanSpawn.r === r) cell.classList.add('shaman')
    })
    nameInput.disabled = locked
    save.disabled = locked
    test.disabled = locked
  }

  function paintTools(): void {
    for (const button of tools.querySelectorAll<HTMLButtonElement>('button')) {
      button.classList.toggle('on', button.dataset.tool === tool)
      button.disabled = locked
    }
  }

  function paintBadge(): void {
    const open = id ? maps.find((map) => map.id === id) : undefined
    locked = !!open && !open.mine
    if (!id) locked = false
    state.textContent = locked ? 'só leitura' : status
    state.className = status === 'aprovado' ? 'badge good' : 'badge'
    nameInput.disabled = locked
    save.disabled = locked
    test.disabled = locked
    paintTools()
  }

  function paintList(): void {
    list.replaceChildren(
      ...maps.map((map) => {
        const item = document.createElement('li')
        const button = document.createElement('button')
        button.type = 'button'
        button.classList.toggle('on', map.id === id)
        button.textContent = `${map.status === 'aprovado' ? 'aprovado' : 'reprovado'} · ${map.name || 'sem nome'}${map.mine ? '' : ` · ${map.authorName}`}`
        button.addEventListener('click', () => load(map))
        item.append(button)
        return item
      }),
    )
  }
}
