// ---------- Типы FOODSTORATOR TD: вредная еда против здоровой кухни ----------

export type TowerId = 'broccoli' | 'carrot' | 'tomato' | 'berry' | 'blender' | 'chili'
export type EnemyId =
  | 'candy' | 'fries' | 'cupcake' | 'donut' | 'cola'
  | 'pizza' | 'burger' | 'choco' | 'cake'

export type Phase = 'menu' | 'build' | 'wave' | 'gameover' | 'victory'
export type AttackKind = 'shot' | 'lob' | 'chain' | 'flame'

export interface TowerLevel {
  dmg: number
  rate: number   // выстрелов/сек (для flame — не используется)
  range: number
  up: number     // стоимость улучшения ДО этого уровня (у levels[0] = 0)
}

export interface TowerDef {
  id: TowerId
  name: string
  tag: string
  desc: string
  kind: AttackKind
  cost: number
  color: string
  levels: [TowerLevel, TowerLevel, TowerLevel]
  splash?: number        // радиус сплэша (tomato)
  chains?: number        // цели цепочки (blender)
  slowFactor?: number    // множитель скорости (berry)
  slowDur?: number
  burn?: number          // урон/сек от поджога (chili)
  burnDur?: number
}

export interface EnemyDef {
  name: string
  hp: number
  speed: number   // px/сек
  bounty: number
  armor: number   // плоская броня
  r: number       // радиус
  tint: string    // основной цвет (частицы крошек)
}

export interface SpawnGroup {
  type: EnemyId
  count: number
  gap: number    // сек между врагами
  delay: number  // задержка старта группы
}

export interface WaveDef {
  name: string
  groups: SpawnGroup[]
}

export interface Enemy {
  id: number
  type: EnemyId
  hp: number
  maxHp: number
  dist: number
  x: number
  y: number
  ang: number
  bob: number
  slowT: number
  slowF: number
  burnT: number
  burnDps: number
  hitFlash: number
}

export interface Tower {
  id: number
  type: TowerId
  level: number      // 1..3
  cx: number
  cy: number
  x: number
  y: number
  cd: number
  ang: number
  invested: number
  fireAnim: number   // вспышка выстрела
  flameOn: number    // активность огнемёта (для звука/анимации)
}

export interface Projectile {
  id: number
  kind: 'pea' | 'spike' | 'ice' | 'tomato'
  x: number
  y: number
  vx: number
  vy: number
  targetId: number
  lx: number        // последняя известная цель
  ly: number
  dmg: number
  splash: number
  slowF: number
  slowDur: number
  // для лоб-снаряда (tomato)
  lobT: number
  lobTMax: number
  sx: number
  sy: number
  tx: number
  ty: number
  arcH: number
}

export interface Zap {
  id: number
  pts: { x: number; y: number }[]
  life: number
}

export type ParticleKind = 'crumb' | 'splat' | 'smoke' | 'spark' | 'frost' | 'tooth'

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

export interface SelInfo {
  id: number
  type: TowerId
  level: number
  invested: number
  dmg: number
  rate: number
  range: number
  upCost: number
  sell: number
  maxed: boolean
  dps: number
}

export interface HudState {
  phase: Phase
  money: number
  teeth: number
  maxTeeth: number
  waveIdx: number
  totalWaves: number
  alive: number
  remaining: number
  speed: number
  paused: boolean
  placing: TowerId | null
  selected: SelInfo | null
  waveName: string
  endless: boolean
}

export interface SaveData {
  sound: boolean
  bestWave: number
  wins: number
  runs: number
}
