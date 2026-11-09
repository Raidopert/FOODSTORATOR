import {
  PATH_LEN, pointAt, BLOCKED, COLS, ROWS, CELL,
  STATIONS, RECIPES, WAVES, CARDS, STEP_INFO,
  DISH_SPEED, FREEZE_SLOW, START_MONEY, START_REP, BURN_LIMIT,
  REP_FAIL, REP_SPOIL, REP_PERFECT, PERFECT_BONUS,
  UPGRADE_RATE, UPG_RANGE, WAVE_SKIP_BONUS,
  upgradeCost, sellValue,
} from './config'
import type {
  Phase, Dish, Station, FloatText, DraftCard, RunStats, HudState, StepType, StationType,
} from './types'

const STEP_TYPES: StepType[] = ['chop', 'fry', 'season', 'plate']

interface PendingSpawn {
  t: number
  recipeId: string
}

export class GameEngine {
  phase: Phase = 'menu'
  money = START_MONEY
  rep = START_REP
  waveIdx = 0
  speed = 1
  paused = false

  dishes: Dish[] = []
  stations: Station[] = []
  pending: PendingSpawn[] = []
  floats: FloatText[] = []

  draft: DraftCard[] = []
  draftPicked = false
  placing: StationType | null = null
  freeStation = false
  selectedStationId: number | null = null
  preBoostNext = false

  buffs = {
    globalSpeed: 1,
    typeSpeed: { chop: 1, fry: 1, season: 1, plate: 1, freeze: 1 } as Record<StationType, number>,
    freezeSlow: FREEZE_SLOW,
  }

  stats: RunStats = { perfect: 0, failed: 0, spoiled: 0, tips: 0 }

  time = 0
  private nextId = 1
  private occupied = new Map<string, number>()
  private lastHudKey = ''
  private hudDirty = false

  sfx: (name: string) => void = () => {}
  onBanner: (text: string, tone: 'info' | 'good') => void = () => {}
  onRunEnd: (win: boolean, stats: RunStats, waveIdx: number) => void = () => {}
  onHud: () => void = () => {}

  // ---------- Жизненный цикл ----------
  startRun() {
    this.phase = 'build'
    this.money = START_MONEY
    this.rep = START_REP
    this.waveIdx = 0
    this.speed = 1
    this.paused = false
    this.dishes = []
    this.stations = []
    this.pending = []
    this.floats = []
    this.draft = []
    this.draftPicked = false
    this.placing = null
    this.freeStation = false
    this.selectedStationId = null
    this.preBoostNext = false
    this.stats = { perfect: 0, failed: 0, spoiled: 0, tips: 0 }
    this.buffs = {
      globalSpeed: 1,
      typeSpeed: { chop: 1, fry: 1, season: 1, plate: 1, freeze: 1 },
      freezeSlow: FREEZE_SLOW,
    }
    this.occupied.clear()
    this.touchHud(true)
  }

  openMenu() {
    this.phase = 'menu'
    this.touchHud(true)
  }

  startWave() {
    if (this.phase !== 'build' && this.phase !== 'draft') return
    const wave = WAVES[this.waveIdx]
    this.pending = []
    for (const s of wave.streams) {
      for (let i = 0; i < s.count; i++) {
        this.pending.push({ t: s.delay + i * s.interval, recipeId: s.recipeId })
      }
    }
    this.pending.sort((a, b) => a.t - b.t)
    this.phase = 'wave'
    this.draftPicked = false
    this.sfx('wave')
    this.onBanner(`Волна ${this.waveIdx + 1} — ${WAVES[this.waveIdx].name}`, 'info')
    this.touchHud(true)
  }

  // ---------- Основной апдейт ----------
  update(dtReal: number) {
    const dt = Math.min(0.05, dtReal) * (this.paused ? 0 : this.speed)
    this.time += dtReal

    if (this.phase === 'wave' && dt > 0) {
      // спавн заказов
      while (this.pending.length > 0 && this.pending[0].t <= 0) {
        const s = this.pending.shift()!
        this.spawnDish(s.recipeId)
      }
      for (const p of this.pending) p.t -= dt

      this.moveDishes(dt)
      this.runStations(dt)

      // конец волны
      if (this.pending.length === 0 && this.dishes.length === 0) {
        this.finishWave()
      }
    }

    // плавающие тексты живут всегда
    for (const f of this.floats) f.life -= dtReal
    this.floats = this.floats.filter((f) => f.life > 0)

    this.touchHud(false)
  }

