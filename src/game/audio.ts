type Names =
  | 'click' | 'place' | 'upgrade' | 'sell' | 'coin' | 'fail' | 'burn'
  | 'wave' | 'draft' | 'win' | 'lose' | 'error'

export class Sfx {
  private ctx: AudioContext | null = null
  enabled = true

  private ensure(): AudioContext | null {
    if (typeof window === 'undefined') return null
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!AC) return null
      this.ctx = new AC()
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  private tone(freq: number, t0: number, dur: number, vol: number, type: OscillatorType = 'sine') {
    const ctx = this.ctx
    if (!ctx) return
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.value = freq
    const start = ctx.currentTime + t0
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(vol, start + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur)
    osc.connect(gain).connect(ctx.destination)
    osc.start(start)
    osc.stop(start + dur + 0.02)
  }

  play(name: Names) {
    if (!this.enabled) return
    const ctx = this.ensure()
    if (!ctx) return
    switch (name) {
      case 'click': this.tone(700, 0, 0.06, 0.08, 'triangle'); break
      case 'place':
        this.tone(520, 0, 0.08, 0.1, 'triangle')
        this.tone(660, 0.07, 0.1, 0.1, 'triangle')
        break
      case 'upgrade':
        this.tone(660, 0, 0.08, 0.1, 'triangle')
        this.tone(880, 0.08, 0.12, 0.1, 'triangle')
        break
      case 'sell':
        this.tone(500, 0, 0.08, 0.09, 'sine')
        this.tone(380, 0.08, 0.1, 0.09, 'sine')
        break
      case 'coin':
        this.tone(880, 0, 0.07, 0.1, 'sine')
        this.tone(1318, 0.07, 0.14, 0.1, 'sine')
        break
      case 'fail':
        this.tone(320, 0, 0.12, 0.1, 'sawtooth')
        this.tone(220, 0.1, 0.16, 0.1, 'sawtooth')
        break
      case 'burn':
        this.tone(140, 0, 0.22, 0.12, 'sawtooth')
        this.tone(110, 0.08, 0.2, 0.1, 'square')
        break
      case 'wave':
        this.tone(523, 0, 0.1, 0.1, 'triangle')
        this.tone(659, 0.1, 0.1, 0.1, 'triangle')
        this.tone(784, 0.2, 0.16, 0.1, 'triangle')
        break
      case 'draft':
        this.tone(659, 0, 0.09, 0.09, 'sine')
        this.tone(523, 0.09, 0.12, 0.09, 'sine')
        break
      case 'win':
        this.tone(523, 0, 0.12, 0.12, 'triangle')
        this.tone(659, 0.12, 0.12, 0.12, 'triangle')
        this.tone(784, 0.24, 0.12, 0.12, 'triangle')
        this.tone(1046, 0.36, 0.3, 0.12, 'triangle')
        break
      case 'lose':
        this.tone(392, 0, 0.18, 0.11, 'sawtooth')
        this.tone(330, 0.18, 0.18, 0.11, 'sawtooth')
        this.tone(262, 0.36, 0.3, 0.11, 'sawtooth')
        break
      case 'error':
        this.tone(180, 0, 0.08, 0.1, 'square')
        this.tone(180, 0.1, 0.08, 0.1, 'square')
        break
    }
  }
}
