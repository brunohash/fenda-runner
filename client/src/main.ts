import { CHARACTERS } from '@shared/characters.ts'
import { CHAT_MAX_CHARS, SHAMAN_MAX_MANA } from '@shared/config.ts'
import { POWER_DEFS, previewPower } from '@shared/shaman.ts'
import { drawPowerGlyph } from './art.ts'
import type { ServerMessage } from '@shared/protocol.ts'
import { mountGame, refreshGame } from './game.ts'
import { bindInput, readInput, releaseKeys, setArmed } from './input.ts'
import { connectNet, type Net } from './net.ts'
import { drawPortrait } from './portrait.ts'
import { playDeny, playDig, playFall, playGo, playWin, unlockAudio } from './sfx.ts'
import { bridge } from './state.ts'

const TOKEN_KEY = 'fenda-token'
const ROOM_KEY = 'fenda-room'

const timer = document.querySelector<HTMLElement>('#timer')!
const levelName = document.querySelector<HTMLElement>('#level')!
const alive = document.querySelector<HTMLElement>('#alive')!
const roster = document.querySelector<HTMLElement>('#roster')!
const roomField = document.querySelector<HTMLElement>('#room-field')!
const roomInput = document.querySelector<HTMLInputElement>('#room-name')!
const castOpen = document.querySelector<HTMLButtonElement>('#cast-open')!
const status = document.querySelector<HTMLElement>('#status')!
const lobby = document.querySelector<HTMLElement>('#lobby')!
const desk = document.querySelector<HTMLElement>('#desk')!
const entering = document.querySelector<HTMLElement>('#entering')!
const nickField = document.querySelector<HTMLElement>('#nick-field')!
const confirmField = document.querySelector<HTMLElement>('#confirm-field')!
const nickname = document.querySelector<HTMLInputElement>('#nickname')!
const email = document.querySelector<HTMLInputElement>('#email')!
const password = document.querySelector<HTMLInputElement>('#password')!
const confirm = document.querySelector<HTMLInputElement>('#confirm')!
const authSubmit = document.querySelector<HTMLButtonElement>('#auth-submit')!
const showRegister = document.querySelector<HTMLButtonElement>('#show-register')!
const showLogin = document.querySelector<HTMLButtonElement>('#show-login')!
const errorBox = document.querySelector<HTMLElement>('#error')!
const announce = document.querySelector<HTMLElement>('#announce')!
const result = document.querySelector<HTMLElement>('#result')!
const resultKicker = document.querySelector<HTMLElement>('#result-kicker')!
const resultTitle = document.querySelector<HTMLElement>('#result-title')!
const resultNames = document.querySelector<HTMLElement>('#result-names')!
const again = document.querySelector<HTMLButtonElement>('#again')!
const feed = document.querySelector<HTMLElement>('#feed')!
const gate = document.querySelector<HTMLElement>('#gate')!
const shamanName = document.querySelector<HTMLElement>('#shaman-name')!
const powers = document.querySelector<HTMLElement>('#powers')!
const powerRow = document.querySelector<HTMLElement>('#power-row')!
const powerTip = document.querySelector<HTMLElement>('#power-tip')!
const manaFill = document.querySelector<HTMLElement>('#mana-fill')!
const manaLabel = document.querySelector<HTMLElement>('#mana-label')!
const notice = document.querySelector<HTMLElement>('#notice')!
const cast = document.querySelector<HTMLElement>('#cast')!
const chatLog = document.querySelector<HTMLElement>('#chat-log')!
const chatText = document.querySelector<HTMLInputElement>('#chat-text')!

const savedRoom = localStorage.getItem(ROOM_KEY)
if (savedRoom) roomInput.value = savedRoom

let net: Net
let registering = true
let profile: { nickname: string; email: string; characterId: string } | null = null
let wantCharacter = 'lume'
let pickedByUser = false
let lastPhase = ''
let valendoUntil = 0
let noticeUntil = 0
let shamanOutcome: { killerId: string | null; cause: 'killed' | 'self' | 'disconnect' } | null = null

buildCast(document.querySelector('#cast-grid')!)
buildCast(document.querySelector('#cast-live')!)
buildPowers()
setAuthMode(true)

showRegister.addEventListener('click', () => setAuthMode(true))
showLogin.addEventListener('click', () => setAuthMode(false))

