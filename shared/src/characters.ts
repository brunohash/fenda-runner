export interface CharacterDef {
  id: string
  name: string
  blurb: string
  ink: Record<string, string>
  rows: string[]
}

/**
 * Personagens originais do jogo, em pixel art própria.
 * O id é o que uma loja futura precisa guardar na conta.
 */
export const CHARACTERS: CharacterDef[] = [
  {
    id: 'lume',
    name: 'Lume',
    blurb: 'Capacete curto e viseira azul.',
    ink: { o: '#f0c7a8', d: '#18202b', c: '#39c6ef', b: '#123044', k: '#0c1016' },
    rows: [
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
    ],
  },
  {
    id: 'brasa',
    name: 'Brasa',
    blurb: 'Capuz redondo, cor de cobre.',
    ink: { o: '#f0c7a8', d: '#2a140e', c: '#e4895a', b: '#8a3e28', k: '#1a0c08' },
    rows: [
      '...ddddd...',
      '..dcccccd..',
      '.dcccooccd.',
      '.dccoooocd.',
      '.dcccooccd.',
      '..ddddddd..',
      '.ccccccccc.',
      '.ccccccccc.',
      '.ccckkkccc.',
      '..cckkkcc..',
      '..cckkkcc..',
      '...c...c...',
      '...c...c...',
      '..ccc.ccc..',
    ],
  },
  {
    id: 'nico',
    name: 'Nico',
    blurb: 'Antena no meio da cabeça.',
    ink: { o: '#f0c7a8', d: '#14210f', c: '#7dff6b', a: '#d8ff6a', b: '#245c32', k: '#0c140c' },
    rows: [
      '.....a.....',
      '.....d.....',
      '..ddddddd..',
      '.ddooooodd.',
      '.ddooooodd.',
      '.ddooooadd.',
      '..ddddddd..',
      '.bbbbbbbbb.',
      '.bbcccccbb.',
      '.bbckkkcbb.',
      '..bbkkkbb..',
      '...b...b...',
      '...b...b...',
      '..bbb.bbb..',
    ],
  },
  {
    id: 'voga',
    name: 'Voga',
    blurb: 'Boné largo e jaqueta ocre.',
    ink: { o: '#e8b898', d: '#2a2416', c: '#f0c14e', b: '#8a6a22', k: '#1c160c' },
    rows: [
      '.ddddddddd.',
      'ddddddddddd',
      '.ddooooodd.',
      '.ddooooodd.',
      '.ddooooodd.',
      '..ddddddd..',
      '..ccccccc..',
      '.ccccccccc.',
      '.ccckkkccc.',
      '..cckkkcc..',
      '..cckkkcc..',
      '...c...c...',
      '...b...b...',
      '..bbb.bbb..',
    ],
  },
  {
    id: 'iris',
    name: 'Iris',
    blurb: 'Dois coques e casaco violeta.',
    ink: { o: '#f0c7a8', d: '#24142c', c: '#c084fc', h: '#6b3d86', b: '#3a2458', k: '#140c18' },
    rows: [
      '.hh.....hh.',
      '.hhdddddhh.',
      '.ddddddddd.',
      '.ddooooodd.',
      '.ddooooodd.',
      '.ddooooodd.',
      '..ddddddd..',
      '.bbbbbbbbb.',
      '.bbcccccbb.',
      '.bbckkkcbb.',
      '..bbkkkbb..',
      '...b...b...',
      '...b...b...',
      '..ccc.ccc..',
    ],
  },
  {
    id: 'cabo',
    name: 'Cabo',
    blurb: 'Gola alta e faixa clara.',
    ink: { o: '#f0c7a8', d: '#10141c', c: '#d7e2ea', b: '#3d4c5c', k: '#1a2330' },
    rows: [
      '..ddddddd..',
      '.ddooooodd.',
      '.ddooooodd.',
      '.ddooooodd.',
      '.ddddddddd.',
      '..bbbbbbb..',
      '.bbbbbbbbb.',
      '.bbbcccbbb.',
      '.bbbcccbbb.',
      '..bbkkkbb..',
      '..bbkkkbb..',
      '...b...b...',
      '...k...k...',
      '..kkk.kkk..',
    ],
  },
]

export function characterById(id: string): CharacterDef {
  return CHARACTERS.find((item) => item.id === id) ?? CHARACTERS[0]
}

export function isCharacterId(id: string): boolean {
  return CHARACTERS.some((item) => item.id === id)
}

for (const character of CHARACTERS) {
  const width = character.rows[0]?.length ?? 0
  if (!character.rows.every((row) => row.length === width)) {
    throw new Error(`Sprite irregular: ${character.id}`)
  }
}

export function normalizeRoomName(input: string): string | null {
  const clean = input.trim().replace(/\s+/g, ' ').slice(0, 24)
  if (clean.length < 2) return null
  if (!/^[\p{L}\p{N}][\p{L}\p{N} _-]*$/u.test(clean)) return null
  return clean
}
