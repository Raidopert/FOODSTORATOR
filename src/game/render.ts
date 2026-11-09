import { W, H, CELL, COLS, ROWS, PATH, PATH_LEN, pointAt, BLOCKED, STATIONS, RECIPES, DISH_SPEED, UPGRADE_RATE } from './config'
import type { GameEngine } from './engine'
import type { Station, Dish } from './types'

export interface RenderView {
  hover: { cx: number; cy: number } | null
  timeMs: number
}

const FONT = "'Segoe UI',system-ui,-apple-system,Roboto,sans-serif"
const EMOJI_FONT = "'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif"

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function emoji(ctx: CanvasRenderingContext2D, ch: string, x: number, y: number, size: number, alpha = 1) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.font = `${size}px ${EMOJI_FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(ch, x, y)
  ctx.restore()
}

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, weight = 600, align: CanvasTextAlign = 'center') {
  ctx.save()
  ctx.font = `${weight} ${size}px ${FONT}`
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  ctx.fillText(s, x, y)
  ctx.restore()
}

let pathCache: Path2D | null = null
function getPath(): Path2D {
  if (pathCache) return pathCache
  const p = new Path2D()
  p.moveTo(PATH[0].x, PATH[0].y)
  for (let i = 1; i < PATH.length; i++) p.lineTo(PATH[i].x, PATH[i].y)
  pathCache = p
  return p
}

function drawFloor(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#fdf6ec'
  ctx.fillRect(0, 0, W, H)
  for (let cx = 0; cx < COLS; cx++) {
    for (let cy = 0; cy < ROWS; cy++) {
      if ((cx + cy) % 2 === 0) {
        ctx.fillStyle = '#f9ecda'
        ctx.fillRect(cx * CELL, cy * CELL, CELL, CELL)
      }
    }
  }
  // точки сетки на доступных клетках
  ctx.fillStyle = 'rgba(180,140,90,0.16)'
  for (let cx = 1; cx < COLS; cx++) {
    for (let cy = 1; cy < ROWS; cy++) {
      if (!BLOCKED.has(`${cx},${cy}`) && !BLOCKED.has(`${cx - 1},${cy}`) && !BLOCKED.has(`${cx},${cy - 1}`) && !BLOCKED.has(`${cx - 1},${cy - 1}`)) {
        ctx.fillRect(cx * CELL - 1, cy * CELL - 1, 2, 2)
      }
    }
  }
}

function drawConveyor(ctx: CanvasRenderingContext2D, timeMs: number) {
  const p = getPath()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = '#92702f'
  ctx.lineWidth = 52
  ctx.stroke(p)
  ctx.strokeStyle = '#44403c'
  ctx.lineWidth = 44
  ctx.stroke(p)
  ctx.strokeStyle = '#57534e'
  ctx.lineWidth = 34
  ctx.stroke(p)
  // движущиеся полоски ленты
  ctx.save()
  ctx.setLineDash([16, 24])
  ctx.lineDashOffset = -(timeMs / 1000 * DISH_SPEED) % 40
  ctx.strokeStyle = '#78716c'
  ctx.lineWidth = 6
  ctx.stroke(p)
  ctx.restore()
}

function drawWarehouse(ctx: CanvasRenderingContext2D) {
  const x = 4
  const y = 288
  // тень
  ctx.fillStyle = 'rgba(0,0,0,0.12)'
  rr(ctx, x + 3, y + 5, 148, 146, 14)
  ctx.fill()
  // корпус
  ctx.fillStyle = '#b45309'
  rr(ctx, x, y, 148, 146, 14)
  ctx.fill()
  ctx.fillStyle = '#92400e'
  rr(ctx, x, y, 148, 34, 14)
  ctx.fill()
  // навес-полоски
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#fbbf24' : '#fef3c7'
    ctx.fillRect(x + 8 + i * 22, y + 36, 22, 12)
  }
  text(ctx, 'СКЛАД', x + 74, y + 62, 15, '#fff7ed', 700)
  emoji(ctx, '📦', x + 46, y + 106, 34)
  emoji(ctx, '🧺', x + 96, y + 108, 30)
  // стрелка направления
  ctx.fillStyle = '#a8a29e'
  ctx.beginPath()
  ctx.moveTo(165, 352)
  ctx.lineTo(165, 368)
  ctx.lineTo(178, 368)
  ctx.lineTo(178, 376)
  ctx.lineTo(194, 360)
  ctx.lineTo(178, 344)
  ctx.lineTo(178, 352)
  ctx.closePath()
  ctx.fill()
}

function drawCounter(ctx: CanvasRenderingContext2D) {
  const x = 1152
  const y = 412
  ctx.fillStyle = 'rgba(0,0,0,0.12)'
  rr(ctx, x + 3, y + 5, 122, 150, 14)
  ctx.fill()
  ctx.fillStyle = '#0f766e'
  rr(ctx, x, y, 122, 150, 14)
  ctx.fill()
  ctx.fillStyle = '#115e59'
  rr(ctx, x, y, 122, 32, 14)
  ctx.fill()
  text(ctx, 'СТОЙКА', x + 61, y + 18, 14, '#ccfbf1', 700)
  // столешница
  ctx.fillStyle = '#e7e5e4'
  rr(ctx, x + 10, y + 44, 102, 14, 6)
  ctx.fill()
  emoji(ctx, '🧑‍🍳', x + 61, y + 106, 40)
  text(ctx, 'официант', x + 61, y + 138, 11, '#99f6e4', 600)
}

function drawStation(ctx: CanvasRenderingContext2D, st: Station, engine: GameEngine, timeMs: number) {
  const def = STATIONS[st.type]
  const selected = engine.selectedStationId === st.id
  const placing = engine.placing !== null

  // аура морозилки
  if (st.type === 'freeze') {
    const range = def.range * Math.pow(1.08, st.level - 1)
    ctx.fillStyle = 'rgba(59,130,246,0.07)'
    ctx.beginPath()
    ctx.arc(st.x, st.y, range, 0, Math.PI * 2)
    ctx.fill()
  }

  // тень
  ctx.fillStyle = 'rgba(0,0,0,0.15)'
  rr(ctx, st.x - 30, st.y - 26, 64, 64, 12)
  ctx.fill()

  // плитка
  ctx.fillStyle = def.color
  rr(ctx, st.x - 32, st.y - 32, 64, 64, 12)
  ctx.fill()
  ctx.strokeStyle = def.border
  ctx.lineWidth = 3
  rr(ctx, st.x - 32, st.y - 32, 64, 64, 12)
  ctx.stroke()

  if (selected) {
    ctx.strokeStyle = '#fbbf24'
    ctx.lineWidth = 4
    rr(ctx, st.x - 36, st.y - 36, 72, 72, 14)
    ctx.stroke()
    // зона
    const range = def.range * Math.pow(1.08, st.level - 1)
    ctx.save()
    ctx.setLineDash([8, 8])
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.arc(st.x, st.y, range, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.08)'
    ctx.fill()
    ctx.restore()
  }

  emoji(ctx, def.emoji, st.x, st.y - 6, 30)

  // индикатор отката
  if (st.type !== 'freeze' && st.cd > 0) {
    const eff = def.cd / (Math.pow(UPGRADE_RATE, st.level - 1) * engine.buffs.globalSpeed * engine.buffs.typeSpeed[st.type])
    const frac = Math.max(0, Math.min(1, 1 - st.cd / eff))
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.arc(st.x, st.y, 24, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2)
    ctx.stroke()
  }

  // вспышка работы
  if (st.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${Math.min(0.8, st.flash * 3)})`
    rr(ctx, st.x - 32, st.y - 32, 64, 64, 12)
    ctx.fill()
  }

  // уровень — точки
  for (let i = 0; i < st.level; i++) {
    ctx.fillStyle = '#f59e0b'
    ctx.beginPath()
    ctx.arc(st.x - 10 + i * 10, st.y + 22, 3.2, 0, Math.PI * 2)
    ctx.fill()
  }

  if (!placing) {
    // курсорная подсказка не нужна, но подсветим занятость
  }
  void timeMs
}

