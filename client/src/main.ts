import { CHAT_MAX_CHARS, DOOR_RUSH_MS, SHAMAN_MAX_MANA } from '@shared/config.ts'
import { POWER_DEFS, previewPower } from '@shared/shaman.ts'
import { roleGear } from '@shared/shop.ts'
import type { ServerMessage, WalletView } from '@shared/protocol.ts'
import { drawPowerGlyph } from './art.ts'
import { mountEditor } from './editor.ts'
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
const status = document.querySelector<HTMLElement>('#status')!
const profileOpen = document.querySelector<HTMLButtonElement>('#profile-open')!
const mapsOpen = document.querySelector<HTMLButtonElement>('#maps-open')!
const editorEl = document.querySelector<HTMLElement>('#editor')!
const profilePanel = document.querySelector<HTMLElement>('#profile')!
const profileFace = document.querySelector<HTMLCanvasElement>('#profile-face')!
const profileName = document.querySelector<HTMLElement>('#profile-name')!
const profileMail = document.querySelector<HTMLElement>('#profile-mail')!
const profileCoins = document.querySelector<HTMLElement>('#profile-coins')!
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
const resultWait = document.querySelector<HTMLElement>('#result-wait')!
const card = document.querySelector<HTMLElement>('#card')!
const cardFace = document.querySelector<HTMLCanvasElement>('#card-face')!
const cardRole = document.querySelector<HTMLElement>('#card-role')!
const cardName = document.querySelector<HTMLElement>('#card-name')!
const cardStats = document.querySelector<HTMLElement>('#card-stats')!
const feed = document.querySelector<HTMLElement>('#feed')!
const gate = document.querySelector<HTMLElement>('#gate')!
const shamanName = document.querySelector<HTMLElement>('#shaman-name')!
const powers = document.querySelector<HTMLElement>('#powers')!
const powerRow = document.querySelector<HTMLElement>('#power-row')!
const powerTip = document.querySelector<HTMLElement>('#power-tip')!
const manaFill = document.querySelector<HTMLElement>('#mana-fill')!
const manaLabel = document.querySelector<HTMLElement>('#mana-label')!
const notice = document.querySelector<HTMLElement>('#notice')!
const chatLog = document.querySelector<HTMLElement>('#chat-log')!
const chatText = document.querySelector<HTMLInputElement>('#chat-text')!
const coinsLabel = document.querySelector<HTMLElement>('#coins')!
const shopList = document.querySelector<HTMLElement>('#shop-list')!

const savedRoom = localStorage.getItem(ROOM_KEY)
if (savedRoom) roomInput.value = savedRoom

let net: Net
let registering = true
let profile: { nickname: string; email: string } | null = null
let wallet: WalletView = { coins: 0, owned: [], equipped: [] }
let loggingOut = false
let droppedToken = ''
let editing = false
let practicing = false
let pendingTest = false
let awaitingTest = false
let shownGear = ''
let lastPhase = ''
let valendoUntil = 0
let noticeUntil = 0
let shamanOutcome: { killerId: string | null; cause: 'killed' | 'self' | 'disconnect' } | null = null

buildShop()
buildPowers()
setAuthMode(true)

showRegister.addEventListener('click', () => setAuthMode(true))
showLogin.addEventListener('click', () => setAuthMode(false))

