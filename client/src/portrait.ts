import { characterById, type CharacterDef } from '@shared/characters.ts'

export function drawPortrait(canvas: HTMLCanvasElement, id: string, scale = 4): void {
  const def = characterById(id)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const width = def.rows[0]?.length ?? 0
  const height = def.rows.length
  canvas.width = width * scale
  canvas.height = height * scale
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.imageSmoothingEnabled = false
  paint(ctx, def, scale)
}

function paint(ctx: CanvasRenderingContext2D, def: CharacterDef, scale: number): void {
  def.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ink = def.ink[row[x] ?? '']
      if (!ink) continue
      ctx.fillStyle = ink
      ctx.fillRect(x * scale, y * scale, scale, scale)
    }
  })
}
