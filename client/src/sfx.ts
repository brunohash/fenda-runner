let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  try {
    if (!ctx) ctx = new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

export function unlockAudio(): void {
  audio()
}

function tone(freq: number, dur: number, type: OscillatorType, gain: number, slideTo?: number): void {
  const ac = audio()
  if (!ac) return
  const osc = ac.createOscillator()
  const amp = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, ac.currentTime)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), ac.currentTime + dur)
  amp.gain.setValueAtTime(gain, ac.currentTime)
  amp.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur)
  osc.connect(amp).connect(ac.destination)
  osc.start()
  osc.stop(ac.currentTime + dur + 0.02)
}

export function playDig(): void {
  tone(210, 0.12, 'triangle', 0.05, 70)
}

export function playDeny(): void {
  tone(140, 0.06, 'square', 0.02, 90)
}

export function playFall(): void {
  tone(320, 0.28, 'sine', 0.05, 60)
}

export function playGo(): void {
  tone(520, 0.08, 'square', 0.03)
  window.setTimeout(() => tone(680, 0.1, 'square', 0.03), 90)
}

export function playWin(): void {
  tone(523, 0.12, 'triangle', 0.04)
  window.setTimeout(() => tone(659, 0.12, 'triangle', 0.04), 110)
  window.setTimeout(() => tone(784, 0.2, 'triangle', 0.04), 220)
}
