import {
  BLOCKED, COLS, ROWS, CELL, PATH_LEN, pointAt,
  ENEMIES, TOWERS, WAVES, TOTAL_WAVES, makeEndlessWave, waveHpMul,
  START_MONEY, START_TEETH, upgradeCost, sellValue,
} from './config'
import type {
  Enemy, EnemyId, FloatText, HudState, Particle, ParticleKind, Phase,
  Projectile, SelInfo, Tower, TowerId, Zap,
} from './types'

interface PendingSpawn { t: number; type: EnemyId }

const LEAK_DIST = PATH_LEN - 58 // у самых губ
const PROJ_SPEED: Record<Projectile['kind'], number> = { pea: 430, spike: 580, ice: 390, tomato: 320 }
const W_CENTER_X = 480
const MOUTH_FX = 800
const MOUTH_FY = 250

export class GameEngine {
  phase: Phase = 'menu'
  money = START_MONEY
  teeth = START_TEETH
  maxTeeth = START_TEETH
  waveIdx = 0
  speed = 1
  paused = false
  endless = false

  enemies: Enemy[] = []
  towers: Tower[] = []
  projectiles: Projectile[] = []
  zaps: Zap[] = []
  particles: Particle[] = []
  floats: FloatText[] = []
  private pending: PendingSpawn[] = []

  placing: TowerId | null = null
  selectedId: number | null = null

  chompT = 0    // анимация жевания рта
  shakeT = 0    // тряска экрана
  redFlash = 0  // красная вспышка при потере зуба

  time = 0
  private nextId = 1
  private occupied = new Map<string, number>()
  private lastHudKey = ''
  private hudDirty = true
  private lastSfx = new Map<string, number>()

  sfx: (name: string) => void = () => {}
  onHud: () => void = () => {}
  onRunEnd: (win: boolean, waveReached: number) => void = () => {}

  // ---------- Жизненный цикл ----------
  startRun() {
    this.phase = 'build'
    this.money = START_MONEY
    this.teeth = START_TEETH
    this.waveIdx = 0
    this.speed = 1
    this.paused = false
    this.endless = false
    this.enemies = []
    this.towers = []
    this.projectiles = []
    this.zaps = []
    this.particles = []
    this.floats = []
    this.pending = []
    this.placing = null
    this.selectedId = null
    this.chompT = 0
    this.shakeT = 0
    this.redFlash = 0
    this.occupied.clear()
    this.touchHud(true)
  }

  openMenu() {
    this.phase = 'menu'
    this.touchHud(true)
  }

  continueEndless() {
    if (this.phase !== 'victory') return
    this.endless = true
    this.phase = 'build'
    this.sfx('click')
    this.touchHud(true)
  }

  /** Отладочный переход к волне (для тестов: ?wave=N) */
  debugJump(wave: number) {
    if (!Number.isFinite(wave)) return
    this.waveIdx = Math.max(0, Math.min(TOTAL_WAVES - 1, Math.round(wave) - 1))
    this.money = Math.max(this.money, 400 + this.waveIdx * 60)
    this.touchHud(true)
  }

  startWave() {
    if (this.phase !== 'build') return
    const wave = this.waveIdx < TOTAL_WAVES ? WAVES[this.waveIdx] : makeEndlessWave(this.waveIdx + 1)
    this.pending = []
    for (const g of wave.groups) {
      for (let i = 0; i < g.count; i++) {
        this.pending.push({ t: g.delay + i * g.gap, type: g.type })
      }
    }
    this.pending.sort((a, b) => a.t - b.t)
    this.phase = 'wave'
    this.placing = null
    this.selectedId = null
    this.sfx('wave')
    const boss = wave.groups.some((g) => g.type === 'cake' || g.type === 'choco')
    if (boss) this.sfx('boss')
    this.addFloat(`Волна ${this.waveIdx + 1} — ${wave.name}`, W_CENTER_X, 80, '#fbbf24', 22)
    this.touchHud(true)
  }

