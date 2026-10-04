import { characterById } from '@shared/characters.ts'
import { resolveLook } from '@shared/shop.ts'

export function drawPortrait(canvas: HTMLCanvasElement, gear: string[] = [], scale = 3): void {
  const def = characterById('lume')
  const look = resolveLook(gear)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const width = def.rows[0]?.length ?? 0
  const height = def.rows.length
  canvas.width = width * scale
  canvas.height = height * scale
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.imageSmoothingEnabled = false
  def.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ink = look.ink[row[x] ?? '']
      if (!ink) continue
      ctx.fillStyle = ink
      ctx.fillRect(x * scale, y * scale, scale, scale)
    }
  })
  for (const mark of look.marks) {
    ctx.fillStyle = mark.color
    ctx.fillRect(mark.x * scale, mark.y * scale, scale, scale)
  }
}
