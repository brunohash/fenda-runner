import Phaser from 'phaser'
import { characterById } from '@shared/characters.ts'
import { PLAYER_H, PLAYER_W, TILE_SIZE } from '@shared/config.ts'

const S = 2

const SKINS = [
  { id: 'copper', mortar: 0x24140e, brick: 0xc56a3a, light: 0xf2b48c, dark: 0x6d341c, risk: 0xb24b34, riskLight: 0xf09978, riskDark: 0x5e2416 },
  { id: 'ash', mortar: 0x161a20, brick: 0x8b93a3, light: 0xd5dbe6, dark: 0x4a5260, risk: 0x9a5a48, riskLight: 0xe0b0a0, riskDark: 0x5a3028 },
  { id: 'moss', mortar: 0x121910, brick: 0x6d8f5c, light: 0xc6e0a8, dark: 0x314828, risk: 0x8f5a32, riskLight: 0xe0b080, riskDark: 0x4a2c16 },
  { id: 'wine', mortar: 0x1c1016, brick: 0xa85b6c, light: 0xf0c0c8, dark: 0x5e2c38, risk: 0xc45a3a, riskLight: 0xf0b090, riskDark: 0x6a2a1c },
]

export function ensureTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists('brick-copper')) return
  for (const skin of SKINS) {
    paintBrick(scene, `brick-${skin.id}`, skin.mortar, skin.brick, skin.light, skin.dark)
    paintBrick(scene, `brick-${skin.id}-risco`, skin.mortar, skin.risk, skin.riskLight, skin.riskDark)
  }
  paintTrava(scene)
  paintLadder(scene)
  paintDoor(scene)
}

function gfx(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  return scene.make.graphics({}, false)
}

function paintBrick(scene: Phaser.Scene, key: string, mortar: number, fill: number, light: number, dark: number): void {
  const g = gfx(scene)
  const size = TILE_SIZE * S
  const gap = 2 * S
  g.fillStyle(mortar, 1)
  g.fillRect(0, 0, size, size)
  g.fillStyle(fill, 1)
  g.fillRect(gap, gap, size - gap * 2, size - gap * 2)
  g.fillStyle(light, 1)
  g.fillRect(gap, gap, size - gap * 2, 4 * S)
  g.fillRect(gap, gap, 3 * S, size - gap * 2)
  g.fillStyle(dark, 1)
  g.fillRect(gap, size - gap - 4 * S, size - gap * 2, 4 * S)
  g.fillRect(size - gap - 3 * S, gap, 3 * S, size - gap * 2)
  g.generateTexture(key, size, size)
  g.destroy()
}

function paintTrava(scene: Phaser.Scene): void {
  const g = gfx(scene)
  const size = TILE_SIZE * S
  const gap = 2 * S
  g.fillStyle(0x141820, 1)
  g.fillRect(0, 0, size, size)
  g.fillStyle(0x3e4c5e, 1)
  g.fillRect(gap, gap, size - gap * 2, size - gap * 2)
  g.fillStyle(0x8ea0b4, 1)
  g.fillRect(gap, gap, size - gap * 2, 3 * S)
  g.fillStyle(0x24303c, 1)
  g.fillRect(gap, size - gap - 3 * S, size - gap * 2, 3 * S)
  g.fillStyle(0xd7fff6, 1)
  g.fillCircle(size / 2, size / 2, 2.2 * S)
  g.fillStyle(0x1a222c, 1)
  g.fillCircle(size / 2, size / 2, 1 * S)
  g.generateTexture('trava', size, size)
  g.destroy()
}

function paintDoor(scene: Phaser.Scene): void {
  const g = gfx(scene)
  const size = TILE_SIZE * S
  g.fillStyle(0x2a2118, 1)
  g.fillRect(6 * S, 2 * S, 36 * S, 44 * S)
  g.fillStyle(0x6a4328, 1)
  g.fillRect(8 * S, 4 * S, 32 * S, 40 * S)
  g.fillStyle(0xffe7a8, 0.95)
  g.fillRect(12 * S, 8 * S, 24 * S, 28 * S)
  g.fillStyle(0xfff4d2, 1)
  g.fillRect(18 * S, 12 * S, 12 * S, 16 * S)
  g.fillStyle(0xf0c14e, 1)
  g.fillCircle(34 * S, 26 * S, 2 * S)
  g.generateTexture('door', size, size)
  g.destroy()
}

function paintLadder(scene: Phaser.Scene): void {
  const g = gfx(scene)
  const size = TILE_SIZE * S
  g.fillStyle(0xf0c14e, 1)
  g.fillRect(14 * S, 0, 3 * S, size)
  g.fillRect(size - 17 * S, 0, 3 * S, size)
  g.fillStyle(0xffe3a1, 1)
  for (let i = 0; i < 4; i++) {
    const y = (6 + i * 12) * S
    g.fillRect(14 * S, y, size - 28 * S, 2.5 * S)
  }
  g.generateTexture('ladder', size, size)
  g.destroy()
}

