import type { SaveData } from './types'

const KEY = 'foodstorator-td-save-v1'

const DEFAULT: SaveData = {
  sound: true,
  bestWave: 0,
  wins: 0,
  runs: 0,
}

export function loadSave(): SaveData {
  if (typeof window === 'undefined') return { ...DEFAULT }
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT }
    return { ...DEFAULT, ...(JSON.parse(raw) as Partial<SaveData>) }
  } catch {
    return { ...DEFAULT }
  }
}

export function persistSave(d: SaveData) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KEY, JSON.stringify(d))
  } catch {
    // приватный режим — игнорируем
  }
}
