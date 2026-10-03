import type { ServerMessage } from '@shared/protocol.ts'

export type LinkStatus = 'connecting' | 'open' | 'closed'
export type MatchPayload = Extract<ServerMessage, { action: 'MATCH' }>
export type SnapPayload = Extract<ServerMessage, { action: 'SNAP' }>

export interface SpeechLine {
  playerId: string
  text: string
  until: number
}

export const bridge: {
  youId: string
  hostId: string
  code: string
  status: LinkStatus
  match: MatchPayload | null
  snap: SnapPayload | null
  speech: SpeechLine[]
  castBlock: ((c: number, r: number) => void) | null
  selectedPower: string | null
} = {
  youId: '',
  hostId: '',
  code: '',
  status: 'connecting',
  match: null,
  snap: null,
  speech: [],
  castBlock: null,
  selectedPower: null,
}