export function drawPowerGlyph(canvas: HTMLCanvasElement, id: string): void {
  canvas.width = 32
  canvas.height = 32
  const g = canvas.getContext('2d')
  if (!g) return
  g.clearRect(0, 0, 32, 32)
  const px = (x: number, y: number, color: string, w = 1, h = 1) => {
    g.fillStyle = color
    g.fillRect(x * 2, y * 2, w * 2, h * 2)
  }
  const brick = id === 'fortify' ? '#3e4c5e' : '#c56a3a'
  const light = id === 'fortify' ? '#8ea0b4' : '#f2b48c'
  const dark = id === 'fortify' ? '#24303c' : '#6d341c'
  for (let y = 3; y <= 12; y++) for (let x = 3; x <= 12; x++) px(x, y, brick)
  for (let x = 3; x <= 12; x++) px(x, 3, light)
  for (let y = 3; y <= 12; y++) px(12, y, dark)
  if (id === 'block') {
    px(6, 6, '#2a140e')
    px(7, 7, '#2a140e')
    px(8, 8, '#2a140e')
    px(9, 9, '#2a140e')
    px(8, 6, '#ffe14a')
    px(9, 5, '#fff4d2')
  } else if (id === 'restore') {
    for (let y = 6; y <= 9; y++) px(7, y, '#d7ffe6')
    for (let x = 6; x <= 9; x++) px(x, 7, '#d7ffe6')
  } else {
    px(7, 7, '#d7fff6')
    px(8, 7, '#d7fff6')
    px(7, 8, '#1a222c')
    px(8, 8, '#1a222c')
  }
}

export function ensureCharacter(scene: Phaser.Scene, id: string): string {
  const def = characterById(id)
  const key = `char-${def.id}`
  if (scene.textures.exists(key)) return key
  const g = gfx(scene)
  const scale = 4
  const width = def.rows[0].length * scale
  const height = def.rows.length * scale
  def.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ink = def.ink[row[x] ?? '']
      if (!ink) continue
      g.fillStyle(Phaser.Display.Color.HexStringToColor(ink).color, 1)
      g.fillRect(x * scale, y * scale, scale, scale)
    }
  })
  g.generateTexture(key, width, height)
  g.destroy()
  return key
}

export function ensureRunner(scene: Phaser.Scene, color: string, variant: number): string {
  const key = `runner-${color.replace('#', '')}-${variant}`
  if (scene.textures.exists(key)) return key
  const g = gfx(scene)
  const w = PLAYER_W * S
  const h = PLAYER_H * S
  const fill = Phaser.Display.Color.HexStringToColor(color).color
  g.fillStyle(0x14120f, 1)
  g.fillRoundedRect(0, 4 * S, w, h - 4 * S, 7 * S)
  g.fillStyle(fill, 1)
  g.fillRoundedRect(S, 5 * S, w - 2 * S, h - 6 * S, 6 * S)
  g.fillStyle(0x14120f, 0.95)
  g.fillRoundedRect(w - 9 * S, 12 * S, 6 * S, 4 * S, 1.5 * S)
  g.fillStyle(0x14120f, 1)
  g.fillRect(4 * S, h - 6 * S, 6 * S, 4 * S)
  g.fillRect(w - 10 * S, h - 6 * S, 6 * S, 4 * S)
  drawHat(g, variant, w, fill)
  g.generateTexture(key, w, h)
  g.destroy()
  return key
}

function drawHat(g: Phaser.GameObjects.Graphics, variant: number, w: number, fill: number): void {
  g.fillStyle(0x14120f, 1)
  const mid = w / 2
  switch (variant % 10) {
    case 1:
      g.fillRect(4 * S, 7 * S, w - 8 * S, 3 * S)
      break
    case 2:
      g.fillRect(mid - S, 0, 2 * S, 8 * S)
      g.fillCircle(mid, 0.5 * S, 2 * S)
      break
    case 3:
      g.fillTriangle(mid, 0, mid - 7 * S, 8 * S, mid + 7 * S, 8 * S)
      break
    case 4:
      g.fillStyle(fill, 1)
      g.fillCircle(mid - 6 * S, 8 * S, 2 * S)
      g.fillCircle(mid + 6 * S, 8 * S, 2 * S)
      break
    case 5:
      g.fillRect(mid - 8 * S, 2 * S, 16 * S, 4 * S)
      break
    case 6:
      g.lineStyle(2 * S, 0x14120f, 1)
      g.beginPath()
      g.arc(mid, 10 * S, 8 * S, Math.PI, 0, false)
      g.strokePath()
      break
    case 7:
      g.fillRect(5 * S, 6 * S, w - 10 * S, 2 * S)
      g.fillRect(5 * S, 10 * S, w - 10 * S, 2 * S)
      break
    case 8:
      g.fillTriangle(mid, 1 * S, mid - 4 * S, 8 * S, mid + 4 * S, 8 * S)
      g.fillRect(mid - 4 * S, 8 * S, 8 * S, 2 * S)
      break
    case 9:
      g.fillRoundedRect(mid - 10 * S, 2 * S, 20 * S, 5 * S, 2 * S)
      break
    default:
      break
  }
}