  // ---------- Основной апдейт ----------
  update(dtReal: number) {
    const dt = Math.min(0.05, dtReal) * (this.paused ? 0 : this.speed)
    this.time += dtReal

    if ((this.phase === 'wave') && dt > 0) {
      while (this.pending.length > 0 && this.pending[0].t <= 0) {
        const s = this.pending.shift()!
        this.spawnEnemy(s.type)
      }
      for (const p of this.pending) p.t -= dt

      this.moveEnemies(dt)
      this.runTowers(dt)
      this.moveProjectiles(dt)
      for (const z of this.zaps) z.life -= dt
      this.zaps = this.zaps.filter((z) => z.life > 0)

      if (this.pending.length === 0 && this.enemies.length === 0) this.finishWave()
    }

    // визуальные таймеры идут в реальном времени
    this.chompT = Math.max(0, this.chompT - dtReal * 1.6)
    this.shakeT = Math.max(0, this.shakeT - dtReal)
    this.redFlash = Math.max(0, this.redFlash - dtReal * 1.4)

    for (const f of this.floats) f.life -= dtReal
    this.floats = this.floats.filter((f) => f.life > 0)

    for (const p of this.particles) {
      p.life -= dtReal
      p.x += p.vx * dtReal
      p.y += p.vy * dtReal
      if (p.kind === 'crumb' || p.kind === 'spark') p.vy += 260 * dtReal
      if (p.kind === 'smoke') p.vy -= 40 * dtReal
    }
    this.particles = this.particles.filter((p) => p.life > 0)

    this.touchHud(false)
  }

  private spawnEnemy(type: EnemyId) {
    const def = ENEMIES[type]
    const hp = Math.round(def.hp * waveHpMul(this.waveIdx))
    const pos = pointAt(0)
    this.enemies.push({
      id: this.nextId++,
      type,
      hp,
      maxHp: hp,
      dist: 0,
      x: pos.x,
      y: pos.y,
      ang: pos.ang,
      bob: Math.random() * Math.PI * 2,
      slowT: 0,
      slowF: 1,
      burnT: 0,
      burnDps: 0,
      hitFlash: 0,
    })
    this.touchHud(true)
  }

  private moveEnemies(dt: number) {
    const leak: Enemy[] = []
    for (const e of this.enemies) {
      const def = ENEMIES[e.type]
      // статусы
      if (e.slowT > 0) e.slowT -= dt
      if (e.burnT > 0) {
        e.burnT -= dt
        this.hitEnemy(e, e.burnDps * dt, true)
        if (Math.random() < dt * 8) {
          this.puffAt(e.x, e.y - 8, 'spark', 1, 20, 30, 4, '#fb923c', 0.4)
        }
        if (e.hp <= 0) continue
      }
      if (e.hitFlash > 0) e.hitFlash -= dt

      const mul = e.slowT > 0 ? e.slowF : 1
      e.dist += def.speed * mul * dt
      e.bob += dt * 9 * (def.speed / 80)
      const pos = pointAt(e.dist)
      e.x = pos.x
      e.y = pos.y
      e.ang = pos.ang
      if (e.dist >= LEAK_DIST) leak.push(e)
    }

    // убираем сбитых (иначе «трупы» копятся и блокируют конец волны)
    if (this.enemies.some((e) => e.hp <= 0)) {
      this.enemies = this.enemies.filter((e) => e.hp > 0)
    }

    if (leak.length > 0) {
      this.enemies = this.enemies.filter((e) => !leak.includes(e))
      this.teeth -= leak.length
      this.chompT = 0.62
      this.shakeT = 0.4
      this.redFlash = 0.55
      this.sfx('chomp')
      this.addFloat(leak.length > 1 ? `−${leak.length} зуба!` : '−1 зуб!', MOUTH_FX, MOUTH_FY, '#f87171', 20)
      for (let i = 0; i < 6; i++) {
        this.puffAt(MOUTH_FX - 20, MOUTH_FY, 'tooth', 1, 60, 80, 7, '#ffffff', 0.8)
      }
      this.touchHud(true)
      if (this.teeth <= 0) {
        this.teeth = 0
        this.phase = 'gameover'
        this.placing = null
        this.selectedId = null
        this.onRunEnd(false, this.waveIdx + 1)
        this.sfx('lose')
      }
    }
  }

