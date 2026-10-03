import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { isCharacterId } from '../../shared/src/characters.ts'
import { sanitizeName } from '../../shared/src/protocol.ts'

export interface PublicUser {
  id: string
  nickname: string
  email: string
  characterId: string
}

interface StoredUser extends PublicUser {
  salt: string
  hash: string
}

const file = path.join(process.cwd(), 'server', 'data', 'users.json')
const sessions = new Map<string, string>()
let users: StoredUser[] = []

function load(): void {
  if (!existsSync(file)) return
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as StoredUser[]
    if (Array.isArray(parsed)) users = parsed
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

function publicUser(user: StoredUser): PublicUser {
  return { id: user.id, nickname: user.nickname, email: user.email, characterId: user.characterId }
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

export function setCharacter(userId: string, characterId: string): PublicUser | { error: string } {
  if (!isCharacterId(characterId)) return { error: 'Personagem desconhecido' }
  const user = users.find((item) => item.id === userId)
  if (!user) return { error: 'Conta não encontrada' }
  user.characterId = characterId
  save()
  return publicUser(user)
}

function openSession(userId: string): string {
  const token = randomBytes(24).toString('hex')
  sessions.set(token, userId)
  return token
}
