import { characterById } from './characters.ts'

export const ESCAPE_COINS = 25

export type ItemSlot = 'visor' | 'shell' | 'lamp' | 'belt'

export interface ShopItem {
  id: string
  name: string
  blurb: string
  slot: ItemSlot
  price: number
  ink?: Record<string, string>
  marks?: { x: number; y: number; color: string }[]
}

export interface Wallet {
  coins: number
  owned: string[]
  equipped: string[]
}

/** Um corpo só. O que muda é o que está equipado. */
export const SHOP: ShopItem[] = [
  {
    id: 'visor-cobre',
    name: 'Viseira de cobre',
    blurb: 'Os olhos ficam da cor do tijolo.',
    slot: 'visor',
    price: 30,
    ink: { c: '#e4895a' },
  },
  {
    id: 'visor-musgo',
    name: 'Viseira de musgo',
    blurb: 'Os olhos ficam verdes.',
    slot: 'visor',
    price: 30,
    ink: { c: '#8fd06a' },
  },
  {
    id: 'casco-brasa',
    name: 'Casco de brasa',
    blurb: 'O corpo puxa para o cobre.',
    slot: 'shell',
    price: 50,
    ink: { b: '#8a3e28', d: '#3a2218' },
  },
  {
    id: 'casco-vinho',
    name: 'Casco de vinho',
    blurb: 'O corpo ganha um vinho escuro.',
    slot: 'shell',
    price: 50,
    ink: { b: '#6a3048', d: '#2a1420' },
  },
  {
    id: 'lanterna',
    name: 'Lanterna',
    blurb: 'Uma luz na antena.',
    slot: 'lamp',
    price: 80,
    marks: [
      { x: 5, y: 0, color: '#ffe14a' },
      { x: 4, y: 0, color: '#fff4d2' },
      { x: 6, y: 0, color: '#c9a227' },
    ],
  },
  {
    id: 'faixa',
    name: 'Faixa de ouro',
    blurb: 'A faixa do peito fica dourada.',
    slot: 'belt',
    price: 40,
    ink: { k: '#f0c14e' },
  },
]

export function itemById(id: string): ShopItem | null {
  return SHOP.find((item) => item.id === id) ?? null
}

/** O Shaman usa o casco de vinho. O restante fica no verde da folha. */
export function roleGear(role: string | null | undefined): string[] {
  return role === 'shaman' ? ['casco-vinho'] : []
}

export function appearanceKey(gear: string[]): string {
  return [...gear].sort().join('+') || 'base'
}

export function resolveLook(gear: string[]): { ink: Record<string, string>; marks: { x: number; y: number; color: string }[] } {
  const ink = { ...characterById('lume').ink }
  const marks: { x: number; y: number; color: string }[] = []
  for (const id of gear) {
    const item = itemById(id)
    if (!item) continue
    if (item.ink) Object.assign(ink, item.ink)
    if (item.marks) marks.push(...item.marks)
  }
  return { ink, marks }
}

/** Compra e já equipa, no lugar de outro item do mesmo encaixe. */
export function buyItem(wallet: Wallet, id: string): string | null {
  const item = itemById(id)
  if (!item) return 'Item desconhecido'
  if (wallet.owned.includes(id)) return 'Você já tem esse item'
  if (wallet.coins < item.price) return 'Moedas insuficientes'
  wallet.coins -= item.price
  wallet.owned.push(id)
  equipItem(wallet, id)
  return null
}

/** Equipa o item. Se ele já estiver equipado, tira. */
export function equipItem(wallet: Wallet, id: string): string | null {
  const item = itemById(id)
  if (!item) return 'Item desconhecido'
  if (!wallet.owned.includes(id)) return 'Você não tem esse item'
  const wearing = wallet.equipped.includes(id)
  wallet.equipped = wallet.equipped.filter((ownedId) => itemById(ownedId)?.slot !== item.slot)
  if (!wearing) wallet.equipped.push(id)
  return null
}
