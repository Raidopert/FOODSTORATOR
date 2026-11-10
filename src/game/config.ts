import type { EnemyDef, EnemyId, TowerDef, TowerId, WaveDef } from './types'

// ---------- Мир (внутреннее разрешение игры) ----------
export const W = 960
export const H = 600
export const CELL = 40
export const COLS = W / CELL // 24
export const ROWS = H / CELL // 15

// ---------- Путь вредной еды: с левого края — в огромный рот справа ----------
export const PATH: { x: number; y: number }[] = [
  { x: -40, y: 300 },
  { x: 120, y: 300 },
  { x: 120, y: 110 },
  { x: 400, y: 110 },
  { x: 400, y: 470 },
  { x: 620, y: 470 },
  { x: 620, y: 150 },
  { x: 830, y: 150 },
  { x: 830, y: 320 },
  { x: 876, y: 320 },
]

export const MOUTH = { x: 878, y: 320, r: 60 }

const SEG: { x: number; y: number; dx: number; dy: number; len: number; acc: number }[] = []
let ACC = 0
for (let i = 0; i < PATH.length - 1; i++) {
  const a = PATH[i]
  const b = PATH[i + 1]
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  SEG.push({ x: a.x, y: a.y, dx: dx / len, dy: dy / len, len, acc: ACC })
  ACC += len
}
export const PATH_LEN = ACC

/** Позиция на пути по пройденной дистанции */
export function pointAt(dist: number): { x: number; y: number; ang: number } {
  const d = Math.max(0, Math.min(PATH_LEN - 0.001, dist))
  for (let i = SEG.length - 1; i >= 0; i--) {
    const s = SEG[i]
    if (d >= s.acc) {
      const t = d - s.acc
      return { x: s.x + s.dx * t, y: s.y + s.dy * t, ang: Math.atan2(s.dy, s.dx) }
    }
  }
  return { x: PATH[0].x, y: PATH[0].y, ang: 0 }
}

function distToSegment(px: number, py: number, s: (typeof SEG)[number]): number {
  const t = Math.max(0, Math.min(s.len, (px - s.x) * s.dx + (py - s.y) * s.dy))
  const cx = s.x + s.dx * t
  const cy = s.y + s.dy * t
  return Math.hypot(px - cx, py - cy)
}

/** Клетки, занятые дорогой и ртом (строить нельзя) */
export const BLOCKED: Set<string> = (() => {
  const set = new Set<string>()
  for (let cxi = 0; cxi < COLS; cxi++) {
    for (let cyi = 0; cyi < ROWS; cyi++) {
      const px = cxi * CELL + CELL / 2
      const py = cyi * CELL + CELL / 2
      if (Math.hypot(px - MOUTH.x, py - MOUTH.y) < MOUTH.r + 26) {
        set.add(`${cxi},${cyi}`)
        continue
      }
      for (const s of SEG) {
        if (distToSegment(px, py, s) < 30) {
          set.add(`${cxi},${cyi}`)
          break
        }
      }
    }
  }
  return set
})()

// ---------- Башни: здоровая еда против вредной ----------
export const TOWERS: Record<TowerId, TowerDef> = {
  broccoli: {
    id: 'broccoli', name: 'Брокколи-пушка', tag: 'базовая', kind: 'shot',
    desc: 'Стреляет зелёными горошинами. Дёшево и надёжно.',
    cost: 50, color: '#4ade80',
    levels: [
      { dmg: 7, rate: 1.5, range: 100, up: 0 },
      { dmg: 12, rate: 1.65, range: 112, up: 45 },
      { dmg: 21, rate: 1.8, range: 124, up: 80 },
    ],
  },
  carrot: {
    id: 'carrot', name: 'Морковный снайпер', tag: 'дальний бой', kind: 'shot',
    desc: 'Огромная дальность, мощный урон. Бьёт самых жирных.',
    cost: 90, color: '#fb923c',
    levels: [
      { dmg: 26, rate: 0.55, range: 175, up: 0 },
      { dmg: 50, rate: 0.6, range: 195, up: 85 },
      { dmg: 92, rate: 0.66, range: 215, up: 150 },
    ],
  },
  tomato: {
    id: 'tomato', name: 'Томатный миномёт', tag: 'по площади', kind: 'lob',
    desc: 'Навесом кидает помидор — урон по всем вокруг места падения.',
    cost: 110, color: '#ef4444', splash: 55,
    levels: [
      { dmg: 13, rate: 0.62, range: 125, up: 0 },
      { dmg: 23, rate: 0.66, range: 136, up: 90 },
      { dmg: 40, rate: 0.7, range: 148, up: 160 },
    ],
  },
  berry: {
    id: 'berry', name: 'Ледяная смородина', tag: 'заморозка', kind: 'shot',
    desc: 'Ледяные ягоды сильно тормозят вредную еду.',
    cost: 80, color: '#67e8f9', slowFactor: 0.55, slowDur: 1.6,
    levels: [
      { dmg: 4, rate: 0.9, range: 110, up: 0 },
      { dmg: 6, rate: 1.0, range: 122, up: 60 },
      { dmg: 9, rate: 1.1, range: 135, up: 105 },
    ],
  },
  blender: {
    id: 'blender', name: 'Блендер', tag: 'цепная молния', kind: 'chain',
    desc: 'Разряд тока перескакивает сразу на несколько вредностей.',
    cost: 140, color: '#a78bfa', chains: 2,
    levels: [
      { dmg: 10, rate: 1.05, range: 95, up: 0 },
      { dmg: 17, rate: 1.15, range: 106, up: 120 },
      { dmg: 28, rate: 1.25, range: 118, up: 205 },
    ],
  },
  chili: {
    id: 'chili', name: 'Чили-огнемёт', tag: 'поджог', kind: 'flame',
    desc: 'Обжигает всё рядом огненной струёй и поджигает надолго.',
    cost: 120, color: '#f97316', burn: 6, burnDur: 2,
    levels: [
      { dmg: 24, rate: 0, range: 85, up: 0 },
      { dmg: 40, rate: 0, range: 95, up: 100 },
      { dmg: 64, rate: 0, range: 108, up: 175 },
    ],
  },
}

