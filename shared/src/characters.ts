export type RunnerPose = 'idle' | 'step' | 'climb' | 'hang' | 'fall'

export interface CharacterDef {
  id: string
  name: string
  blurb: string
  ink: Record<string, string>
  rows: string[]
  poses: Record<RunnerPose, string[]>
}

const idle = [
  '..ddddddd..',
  '.dcccccccd.',
  '.dcooocccd.',
  '.dcooocccd.',
  '..ddddddd..',
  '..bbbbbbb..',
  '.bbcccccbb.',
  '.bbcccccbb.',
  '.bbcccccbb.',
  '..bbkkbbb..',
  '..bbkkbbb..',
  '...b...b...',
  '...b...b...',
  '..bbb.bbb..',
]

const step = [
  '..ddddddd..',
  '.dcccccccd.',
  '.dcooocccd.',
  '.dcooocccd.',
  '..ddddddd..',
  '.bbbbbbbbb.',
  '.bbcccccbb.',
  '.bbcccccbb.',
  '..bbkkbbb..',
  '..b.kkbb...',
  '.bb....b...',
  'bb.........',
  'b..........',
  '..bb.......',
]

const climb = [
  '..ddddddd..',
  '.dcccccccd.',
  '.dcooocccd.',
  'b.dcoooccdb',
  'b.dddddddb.',
  'bbbbbbbbbbb',
  '.bbcccccbb.',
  '.bbcccccbb.',
  '..bbkkbbb..',
  '...bkk.b...',
  '...b...b...',
  '..bb...b...',
  '.bb....bb..',
  '...........',
]

const hang = [
  'b.ddddddd.b',
  'bdcccccccdb',
  '.dcooocccd.',
  '..ddddddd..',
  '...bbbbb...',
  '...bbbbb...',
  '...bbkbb...',
  '....b.b....',
  '....b.b....',
  '...bb.bb...',
  '...........',
  '...........',
  '...........',
  '...........',
]

const fall = [
  '..ddddddd..',
  '.dcccccccd.',
  'bdcooocccdb',
  '..ddddddd..',
  'b.bbbbbbb.b',
  '.bbcccccbb.',
  '..bbkkbbb..',
  '...b...b...',
  '..b.....b..',
  '.b.......b.',
  'bb.......bb',
  '...........',
  '...........',
  '...........',
]

/**
 * Um operador só. O visual muda pelos itens da loja, não por outro corpo.
 * O id `lume` continua na conta para as partidas já salvas.
 */
export const CHARACTERS: CharacterDef[] = [
  {
    id: 'lume',
    name: 'Operador',
    blurb: 'O corpo da galeria. Capacete, viseira e faixa mudam na loja.',
    ink: { o: '#f0c7a8', d: '#18202b', c: '#39c6ef', b: '#123044', k: '#0c1016' },
    rows: idle,
    poses: { idle, step, climb, hang, fall },
  },
]

export function characterById(id: string): CharacterDef {
  return CHARACTERS.find((item) => item.id === id) ?? CHARACTERS[0]
}

export function isCharacterId(id: string): boolean {
  return CHARACTERS.some((item) => item.id === id)
}

for (const character of CHARACTERS) {
  const frames = [character.rows, ...Object.values(character.poses)]
  for (const pose of frames) {
    const width = pose[0]?.length ?? 0
    if (pose.length !== 14 || !pose.every((row) => row.length === width)) {
      throw new Error(`Sprite irregular: ${character.id}`)
    }
  }
}

export function normalizeRoomName(input: string): string | null {
  const clean = input.trim().replace(/\s+/g, ' ').slice(0, 24)
  if (clean.length < 2) return null
  if (!/^[\p{L}\p{N}][\p{L}\p{N} _-]*$/u.test(clean)) return null
  return clean
}
