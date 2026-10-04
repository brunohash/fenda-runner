/** Quadros recortados de client/public/alien.png. Gerado a partir da folha do operador. */
export const ALIEN_CELL_W = 84
export const ALIEN_CELL_H = 88
export const ALIEN_FRAMES = [{"w":34,"h":66},{"w":36,"h":68},{"w":36,"h":68},{"w":30,"h":67},{"w":31,"h":68},{"w":34,"h":65},{"w":29,"h":67},{"w":31,"h":66},{"w":34,"h":65},{"w":42,"h":67},{"w":37,"h":70},{"w":41,"h":70},{"w":51,"h":58},{"w":63,"h":32}] as { w: number; h: number }[]

export const ALIEN_POSE_FRAMES = {
  idle: [0, 1, 2],
  step: [3, 4, 5, 6, 7, 8],
  fall: [9, 10, 11],
  climb: [9, 10, 11],
  hang: [12],
  dead: [13],
} as const
