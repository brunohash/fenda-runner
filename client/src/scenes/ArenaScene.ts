import Phaser from 'phaser'
import { BUBBLE_MAX_CHARS, PLAYER_H, PLAYER_W, SHAMAN_POWER_RANGE, TILE_SIZE } from '@shared/config.ts'
import { Tile } from '@shared/map.ts'
import { previewPower } from '@shared/shaman.ts'
import { inspectDig } from '@shared/sim.ts'
import { roleGear } from '@shared/shop.ts'
import type { PlayerSnap, TileChange } from '@shared/types.ts'
import { alienDisplay, alienFrameCount, type SpritePose } from '../alien.ts'
import { ensureCharacter, ensurePlaceholder, ensureTextures } from '../art.ts'
import { bridge, type SnapPayload } from '../state.ts'

interface Actor {
  root: Phaser.GameObjects.Container
  sprite: Phaser.GameObjects.Image
  label: Phaser.GameObjects.Text
  pin: Phaser.GameObjects.Text
  bubble: Phaser.GameObjects.Text
  aura: Phaser.GameObjects.Ellipse
  look: string
}

function runnerPose(player: PlayerSnap): SpritePose {
  if (!player.alive) return 'dead'
  if (player.onBar) return 'hang'
  if (player.onLadder) return 'climb'
  if (!player.onGround) return 'fall'
  if (Math.abs(player.vx) > 20) return 'step'
  return 'idle'
}

function poseFrame(pose: SpritePose): number {
  const count = alienFrameCount(pose)
  if (count <= 1) return 0
  const period = pose === 'idle' ? 280 : pose === 'step' ? 90 : 120
  return Math.floor(performance.now() / period) % count
}

interface Bit {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  color: number
}

export class ArenaScene extends Phaser.Scene {
  private world!: Phaser.GameObjects.Container
  private marker!: Phaser.GameObjects.Graphics
  private bitsGfx!: Phaser.GameObjects.Graphics
  private tileImages = new Map<string, Phaser.GameObjects.Image>()
  private actors = new Map<string, Actor>()
  private reforming = new Set<string>()
  private marked = new Set<string>()
  private hover: { c: number; r: number } | null = null
  private doorGlow: Phaser.GameObjects.Ellipse | null = null
  private bits: Bit[] = []
  private tiles: number[][] = []
  private width = 0
  private height = 0
  private mapW = 0
  private mapH = 0
  private serial = 0
  private tick = -1
  private dangerRow = 0
  private youId = ''
  private shake = 0
  private baseX = 0
  private baseY = 0
  private reduceMotion = false

  constructor() {
    super('arena')
  }

  preload(): void {
    this.load.image('tile-grass', '/tile-grass.png')
    this.load.image('tile-dirt', '/tile-dirt.png')
    this.load.image('tile-foot', '/tile-foot.png')
    this.load.image('tile-stone', '/tile-stone.png')
  }

