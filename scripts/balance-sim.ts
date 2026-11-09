/**
 * Автосимуляция баланса «Шеф-Конвейер».
 * Запуск: bun scripts/balance-sim.ts
 * Гоняет движок без рендера по нескольким стратегиям и печатает итоги.
 */
import { GameEngine } from '../src/game/engine'
import { WAVES, LEVEL_COUNT } from '../src/game/config'
import type { StationType } from '../src/game/types'

interface Placement {
  wave: number // номер волны, перед которой строим
  type: StationType
  cx: number
  cy: number
}

const DT = 1 / 60
const MAX_STEPS = 60 * 60 * 12 // 12 минут симуляции на волну максимум

function runSim(name: string, plan: Placement[], verbose = true) {
  const e = new GameEngine()
  e.startRun()
  const perWave: string[] = []

  const applyPlan = (wave: number) => {
    for (const p of plan.filter((x) => x.wave === wave)) {
      e.beginPlacing(p.type)
      const ok = e.tryPlace(p.cx, p.cy)
      if (!ok && verbose) console.log(`  !! не удалось поставить ${p.type} на (${p.cx},${p.cy})`)
    }
  }

  const pickCard = () => {
    const ids = e.draft.map((c) => c.id)
    if (e.rep < 55 && ids.includes('rep15')) return e.pickDraft('rep15')
    const prio = ['freeStation', 'tips100', 'chefSpeed', 'tips200', 'preBoost', 'frySpeed', 'chopSpeed', 'seasonSpeed', 'plateSpeed', 'freezeBoost']
    for (const id of prio) if (ids.includes(id)) return e.pickDraft(id)
    e.skipDraft()
  }

  let step = 0
  let wave = 0
  applyPlan(0)
  if (e.phase === 'build') e.startWave()

  while (wave < LEVEL_COUNT && step < MAX_STEPS) {
    e.update(DT)
    step++
    if (e.phase === 'draft') {
      const done = e.stats
      perWave.push(
        `волна ${wave}: ✅${done.perfect} ❌${done.failed} 🔥${done.spoiled} | 💰${e.money}₽ | ⭐${e.rep}`
      )
      pickCard()
      wave++
      applyPlan(wave)
      if (e.phase === 'build') e.startWave()
    }
    if (e.phase === 'gameover') {
      perWave.push(`--- РЕСТОРАН ЗАКРЫТ на волне ${wave + 1} ---`)
      break
    }
  }

  console.log(`\n=== ${name} ===`)
  for (const l of perWave) console.log('  ' + l)
  console.log(
    `  ИТОГ: ${e.phase} | волн ${e.waveIdx}/${WAVES.length} | ⭐${e.rep} | 💰${e.money}₽ | чаевые ${e.stats.tips}₽ | ✅${e.stats.perfect} ❌${e.stats.failed} 🔥${e.stats.spoiled}`
  )
  return e
}

// --- Стратегия A: грамотная игра (одна станция на сегмент) ---
const PLAN_A: Placement[] = [
  { wave: 0, type: 'fry', cx: 3, cy: 2 },     // плита на верхнем сегменте
  { wave: 1, type: 'chop', cx: 5, cy: 3 },    // разделка у левого вертикального
  { wave: 1, type: 'plate', cx: 4, cy: 2 },   // подача у верхнего сегмента
  { wave: 2, type: 'season', cx: 8, cy: 6 },  // специи у нижнего сегмента
  { wave: 3, type: 'chop', cx: 6, cy: 5 },    // вторая разделка на вертикальном
  { wave: 4, type: 'plate', cx: 9, cy: 6 },   // вторая подача (десерты: plate×2)
  { wave: 4, type: 'freeze', cx: 7, cy: 6 },  // морозилка на нижнем сегменте
  { wave: 5, type: 'fry', cx: 10, cy: 3 },    // вторая плита у правого сегмента
]

// --- Стратегия B: минимальная кухня (часть шагов не закрыта) ---
const PLAN_B: Placement[] = [
  { wave: 0, type: 'fry', cx: 3, cy: 2 },
  { wave: 1, type: 'chop', cx: 5, cy: 3 },
]

// --- Стратегия C: три плиты кучей (проверка сгорания) ---
const PLAN_C: Placement[] = [
  { wave: 0, type: 'fry', cx: 3, cy: 2 },
  { wave: 0, type: 'fry', cx: 2, cy: 2 },
  { wave: 0, type: 'fry', cx: 4, cy: 2 },
]

runSim('A: грамотная расстановка', PLAN_A)
runSim('B: минимальная кухня', PLAN_B)
runSim('C: три плиты кучей', PLAN_C)
