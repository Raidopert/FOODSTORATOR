import type { RecipeDef, StationDef, WaveDef, StepType, StationType } from './types'

// ---------- Мир (внутреннее разрешение игры) ----------
export const W = 1280
export const H = 720
export const CELL = 80
export const COLS = W / CELL // 16
export const ROWS = H / CELL // 9

// ---------- Путь конвейера: от склада до стойки ----------
export const PATH: { x: number; y: number }[] = [
  { x: -60, y: 360 },
  { x: 170, y: 360 },
  { x: 170, y: 130 },
  { x: 470, y: 130 },
  { x: 470, y: 590 },
  { x: 790, y: 590 },
  { x: 790, y: 200 },
  { x: 1070, y: 200 },
  { x: 1070, y: 490 },
  { x: 1248, y: 490 },
]

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

/** Ячейки, занятые конвейером (строить нельзя) */
export const BLOCKED: Set<string> = (() => {
  const set = new Set<string>()
  for (let cxi = 0; cxi < COLS; cxi++) {
    for (let cyi = 0; cyi < ROWS; cyi++) {
      const px = cxi * CELL + CELL / 2
      const py = cyi * CELL + CELL / 2
      for (const s of SEG) {
        if (distToSegment(px, py, s) < 28) {
          set.add(`${cxi},${cyi}`)
          break
        }
      }
    }
  }
  return set
})()

// ---------- Станции (башни) ----------
export const STEP_INFO: Record<StepType, { emoji: string; name: string }> = {
  chop: { emoji: '🔪', name: 'Нарезка' },
  fry: { emoji: '🍳', name: 'Жарка' },
  season: { emoji: '🧂', name: 'Специи' },
  plate: { emoji: '🍽️', name: 'Подача' },
}

export const STATIONS: Record<StationType, StationDef> = {
  chop: {
    type: 'chop', name: 'Разделка', emoji: '🔪', cost: 50, cd: 0.9, range: 92,
    color: '#fef3c7', border: '#f59e0b',
    desc: 'Нарезает продукты. Быстрая, дешёвая — основа кухни.',
  },
  fry: {
    type: 'fry', name: 'Плита', emoji: '🍳', cost: 70, cd: 1.05, range: 96,
    color: '#fee2e2', border: '#ef4444',
    desc: 'Жарит. Три лишние жарки — блюдо СГОРАЕТ!',
  },
  season: {
    type: 'season', name: 'Специи', emoji: '🧂', cost: 60, cd: 1.1, range: 96,
    color: '#f3e8ff', border: '#a855f7',
    desc: 'Приправляет блюдо. Большой радиус действия.',
  },
  plate: {
    type: 'plate', name: 'Подача', emoji: '🍽️', cost: 80, cd: 1.2, range: 90,
    color: '#e0f2fe', border: '#0ea5e9',
    desc: 'Собирает блюдо на тарелке перед подачей.',
  },
  freeze: {
    type: 'freeze', name: 'Морозилка', emoji: '❄️', cost: 90, cd: 0, range: 110,
    color: '#dbeafe', border: '#3b82f6',
    desc: 'Замедляет конвейер: у поваров больше времени.',
  },
}

export const STATION_ORDER: StationType[] = ['chop', 'fry', 'season', 'plate', 'freeze']

// ---------- Рецепты блюд ----------
export const RECIPES: Record<string, RecipeDef> = {
  fries: {
    id: 'fries', name: 'Картошка фри', emoji: '🍟', price: 16,
    steps: [{ type: 'fry', count: 2 }],
  },
  burger: {
    id: 'burger', name: 'Гамбургер', emoji: '🍔', price: 24,
    steps: [{ type: 'chop', count: 2 }, { type: 'fry', count: 1 }, { type: 'plate', count: 1 }],
  },
  salad: {
    id: 'salad', name: 'Салат', emoji: '🥗', price: 22,
    steps: [{ type: 'chop', count: 2 }, { type: 'season', count: 1 }, { type: 'plate', count: 1 }],
  },
  steak: {
    id: 'steak', name: 'Стейк', emoji: '🥩', price: 38,
    steps: [{ type: 'fry', count: 2 }, { type: 'season', count: 1 }, { type: 'plate', count: 1 }],
  },
  dessert: {
    id: 'dessert', name: 'Десерт', emoji: '🍰', price: 34,
    steps: [{ type: 'chop', count: 1 }, { type: 'season', count: 1 }, { type: 'plate', count: 2 }],
  },
  deluxe: {
    id: 'deluxe', name: 'Пицца-де-люкс', emoji: '🍕', price: 55,
    steps: [{ type: 'chop', count: 2 }, { type: 'fry', count: 2 }, { type: 'season', count: 2 }, { type: 'plate', count: 1 }],
  },
}