export const TOWER_ORDER: TowerId[] = ['broccoli', 'carrot', 'tomato', 'berry', 'blender', 'chili']

// ---------- Вредная еда ----------
export const ENEMIES: Record<EnemyId, EnemyDef> = {
  candy:   { name: 'Конфета',        hp: 16,   speed: 95,  bounty: 4,  armor: 0, r: 9,  tint: '#f472b6' },
  fries:   { name: 'Картошка фри',   hp: 32,   speed: 80,  bounty: 6,  armor: 0, r: 11, tint: '#facc15' },
  cupcake: { name: 'Кексик',         hp: 28,   speed: 90,  bounty: 5,  armor: 0, r: 10, tint: '#fbcfe8' },
  donut:   { name: 'Пончик',         hp: 60,   speed: 62,  bounty: 8,  armor: 0, r: 13, tint: '#fda4af' },
  cola:    { name: 'Кола',           hp: 45,   speed: 118, bounty: 9,  armor: 0, r: 11, tint: '#b45309' },
  pizza:   { name: 'Пицца',          hp: 95,   speed: 52,  bounty: 12, armor: 3, r: 14, tint: '#fdba74' },
  burger:  { name: 'Бургер',         hp: 170,  speed: 45,  bounty: 16, armor: 2, r: 15, tint: '#d97706' },
  choco:   { name: 'Шоколадка',      hp: 430,  speed: 37,  bounty: 40, armor: 4, r: 17, tint: '#78350f' },
  cake:    { name: 'ТОРТ «Мега-Губка»', hp: 1500, speed: 30, bounty: 100, armor: 6, r: 22, tint: '#f9a8d4' },
}

