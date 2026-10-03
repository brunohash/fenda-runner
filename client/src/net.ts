import { WS_PORT } from '@shared/config.ts'
import { parseClientMessage, type ClientMessage, type ServerMessage } from '@shared/protocol.ts'

export interface Net {
  send(message: ClientMessage): void
  close(): void
}

export function connectNet(onMessage: (message: ServerMessage) => void, onStatus: (status: 'connecting' | 'open' | 'closed') => void): Net {
  let socket: WebSocket | null = null
  let generation = 0
  let stopped = false

  const open = () => {
    if (stopped) return
    const generationNow = ++generation
    onStatus('connecting')
    const host = location.hostname || 'localhost'
    const next = new WebSocket(`ws://${host}:${WS_PORT}`)
    socket = next
    next.addEventListener('open', () => {
      if (generationNow !== generation) return
      onStatus('open')
    })
    next.addEventListener('message', (event) => {
      if (generationNow !== generation) return
      let raw: unknown
      try {
        raw = JSON.parse(String(event.data))
      } catch {
        return
      }
      if (!raw || typeof raw !== 'object' || !('action' in raw)) return
      onMessage(raw as ServerMessage)
    })
    next.addEventListener('close', () => {
      if (generationNow !== generation) return
      onStatus('closed')
      window.setTimeout(open, 800)
    })
  }

  open()

  return {
    send(message) {
      const checked = parseClientMessage(message)
      if (!checked || !socket || socket.readyState !== WebSocket.OPEN) return
      socket.send(JSON.stringify(checked))
    },
    close() {
      stopped = true
      generation += 1
      socket?.close()
    },
  }
}
