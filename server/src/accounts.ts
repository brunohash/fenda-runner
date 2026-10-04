import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { sanitizeName } from '../../shared/src/protocol.ts'
import { buyItem, equipItem, itemById, type Wallet } from '../../shared/src/shop.ts'

export interface PublicUser extends Wallet {
  id: string
  nickname: string
  email: string
  characterId: string
}

export interface Career {
  rounds: number
  escapes: number
  wins: number
  falls: number
  shamanRounds: number
}

export type CareerField = keyof Career

interface StoredUser extends PublicUser {
  salt: string
  hash: string
  career: Career
}

const file = path.join(process.cwd(), 'server', 'data', 'users.json')
const sessions = new Map<string, string>()
let users: StoredUser[] = []

function load(): void {
  if (!existsSync(file)) return
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as StoredUser[]
    if (Array.isArray(parsed)) users = parsed.map((user) => normalize(user))
  } catch {
    users = []
  }
}

function save(): void {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(users, null, 2))
}

load()

function hashPassword(password: string, salt: string): Buffer {
  return scryptSync(password, salt, 32)
}

function normalize(user: StoredUser): StoredUser {
  const owned = Array.isArray(user.owned) ? user.owned.filter((id) => itemById(id)) : []
  const equipped = Array.isArray(user.equipped) ? user.equipped.filter((id) => owned.includes(id)) : []
  return {
    ...user,
    characterId: 'lume',
    coins: typeof user.coins === 'number' && user.coins >= 0 ? Math.floor(user.coins) : 0,
    owned,
    equipped,
    career: readCareer(user.career),
  }
}

function publicUser(user: StoredUser): PublicUser {
  const ready = normalize(user)
  return {
    id: ready.id,
    nickname: ready.nickname,
    email: ready.email,
    characterId: ready.characterId,
    coins: ready.coins,
    owned: [...ready.owned],
    equipped: [...ready.equipped],
  }
}

export function registerAccount(nickname: string, email: string, password: string): { token: string; user: PublicUser } | { error: string } {
  const name = sanitizeName(nickname, '')
  const mail = email.trim().toLowerCase()
  if (name.length < 2) return { error: 'O apelido precisa de pelo menos 2 letras' }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return { error: 'E-mail inválido' }
  if (password.length < 6) return { error: 'A senha precisa de pelo menos 6 caracteres' }
  if (users.some((user) => user.email === mail)) return { error: 'Este e-mail já está cadastrado' }
  if (users.some((user) => user.nickname.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))) {
    return { error: 'Este apelido já está em uso' }
  }
  const salt = randomBytes(16).toString('hex')
  const user: StoredUser = {
    id: randomBytes(8).toString('hex'),
    nickname: name,
    email: mail,
    characterId: 'lume',
    coins: 0,
    owned: [],
    equipped: [],
    career: blankCareer(),
    salt,
    hash: hashPassword(password, salt).toString('hex'),
  }
  users.push(user)
  save()
  return { token: openSession(user.id), user: publicUser(user) }
}

export function loginAccount(email: string, password: string): { token: string; user: PublicUser } | { error: string } {
  const mail = email.trim().toLowerCase()
  const user = users.find((item) => item.email === mail)
  if (!user) return { error: 'E-mail ou senha incorretos' }
  const actual = Buffer.from(user.hash, 'hex')
  const given = hashPassword(password, user.salt)
  if (actual.length !== given.length || !timingSafeEqual(actual, given)) return { error: 'E-mail ou senha incorretos' }
  return { token: openSession(user.id), user: publicUser(user) }
}

export function userFromToken(token: string): PublicUser | null {
  const id = sessions.get(token)
  const user = users.find((item) => item.id === id)
  return user ? publicUser(user) : null
}

export function buyForUser(userId: string, itemId: string): PublicUser | { error: string } {
  return changeWallet(userId, (wallet) => buyItem(wallet, itemId))
}

export function equipForUser(userId: string, itemId: string): PublicUser | { error: string } {
  return changeWallet(userId, (wallet) => equipItem(wallet, itemId))
}

export function grantCoins(userId: string, amount: number): PublicUser | null {
  const user = users.find((item) => item.id === userId)
  if (!user || amount <= 0) return user ? publicUser(user) : null
  const ready = normalize(user)
  ready.coins += amount
  Object.assign(user, ready)
  save()
  return publicUser(user)
}

export function recordCareer(notes: { userId: string; field: CareerField }[]): void {
  let dirty = false
  for (const note of notes) {
    const user = users.find((item) => item.id === note.userId)
    if (!user) continue
    const career = readCareer(user.career)
    career[note.field] += 1
    user.career = career
    dirty = true
  }
  if (dirty) save()
}

export function careerOf(userId: string): { nickname: string; coins: number; equipped: string[]; career: Career } | null {
  const user = users.find((item) => item.id === userId)
  if (!user) return null
  const ready = normalize(user)
  return { nickname: ready.nickname, coins: ready.coins, equipped: [...ready.equipped], career: ready.career }
}

function blankCareer(): Career {
  return { rounds: 0, escapes: 0, wins: 0, falls: 0, shamanRounds: 0 }
}

function readCareer(value: unknown): Career {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const num = (key: CareerField) => (typeof raw[key] === 'number' && (raw[key] as number) >= 0 ? Math.floor(raw[key] as number) : 0)
  return {
    rounds: num('rounds'),
    escapes: num('escapes'),
    wins: num('wins'),
    falls: num('falls'),
    shamanRounds: num('shamanRounds'),
  }
}

function changeWallet(userId: string, apply: (wallet: Wallet) => string | null): PublicUser | { error: string } {
  const user = users.find((item) => item.id === userId)
  if (!user) return { error: 'Conta não encontrada' }
  const wallet = normalize(user)
  const error = apply(wallet)
  if (error) return { error }
  user.coins = wallet.coins
  user.owned = wallet.owned
  user.equipped = wallet.equipped
  user.characterId = 'lume'
  save()
  return publicUser(user)
}

export function closeSession(token: string): void {
  sessions.delete(token)
}

function openSession(userId: string): string {
  const token = randomBytes(24).toString('hex')
  sessions.set(token, userId)
  return token
}
