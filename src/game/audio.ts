type Names =
  | 'click' | 'place' | 'upgrade' | 'sell' | 'coin' | 'splat' | 'zap' | 'flame'
  | 'freeze' | 'chomp' | 'shoot' | 'shoot2' | 'wave' | 'boss' | 'win' | 'lose' | 'error'

const TEMPO_STEP = 0.26 // сек на шаг (16-е, ~115 BPM)

/** Аккордовая сетка: C — Am — F — G (I–vi–IV–V) */
const CHORDS: { bass: number; triad: [number, number, number] }[] = [
  { bass: 65.41, triad: [261.63, 329.63, 392.0] },   // C
  { bass: 55.0,  triad: [220.0, 261.63, 329.63] },   // Am
  { bass: 87.31, triad: [174.61, 220.0, 261.63] },   // F
  { bass: 98.0,  triad: [196.0, 246.94, 293.66] },   // G
]

/** Нежные «блестки» мелодии на пентатонике */
const SPARKLE = [329.63, 392.0, 440.0, 523.25, 587.33] // E4 G4 A4 C5 D5

export class Sfx {
  private ctx: AudioContext | null = null
  enabled = true
  musicOn = false

  private musicTimer: ReturnType<typeof setInterval> | null = null
  private nextNote = 0
  private stepIdx = 0
  private musicGain: GainNode | null = null
  private noiseBuf: AudioBuffer | null = null

  private ensure(): AudioContext | null {
    if (typeof window === 'undefined') return null
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!AC) return null
      this.ctx = new AC()
      this.musicGain = this.ctx.createGain()
      this.musicGain.gain.value = 0.9
      this.musicGain.connect(this.ctx.destination)
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

  /** Мягкий тон для музыки — через отдельный шину громкости */
  private mTone(freq: number, when: number, dur: number, vol: number, type: OscillatorType = 'sine') {
    const ctx = this.ctx
    if (!ctx || !this.musicGain) return
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0, when)
    gain.gain.linearRampToValueAtTime(vol, when + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, when + dur)
    osc.connect(gain).connect(this.musicGain)
    osc.start(when)
    osc.stop(when + dur + 0.03)
  }

  /** Шумовой «хэт» через highpass */
  private mHat(when: number, vol: number) {
    const ctx = this.ctx
    if (!ctx || !this.musicGain || !this.noiseBuf) return
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuf
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 7000
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(vol, when)
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.05)
    src.connect(hp).connect(gain).connect(this.musicGain)
    src.start(when)
    src.stop(when + 0.06)
  }

  // ---------- Фоновая музыка ----------
  setMusic(on: boolean) {
    this.musicOn = on
    if (on) this.startMusic()
    else this.stopMusic()
  }

  private startMusic() {
    const ctx = this.ensure()
    if (!ctx || this.musicTimer) return
    if (!this.noiseBuf) {
      const len = Math.floor(ctx.sampleRate * 0.4)
      const buf = ctx.createBuffer(1, len, ctx.sampleRate)
      const data = buf.getChannelData(0)
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
      this.noiseBuf = buf
    }
    this.nextNote = ctx.currentTime + 0.08
    this.musicTimer = setInterval(() => this.scheduleMusic(), 90)
    this.scheduleMusic()
  }

  private stopMusic() {
    if (this.musicTimer) {
      clearInterval(this.musicTimer)
      this.musicTimer = null
    }
  }

  private scheduleMusic() {
    const ctx = this.ctx
    if (!ctx || !this.musicOn) return
    while (this.nextNote < ctx.currentTime + 0.4) {
      this.playMusicStep(this.stepIdx, this.nextNote)
      this.stepIdx = (this.stepIdx + 1) % 64
      this.nextNote += TEMPO_STEP
    }
  }

  private playMusicStep(i: number, when: number) {
    const bar = Math.floor(i / 16)
    const pos = i % 16
    const chord = CHORDS[bar]

    // бас: на сильную и слабую долю
    if (pos === 0) this.mTone(chord.bass, when, 0.42, 0.05, 'sine')
    if (pos === 8) this.mTone(chord.bass * 1.5, when, 0.3, 0.04, 'sine')
    if (pos === 11) this.mTone(chord.bass * 1.19, when, 0.18, 0.03, 'sine')

    // аккордовые «щипки» на офф-битах
    if (pos === 2 || pos === 6 || pos === 10 || pos === 14) {
      chord.triad.forEach((f, k) => this.mTone(f, when, 0.2, 0.022 - k * 0.004, 'triangle'))
    }

    // хэт на каждый чётный шаг
    if (pos % 2 === 0) this.mHat(when, pos % 4 === 0 ? 0.014 : 0.007)

    // мелодические брызги
    if (pos === 4 || pos === 12) {
      const note = SPARKLE[(bar * 2 + (pos === 12 ? 1 : 0) + (i % 7 === 0 ? 2 : 0)) % SPARKLE.length]
      this.mTone(note, when, 0.3, 0.026, 'sine')
    }
  }

  /** Шумовой всплеск (шлёп, огонь) через lowpass */
  private noise(t0: number, dur: number, vol: number, freq: number) {
    const ctx = this.ctx
    if (!ctx) return
    if (!this.noiseBuf) {
      const len = Math.floor(ctx.sampleRate * 0.4)
      const buf = ctx.createBuffer(1, len, ctx.sampleRate)
      const data = buf.getChannelData(0)
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
      this.noiseBuf = buf
    }
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuf
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = freq
    const gain = ctx.createGain()
    const start = ctx.currentTime + t0
    gain.gain.setValueAtTime(vol, start)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur)
    src.connect(lp).connect(gain).connect(ctx.destination)
    src.start(start)
    src.stop(start + dur + 0.02)
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
      case 'shoot':
        this.tone(620, 0, 0.05, 0.05, 'square')
        break
      case 'shoot2':
        this.tone(240, 0, 0.09, 0.07, 'sawtooth')
        this.tone(180, 0.03, 0.06, 0.05, 'sawtooth')
        break
      case 'splat':
        this.noise(0, 0.07, 0.09, 900)
        break
      case 'zap':
        this.tone(1100, 0, 0.05, 0.05, 'sawtooth')
        this.tone(700, 0.03, 0.07, 0.05, 'sawtooth')
        break
      case 'flame':
        this.noise(0, 0.18, 0.05, 500)
        break
      case 'freeze':
        this.tone(1400, 0, 0.06, 0.05, 'sine')
        this.tone(1900, 0.04, 0.08, 0.04, 'sine')
        break
      case 'chomp':
        this.tone(120, 0, 0.1, 0.16, 'square')
        this.tone(90, 0.1, 0.14, 0.16, 'square')
        this.tone(60, 0.2, 0.2, 0.14, 'sawtooth')
        break
      case 'boss':
        this.tone(98, 0, 0.3, 0.12, 'sawtooth')
        this.tone(98, 0.32, 0.3, 0.12, 'sawtooth')
        this.tone(78, 0.64, 0.5, 0.12, 'sawtooth')
        break
      case 'wave':
        this.tone(523, 0, 0.1, 0.1, 'triangle')
        this.tone(659, 0.1, 0.1, 0.1, 'triangle')
        this.tone(784, 0.2, 0.16, 0.1, 'triangle')
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