  private spawnDish(recipeId: string) {
    const r = RECIPES[recipeId]
    const dish: Dish = {
      id: this.nextId++,
      recipeId,
      dist: 0,
      prog: { chop: 0, fry: 0, season: 0, plate: 0 },
      heat: 0,
      spoiled: false,
      bob: Math.random() * Math.PI * 2,
      slowNow: false,
    }
    if (this.preBoostNext) {
      const first = r.steps[0]
      dish.prog[first.type] = Math.min(first.count, dish.prog[first.type] + 1)
    }
    this.dishes.push(dish)
  }

  private moveDishes(dt: number) {
    for (const d of this.dishes) {
      const pos = pointAt(d.dist)
      let slow = 1
      for (const st of this.stations) {
        if (st.type !== 'freeze') continue
        if (Math.hypot(st.x - pos.x, st.y - pos.y) <= this.rangeOf(st)) {
          slow = Math.min(slow, this.buffs.freezeSlow)
        }
      }
      d.slowNow = slow < 1
      d.dist += DISH_SPEED * slow * dt
      d.bob += dt * 6
      if (d.dist >= PATH_LEN) {
        this.resolveDish(d)
      }
    }
    this.dishes = this.dishes.filter((d) => d.dist < PATH_LEN)
  }

  private rangeOf(st: Station): number {
    return STATIONS[st.type].range * Math.pow(UPG_RANGE, st.level - 1)
  }

  private cdOf(st: Station): number {
    const def = STATIONS[st.type]
    const buff = this.buffs.globalSpeed * this.buffs.typeSpeed[st.type]
    return def.cd / (Math.pow(UPGRADE_RATE, st.level - 1) * buff)
  }

  private runStations(dt: number) {
    for (const st of this.stations) {
      if (st.type === 'freeze') continue
      if (st.flash > 0) st.flash -= dt
      st.cd -= dt
      if (st.cd > 0) continue

      const range = this.rangeOf(st)
      const type = st.type as StepType
      let target: Dish | null = null
      let burnTarget: Dish | null = null

      for (const d of this.dishes) {
        if (d.spoiled) continue
        const pos = pointAt(d.dist)
        if (Math.hypot(st.x - pos.x, st.y - pos.y) > range) continue
        const r = RECIPES[d.recipeId]
        const req = r.steps.find((s) => s.type === type)?.count ?? 0
        if (req > 0 && d.prog[type] < req) {
          if (!target || d.dist > target.dist) target = d
        } else if (st.type === 'fry' && req > 0 && d.prog[type] >= req) {
          // лишняя жарка — добавляет жар; 3 лишних — блюдо сгорает
          if (!burnTarget || d.dist > burnTarget.dist) burnTarget = d
        }
      }

      if (target) {
        target.prog[type]++
        st.flash = 0.22
        st.cd = this.cdOf(st)
      } else if (burnTarget) {
        burnTarget.heat++
        st.flash = 0.3
        st.cd = this.cdOf(st)
        if (burnTarget.heat >= BURN_LIMIT) {
          burnTarget.spoiled = true
          const pos = pointAt(burnTarget.dist)
          this.addFloat('🔥 сгорело!', pos.x, pos.y - 34, '#ef4444', 15)
          this.sfx('burn')
        }
      } else {
        st.cd = 0
      }
    }
  }

  private resolveDish(d: Dish) {
    const r = RECIPES[d.recipeId]
    const pos = pointAt(PATH_LEN - 20)
    let money = 0
    if (d.spoiled) {
      this.rep = Math.max(0, this.rep - REP_SPOIL)
      this.stats.spoiled++
      this.addFloat(`−${REP_SPOIL}⭐ ${r.emoji}`, pos.x, pos.y - 30, '#ef4444', 16)
      this.sfx('fail')
    } else {
      const missing = r.steps.filter((s) => d.prog[s.type] < s.count)
      if (missing.length === 0) {
        money = Math.round(r.price * (1 + PERFECT_BONUS))
        this.money += money
        this.rep = Math.min(100, this.rep + REP_PERFECT)
        this.stats.perfect++
        this.stats.tips += money
        this.addFloat(`+${money}₽ идеально!`, pos.x, pos.y - 30, '#22c55e', 16)
        this.sfx('coin')
      } else {
        this.rep = Math.max(0, this.rep - REP_FAIL)
        this.stats.failed++
        this.addFloat(`−${REP_FAIL}⭐ ${r.emoji}`, pos.x, pos.y - 30, '#f97316', 15)
        this.sfx('fail')
      }
    }
    if (this.rep <= 0) {
      this.phase = 'gameover'
      this.placing = null
      this.freeStation = false
      this.selectedStationId = null
      this.onRunEnd(false, this.stats, this.waveIdx)
      this.sfx('lose')
    }
    this.touchHud(true)
  }