// ---------- Волны ----------
export const WAVES: WaveDef[] = [
  { name: 'Первая вредность', groups: [
    { type: 'candy', count: 8, gap: 1.1, delay: 0 },
  ]},
  { name: 'Сладкий ручей', groups: [
    { type: 'candy', count: 14, gap: 0.8, delay: 0 },
  ]},
  { name: 'Картошечка', groups: [
    { type: 'fries', count: 10, gap: 1.3, delay: 0 },
  ]},
  { name: 'Вредный микс', groups: [
    { type: 'candy', count: 10, gap: 0.7, delay: 0 },
    { type: 'fries', count: 6, gap: 1.6, delay: 2 },
  ]},
  { name: 'Кондитерская', groups: [
    { type: 'cupcake', count: 10, gap: 1.0, delay: 0 },
    { type: 'donut', count: 4, gap: 2.2, delay: 1 },
  ]},
  { name: 'Шипучка', groups: [
    { type: 'cola', count: 8, gap: 1.4, delay: 0 },
    { type: 'candy', count: 8, gap: 0.6, delay: 0.5 },
  ]},
  { name: 'Пончики горкой', groups: [
    { type: 'donut', count: 10, gap: 1.6, delay: 0 },
    { type: 'fries', count: 6, gap: 1.2, delay: 2 },
  ]},
  { name: 'Пиццерия', groups: [
    { type: 'pizza', count: 5, gap: 2.6, delay: 0 },
    { type: 'cupcake', count: 10, gap: 0.9, delay: 1 },
  ]},
  { name: 'Фастфуд-фуршет', groups: [
    { type: 'burger', count: 3, gap: 3.5, delay: 0 },
    { type: 'donut', count: 6, gap: 1.4, delay: 1 },
    { type: 'fries', count: 8, gap: 1.0, delay: 2 },
  ]},
  { name: 'Шоколадный гость', groups: [
    { type: 'choco', count: 1, gap: 1, delay: 0 },
    { type: 'cola', count: 10, gap: 1.2, delay: 2 },
    { type: 'candy', count: 12, gap: 0.5, delay: 3 },
  ]},
  { name: 'Двойной бургер', groups: [
    { type: 'burger', count: 5, gap: 2.8, delay: 0 },
    { type: 'cupcake', count: 12, gap: 0.7, delay: 1 },
  ]},
  { name: 'Пицца-вечеринка', groups: [
    { type: 'pizza', count: 8, gap: 2.0, delay: 0 },
    { type: 'cola', count: 8, gap: 1.1, delay: 1.5 },
  ]},
  { name: 'Сахарный шторм', groups: [
    { type: 'candy', count: 24, gap: 0.45, delay: 0 },
    { type: 'donut', count: 6, gap: 2.0, delay: 2 },
  ]},
  { name: 'Вредный набор', groups: [
    { type: 'fries', count: 12, gap: 0.9, delay: 0 },
    { type: 'pizza', count: 5, gap: 2.4, delay: 2 },
    { type: 'burger', count: 3, gap: 3.2, delay: 4 },
  ]},
  { name: 'БОСС: Торт-Мегабайт', groups: [
    { type: 'cake', count: 1, gap: 1, delay: 0 },
    { type: 'cupcake', count: 10, gap: 1.4, delay: 3 },
    { type: 'cola', count: 6, gap: 1.6, delay: 5 },
  ]},
  { name: 'Кола-лавина', groups: [
    { type: 'cola', count: 16, gap: 0.8, delay: 0 },
    { type: 'burger', count: 4, gap: 3.0, delay: 2 },
  ]},
  { name: 'Всё сразу', groups: [
    { type: 'candy', count: 16, gap: 0.5, delay: 0 },
    { type: 'fries', count: 10, gap: 1.0, delay: 0 },
    { type: 'donut', count: 8, gap: 1.5, delay: 1.5 },
    { type: 'pizza', count: 4, gap: 2.6, delay: 3 },
  ]},
  { name: 'Мясной гнев', groups: [
    { type: 'burger', count: 8, gap: 2.2, delay: 0 },
    { type: 'pizza', count: 6, gap: 2.2, delay: 1 },
    { type: 'cupcake', count: 14, gap: 0.6, delay: 2 },
  ]},
  { name: 'Шоколадный десант', groups: [
    { type: 'choco', count: 3, gap: 8, delay: 0 },
    { type: 'cola', count: 12, gap: 0.9, delay: 2 },
    { type: 'candy', count: 20, gap: 0.4, delay: 3 },
  ]},
  { name: 'ФИНАЛ: Банкет вредности', groups: [
    { type: 'cake', count: 1, gap: 1, delay: 0 },
    { type: 'choco', count: 2, gap: 10, delay: 6 },
    { type: 'burger', count: 6, gap: 2.4, delay: 2 },
    { type: 'pizza', count: 8, gap: 2.0, delay: 3 },
    { type: 'candy', count: 20, gap: 0.5, delay: 4 },
  ]},
]

export const TOTAL_WAVES = WAVES.length

// ---------- Игровые константы ----------
export const START_MONEY = 280
export const START_TEETH = 10
export const ENDLESS_HP_GROWTH = 1.045 // рост HP за бесконечную волну

/** Множитель HP волны */
export function waveHpMul(waveIdx: number): number {
  if (waveIdx < TOTAL_WAVES) return 1 + waveIdx * 0.05
  const extra = waveIdx - TOTAL_WAVES + 1
  return 1 + (TOTAL_WAVES - 1) * 0.05 + (Math.pow(ENDLESS_HP_GROWTH, extra) - 1) * 6
}

/** Волны бесконечного режима */
export function makeEndlessWave(n: number): WaveDef {
  // n — номер волны (21, 22, ...)
  const k = n - TOTAL_WAVES
  const heavy: EnemyId[] = k % 5 === 0 ? ['cake'] : ['choco']
  return {
    name: `Бесконечность ${k}`,
    groups: [
      { type: heavy[0], count: k % 5 === 0 ? 1 + Math.floor(k / 10) : 2 + Math.floor(k / 4), gap: 7, delay: 0 },
      { type: 'burger', count: 5 + k, gap: 1.8, delay: 1 },
      { type: 'cola', count: 8 + k * 2, gap: 0.6, delay: 2 },
      { type: 'pizza', count: 4 + k, gap: 1.6, delay: 3 },
      { type: 'candy', count: 14 + k * 3, gap: 0.35, delay: 4 },
    ],
  }
}

export function upgradeCost(type: TowerId, level: number): number {
  const def = TOWERS[type]
  return level === 1 ? def.levels[1].up : def.levels[2].up
}

export function sellValue(invested: number): number {
  return Math.round(invested * 0.7)
}