function drawDish(ctx: CanvasRenderingContext2D, d: Dish, engine: GameEngine) {
  const r = RECIPES[d.recipeId]
  const pos = pointAt(d.dist)
  const bobY = Math.sin(d.bob) * 2.5
  const alpha = d.spoiled ? 0.75 : 1

  // тень
  ctx.fillStyle = 'rgba(0,0,0,0.18)'
  ctx.beginPath()
  ctx.ellipse(pos.x, pos.y + 16, 16, 5, 0, 0, Math.PI * 2)
  ctx.fill()

  emoji(ctx, r.emoji, pos.x, pos.y - 10 + bobY, 32, alpha)
  if (d.spoiled) emoji(ctx, '💀', pos.x + 14, pos.y - 20 + bobY, 16)
  else if (d.heat >= 1) emoji(ctx, '🔥', pos.x + 14, pos.y - 20 + bobY, 15, 0.95)
  if (d.slowNow && !d.spoiled) emoji(ctx, '❄️', pos.x - 16, pos.y - 22 + bobY, 14, 0.9)

  // чипсы шагов рецепта
  const chips = r.steps
  const cw = 36
  const gap = 3
  const totalW = chips.length * cw + (chips.length - 1) * gap
  let x0 = pos.x - totalW / 2
  const y0 = pos.y + 20 + bobY * 0.4
  for (const s of chips) {
    const done = d.prog[s.type] >= s.count
    ctx.fillStyle = done ? 'rgba(34,197,94,0.92)' : 'rgba(255,255,255,0.92)'
    rr(ctx, x0, y0, cw, 16, 8)
    ctx.fill()
    ctx.strokeStyle = done ? '#16a34a' : 'rgba(0,0,0,0.2)'
    ctx.lineWidth = 1
    rr(ctx, x0, y0, cw, 16, 8)
    ctx.stroke()
    const info = { chop: '🔪', fry: '🍳', season: '🧂', plate: '🍽️' }[s.type]
    emoji(ctx, info, x0 + 10, y0 + 8, 10)
    text(ctx, `${d.prog[s.type]}/${s.count}`, x0 + 24, y0 + 9, 10, done ? '#064e3b' : '#57534e', 700)
    x0 += cw + gap
  }
}