  private runTowers(dt: number) {
    for (const t of this.towers) {
      const def = TOWERS[t.type]
      const lv = def.levels[t.level - 1]
      if (t.fireAnim > 0) t.fireAnim -= dt

      if (def.kind === 'flame') {
        // огнемёт: непрерывная струя по всем в радиусе
        const inRange = this.enemies.filter((e) => e.hp > 0 && Math.hypot(e.x - t.x, e.y - t.y) <= lv.range)
        if (inRange.length > 0) {
          t.flameOn = 0.25
          inRange.sort((a, b) => b.dist - a.dist)
          const targets = inRange.slice(0, 6)
          for (const e of targets) {
            this.hitEnemy(e, lv.dmg * dt)
            e.burnT = def.burnDur ?? 2
            e.burnDps = def.burn ?? 6
          }
          const near = targets[0]
          t.ang = Math.atan2(near.y - t.y, near.x - t.x)
          if (Math.random() < dt * 30) {
            const a = t.ang + (Math.random() - 0.5) * 0.5
            this.particles.push({
              id: this.nextId++,
              kind: 'spark',
              x: t.x + Math.cos(t.ang) * 14,
              y: t.y + Math.sin(t.ang) * 14,
              vx: Math.cos(a) * 160 * Math.random(),
              vy: Math.sin(a) * 160 * Math.random() - 20,
              life: 0.35,
              maxLife: 0.35,
              size: 6 * Math.random() + 3,
              color: Math.random() < 0.5 ? '#fb923c' : '#fde047',
            })
          }
          this.throttledSfx('flame', 0.4)
        } else {
          t.flameOn = Math.max(0, t.flameOn - dt)
        }
        continue
      }

      t.cd -= dt
      const target = this.pickTarget(t, lv.range)
      if (target) t.ang = Math.atan2(target.y - t.y, target.x - t.x)

      if (t.cd > 0 || !target) continue
      t.cd = 1 / Math.max(0.05, lv.rate)
      t.fireAnim = 0.15

      if (def.kind === 'chain') {
        this.fireChain(t, target, lv.dmg, def.chains ?? 2)
        this.sfx('zap')
      } else if (def.kind === 'lob') {
        this.fireLob(t, target, lv.dmg, def.splash ?? 50)
        this.sfx('splat')
      } else {
        const kind: Projectile['kind'] = t.type === 'carrot' ? 'spike' : t.type === 'berry' ? 'ice' : 'pea'
        this.fireShot(t, target, kind, lv.dmg, def.slowFactor ?? 1, def.slowDur ?? 0)
        this.sfx(t.type === 'berry' ? 'freeze' : t.type === 'carrot' ? 'shoot2' : 'shoot')
      }
    }
  }

  private pickTarget(t: Tower, range: number): Enemy | null {
    let best: Enemy | null = null
    for (const e of this.enemies) {
      if (e.hp <= 0) continue
      if (Math.hypot(e.x - t.x, e.y - t.y) > range) continue
      if (!best || e.dist > best.dist) best = e
    }
    return best
  }

  private fireShot(t: Tower, target: Enemy, kind: Projectile['kind'], dmg: number, slowF: number, slowDur: number) {
    const a = Math.atan2(target.y - t.y, target.x - t.x)
    const sp = PROJ_SPEED[kind]
    this.projectiles.push({
      id: this.nextId++,
      kind,
      x: t.x + Math.cos(a) * 14,
      y: t.y + Math.sin(a) * 14,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      targetId: target.id,
      lx: target.x,
      ly: target.y,
      dmg,
      splash: 0,
      slowF,
      slowDur,
      lobT: 0,
      lobTMax: 0,
      sx: 0, sy: 0, tx: 0, ty: 0, arcH: 0,
    })
  }