desk.addEventListener('submit', (event) => {
  event.preventDefault()
  unlockAudio()
  clearError()
  if (registering) {
    if (password.value !== confirm.value) {
      showError('As senhas não coincidem')
      return
    }
    net.send({
      action: 'REGISTER',
      nickname: nickname.value,
      email: email.value,
      password: password.value,
    })
    return
  }
  net.send({ action: 'LOGIN', email: email.value, password: password.value })
})

roomInput.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return
  event.preventDefault()
  commitRoom()
  roomInput.blur()
})
roomInput.addEventListener('blur', () => commitRoom())

castOpen.addEventListener('click', () => {
  cast.hidden = false
})
document.querySelector('#cast-close')!.addEventListener('click', () => {
  cast.hidden = true
})

again.addEventListener('click', () => {
  unlockAudio()
  net.send({ action: 'START' })
})

document.querySelector('#chat')!.addEventListener('submit', (event) => {
  event.preventDefault()
  const text = chatText.value.trim().slice(0, CHAT_MAX_CHARS)
  if (!text || !bridge.youId) return
  net.send({ action: 'CHAT', text })
  chatText.value = ''
})

document.addEventListener('focusin', (event) => {
  const target = event.target
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) releaseKeys()
})

net = connectNet(onMessage, (link) => {
  bridge.status = link
  status.textContent = link === 'open' ? 'conectado' : link === 'connecting' ? 'conectando' : 'sem servidor'
  status.classList.toggle('bad', link !== 'open')
  if (link === 'closed') {
    bridge.youId = ''
    bridge.code = ''
    bridge.match = null
    bridge.snap = null
    render()
  }
  if (link === 'open') {
    const token = localStorage.getItem(TOKEN_KEY)
    if (token) net.send({ action: 'AUTH', token })
  }
})

bridge.castBlock = (c, r) => {
  const power = bridge.selectedPower
  const me = bridge.snap?.players.find((player) => player.id === bridge.youId)
  const snap = bridge.snap
  if (!power || !me || !snap || me.role !== 'shaman' || !me.alive || snap.phase !== 'playing') return
  const reason = previewPower({
    tiles: snap.grid,
    holes: snap.holes ?? [],
    marks: snap.marks ?? [],
    exit: bridge.match?.exit ?? null,
    caster: me,
    phase: snap.phase,
    power,
    c,
    r,
  })
  if (reason) {
    showNotice(reason)
    return
  }
  net.send({ action: 'POWER', power, c, r })
}

bindInput(
  () => net.send({ action: 'DIG' }),
  () => {
    if (!bridge.match) return
    net.send({ action: 'INPUT', ...readInput() })
  },
  () => {
    bridge.selectedPower = null
    paintPowers()
  },
)

window.setInterval(() => {
  const phase = bridge.snap?.phase
  if (!bridge.match || (phase !== 'playing' && phase !== 'countdown')) return
  net.send({ action: 'INPUT', ...readInput() })
}, 50)

mountGame()

function onMessage(message: ServerMessage): void {
  if (message.action === 'SESSION') {
    if (message.token) localStorage.setItem(TOKEN_KEY, message.token)
    profile = { nickname: message.nickname, email: message.email, characterId: message.characterId }
    clearError()
    if (!pickedByUser) wantCharacter = message.characterId
    if (wantCharacter !== message.characterId) {
      net.send({ action: 'CHARACTER', id: wantCharacter })
      render()
      return
    }
    wantCharacter = message.characterId
    paintPick()
    if (!bridge.youId) enterRoom()
  } else if (message.action === 'LOBBY') {
    bridge.hostId = message.hostId
    bridge.code = message.code
    if (document.activeElement !== roomInput) roomInput.value = message.code
    localStorage.setItem(ROOM_KEY, message.code)
    entering.textContent = `Você está em ${message.code}.`
  } else if (message.action === 'SAID') {
    bridge.speech = bridge.speech.filter((line) => line.until > performance.now())
    bridge.speech.push({ playerId: message.playerId, text: message.text, until: performance.now() + 4500 })
    pushChat(message.name, message.text)
  } else if (message.action === 'NOTICE') {
    showNotice(message.text)
  } else if (message.action === 'ERROR') {
    showError(message.message)
    if (message.message.includes('Sessão expirada')) localStorage.removeItem(TOKEN_KEY)
  } else if (message.action === 'BYE') {
    bridge.match = null
    bridge.snap = null
    bridge.youId = ''
    bridge.code = ''
  } else if (message.action === 'MATCH') {
    bridge.match = message
    bridge.youId = message.youId
    bridge.code = message.code
    lastPhase = ''
    shamanOutcome = null
    bridge.selectedPower = null
    clearFeed()
    refreshGame()
  } else if (message.action === 'SNAP') {
    if (bridge.match && message.serial !== bridge.match.serial) return
    const previous = lastPhase
    bridge.snap = message
    if (previous === 'countdown' && message.phase === 'playing') {
      valendoUntil = performance.now() + 700
      playGo()
    }
    if (previous !== 'finished' && message.phase === 'finished') {
      if (message.result && !message.result.tie && message.result.winnerIds[0] === bridge.youId) playWin()
    }
    lastPhase = message.phase
    for (const event of message.events) handleEvent(event)
  }
  render()
}

