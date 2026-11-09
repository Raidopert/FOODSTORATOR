export type StepType = 'chop' | 'fry' | 'season' | 'plate'
export type StationType = StepType | 'freeze'
export type Phase = 'menu' | 'howto' | 'build' | 'wave' | 'draft' | 'gameover' | 'victory'

export interface StepReq {
  type: StepType
  count: number
}

export interface RecipeDef {
  id: string
  name: string
  emoji: string
  price: number
  steps: StepReq[]
}

export interface StationDef {
  type: StationType
  name: string
  emoji: string
  cost: number
  cd: number
  range: number
  color: string
  border: string
  desc: string
}

export interface WaveStream {
  recipeId: string
  count: number
  interval: number
  delay: number
}

export interface WaveDef {
  name: string
  streams: WaveStream[]
}

export interface Dish {
  id: number
  recipeId: string
  dist: number
  prog: Record<StepType, number>
  heat: number
  spoiled: boolean
  bob: number
  slowNow: boolean
}

export interface Station {
  id: number
  type: StationType
  level: number
  cx: number
  cy: number
  x: number
  y: number
  cd: number
  invested: number
  flash: number
}

export interface FloatText {
  id: number
  text: string
  x: number
  y: number
  life: number
  maxLife: number
  color: string
  size: number
}

export type ParticleKind = 'steam' | 'spark' | 'star' | 'smoke' | 'puff'

export interface Particle {
  id: number
  kind: ParticleKind
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  color: string
}

export interface DraftCard {
  id: string
  emoji: string
  title: string
  desc: string
  accent: string
}

export interface RunStats {
  perfect: number
  failed: number
  spoiled: number
  tips: number
}

export interface HudState {
  phase: Phase
  money: number
  rep: number
  waveIdx: number
  totalWaves: number
  alive: number
  remaining: number
  speed: number
  paused: boolean
  draft: DraftCard[]
  draftPicked: boolean
  selectedStationId: number | null
  selectedStation: { id: number; type: StationType; level: number; invested: number } | null
  placing: StationType | null
  freeStation: boolean
  nextWave: { emoji: string; count: number; steps: string }[]
  stats: RunStats
  preBoost: boolean
  lastWaveResult: 'win' | 'lose' | null
}

export interface SaveData {
  sound: boolean
  music: boolean
  bestWave: number
  wins: number
  runs: number
  bestTips: number
  seenHowTo: boolean
}