  private fireLob(t: Tower, target: Enemy, dmg: number, splash: number) {
    const def = ENEMIES[target.type]
    const dist = Math.hypot(target.x - t.x, target.y - t.y)
    const T = Math.max(0.35, Math.min(0.95, dist / PROJ_SPEED.tomato))
    // упреждение: цель за время полёта проползёт ещё немного
    const future = pointAt(target.dist + def.speed * (target.slowT > 0 ? target.slowF : 1) * T)
    this.projectiles.push({
      id: this.nextId++,
      kind: 'tomato',
      x: t.x, y: t.y,
      vx: 0, vy: 0,
      targetId: 0,
      lx: 0, ly: 0,
      dmg,
      splash,
      slowF: 1, slowDur: 0,
      lobT: 0,
      lobTMax: T,
      sx: t.x, sy: t.y,
      tx: future.x, ty: future.y,
      arcH: 34 + dist * 0.12,
    })
  }

  private fireChain(t: Tower, primary: Enemy, dmg: number, chains: number) {
    const hit = new Set<number>([primary.id])
    const pts = [{ x: t.x, y: t.y }, { x: primary.x, y: primary.y }]
    this.hitEnemy(primary, dmg)
    let from = primary
    for (let i = 1; i < chains; i++) {
      let next: Enemy | null = null
      for (const e of this.enemies) {
        if (e.hp <= 0 || hit.has(e.id)) continue
        if (Math.hypot(e.x - from.x, e.y - from.y) > 85) continue
        if (!next || Math.hypot(e.x - from.x, e.y - from.y) < Math.hypot(next.x - from.x, next.y - from.y)) next = e
      }
      if (!next) break
      hit.add(next.id)
      pts.push({ x: next.x, y: next.y })
      this.hitEnemy(next, dmg * 0.8)
      from = next
    }
    this.zaps.push({ id: this.nextId++, pts, life: 0.18 })
  }

  private moveProjectiles(dt: number) {
    const keep: Projectile[] = []
    for (const p of this.projectiles) {
      if (p.kind === 'tomato') {
        p.lobT += dt
        const t = Math.min(1, p.lobT / p.lobTMax)
        p.x = p.sx + (p.tx - p.sx) * t
        p.y = p.sy + (p.ty - p.sy) * t
        if (t >= 1) {
          this.tomatoSplash(p)
          continue
        }
        keep.push(p)
        continue
      }
      const target = this.enemies.find((e) => e.id === p.targetId && e.hp > 0)
      if (target) { p.lx = target.x; p.ly = target.y }
      const dx = p.lx - p.x
      const dy = p.ly - p.y
      const d = Math.hypot(dx, dy)
      const sp = PROJ_SPEED[p.kind]
      const step = sp * dt
      const r = target ? ENEMIES[target.type].r : 6
      if (d <= step + r * 0.5) {
        if (target) {
          this.hitEnemy(target, p.dmg)
          if (p.slowDur > 0 && target.hp > 0) {
            target.slowT = p.slowDur
            target.slowF = p.slowF
            this.puffAt(p.lx, p.ly, 'frost', 3, 40, 20, 4, '#a5f3fc', 0.5)
          }
          this.puffAt(p.lx, p.ly, 'splat', 3, 50, 30, 4, p.kind === 'ice' ? '#a5f3fc' : '#a3e635', 0.45)
        }
        continue
      }
      p.vx = (dx / d) * sp
      p.vy = (dy / d) * sp
      p.x += p.vx * dt
      p.y += p.vy * dt
      keep.push(p)
    }
    this.projectiles = keep
  }

  private tomatoSplash(p: Projectile) {
    this.puffAt(p.tx, p.ty, 'splat', 10, 90, 50, 6, '#ef4444', 0.55)
    for (const e of this.enemies) {
      if (e.hp <= 0) continue
      if (Math.hypot(e.x - p.tx, e.y - p.ty) <= p.splash + ENEMIES[e.type].r * 0.5) {
        this.hitEnemy(e, p.dmg)
      }
    }
  }