  private finishWave() {
    const bonus = 30 + (this.waveIdx + 1) * 8
    this.money += bonus
    this.addFloat(`+${bonus}₽ волна пройдена`, 640, 360, '#f59e0b', 20)
    this.waveIdx++
    if (this.waveIdx >= WAVES.length) {
      this.phase = 'victory'
      this.placing = null
      this.freeStation = false
      this.selectedStationId = null
      this.onRunEnd(true, this.stats, this.waveIdx)
      this.sfx('win')
    } else {
      this.phase = 'draft'
      this.draftPicked = false
      this.draft = this.rollDraft()
      this.sfx('draft')
      this.onBanner('Волна пройдена! Выбери буст', 'good')
    }
    this.touchHud(true)
  }

  // ---------- Draft ----------
  private rollDraft(): DraftCard[] {
    const pool = [...CARDS]
    const picked: DraftCard[] = []
    while (picked.length < 3 && pool.length > 0) {
      const total = pool.reduce((s, c) => s + c.weight, 0)
      let roll = Math.random() * total
      let idx = 0
      for (let i = 0; i < pool.length; i++) {
        roll -= pool[i].weight
        if (roll <= 0) {
          idx = i
          break
        }
      }
      const c = pool.splice(idx, 1)[0]
      picked.push({ id: c.id, emoji: c.emoji, title: c.title, desc: c.desc, accent: c.accent })
    }
    return picked
  }

  pickDraft(cardId: string) {
    if (this.phase !== 'draft') return
    const card = this.draft.find((c) => c.id === cardId)
    if (!card) return
    switch (card.id) {
      case 'tips100': this.money += 100; break
      case 'tips200': this.money += 200; break
      case 'chefSpeed': this.buffs.globalSpeed *= 1.12; break
      case 'chopSpeed': this.buffs.typeSpeed.chop *= 1.3; break
      case 'frySpeed': this.buffs.typeSpeed.fry *= 1.3; break
      case 'seasonSpeed': this.buffs.typeSpeed.season *= 1.3; break
      case 'plateSpeed': this.buffs.typeSpeed.plate *= 1.3; break
      case 'freezeBoost': this.buffs.freezeSlow = Math.max(0.25, this.buffs.freezeSlow - 0.1); break
      case 'rep15': this.rep = Math.min(100, this.rep + 15); break
      case 'preBoost': this.preBoostNext = true; break
      case 'freeStation':
        this.freeStation = true
        this.placing = null
        break
    }
    this.draftPicked = true
    this.phase = 'build'
    this.sfx('click')
    this.touchHud(true)
  }

  skipDraft() {
    if (this.phase !== 'draft') return
    this.money += WAVE_SKIP_BONUS
    this.draftPicked = true
    this.phase = 'build'
    this.sfx('coin')
    this.touchHud(true)
  }

  // ---------- Строительство ----------
  canPlaceAt(cx: number, cy: number): boolean {
    if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return false
    if (BLOCKED.has(`${cx},${cy}`)) return false
    return !this.occupied.has(`${cx},${cy}`)
  }

  beginPlacing(type: StationType) {
    if (this.phase !== 'build' && this.phase !== 'wave' && this.phase !== 'draft') return
    if (!this.freeStation && this.money < STATIONS[type].cost) {
      this.sfx('error')
      return
    }
    this.placing = type
    this.selectedStationId = null
    this.sfx('click')
    this.touchHud(true)
  }

  cancelPlacing() {
    if (this.placing || this.freeStation) {
      this.placing = null
      this.freeStation = false
      this.touchHud(true)
    }
  }

  tryPlace(cx: number, cy: number): boolean {
    if (!this.placing) return false
    if (!this.canPlaceAt(cx, cy)) {
      this.addFloat('⛔ нельзя на конвейере', cx * CELL + CELL / 2, cy * CELL, '#ef4444', 13)
      this.sfx('error')
      return false
    }
    const type = this.placing
    const def = STATIONS[type]
    const cost = this.freeStation ? 0 : def.cost
    if (this.money < cost) {
      this.sfx('error')
      return false
    }
    this.money -= cost
    const st: Station = {
      id: this.nextId++,
      type,
      level: 1,
      cx,
      cy,
      x: cx * CELL + CELL / 2,
      y: cy * CELL + CELL / 2,
      cd: 0,
      invested: cost,
      flash: 0,
    }
    this.stations.push(st)
    this.occupied.set(`${cx},${cy}`, st.id)
    this.placing = null
    this.freeStation = false
    this.sfx('place')
    this.touchHud(true)
    return true
  }