// ---------- Волны ----------
export const WAVES: WaveDef[] = [
  { name: 'Разогрев', streams: [
    { recipeId: 'fries', count: 5, interval: 2.4, delay: 0 },
  ]},
  { name: 'Первая смена', streams: [
    { recipeId: 'fries', count: 5, interval: 2.2, delay: 0 },
    { recipeId: 'burger', count: 3, interval: 3.4, delay: 1.5 },
  ]},
  { name: 'Обеденный час', streams: [
    { recipeId: 'burger', count: 5, interval: 2.4, delay: 0 },
    { recipeId: 'salad', count: 3, interval: 3.5, delay: 1 },
  ]},
  { name: 'Гурманы', streams: [
    { recipeId: 'salad', count: 5, interval: 2.3, delay: 0 },
    { recipeId: 'steak', count: 2, interval: 4.0, delay: 2 },
  ]},
  { name: 'Кухня мира', streams: [
    { recipeId: 'steak', count: 3, interval: 3.2, delay: 0 },
    { recipeId: 'dessert', count: 3, interval: 3.4, delay: 1 },
    { recipeId: 'burger', count: 4, interval: 2.2, delay: 0.5 },
  ]},
  { name: 'БАНКЕТ', streams: [
    { recipeId: 'deluxe', count: 2, interval: 6.0, delay: 0 },
    { recipeId: 'steak', count: 4, interval: 2.8, delay: 1 },
    { recipeId: 'dessert', count: 4, interval: 2.8, delay: 2 },
    { recipeId: 'salad', count: 5, interval: 2.2, delay: 0.5 },
    { recipeId: 'burger', count: 5, interval: 2.0, delay: 1.5 },
  ]},
]

// ---------- Игровые константы ----------
export const DISH_SPEED = 80        // px/сек по конвейеру
export const FREEZE_SLOW = 0.45     // множитель скорости в морозилке
export const BURN_LIMIT = 3         // лишних жарок до порчи блюда
export const START_MONEY = 220
export const START_REP = 100
export const REP_FAIL = 12          // недоготовленное блюдо
export const REP_SPOIL = 20         // испорчено/сгорело
export const REP_PERFECT = 2        // идеальная подача
export const PERFECT_BONUS = 0.25   // +25% чаевых за идеал
export const UPGRADE_RATE = 1.4     // рост скорости станции за уровень
export const UPG_RANGE = 1.08       // рост радиуса за уровень
export const LEVEL_COUNT = 6
export const LEVEL_NAME = 'Уровень 1 — Фастфуд-старт'
export const WAVE_SKIP_BONUS = 40   // за пропуск draft-карты

export function upgradeCost(type: StationType, level: number): number {
  const base = STATIONS[type].cost
  return level === 1 ? Math.round(base * 0.9) : Math.round(base * 1.6)
}

export function sellValue(invested: number): number {
  return Math.round(invested * 0.7)
}

// ---------- Draft-карты ----------
export interface CardDef {
  id: string
  emoji: string
  title: string
  desc: string
  accent: string
  weight: number
}

export const CARDS: CardDef[] = [
  { id: 'tips100', emoji: '💰', title: 'Щедрые чаевые', desc: '+100₽ в кассу', accent: '#f59e0b', weight: 3 },
  { id: 'tips200', emoji: '🏦', title: 'Премия от сети', desc: '+200₽ в кассу', accent: '#f59e0b', weight: 1 },
  { id: 'chefSpeed', emoji: '👨‍🍳', title: 'Шеф в смене', desc: 'Все станции +12% скорости (навсегда)', accent: '#ef4444', weight: 2 },
  { id: 'chopSpeed', emoji: '🔪', title: 'Острые ножи', desc: 'Разделка +30% скорости (навсегда)', accent: '#f59e0b', weight: 2 },
  { id: 'frySpeed', emoji: '🔥', title: 'Контроль жара', desc: 'Плиты +30% скорости (навсегда)', accent: '#ef4444', weight: 2 },
  { id: 'seasonSpeed', emoji: '🧂', title: 'Ассортимент специй', desc: 'Специи +30% скорости (навсегда)', accent: '#a855f7', weight: 2 },
  { id: 'plateSpeed', emoji: '🍽️', title: 'Быстрая сервировка', desc: 'Подача +30% скорости (навсегда)', accent: '#0ea5e9', weight: 2 },
  { id: 'freezeBoost', emoji: '❄️', title: 'Суперохлаждение', desc: 'Морозилки тормозят конвейер сильнее (навсегда)', accent: '#3b82f6', weight: 2 },
  { id: 'freeStation', emoji: '🎁', title: 'Новая станция', desc: 'Поставь любую станцию бесплатно', accent: '#22c55e', weight: 2 },
  { id: 'rep15', emoji: '⭐', title: 'Хорошая реклама', desc: '+15 репутации ресторана', accent: '#eab308', weight: 2 },
  { id: 'preBoost', emoji: '📦', title: 'Подготовка склада', desc: 'В следующей волне блюда стартуют с 1-м готовым шагом', accent: '#84cc16', weight: 2 },
]