  create(): void {
    this.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ensureTextures(this)
    this.world = this.add.container(0, 0)
    this.scale.on('resize', () => this.layout())
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      this.hover = this.cellAt(pointer)
    })
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.leftButtonDown()) return
      const actorId = this.actorAt(pointer)
      if (actorId) {
        bridge.inspect?.(actorId)
        return
      }
      if (!bridge.selectedPower) return
      const cell = this.cellAt(pointer)
      if (!cell || bridge.snap?.phase !== 'playing') return
      const me = bridge.snap.players.find((player) => player.id === bridge.youId)
      if (!me || me.role !== 'shaman' || !me.alive) return
      bridge.castBlock?.(cell.c, cell.r)
    })
  }

  update(_time: number, delta: number): void {
    const match = bridge.match
    if (match && match.serial !== this.serial) this.rebuild(match)
    const snap = bridge.snap
    if (snap && snap.serial === this.serial && snap.tick !== this.tick) {
      this.applySnap(snap)
      this.tick = snap.tick
    }
    this.refreshSpeech()
    this.refreshPoses()
    this.drawMarker()
    this.stepBits(delta)
    this.pulseReform()
    this.pulseMarks()
    this.pulseDoor()
    this.applyShake()
    const overActor = this.actorAt(this.input.activePointer)
    this.input.setDefaultCursor(overActor ? 'pointer' : bridge.selectedPower ? 'crosshair' : 'default')
  }

  private rebuild(match: NonNullable<typeof bridge.match>): void {
    this.serial = match.serial
    this.tick = -1
    this.youId = match.youId
    this.tiles = match.tiles.map((row) => row.slice())
    this.width = match.width
    this.height = match.height
    this.mapW = match.width * TILE_SIZE
    this.mapH = match.height * TILE_SIZE
    this.dangerRow = 0
    for (let r = 0; r < this.tiles.length; r++) {
      if (this.tiles[r].some((tile) => tile === Tile.Placa)) this.dangerRow = r
    }
    this.world.removeAll(true)
    this.tileImages.clear()
    this.actors.clear()
    this.reforming.clear()
    this.marked.clear()
    this.bits = []

    const backdrop = this.add.graphics()
    backdrop.fillGradientStyle(0x0c2a6e, 0x0c2a6e, 0x071433, 0x071433, 1, 1, 1, 1)
    backdrop.fillRect(0, 0, this.mapW, this.mapH)
    backdrop.fillStyle(0x4a1028, 0.45)
    backdrop.fillRect(0, this.dangerRow * TILE_SIZE + TILE_SIZE, this.mapW, this.mapH)
    this.world.add(backdrop)

    for (let r = 0; r < this.height; r++) {
      for (let c = 0; c < this.width; c++) this.paintCell(c, r, this.tiles[r][c], 'solid')
    }

    this.marker = this.add.graphics()
    this.marker.setDepth(4)
    this.world.add(this.marker)
    this.bitsGfx = this.add.graphics()
    this.bitsGfx.setDepth(30)
    this.world.add(this.bitsGfx)
    this.doorGlow = null
    if (match.exit) {
      const x = match.exit.c * TILE_SIZE + TILE_SIZE / 2
      const y = match.exit.r * TILE_SIZE + TILE_SIZE / 2
      this.doorGlow = this.add.ellipse(x, y + 8, 70, 78, 0xffe14a, 0.42).setDepth(3)
      const door = this.add.image(match.exit.c * TILE_SIZE, match.exit.r * TILE_SIZE, 'door').setOrigin(0, 0).setDepth(4)
      door.setDisplaySize(TILE_SIZE, TILE_SIZE)
      this.world.add([this.doorGlow, door])
    }
    this.layout()
    this.syncActors(match.players)
  }

  private paintCell(c: number, r: number, tile: number, phase: TileChange['phase']): void {
    const key = `${c},${r}`
    if (tile === Tile.Empty && phase !== 'reforming') {
      this.tileImages.get(key)?.setVisible(false)
      this.reforming.delete(key)
      return
    }
    const texture =
      tile === Tile.Bar
        ? 'linha'
        : tile === Tile.Ladder
          ? 'ladder'
          : tile === Tile.Trava
            ? 'tile-stone'
            : this.placaTexture(c, r)
    let image = this.tileImages.get(key)
    if (!image) {
      image = this.add.image(c * TILE_SIZE, r * TILE_SIZE, texture).setOrigin(0, 0)
      image.setDepth(1)
      this.world.add(image)
      this.tileImages.set(key, image)
    }
    image.setTexture(texture)
    image.setDisplaySize(TILE_SIZE, TILE_SIZE)
    image.setVisible(true)
    image.setAlpha(phase === 'reforming' ? 0.45 : 1)
    if (phase === 'reforming') this.reforming.add(key)
    else this.reforming.delete(key)
  }

  private applySnap(snap: SnapPayload): void {
    const grid = snap.grid
    if (grid?.length) {
      for (let r = 0; r < grid.length; r++) {
        const row = grid[r] ?? []
        if (!this.tiles[r]) this.tiles[r] = []
        for (let c = 0; c < row.length; c++) {
          const next = row[c] ?? Tile.Empty
          const prev = this.tiles[r][c]
          if (prev === next) continue
          this.tiles[r][c] = next
          this.paintCell(c, r, next, next === Tile.Empty ? 'open' : 'solid')
          this.repaintPlate(c, r - 1)
          this.repaintPlate(c, r + 1)
          if ((prev === Tile.Placa || prev === Tile.Ladder) && next === Tile.Empty) {
            this.burst(c, r, prev === Tile.Ladder ? 0xf0c14e : 0x6a4a32)
          }
        }
      }
    }
    for (const change of snap.tiles) {
      if (!this.tiles[change.r]) continue
      this.tiles[change.r][change.c] = change.tile
      if (change.phase === 'reforming') this.paintCell(change.c, change.r, change.tile, 'reforming')
      else if (!grid?.length) {
        this.paintCell(change.c, change.r, change.tile, change.phase)
        if (change.phase === 'open') this.burst(change.c, change.r, 0x6a4a32)
      }
    }
    for (const event of snap.events) {
      if (event.type === 'dug' && event.playerId === this.youId && !this.reduceMotion) this.shake = 90
    }
    this.syncActors(snap.players)
    this.paintMarks(snap.marks ?? [])
  }

  private syncActors(players: PlayerSnap[]): void {
    const seen = new Set<string>()
    for (const player of players) {
      seen.add(player.id)
      let actor = this.actors.get(player.id)
      if (!actor) {
        const root = this.add.container(player.x, player.y)
        root.setDepth(10)
        const shadow = this.add.ellipse(PLAYER_W / 2, PLAYER_H - 2, 18, 5, 0x000000, 0.4)
        const aura = this.add.ellipse(PLAYER_W / 2, PLAYER_H / 2, PLAYER_W + 14, PLAYER_H + 10, 0xffe14a, 0.35)
        const sprite = this.add.image(PLAYER_W / 2, PLAYER_H, ensurePlaceholder(this)).setOrigin(0.5, 1)
        const label = this.add
          .text(PLAYER_W / 2, -20, player.name, {
            fontFamily: 'Outfit, sans-serif',
            fontSize: '12px',
            color: player.id === this.youId ? '#8cf0ff' : '#f4efe6',
            resolution: 2,
          })
          .setOrigin(0.5, 1)
        const pin = this.add
          .text(PLAYER_W / 2, -34, player.id === this.youId ? '▼' : '', {
            fontSize: '11px',
            color: '#8cf0ff',
            resolution: 2,
          })
          .setOrigin(0.5, 1)
        const bubble = this.add
          .text(PLAYER_W / 2, -48, '', {
            fontFamily: 'Outfit, sans-serif',
            fontSize: '13px',
            color: '#f4efe6',
            backgroundColor: '#141920',
            padding: { x: 6, y: 4 },
            align: 'center',
            wordWrap: { width: 120, useAdvancedWrap: true },
            resolution: 2,
          })
          .setOrigin(0.5, 1)
          .setVisible(false)
        root.add([aura, shadow, sprite, label, pin, bubble])
        this.world.add(root)
        actor = { root, sprite, label, pin, bubble, aura, look: '' }
        this.actors.set(player.id, actor)
      }
      this.applyLook(actor, player)
      const follow = player.id === this.youId ? 1 : 0.42
      actor.root.x += (player.x - actor.root.x) * follow
      actor.root.y += (player.y - actor.root.y) * follow
      actor.sprite.setFlipX(player.facing === -1)
      const shaman = player.role === 'shaman'
      actor.aura.setVisible(shaman && player.alive)
      actor.label.setColor(shaman ? '#ffe14a' : player.id === this.youId ? '#8cf0ff' : '#f4efe6')
      actor.pin.setText(shaman ? '✶' : player.id === this.youId ? '▼' : '')
      actor.pin.setColor(shaman ? '#ffe14a' : '#8cf0ff')
      actor.root.setAlpha(1)
      actor.root.setDepth(10 + player.y)
    }
    for (const [id, actor] of this.actors) {
      if (!seen.has(id)) {
        actor.root.destroy()
        this.actors.delete(id)
      }
    }
  }

  private placaTexture(c: number, r: number): string {
    const holds = (tile: number | undefined) => tile === Tile.Placa || tile === Tile.Trava
    if (!holds(this.tiles[r - 1]?.[c])) return 'tile-grass'
    if (!holds(this.tiles[r + 1]?.[c])) return 'tile-foot'
    return 'tile-dirt'
  }

  private repaintPlate(c: number, r: number): void {
    if (this.tiles[r]?.[c] !== Tile.Placa) return
    if (this.reforming.has(`${c},${r}`)) return
    this.paintCell(c, r, Tile.Placa, 'solid')
  }

  private applyLook(actor: Actor, player: PlayerSnap): void {
    const gear = roleGear(player.role)
    const pose = runnerPose(player)
    const frame = poseFrame(pose)
    const look = `${player.role}:${pose}:${frame}`
    if (actor.look === look) return
    const key = ensureCharacter(this, gear, pose, frame)
    if (!key) {
      actor.look = ''
      return
    }
    actor.look = look
    const size = alienDisplay(pose, frame)
    actor.sprite.setTexture(key)
    actor.sprite.setOrigin(0.5, 1)
    actor.sprite.setPosition(PLAYER_W / 2, PLAYER_H)
    actor.sprite.setDisplaySize(size.w, size.h)
  }

  private refreshPoses(): void {
    const players = bridge.snap?.players
    if (!players) return
    for (const player of players) {
      const actor = this.actors.get(player.id)
      if (!actor) continue
      this.applyLook(actor, player)
    }
  }

  private refreshSpeech(): void {
    const now = performance.now()
    for (const actor of this.actors.values()) {
      actor.bubble.setVisible(false)
    }
    for (const line of bridge.speech) {
      if (line.until < now) continue
      const actor = this.actors.get(line.playerId)
      if (!actor) continue
      actor.bubble.setText(clipBubble(line.text))
      actor.bubble.setVisible(true)
    }
  }

  private drawMarker(): void {
    if (!this.marker) return
    this.marker.clear()
    const snap = bridge.snap
    if (!snap) return
    const me = snap.players.find((player) => player.id === this.youId)
    if (!me?.alive || !this.tiles.length) return
    if (me.role === 'shaman' && (snap.phase === 'playing' || snap.phase === 'countdown')) this.drawReach(me)
    if (snap.phase !== 'playing') return
    const look = inspectDig(me, { width: this.width, height: this.height, tiles: this.tiles }, me.digCooldownMs, snap.phase)
    if (
      look.c !== undefined &&
      look.r !== undefined &&
      (look.status === 'ready' || look.status === 'cooldown' || look.status === 'unaligned')
    ) {
      const ready = look.status === 'ready'
      this.marker.lineStyle(2, ready ? 0xffb088 : 0x9aa6b5, ready ? 1 : 0.55)
      this.marker.strokeRect(look.c * TILE_SIZE + 6, look.r * TILE_SIZE + 6, TILE_SIZE - 12, TILE_SIZE - 12)
    }
    if (me.role !== 'shaman' || !bridge.selectedPower || !this.hover) return
    const reason = previewPower({
      tiles: this.tiles,
      holes: snap.holes ?? [],
      marks: snap.marks ?? [],
      exit: bridge.match?.exit ?? null,
      bodies: snap.players,
      caster: me,
      phase: snap.phase,
      power: bridge.selectedPower,
      c: this.hover.c,
      r: this.hover.r,
    })
    this.marker.lineStyle(2, reason ? 0xff3344 : 0x9dff6a, 0.95)
    this.marker.strokeRect(this.hover.c * TILE_SIZE + 3, this.hover.r * TILE_SIZE + 3, TILE_SIZE - 6, TILE_SIZE - 6)
  }

  private drawReach(me: PlayerSnap): void {
    const actor = this.actors.get(me.id)
    const x = (actor?.root.x ?? me.x) + PLAYER_W / 2
    const y = (actor?.root.y ?? me.y) + PLAYER_H / 2
    this.marker.fillStyle(0xffe14a, 0.08)
    this.marker.fillCircle(x, y, SHAMAN_POWER_RANGE)
    this.marker.lineStyle(2, 0xffe14a, 0.85)
    this.marker.strokeCircle(x, y, SHAMAN_POWER_RANGE)
  }

  private cellAt(pointer: Phaser.Input.Pointer): { c: number; r: number } | null {
    if (!this.world || !this.width) return null
    const local = this.world.getLocalPoint(pointer.x, pointer.y)
    const c = Math.floor(local.x / TILE_SIZE)
    const r = Math.floor(local.y / TILE_SIZE)
    if (c < 0 || r < 0 || c >= this.width || r >= this.height) return null
    return { c, r }
  }

  private paintMarks(marks: { c: number; r: number }[]): void {
    const next = new Set(marks.map((mark) => `${mark.c},${mark.r}`))
    for (const key of this.marked) {
      if (!next.has(key)) this.tileImages.get(key)?.clearTint()
    }
    this.marked = next
  }

  private pulseDoor(): void {
    if (!this.doorGlow) return
    const wave = Math.sin(this.time.now / 280)
    this.doorGlow.setAlpha(0.28 + wave * 0.14)
    this.doorGlow.setScale(1 + wave * 0.05)
  }

  private pulseMarks(): void {
    if (!this.marked.size) return
    const hot = 0.45 + 0.55 * Math.abs(Math.sin(this.time.now / 110))
    const tint = Phaser.Display.Color.GetColor(255, Math.floor(40 + 70 * hot), 48)
    for (const key of this.marked) this.tileImages.get(key)?.setTint(tint)
  }

  private burst(c: number, r: number, color: number): void {
    if (this.reduceMotion) return
    const x = c * TILE_SIZE + TILE_SIZE / 2
    const y = r * TILE_SIZE + TILE_SIZE / 2
    for (let i = 0; i < 7; i++) {
      this.bits.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 140,
        vy: -40 - Math.random() * 90,
        life: 280 + Math.random() * 160,
        color,
      })
    }
  }

  private stepBits(delta: number): void {
    if (!this.bitsGfx) return
    this.bitsGfx.clear()
    this.bits = this.bits.filter((bit) => bit.life > 0)
    for (const bit of this.bits) {
      bit.life -= delta
      bit.vy += 420 * (delta / 1000)
      bit.x += bit.vx * (delta / 1000)
      bit.y += bit.vy * (delta / 1000)
      this.bitsGfx.fillStyle(bit.color, Math.max(0, bit.life / 320))
      this.bitsGfx.fillRect(bit.x, bit.y, 3, 3)
    }
  }

  private pulseReform(): void {
    if (!this.reforming.size) return
    const alpha = 0.35 + Math.sin(this.time.now / 140) * 0.18
    for (const key of this.reforming) this.tileImages.get(key)?.setAlpha(alpha)
  }

  private actorAt(pointer: Phaser.Input.Pointer): string | null {
    if (!this.world) return null
    const point = this.world.getLocalPoint(pointer.x, pointer.y)
    let found: string | null = null
    for (const [id, actor] of this.actors) {
      const x = actor.root.x
      const y = actor.root.y
      if (point.x >= x && point.x <= x + PLAYER_W && point.y >= y - 18 && point.y <= y + PLAYER_H) found = id
    }
    return found
  }

  private layout(): void {
    if (!this.mapW || !this.world) return
    const z = Math.min(this.scale.width / this.mapW, this.scale.height / this.mapH)
    this.world.setScale(z)
    this.baseX = (this.scale.width - this.mapW * z) / 2
    this.baseY = (this.scale.height - this.mapH * z) / 2
    this.world.setPosition(this.baseX, this.baseY)
  }

  private applyShake(): void {
    if (!this.world || this.shake <= 0) return
    this.shake -= 16
    const mag = 2.2
    this.world.setPosition(this.baseX + (Math.random() - 0.5) * mag, this.baseY + (Math.random() - 0.5) * mag)
    if (this.shake <= 0) this.world.setPosition(this.baseX, this.baseY)
  }
}

function clipBubble(value: string): string {
  const clean = value.replace(/\s+/g, ' ').trim()
  if (clean.length <= BUBBLE_MAX_CHARS) return clean
  return `${clean.slice(0, BUBBLE_MAX_CHARS - 1)}…`
}