  selectStation(id: number | null) {
    this.selectedStationId = id
    if (id !== null) this.placing = null
    this.touchHud(true)
  }

  upgradeStation(id: number) {
    const st = this.stations.find((s) => s.id === id)
    if (!st || st.level >= 3) return
    const cost = upgradeCost(st.type, st.level)
    if (this.money < cost) {
      this.sfx('error')
      return
    }
    this.money -= cost
    st.invested += cost
    st.level++
    this.sfx('upgrade')
    this.touchHud(true)
  }

  sellStation(id: number) {
    const idx = this.stations.findIndex((s) => s.id === id)
    if (idx === -1) return
    const st = this.stations[idx]
    this.money += sellValue(st.invested)
    this.occupied.delete(`${st.cx},${st.cy}`)
    this.stations.splice(idx, 1)
    if (this.selectedStationId === id) this.selectedStationId = null
    this.sfx('sell')
    this.touchHud(true)
  }

  // ---------- Прочее ----------
  toggleSpeed() {
    this.speed = this.speed === 1 ? 2 : 1
    this.touchHud(true)
  }

  togglePause() {
    this.paused = !this.paused
    this.touchHud(true)
  }

  setPaused(v: boolean) {
    this.paused = v
    this.touchHud(true)
  }

  addFloat(text: string, x: number, y: number, color: string, size: number) {
    this.floats.push({
      id: this.nextId++,
      text,
      x,
      y,
      life: 1.6,
      maxLife: 1.6,
      color,
      size,
    })
    if (this.floats.length > 24) this.floats.shift()
  }

  /** Следующие блюда для превью у склада */
  queuePreview(): string[] {
    return this.pending.slice(0, 3).map((p) => RECIPES[p.recipeId].emoji)
  }

  /** Состав следующей волны: какие блюда и сколько */
  waveComposition(): { recipeId: string; emoji: string; count: number }[] {
    if (this.waveIdx >= WAVES.length) return []
    const map = new Map<string, number>()
    for (const s of WAVES[this.waveIdx].streams) {
      map.set(s.recipeId, (map.get(s.recipeId) ?? 0) + s.count)
    }
    return [...map.entries()].map(([rid, count]) => ({
      recipeId: rid,
      emoji: RECIPES[rid].emoji,
      count,
    }))
  }

  /** Превью волны с шагами рецептов для HUD */
  nextWavePreview(): { emoji: string; count: number; steps: string }[] {
    return this.waveComposition().map((c) => {
      const r = RECIPES[c.recipeId]
      const steps = r.steps.map((s) => STEP_INFO[s.type].emoji.repeat(s.count)).join(' ')
      return { emoji: r.emoji, count: c.count, steps }
    })
  }

  getHud(): HudState {
    const sel = this.selectedStationId !== null
      ? this.stations.find((s) => s.id === this.selectedStationId) ?? null
      : null
    return {
      phase: this.phase,
      money: Math.round(this.money),
      rep: Math.round(this.rep),
      waveIdx: this.waveIdx,
      totalWaves: WAVES.length,
      alive: this.dishes.length,
      remaining: this.pending.length + this.dishes.length,
      speed: this.speed,
      paused: this.paused,
      draft: this.draft,
      draftPicked: this.draftPicked,
      selectedStationId: this.selectedStationId,
      selectedStation: sel ? { id: sel.id, type: sel.type, level: sel.level, invested: sel.invested } : null,
      placing: this.placing,
      freeStation: this.freeStation,
      nextWave: this.nextWavePreview(),
      stats: { ...this.stats },
      preBoost: this.preBoostNext,
      lastWaveResult: null,
    }
  }

  private touchHud(force: boolean) {
    if (force) {
      this.hudDirty = true
    } else {
      const key = `${this.phase}|${Math.round(this.money)}|${Math.round(this.rep)}|${this.waveIdx}|${this.dishes.length}|${this.pending.length}|${this.speed}|${this.paused}|${this.placing}|${this.selectedStationId}|${this.draftPicked}|${this.freeStation}`
      if (key !== this.lastHudKey) {
        this.lastHudKey = key
        this.hudDirty = true
      }
    }
    if (this.hudDirty) {
      this.hudDirty = false
      this.onHud()
    }
  }
}