desk.addEventListener('submit', (event) => {
  event.preventDefault()
  unlockAudio()
  clearError()
  loggingOut = false
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

profileOpen.addEventListener('click', () => {
  releaseKeys()
  profilePanel.hidden = !profilePanel.hidden
  profileOpen.classList.toggle('on', !profilePanel.hidden)
})
document.querySelector('#profile-close')!.addEventListener('click', () => {
  profilePanel.hidden = true
  profileOpen.classList.remove('on')
})
document.querySelector('#logout')!.addEventListener('click', () => logout())

mapsOpen.addEventListener('click', () => {
  if (!profile) return
  editing = true
  practicing = false
  releaseKeys()
  profilePanel.hidden = true
  profileOpen.classList.remove('on')
  if (bridge.youId) net.send({ action: 'LEAVE' })
  net.send({ action: 'MAPS' })
  render()
})

const editor = mountEditor({
  save(draft) {
    pendingTest = false
    net.send({ action: 'SAVE_MAP', ...draft })
  },
  test(draft) {
    pendingTest = true
    net.send({ action: 'SAVE_MAP', ...draft })
  },
  close() {
    editing = false
    practicing = false
    pendingTest = false
    awaitingTest = false
    enterRoom()
    render()
  },
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
    bodies: snap.players,
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

bridge.inspect = (playerId) => {
  if (!bridge.match) return
  net.send({ action: 'INSPECT', playerId })
}

document.querySelector('#card-close')!.addEventListener('click', () => {
  card.hidden = true
})
card.addEventListener('click', (event) => {
  if (event.target === card) card.hidden = true
})

bindInput(
  () => net.send({ action: 'DIG' }),
  () => {
    if (!bridge.match) return
    net.send({ action: 'INPUT', ...readInput() })
  },
  () => {
    if (!card.hidden) {
      card.hidden = true
      return
    }
    bridge.selectedPower = null
    paintPowers()
    profilePanel.hidden = true
    profileOpen.classList.remove('on')
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
    if (loggingOut || message.token === droppedToken) return
    if (message.token) localStorage.setItem(TOKEN_KEY, message.token)
    profile = { nickname: message.nickname, email: message.email }
    applyWallet(message)
    clearError()
    if (!bridge.youId && !editing) enterRoom()
  } else if (message.action === 'WALLET') {
    applyWallet(message)
  } else if (message.action === 'LOBBY') {
    if (practicing || awaitingTest || editing) return
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
    if (awaitingTest || pendingTest) {
      awaitingTest = false
      pendingTest = false
    }
    showNotice(message.text)
  } else if (message.action === 'ERROR') {
    showError(message.message)
    if (message.message.includes('Sessão expirada')) localStorage.removeItem(TOKEN_KEY)
  } else if (message.action === 'BYE') {
    bridge.match = null
    bridge.snap = null
    bridge.youId = ''
    bridge.code = ''
  } else if (message.action === 'LOGGED_OUT') {
    loggingOut = false
    clearAccount()
  } else if (message.action === 'MAP_LIST') {
    editor.setMaps(message.maps)
  } else if (message.action === 'MAP_SAVED') {
    editor.saved(message.map)
    if (pendingTest) {
      pendingTest = false
      awaitingTest = true
      net.send({ action: 'TEST_MAP', id: message.map.id })
    }
  } else if (message.action === 'MAP_RESULT') {
    practicing = false
    awaitingTest = false
    pendingTest = false
    editing = true
    editor.mark(message.id, message.status)
    editor.banner(message.text)
    releaseKeys()
    if (bridge.youId) net.send({ action: 'LEAVE' })
  } else if (message.action === 'MATCH') {
    if (awaitingTest) {
      awaitingTest = false
      practicing = true
      editing = false
    }
    bridge.match = message
    bridge.snap = null
    bridge.youId = message.youId
    bridge.code = message.code
    lastPhase = ''
    shamanOutcome = null
    bridge.selectedPower = null
    card.hidden = true
    clearFeed()
    refreshGame()
  } else if (message.action === 'SNAP') {
    if (bridge.match && message.serial !== bridge.match.serial) return
    const previous = lastPhase
    const previousTime = bridge.snap?.timeLeftMs ?? bridge.match?.timeLeftMs ?? 0
    bridge.snap = message
    if (previousTime > DOOR_RUSH_MS && message.timeLeftMs <= DOOR_RUSH_MS && message.events.some((event) => event.type === 'escaped')) {
      pushFeed('30 segundos para a porta')
    }
    if (previous === 'countdown' && message.phase === 'playing') {
      valendoUntil = performance.now() + 700
      playGo()
    }
    if (previous !== 'finished' && message.phase === 'finished') {
      if (message.result && !message.result.tie && message.result.winnerIds[0] === bridge.youId) playWin()
    }
    lastPhase = message.phase
    for (const event of message.events) handleEvent(event)
  } else if (message.action === 'CARD') {
    paintCard(message)
  }
  render()
}

function enterRoom(): void {
  if (editing) return
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
  if (event.type === 'door-held' && event.playerId === bridge.youId) {
    showNotice('A porta abre quando não restar outro jogador.')
    playDeny()
  }
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
  lobby.hidden = inMatch || editing
  editorEl.hidden = !editing
  desk.hidden = !!profile
  entering.hidden = !profile || inMatch
  roomField.hidden = !profile
  chatText.disabled = !bridge.youId
  paintProfile()

  const phase = inMatch ? (snap?.phase ?? bridge.match?.phase ?? 'countdown') : ''
  setArmed(inMatch && !editing && (phase === 'playing' || phase === 'countdown') && document.activeElement !== chatText && document.activeElement !== roomInput)

  levelName.textContent = bridge.match?.mapName ?? ''
  const author = bridge.match?.authorName ?? ''
  if (inMatch && author) {
    const by = document.createElement('small')
    by.textContent = `por ${author}`
    levelName.append(by)
  }
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
    card.hidden = true
    if (editing) {
      timer.textContent = ''
      levelName.textContent = 'mapas'
    }
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
    announce.textContent = String(Math.max(1, Math.ceil((snap?.countdownMs ?? bridge.match?.countdownMs ?? 3000) / 1000)))
  } else if (showValendo) {
    announce.hidden = false
    announce.textContent = 'VALENDO'
  } else {
    announce.hidden = true
  }

  const leftByDoor = players.some((player) => snap?.result?.winnerIds.includes(player.id) && player.escaped)
  if (phase === 'finished' && snap?.result && !leftByDoor && !practicing && !editing) {
    const names = snap.result.winnerIds
      .map((id) => players.find((player) => player.id === id)?.name ?? id)
      .join(', ')
    result.hidden = false
    card.hidden = true
    profilePanel.hidden = true
    profileOpen.classList.remove('on')
    for (const button of result.querySelectorAll('button')) button.remove()
    if (shamanOutcome?.cause === 'killed' && shamanOutcome.killerId) {
      const killer = players.find((player) => player.id === shamanOutcome?.killerId)?.name ?? 'Alguém'
      resultKicker.textContent = 'o shaman caiu'
      resultTitle.textContent = `${killer} derrubou o Shaman!`
      resultNames.textContent = `${killer} será o próximo Shaman.`
    } else if (shamanOutcome) {
      resultKicker.textContent = 'o shaman caiu'
      resultTitle.textContent = 'SEM UM RESPONSÁVEL'
      resultNames.textContent = 'O próximo Shaman será sorteado.'
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
    if (!shamanOutcome) resultNames.textContent = snap.result.tie && names ? names : ''
    const livingShaman = players.find((player) => player.role === 'shaman' && player.alive)
    if (!shamanOutcome && livingShaman) resultNames.textContent = `${livingShaman.name} continua como Shaman.`
    const wait = snap?.restartInMs ?? 0
    resultWait.textContent = wait > 0 ? `A próxima rodada começa em ${Math.max(1, Math.ceil(wait / 1000))} s` : 'A próxima rodada começa para todos.'
  } else {
    result.hidden = true
  }
}

function paintCard(message: Extract<ServerMessage, { action: 'CARD' }>): void {
  card.hidden = false
  cardRole.textContent = message.role === 'shaman' ? 'shaman' : 'operador'
  cardName.textContent = message.name
  const rows: [string, number][] = [
    ['Partidas', message.rounds],
    ['Saídas pela porta', message.escapes],
    ['Vitórias', message.wins],
    ['Quedas', message.falls],
    ['Vezes como Shaman', message.shamanRounds],
    ['Moedas', message.coins],
  ]
  cardStats.replaceChildren(
    ...rows.map(([label, value]) => {
      const item = document.createElement('li')
      const name = document.createElement('span')
      name.textContent = label
      const count = document.createElement('b')
      count.textContent = String(value)
      item.append(name, count)
      return item
    }),
  )
  drawPortrait(cardFace, roleGear(message.role), 4)
}

function paintProfile(): void {
  profileOpen.hidden = !profile
  mapsOpen.hidden = !profile
  mapsOpen.classList.toggle('on', editing)
  profileOpen.textContent = profile?.nickname ?? 'perfil'
  profileOpen.classList.toggle('on', !!profile && !profilePanel.hidden)
  if (!profile) {
    profilePanel.hidden = true
    return
  }
  profileName.textContent = profile.nickname
  profileMail.textContent = profile.email
  profileCoins.textContent = `${wallet.coins} moeda${wallet.coins === 1 ? '' : 's'}`
  if (shownGear !== 'base') {
    shownGear = 'base'
    drawPortrait(profileFace, [], 4)
  }
}

function logout(): void {
  droppedToken = localStorage.getItem(TOKEN_KEY) ?? droppedToken
  loggingOut = true
  localStorage.removeItem(TOKEN_KEY)
  releaseKeys()
  net.send({ action: 'LOGOUT' })
  clearAccount()
}

function clearAccount(): void {
  profile = null
  wallet = { coins: 0, owned: [], equipped: [] }
  shownGear = ''
  editing = false
  practicing = false
  pendingTest = false
  awaitingTest = false
  bridge.youId = ''
  bridge.hostId = ''
  bridge.match = null
  bridge.snap = null
  bridge.code = ''
  bridge.selectedPower = null
  password.value = ''
  confirm.value = ''
  profilePanel.hidden = true
  profileOpen.classList.remove('on')
  chatLog.replaceChildren()
  paintShop()
  render()
}

function applyWallet(next: WalletView): void {
  wallet = { coins: next.coins, owned: [...next.owned], equipped: [...next.equipped] }
  paintShop()
}

function buildShop(): void {
  shopList.replaceChildren()
  paintShop()
}

function paintShop(): void {
  coinsLabel.textContent = `${wallet.coins} moeda${wallet.coins === 1 ? '' : 's'}`
  shopList.replaceChildren()
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

function paintPowers(mana = 0, cooldowns?: { block: number; restore: number; fortify: number; ladder: number; bar: number }): void {
  const me = bridge.snap?.players.find((player) => player.id === bridge.youId)
  const pool = mana || me?.mana || 0
  const cds = cooldowns ?? me?.powerCooldownMs
  const clamped = Math.max(0, Math.min(SHAMAN_MAX_MANA, pool))
  manaFill.style.width = `${(clamped / SHAMAN_MAX_MANA) * 100}%`
  manaLabel.textContent = `${clamped}/${SHAMAN_MAX_MANA}`
  let tip = 'Escolha um poder, depois clique dentro do círculo. ESC cancela.'
  for (const button of powerRow.querySelectorAll<HTMLButtonElement>('.power')) {
    const def = POWER_DEFS.find((item) => item.id === button.dataset.power)
    if (!def) continue
    const left = cds?.[def.id as 'block' | 'restore' | 'fortify' | 'ladder' | 'bar'] ?? 0
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

render()
