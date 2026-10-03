const DIG_KEYS = new Set(['ArrowDown', 'KeyS', 'KeyX', 'KeyK'])
const held = new Set<string>()
let armed = false
let onDig: (() => void) | null = null
let onChange: (() => void) | null = null
let onCancel: (() => void) | null = null

export function bindInput(dig: () => void, change: () => void, cancel?: () => void): void {
  onDig = dig
  onChange = change
  onCancel = cancel ?? null
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', clear)
}

export function releaseKeys(): void {
  if (held.size === 0) return
  held.clear()
  if (armed) onChange?.()
}

export function setArmed(next: boolean): void {
  armed = next
  if (!armed) held.clear()
}

export function readInput(): { left: boolean; right: boolean; up: boolean; down: boolean } {
  return {
    left: held.has('ArrowLeft') || held.has('KeyA'),
    right: held.has('ArrowRight') || held.has('KeyD'),
    up: held.has('ArrowUp') || held.has('KeyW'),
    down: held.has('ArrowDown') || held.has('KeyS'),
  }
}

function onKeyDown(event: KeyboardEvent): void {
  if (!armed) return
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault()
  const was = held.has(event.code)
  held.add(event.code)
  if (!event.repeat && event.code === 'Escape') onCancel?.()
  if (!event.repeat && DIG_KEYS.has(event.code)) onDig?.()
  if (!was) onChange?.()
}

function onKeyUp(event: KeyboardEvent): void {
  if (!held.has(event.code)) return
  held.delete(event.code)
  if (armed) onChange?.()
}

function clear(): void {
  held.clear()
  if (armed) onChange?.()
}