  /** Урон с учётом брони; kill=false — это DoT, звук не нужен */
  private hitEnemy(e: Enemy, raw: number, dot = false) {
    if (e.hp <= 0) return
    const def = ENEMIES[e.type]
    const dmg = Math.max(dot ? 0 : 1, raw - def.armor)
    e.hp -= dmg
    if (!dot) e.hitFlash = 0.12
    if (e.hp <= 0) {
      e.hp = 0
      this.money += def.bounty
      this.addFloat(`+${def.bounty}₽`, e.x, e.y - 18, '#fbbf24', 13)
      this.puffAt(e.x, e.y, 'crumb', 8, 90, 60, 4.5, def.tint, 0.6)
      this.puffAt(e.x, e.y, 'crumb', 3, 70, 80, 3, '#ffffff', 0.5)
      this.throttledSfx('splat', 0.08)
      this.touchHud(true)
    }
  }

  private finishWave() {
    const bonus = 26 + (this.waveIdx + 1) * 5
    this.money += bonus
    this.addFloat(`+${bonus}₽ волна пройдена`, W_CENTER_X, 140, '#fbbf24', 20)
    this.waveIdx++
    if (this.waveIdx === TOTAL_WAVES) {
      this.phase = 'victory'
      this.placing = null
      this.selectedId = null
      this.onRunEnd(true, this.waveIdx)
      this.sfx('win')
    } else {
      this.phase = 'build'
      this.sfx('coin')
    }
    this.touchHud(true)
  }

  // ---------- Строительство ----------
  canPlaceAt(cx: number, cy: number): boolean {
    if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return false
    if (BLOCKED.has(`${cx},${cy}`)) return false
    return !this.occupied.has(`${cx},${cy}`)
  }

  beginPlacing(type: TowerId) {
    if (this.phase !== 'build' && this.phase !== 'wave') return
    if (this.money < TOWERS[type].cost) {
      this.sfx('error')
      return
    }
    this.placing = type
    this.selectedId = null
    this.sfx('click')
    this.touchHud(true)
  }

  cancelPlacing() {
    if (this.placing) {
      this.placing = null
      this.touchHud(true)
    }
  }

  canvasClick(cx: number, cy: number) {
    if (this.phase !== 'build' && this.phase !== 'wave') return
    if (this.placing) {
      this.tryPlace(cx, cy)
      return
    }
    const t = this.towers.find((tw) => tw.cx === cx && tw.cy === cy)
    if (t) {
      this.selectedId = t.id
      this.sfx('click')
    } else {
      this.selectedId = null
    }
    this.touchHud(true)
  }

  private tryPlace(cx: number, cy: number): boolean {
    if (!this.placing) return false
    if (!this.canPlaceAt(cx, cy)) {
      this.sfx('error')
      return false
    }
    const type = this.placing
    const def = TOWERS[type]
    if (this.money < def.cost) {
      this.sfx('error')
      this.placing = null
      return false
    }
    this.money -= def.cost
    const tower: Tower = {
      id: this.nextId++,
      type,
      level: 1,
      cx, cy,
      x: cx * CELL + CELL / 2,
      y: cy * CELL + CELL / 2,
      cd: 0,
      ang: 0,
      invested: def.cost,
      fireAnim: 0,
      flameOn: 0,
    }
    this.towers.push(tower)
    this.occupied.set(`${cx},${cy}`, tower.id)
    this.puffAt(tower.x, tower.y, 'frost', 6, 60, 50, 4, def.color, 0.5)
    this.placing = null
    this.sfx('place')
    this.touchHud(true)
    return true
  }

  getSelected(): SelInfo | null {
    if (this.selectedId === null) return null
    const t = this.towers.find((tw) => tw.id === this.selectedId)
    if (!t) return null
    const def = TOWERS[t.type]
    const lv = def.levels[t.level - 1]
    const maxed = t.level >= 3
    const upCost = maxed ? 0 : upgradeCost(t.type, t.level)
    const dps = def.kind === 'flame' ? lv.dmg + (def.burn ?? 0) : lv.dmg * lv.rate
    return {
      id: t.id,
      type: t.type,
      level: t.level,
      invested: t.invested,
      dmg: lv.dmg,
      rate: lv.rate,
      range: lv.range,
      upCost,
      sell: sellValue(t.invested),
      maxed,
      dps: Math.round(dps),
    }
  }

