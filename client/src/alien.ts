import type { RunnerPose } from '@shared/characters.ts'
import { itemById } from '@shared/shop.ts'
import { ALIEN_CELL_H, ALIEN_CELL_W, ALIEN_FRAMES, ALIEN_POSE_FRAMES } from './alien-atlas.ts'

export type SpritePose = RunnerPose | 'dead'

const sheet = new Image()
let ready = false
const waiters: Array<() => void> = []
sheet.onload = () => {
  ready = true
  const pending = waiters.splice(0)
  for (const fn of pending) fn()
}
sheet.src = '/alien.png'

export function alienReady(): boolean {
  return ready
}

export function onAlienReady(fn: () => void): void {
  if (ready) fn()
  else waiters.push(fn)
}

export function alienFrameCount(pose: SpritePose): number {
  return ALIEN_POSE_FRAMES[pose].length
}

function frameSlot(pose: SpritePose, frame: number): number {
  const list = ALIEN_POSE_FRAMES[pose]
  return list[frame % list.length] ?? list[0]
}

export function alienDisplay(pose: SpritePose, frame: number): { w: number; h: number } {
  const content = ALIEN_FRAMES[frameSlot(pose, frame)] ?? { w: 36, h: 68 }
  const target = pose === 'dead' ? 20 : 44
  const scale = target / content.h
  return { w: ALIEN_CELL_W * scale, h: ALIEN_CELL_H * scale }
}

interface GearPaint {
  shell: string | null
  visor: string | null
  lamp: boolean
  belt: string | null
}

function gearPaint(gear: string[]): GearPaint {
  const paint: GearPaint = { shell: null, visor: null, lamp: false, belt: null }
  for (const id of gear) {
    const item = itemById(id)
    if (!item) continue
    if (item.slot === 'shell') paint.shell = item.ink?.b ?? null
    if (item.slot === 'visor') paint.visor = item.ink?.c ?? null
    if (item.slot === 'lamp') paint.lamp = true
    if (item.slot === 'belt') paint.belt = item.ink?.k ?? '#f0c14e'
  }
  return paint
}

function hex(color: string): [number, number, number] {
  const n = Number.parseInt(color.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const composed = new Map<string, HTMLCanvasElement>()

export function alienCanvas(pose: SpritePose, frame: number, gear: string[]): HTMLCanvasElement | null {
  if (!ready) return null
  const slot = frameSlot(pose, frame)
  const key = `${slot}:${[...gear].sort().join('+')}`
  const cached = composed.get(key)
  if (cached) return cached
  const canvas = document.createElement('canvas')
  canvas.width = ALIEN_CELL_W
  canvas.height = ALIEN_CELL_H
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(sheet, slot * ALIEN_CELL_W, 0, ALIEN_CELL_W, ALIEN_CELL_H, 0, 0, ALIEN_CELL_W, ALIEN_CELL_H)
  paintGear(ctx, gearPaint(gear))
  composed.set(key, canvas)
  return canvas
}

function paintGear(ctx: CanvasRenderingContext2D, gear: GearPaint): void {
  const image = ctx.getImageData(0, 0, ALIEN_CELL_W, ALIEN_CELL_H)
  const data = image.data
  let minY = ALIEN_CELL_H
  let maxY = 0
  let minX = ALIEN_CELL_W
  let maxX = 0
  for (let y = 0; y < ALIEN_CELL_H; y++) {
    for (let x = 0; x < ALIEN_CELL_W; x++) {
      const i = (y * ALIEN_CELL_W + x) * 4
      if (data[i + 3] < 20) continue
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      if (x < minX) minX = x
      if (x > maxX) maxX = x
    }
  }
  if (maxY <= minY) return
  const shell = gear.shell ? hex(gear.shell) : null
  const visor = gear.visor ? hex(gear.visor) : null
  const belt = gear.belt ? hex(gear.belt) : null
  const bodyH = maxY - minY
  const beltTop = minY + bodyH * 0.56
  const beltBot = minY + bodyH * 0.68
  for (let y = 0; y < ALIEN_CELL_H; y++) {
    for (let x = 0; x < ALIEN_CELL_W; x++) {
      const i = (y * ALIEN_CELL_W + x) * 4
      if (data[i + 3] < 200) continue
      const r = data[i] ?? 0
      const g = data[i + 1] ?? 0
      const b = data[i + 2] ?? 0
      if (shell && g > r + 8 && g > b && g > 70) {
        data[i] = Math.round(r * 0.35 + shell[0] * 0.65)
        data[i + 1] = Math.round(g * 0.35 + shell[1] * 0.65)
        data[i + 2] = Math.round(b * 0.35 + shell[2] * 0.65)
      }
      if (visor && r < 45 && g < 45 && b < 55 && y < minY + bodyH * 0.58) {
        data[i] = visor[0]
        data[i + 1] = visor[1]
        data[i + 2] = visor[2]
      }
      if (belt && y >= beltTop && y <= beltBot) {
        data[i] = Math.round((data[i] ?? 0) * 0.25 + belt[0] * 0.75)
        data[i + 1] = Math.round((data[i + 1] ?? 0) * 0.25 + belt[1] * 0.75)
        data[i + 2] = Math.round((data[i + 2] ?? 0) * 0.25 + belt[2] * 0.75)
      }
    }
  }
  ctx.putImageData(image, 0, 0)
  if (!gear.lamp) return
  let tipX = 0
  let tipN = 0
  for (let y = minY; y < minY + 8 && y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const i = (y * ALIEN_CELL_W + x) * 4
      if ((data[i + 3] ?? 0) < 200) continue
      tipX += x
      tipN += 1
    }
  }
  if (tipN === 0) return
  const cx = tipX / tipN
  ctx.fillStyle = '#ffe14a'
  ctx.beginPath()
  ctx.arc(cx, minY + 1, 3.2, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#fff4d2'
  ctx.beginPath()
  ctx.arc(cx, minY + 1, 1.6, 0, Math.PI * 2)
  ctx.fill()
}

export function drawAlien(
  ctx: CanvasRenderingContext2D,
  pose: SpritePose,
  frame: number,
  gear: string[],
  dx: number,
  dy: number,
  dw: number,
  dh: number,
): boolean {
  const canvas = alienCanvas(pose, frame, gear)
  if (!canvas) return false
  const slot = frameSlot(pose, frame)
  const content = ALIEN_FRAMES[slot] ?? { w: ALIEN_CELL_W, h: ALIEN_CELL_H }
  const sx = Math.floor((ALIEN_CELL_W - content.w) / 2)
  const sy = ALIEN_CELL_H - 2 - content.h
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(canvas, sx, sy, content.w, content.h, dx, dy, dw, dh)
  return true
}