function enterRoom(): void {
  const room = roomInput.value.trim() || 'Galeria'
  roomInput.value = room
  net.send({ action: 'ENTER', room })
}

function commitRoom(): void {
  if (!profile) return
  const room = roomInput.value.trim()
  if (room.length < 2) return
  if (bridge.code && room.toLocaleLowerCase() === bridge.code.toLocaleLowerCase()) return
  enterRoom()
}

function handleEvent(event: Extract<ServerMessage, { action: 'SNAP' }>['events'][number]): void {
  if (event.type === 'escaped') {
    const name = bridge.snap?.players.find((player) => player.id === event.playerId)?.name ?? 'Alguém'
    pushFeed(`${name} saiu pela porta`)
    if (event.playerId === bridge.youId) playWin()
  }
  if (event.type === 'dug' && event.playerId === bridge.youId) playDig()
  if (event.type === 'rejected' && event.playerId === bridge.youId) playDeny()
  if (event.type === 'shaman-down') shamanOutcome = { killerId: event.killerId, cause: event.cause }
  if (event.type === 'death') {
    if (event.playerId === bridge.youId || event.cause === 'void') playFall()
    const name = bridge.snap?.players.find((player) => player.id === event.playerId)?.name ?? 'Alguém'
    const line =
      event.cause === 'buried'
        ? `${name} foi selado pelo painel`
        : event.cause === 'disconnect'
          ? `${name} saiu da partida`
          : `${name} caiu no abismo`
    pushFeed(line)
  }
}