function drawGhost(ctx: CanvasRenderingContext2D, engine: GameEngine, view: RenderView) {
  if (!engine.placing || !view.hover) return
  const { cx, cy } = view.hover
  const ok = engine.canPlaceAt(cx, cy)
  const def = STATIONS[engine.placing]
  const x = cx * CELL + CELL / 2
  const y = cy * CELL + CELL / 2

  // зона действия
  ctx.save()
  ctx.setLineDash([8, 8])
  ctx.strokeStyle = ok ? 'rgba(255,255,255,0.95)' : 'rgba(239,68,68,0.9)'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.arc(x, y, def.range, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = ok ? 'rgba(255,255,255,0.1)' : 'rgba(239,68,68,0.12)'
  ctx.fill()
  ctx.restore()

  ctx.globalAlpha = 0.65
  ctx.fillStyle = ok ? def.color : '#fca5a5'
  rr(ctx, x - 32, y - 32, 64, 64, 12)
  ctx.fill()
  ctx.strokeStyle = ok ? def.border : '#dc2626'
  ctx.lineWidth = 3
  rr(ctx, x - 32, y - 32, 64, 64, 12)
  ctx.stroke()
  ctx.globalAlpha = 1
  emoji(ctx, def.emoji, x, y - 6, 30, 0.8)
}

function drawFloats(ctx: CanvasRenderingContext2D, engine: GameEngine) {
  for (const f of engine.floats) {
    const t = 1 - f.life / f.maxLife
    const alpha = Math.min(1, f.life / (f.maxLife * 0.5))
    ctx.save()
    ctx.globalAlpha = alpha
    text(ctx, f.text, f.x, f.y - t * 34, f.size, f.color, 700)
    ctx.restore()
  }
}

export function renderGame(ctx: CanvasRenderingContext2D, engine: GameEngine, view: RenderView) {
  drawFloor(ctx)
  drawConveyor(ctx, view.timeMs)
  drawWarehouse(ctx)
  drawCounter(ctx)

  for (const st of engine.stations) drawStation(ctx, st, engine, view.timeMs)
  drawGhost(ctx, engine, view)

  for (const d of engine.dishes) drawDish(ctx, d, engine)

  // превью очереди у склада
  const q = engine.queuePreview()
  if (q.length > 0 && (engine.phase === 'wave' || engine.phase === 'build')) {
    text(ctx, 'далее:', 105, 258, 11, '#78716c', 600)
    q.forEach((em, i) => emoji(ctx, em, 70 + i * 34, 276, 24))
  }

  drawFloats(ctx, engine)
}

export { PATH_LEN }