  upgradeSelected() {
    if (this.selectedId === null) return
    const t = this.towers.find((tw) => tw.id === this.selectedId)
    if (!t || t.level >= 3) return
    const cost = upgradeCost(t.type, t.level)
    if (this.money < cost) {
      this.sfx('error')
      return
    }
    this.money -= cost
    t.invested += cost
    t.level++
    this.puffAt(t.x, t.y, 'spark', 8, 70, 70, 4, '#fbbf24', 0.6)
    this.sfx('upgrade')
    this.touchHud(true)
  }

  sellSelected() {
    if (this.selectedId === null) return
    const idx = this.towers.findIndex((tw) => tw.id === this.selectedId)
    if (idx === -1) return
    const t = this.towers[idx]
    this.money += sellValue(t.invested)
    this.occupied.delete(`${t.cx},${t.cy}`)
    this.puffAt(t.x, t.y, 'smoke', 5, 50, 40, 5, '#a8a29e', 0.7)
    this.towers.splice(idx, 1)
    this.selectedId = null
    this.sfx('sell')
    this.touchHud(true)
  }

  // ---------- Прочее ----------
  toggleSpeed() {
    this.speed = this.speed === 1 ? 2 : 1
    this.touchHud(true)
  }

  togglePause() {
    if (this.phase === 'wave') {
      this.paused = !this.paused
      this.touchHud(true)
    }
  }

  waveComposition(): { type: EnemyId; name: string; count: number }[] {
    const wave = this.waveIdx < TOTAL_WAVES ? WAVES[this.waveIdx] : makeEndlessWave(this.waveIdx + 1)
    const map = new Map<EnemyId, number>()
    for (const g of wave.groups) map.set(g.type, (map.get(g.type) ?? 0) + g.count)
    return [...map.entries()].map(([type, count]) => ({ type, name: ENEMIES[type].name, count }))
  }

  getHud(): HudState {
    const wave = this.waveIdx < TOTAL_WAVES ? WAVES[this.waveIdx] : makeEndlessWave(this.waveIdx + 1)
    return {
      phase: this.phase,
      money: Math.round(this.money),
      teeth: this.teeth,
      maxTeeth: this.maxTeeth,
      waveIdx: this.waveIdx,
      totalWaves: TOTAL_WAVES,
      alive: this.enemies.length,
      remaining: this.pending.length + this.enemies.length,
      speed: this.speed,
      paused: this.paused,
      placing: this.placing,
      selected: this.getSelected(),
      waveName: this.phase === 'victory' ? 'Победа!' : wave.name,
      endless: this.endless,
    }
  }

  // ---------- Вспомогательное ----------
  private puffAt(x: number, y: number, kind: ParticleKind, count: number, spread: number, up: number, size: number, color: string, life: number) {
    for (let i = 0; i < count; i++) {
      if (this.particles.length > 260) return
      const a = Math.random() * Math.PI * 2
      const v = spread * (0.4 + Math.random() * 0.6)
      this.particles.push({
        id: this.nextId++,
        kind,
        x: x + (Math.random() - 0.5) * 8,
        y: y + (Math.random() - 0.5) * 6,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v * 0.6 - up,
        life,
        maxLife: life,
        size: size * (0.8 + Math.random() * 0.4),
        color,
      })
    }
  }

  addFloat(text: string, x: number, y: number, color: string, size: number) {
    this.floats.push({ id: this.nextId++, text, x, y, life: 1.5, maxLife: 1.5, color, size })
    if (this.floats.length > 20) this.floats.shift()
  }

  private throttledSfx(name: string, interval: number) {
    const now = this.time
    const last = this.lastSfx.get(name) ?? -99
    if (now - last >= interval) {
      this.lastSfx.set(name, now)
      this.sfx(name)
    }
  }

  private touchHud(force: boolean) {
    if (force) {
      this.hudDirty = true
    } else {
      const key = `${this.phase}|${Math.round(this.money)}|${this.teeth}|${this.waveIdx}|${this.enemies.length}|${this.pending.length}|${this.speed}|${this.paused}|${this.placing}|${this.selectedId}|${this.endless}`
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
