import Phaser from 'phaser'
import { ArenaScene } from './scenes/ArenaScene.ts'

let game: Phaser.Game | null = null

export function mountGame(): Phaser.Game {
  if (game) return game
  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#10141b',
    banner: false,
    pixelArt: true,
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: 1280,
      height: 720,
    },
    scene: [ArenaScene],
    fps: { target: 60 },
    audio: { noAudio: true },
  })
  return game
}

export function refreshGame(): void {
  game?.scale.refresh()
}