function render(): void {
  const snap = bridge.snap
  const inMatch = !!bridge.match
  lobby.hidden = inMatch
  desk.hidden = !!profile
  entering.hidden = !profile || inMatch
  roomField.hidden = !profile
  castOpen.hidden = !profile
  chatText.disabled = !bridge.youId

  const phase = inMatch ? (snap?.phase ?? bridge.match?.phase ?? 'countdown') : ''
  setArmed(inMatch && (phase === 'playing' || phase === 'countdown') && document.activeElement !== chatText && document.activeElement !== roomInput)

  levelName.textContent = bridge.match?.mapName ?? ''
  const ms = snap?.timeLeftMs ?? bridge.match?.timeLeftMs ?? 180000
  timer.textContent = formatTime(ms)
  timer.classList.toggle('warn', inMatch && ms <= 30000)
  timer.classList.toggle('late', inMatch && ms <= 10000)

  if (!inMatch) {
    alive.textContent = profile ? 'sala' : 'conta'
    gate.hidden = true
    shamanName.hidden = true
    powers.hidden = true
    roster.replaceChildren()
    announce.hidden = true
    result.hidden = true
    return
  }

  const playersNow = snap?.players ?? bridge.match?.players ?? []
  const me = playersNow.find((player) => player.id === bridge.youId)
  const shaman = playersNow.find((player) => player.role === 'shaman')
  const left = playersNow.filter((player) => player.escaped).length
  gate.hidden = false
  gate.textContent = `${left}/${playersNow.length} saíram`
  shamanName.hidden = false
  shamanName.textContent = shaman ? `Shaman: ${shaman.name}` : 'Shaman'
  powers.hidden = me?.role !== 'shaman'
  if (me?.role === 'shaman') paintPowers(me.mana, me.powerCooldownMs)
  notice.hidden = performance.now() > noticeUntil

  const players = playersNow
  const living = players.filter((player) => player.alive).length
  alive.textContent = `${living} vivo${living === 1 ? '' : 's'}`
  roster.replaceChildren(
    ...players.map((player) => {
      const chip = document.createElement('span')
      chip.className = player.escaped ? 'chip out' : player.alive ? 'chip' : 'chip dead'
      chip.innerHTML = `<i style="background:${player.color}"></i>${escapeHtml(player.name)}`
      return chip
    }),
  )

  const showValendo = performance.now() < valendoUntil && phase === 'playing'
  if (phase === 'countdown') {
    announce.hidden = false
    announce.textContent = String(Math.max(1, Math.ceil((snap?.countdownMs ?? 3000) / 1000)))
  } else if (showValendo) {
    announce.hidden = false
    announce.textContent = 'VALENDO'
  } else {
    announce.hidden = true
  }

  if (phase === 'finished' && snap?.result) {
    const names = snap.result.winnerIds
      .map((id) => players.find((player) => player.id === id)?.name ?? id)
      .join(', ')
    result.hidden = false
    if (shamanOutcome?.cause === 'killed' && shamanOutcome.killerId) {
      const killer = players.find((player) => player.id === shamanOutcome?.killerId)?.name ?? 'Alguém'
      resultKicker.textContent = 'o shaman caiu'
      resultTitle.textContent = `${killer} derrubou o Shaman!`
      resultNames.textContent = `${killer} será o próximo Shaman.`
    } else if (shamanOutcome) {
      resultKicker.textContent = 'o shaman caiu'
      resultTitle.textContent = 'SEM UM RESPONSÁVEL'
      resultNames.textContent = 'O próximo Shaman será sorteado.'
    } else if (players.some((player) => snap.result?.winnerIds.includes(player.id) && player.escaped)) {
      resultKicker.textContent = 'a porta'
      resultTitle.textContent = snap.result.winnerIds.length === 1 ? `${names} saiu` : 'SAÍRAM'
      resultNames.textContent = names
    } else if (snap.result.winnerIds.length === 1 && !snap.result.tie) {
      resultKicker.textContent = snap.result.winnerIds[0] === bridge.youId ? 'você ficou de pé' : 'último de pé'
      resultTitle.textContent = names
    } else if (snap.result.winnerIds.length === 0) {
      resultKicker.textContent = 'fim da galeria'
      resultTitle.textContent = 'NINGUÉM FICOU DE PÉ'
    } else {
      resultKicker.textContent = 'o tempo acabou'
      resultTitle.textContent = 'EMPATE'
    }
    const leftByDoor = players.some((player) => snap.result?.winnerIds.includes(player.id) && player.escaped)
    if (!shamanOutcome && !leftByDoor) resultNames.textContent = snap.result.tie && names ? names : ''
    const livingShaman = players.find((player) => player.role === 'shaman' && player.alive)
    if (!shamanOutcome && !leftByDoor && livingShaman) resultNames.textContent = `${livingShaman.name} continua como Shaman.`
    again.hidden = false
  } else {
    result.hidden = true
  }
}

function setAuthMode(next: boolean): void {
  registering = next
  nickField.hidden = !next
  confirmField.hidden = !next
  authSubmit.textContent = next ? 'Criar conta e entrar' : 'Entrar'
  showRegister.classList.toggle('on', next)
  showLogin.classList.toggle('on', !next)
  password.autocomplete = next ? 'new-password' : 'current-password'
}

function buildCast(root: HTMLElement): void {
  root.replaceChildren(
    ...CHARACTERS.map((character) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'cast-card-btn'
      button.dataset.id = character.id
      const canvas = document.createElement('canvas')
      drawPortrait(canvas, character.id, 4)
      const name = document.createElement('span')
      name.textContent = character.name
      const blurb = document.createElement('small')
      blurb.textContent = character.blurb
      button.append(canvas, name, blurb)
      button.addEventListener('click', () => chooseCharacter(character.id))
      return button
    }),
  )
}

