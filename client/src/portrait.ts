import { drawAlien, onAlienReady } from './alien.ts'

export function drawPortrait(canvas: HTMLCanvasElement, gear: string[] = [], scale = 3): void {
  const paint = (): void => {
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const width = 12 * scale
    const height = 22 * scale
    canvas.width = width
    canvas.height = height
    ctx.clearRect(0, 0, width, height)
    drawAlien(ctx, 'idle', 1, gear, 0, 0, width, height)
  }
  paint()
  onAlienReady(paint)
}