function chooseCharacter(id: string): void {
  pickedByUser = true
  wantCharacter = id
  paintPick()
  cast.hidden = true
  if (profile && profile.characterId !== id) net.send({ action: 'CHARACTER', id })
}

function paintPick(): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>('.cast-card-btn')) {
    button.classList.toggle('on', button.dataset.id === wantCharacter)
  }
}

function buildPowers(): void {
  powerRow.replaceChildren(
    ...POWER_DEFS.map((def) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'power'
      button.dataset.power = def.id
      const canvas = document.createElement('canvas')
      drawPowerGlyph(canvas, def.id)
      const cd = document.createElement('span')
      cd.className = 'power-cd'
      button.append(canvas, cd)
      button.addEventListener('click', () => {
        if (button.disabled) return
        bridge.selectedPower = bridge.selectedPower === def.id ? null : def.id
        paintPowers()
      })
      button.addEventListener('mouseenter', () => {
        button.dataset.hot = '1'
        paintPowers()
      })
      button.addEventListener('mouseleave', () => {
        delete button.dataset.hot
        paintPowers()
      })
      return button
    }),
  )
}

function paintPowers(mana = 0, cooldowns?: { block: number; restore: number; fortify: number }): void {
  const me = bridge.snap?.players.find((player) => player.id === bridge.youId)
  const pool = mana || me?.mana || 0
  const cds = cooldowns ?? me?.powerCooldownMs
  const clamped = Math.max(0, Math.min(SHAMAN_MAX_MANA, pool))
  manaFill.style.width = `${(clamped / SHAMAN_MAX_MANA) * 100}%`
  manaLabel.textContent = `${clamped}/${SHAMAN_MAX_MANA}`
  let tip = 'Escolha um poder, depois clique no bloco. ESC cancela.'
  for (const button of powerRow.querySelectorAll<HTMLButtonElement>('.power')) {
    const def = POWER_DEFS.find((item) => item.id === button.dataset.power)
    if (!def) continue
    const left = cds?.[def.id as 'block' | 'restore' | 'fortify'] ?? 0
    const broke = pool < def.manaCost
    const cooling = left > 0
    button.disabled = broke || cooling
    button.classList.toggle('on', bridge.selectedPower === def.id)
    const label = button.querySelector('.power-cd')
    if (label) label.textContent = cooling ? `${(left / 1000).toFixed(1)}s` : ''
    button.title = broke
      ? `Mana insuficiente\nNecessário: ${def.manaCost}\nAtual: ${clamped}`
      : `${def.name}\n${def.summary}\nMana: ${def.manaCost}\nAtivação: ${(def.cooldownMs / 1000).toFixed(1)}s`
    if (button.dataset.hot === '1' || bridge.selectedPower === def.id) {
      tip = broke
        ? `Mana insuficiente. Necessário ${def.manaCost}, atual ${clamped}.`
        : `${def.name}. ${def.summary} Mana ${def.manaCost}.`
    }
  }
  powerTip.textContent = tip
}

function showNotice(text: string): void {
  notice.hidden = false
  notice.textContent = text
  noticeUntil = performance.now() + 1600
}

function showError(message: string): void {
  errorBox.hidden = false
  errorBox.textContent = message
  if (lobby.hidden) pushChat('sala', message)
}

function clearError(): void {
  errorBox.hidden = true
  errorBox.textContent = ''
}

function pushChat(name: string, text: string): void {
  const item = document.createElement('li')
  const who = document.createElement('b')
  who.textContent = name
  item.append(who, document.createTextNode(` ${text.slice(0, CHAT_MAX_CHARS)}`))
  chatLog.append(item)
  while (chatLog.children.length > 40) chatLog.firstElementChild?.remove()
  chatLog.scrollTop = chatLog.scrollHeight
}

function pushFeed(line: string): void {
  const item = document.createElement('li')
  item.textContent = line
  feed.prepend(item)
  while (feed.children.length > 4) feed.lastElementChild?.remove()
}

function clearFeed(): void {
  feed.replaceChildren()
}

function formatTime(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const min = Math.floor(total / 60)
  const sec = total % 60
  return `${min}:${sec.toString().padStart(2, '0')}`
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char)
}

window.setInterval(() => {
  if (performance.now() < valendoUntil || performance.now() < noticeUntil + 200) render()
}, 100)

paintPick()
render()
