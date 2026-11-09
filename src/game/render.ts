import { W, H, CELL, COLS, ROWS, PATH, PATH_LEN, pointAt, BLOCKED, STATIONS, RECIPES, DISH_SPEED, UPGRADE_RATE } from './config'
import type { GameEngine } from './engine'
import type { Station, Dish, StationType } from './types'

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

// ---------- Фон: пол + стена кухни ----------
function drawFloor(ctx: CanvasRenderingContext2D) {
  // тёплый пол-шахматка
  ctx.fillStyle = '#f3e4cb'
  ctx.fillRect(0, 0, W, H)
  for (let cx = 0; cx < COLS; cx++) {
    for (let cy = 0; cy < ROWS; cy++) {
      if ((cx + cy) % 2 === 0) {
        ctx.fillStyle = '#edd7b6'
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

  // ===== стена кухни сверху =====
  const wallH = 84
  ctx.fillStyle = '#e2e6df'
  ctx.fillRect(0, 0, W, wallH)
  // плитка стены с затиркой
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'
  ctx.lineWidth = 2
  for (let x = 0; x <= W; x += 42) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, wallH)
    ctx.stroke()
  }
  for (let y = 0; y <= wallH; y += 28) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(W, y)
    ctx.stroke()
  }
  // нижний край стены — плинтус с тенью
  ctx.fillStyle = '#cbd2c5'
  ctx.fillRect(0, wallH - 10, W, 10)
  ctx.fillStyle = 'rgba(0,0,0,0.10)'
  ctx.fillRect(0, wallH, W, 6)

  // кухонная утварь на стене
  emoji(ctx, '🍳', 306, 44, 26, 0.92)
  emoji(ctx, '🥄', 560, 42, 24, 0.9)
  emoji(ctx, '⏲️', 712, 44, 22, 0.9)
  emoji(ctx, '🫙', 1010, 42, 24, 0.9)

  // растения в углах стены
  drawPlant(ctx, 40, wallH - 8)
  drawPlant(ctx, W - 44, wallH - 8)

  // мягкое затемнение по краям (виньетка)
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95)
  vg.addColorStop(0, 'rgba(60,30,0,0)')
  vg.addColorStop(1, 'rgba(60,30,0,0.14)')
  ctx.fillStyle = vg
  ctx.fillRect(0, 0, W, H)
}

function drawPlant(ctx: CanvasRenderingContext2D, x: number, baseY: number) {
  // горшок
  ctx.fillStyle = '#c2622f'
  ctx.beginPath()
  ctx.moveTo(x - 13, baseY - 16)
  ctx.lineTo(x + 13, baseY - 16)
  ctx.lineTo(x + 9, baseY)
  ctx.lineTo(x - 9, baseY)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#9a4b21'
  ctx.fillRect(x - 15, baseY - 20, 30, 7)
  // листья
  ctx.fillStyle = '#4d8f4f'
  for (const [dx, dy, r] of [[-9, -30, 11], [9, -32, 12], [0, -40, 13], [-3, -22, 9], [4, -24, 9]] as const) {
    ctx.beginPath()
    ctx.ellipse(x + dx, baseY + dy, r * 0.62, r, dx * 0.03, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = '#66ab64'
  ctx.beginPath()
  ctx.ellipse(x - 5, baseY - 36, 5, 9, -0.4, 0, Math.PI * 2)
  ctx.fill()
}

// ---------- Конвейер ----------
function drawConveyor(ctx: CanvasRenderingContext2D, timeMs: number) {
  const p = getPath()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  // тень под лентой
  ctx.strokeStyle = 'rgba(90,60,20,0.16)'
  ctx.lineWidth = 60
  ctx.stroke(p)
  // металлические боковины
  ctx.strokeStyle = '#8d8578'
  ctx.lineWidth = 54
  ctx.stroke(p)
  ctx.strokeStyle = '#5b5751'
  ctx.lineWidth = 48
  ctx.stroke(p)
  // тёмная рама
  ctx.strokeStyle = '#2f2c29'
  ctx.lineWidth = 44
  ctx.stroke(p)
  // сама лента
  ctx.strokeStyle = '#403d3a'
  ctx.lineWidth = 36
  ctx.stroke(p)
  // движущиеся траки ленты
  ctx.save()
  ctx.setLineDash([13, 21])
  ctx.lineDashOffset = -(timeMs / 1000 * DISH_SPEED) % 34
  ctx.strokeStyle = '#6d6862'
  ctx.lineWidth = 7
  ctx.stroke(p)
  ctx.restore()
  // блик сверху ленты
  ctx.save()
  ctx.globalAlpha = 0.25
  ctx.strokeStyle = '#f5f0e6'
  ctx.lineWidth = 2
  ctx.stroke(p)
  ctx.restore()
}

// ---------- Склад ----------
function drawWarehouse(ctx: CanvasRenderingContext2D) {
  const x = 4
  const y = 288
  // тень
  ctx.fillStyle = 'rgba(0,0,0,0.14)'
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
  // свет лампы над дверью
  ctx.fillStyle = 'rgba(253,224,71,0.16)'
  ctx.beginPath()
  ctx.ellipse(x + 74, y + 92, 54, 30, 0, 0, Math.PI * 2)
  ctx.fill()
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

// ---------- Стойка официанта ----------
function drawCounter(ctx: CanvasRenderingContext2D) {
  const x = 1152
  const y = 412
  ctx.fillStyle = 'rgba(0,0,0,0.14)'
  rr(ctx, x + 3, y + 5, 122, 150, 14)
  ctx.fill()
  ctx.fillStyle = '#0f766e'
  rr(ctx, x, y, 122, 150, 14)
  ctx.fill()
  ctx.fillStyle = '#115e59'
  rr(ctx, x, y, 122, 32, 14)
  ctx.fill()
  text(ctx, 'СТОЙКА', x + 55, y + 18, 14, '#ccfbf1', 700)
  // столешница
  ctx.fillStyle = '#e7e5e4'
  rr(ctx, x + 10, y + 44, 102, 14, 6)
  ctx.fill()
  emoji(ctx, '🔔', x + 100, y + 52, 15)
  emoji(ctx, '🧑‍🍳', x + 58, y + 106, 40)
  text(ctx, 'официант', x + 58, y + 138, 11, '#99f6e4', 600)
}

// ---------- Машины станций (общее для башни и призрака) ----------
function drawMachine(ctx: CanvasRenderingContext2D, type: StationType, x: number, y: number, timeMs: number, flash: number) {
  switch (type) {
    case 'chop': {
      // разделочная доска
      ctx.fillStyle = '#c98a3e'
      rr(ctx, x - 26, y - 16, 50, 30, 7)
      ctx.fill()
      ctx.strokeStyle = '#8a5a22'
      ctx.lineWidth = 2
      rr(ctx, x - 26, y - 16, 50, 30, 7)
      ctx.stroke()
      ctx.fillStyle = '#8a5a22'
      ctx.beginPath()
      ctx.arc(x + 29, y - 1, 5, 0, Math.PI * 2)
      ctx.fill()
      // нарезанные кусочки
      ctx.fillStyle = '#4d8f4f'
      ctx.fillRect(x - 18, y - 8, 4, 4)
      ctx.fillRect(x - 11, y - 4, 4, 4)
      ctx.fillRect(x - 15, y + 1, 4, 4)
      ctx.fillStyle = '#e67e22'
      ctx.fillRect(x - 4, y - 6, 4, 4)
      ctx.fillRect(x + 1, y + 2, 4, 4)
      // нож (покачивается при работе)
      ctx.save()
      ctx.translate(x + 6, y - 22)
      ctx.rotate(flash > 0 ? Math.sin(timeMs / 40) * 0.25 : 0.12)
      ctx.fillStyle = '#d6d3d1'
      ctx.beginPath()
      ctx.moveTo(-16, 6)
      ctx.quadraticCurveTo(-4, -8, 12, -2)
      ctx.lineTo(12, 6)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#5b3a1e'
      rr(ctx, 12, -3, 14, 8, 3)
      ctx.fill()
      ctx.restore()
      break
    }
    case 'fry': {
      // корпус плиты
      ctx.fillStyle = '#3f3f46'
      rr(ctx, x - 26, y - 22, 52, 42, 8)
      ctx.fill()
      ctx.strokeStyle = '#27272a'
      ctx.lineWidth = 2
      rr(ctx, x - 26, y - 22, 52, 42, 8)
      ctx.stroke()
      // конфорки
      for (const bx of [x - 12, x + 12]) {
        ctx.fillStyle = '#18181b'
        ctx.beginPath()
        ctx.arc(bx, y + 6, 9, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#52525b'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(bx, y + 6, 6.5, 0, Math.PI * 2)
        ctx.stroke()
      }
      // ручки
      ctx.fillStyle = '#ef4444'
      ctx.beginPath()
      ctx.arc(x - 10, y - 14, 3, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(x + 10, y - 14, 3, 0, Math.PI * 2)
      ctx.fill()
      // огонь при работе
      if (flash > 0) {
        for (const bx of [x - 12, x + 12]) {
          ctx.save()
          ctx.globalAlpha = Math.min(0.95, flash * 3.2)
          for (const [ox, h, c] of [[-3, 10, '#f97316'], [2, 7, '#fbbf24']] as const) {
            ctx.fillStyle = c
            ctx.beginPath()
            ctx.moveTo(bx + ox - 3, y + 3)
            ctx.quadraticCurveTo(bx + ox, y + 3 - h - Math.sin(timeMs / 30) * 2, bx + ox + 3, y + 3)
            ctx.closePath()
            ctx.fill()
          }
          ctx.restore()
        }
      }
      break
    }
    case 'season': {
      // полка со специями
      ctx.fillStyle = '#a16207'
      rr(ctx, x - 24, y - 18, 48, 5, 2)
      ctx.fill()
      rr(ctx, x - 24, y + 8, 48, 5, 2)
      ctx.fill()
      // банки
      const jars: [number, string, string][] = [
        [x - 17, '#ef4444', '🧂'],
        [x - 1, '#22c55e', '🌿'],
        [x + 15, '#eab308', '🌶️'],
      ]
      for (const [jx, jc, jem] of jars) {
        ctx.fillStyle = jc
        rr(ctx, jx - 6, y - 14, 12, 14, 3)
        ctx.fill()
        ctx.fillStyle = '#7c2d12'
        rr(ctx, jx - 7, y - 17, 14, 5, 2)
        ctx.fill()
        emoji(ctx, jem, jx, y + 0.5, 9)
      }
      // посыпка при работе
      if (flash > 0) {
        ctx.save()
        ctx.globalAlpha = Math.min(0.9, flash * 3)
        ctx.fillStyle = '#fcd34d'
        for (let i = 0; i < 5; i++) {
          ctx.beginPath()
          ctx.arc(x - 14 + i * 7, y - 22 + ((timeMs / 3 + i * 40) % 22), 1.6, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.restore()
      }
      break
    }
    case 'plate': {
      // стопка тарелок
      for (let i = 0; i < 3; i++) {
        const py = y + 14 - i * 7
        ctx.fillStyle = i === 2 ? '#ffffff' : '#f3f1ee'
        ctx.beginPath()
        ctx.ellipse(x - 2, py, 20 - i, 8 - i * 0.6, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#c9c5c0'
        ctx.lineWidth = 1.2
        ctx.stroke()
      }
      // салфетка
      ctx.fillStyle = '#14b8a6'
      ctx.save()
      ctx.translate(x + 18, y + 8)
      ctx.rotate(0.4)
      rr(ctx, -6, -6, 12, 12, 2)
      ctx.fill()
      ctx.restore()
      // вилка-нож над стопкой при работе
      if (flash > 0) {
        ctx.save()
        ctx.globalAlpha = Math.min(0.85, flash * 3)
        emoji(ctx, '✨', x, y - 16, 13)
        ctx.restore()
      }
      break
    }
    case 'freeze': {
      // корпус морозильного сундука
      ctx.fillStyle = '#bae6fd'
      rr(ctx, x - 26, y - 20, 52, 38, 8)
      ctx.fill()
      ctx.strokeStyle = '#0284c7'
      ctx.lineWidth = 2
      rr(ctx, x - 26, y - 20, 52, 38, 8)
      ctx.stroke()
      // крышка
      ctx.fillStyle = '#e0f2fe'
      rr(ctx, x - 26, y - 20, 52, 12, 8)
      ctx.fill()
      ctx.strokeStyle = '#0284c7'
      rr(ctx, x - 26, y - 20, 52, 12, 8)
      ctx.stroke()
      // ручка
      ctx.fillStyle = '#075985'
      rr(ctx, x - 8, y - 8, 16, 5, 2)
      ctx.fill()
      // снежинки, мерцающие по времени
      const tw = 0.55 + Math.sin(timeMs / 300) * 0.3
      emoji(ctx, '❄️', x - 16, y + 12, 12, tw)
      emoji(ctx, '❄️', x + 16, y + 12, 12, 1.2 - tw)
      break
    }
  }
}

function drawStation(ctx: CanvasRenderingContext2D, st: Station, engine: GameEngine, timeMs: number) {
  const def = STATIONS[st.type]
  const selected = engine.selectedStationId === st.id
  const placing = engine.placing !== null

  // аура морозилки
  if (st.type === 'freeze') {
    const range = def.range * Math.pow(1.08, st.level - 1)
    const pulse = 0.06 + Math.sin(timeMs / 500) * 0.02
    ctx.fillStyle = `rgba(59,130,246,${pulse})`
    ctx.beginPath()
    ctx.arc(st.x, st.y, range, 0, Math.PI * 2)
    ctx.fill()
  }

  // тень
  ctx.fillStyle = 'rgba(0,0,0,0.15)'
  rr(ctx, st.x - 30, st.y - 26, 64, 64, 12)
  ctx.fill()

  // плитка-основание
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

  drawMachine(ctx, st.type, st.x, st.y, timeMs, st.flash)

  // индикатор отката
  if (st.type !== 'freeze' && st.cd > 0) {
    const eff = def.cd / (Math.pow(UPGRADE_RATE, st.level - 1) * engine.buffs.globalSpeed * engine.buffs.typeSpeed[st.type])
    const frac = Math.max(0, Math.min(1, 1 - st.cd / eff))
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.arc(st.x, st.y, 27, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2)
    ctx.stroke()
  }

  // вспышка работы
  if (st.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${Math.min(0.55, st.flash * 2)})`
    rr(ctx, st.x - 32, st.y - 32, 64, 64, 12)
    ctx.fill()
  }

  // уровень — звёздочки-точки
  for (let i = 0; i < st.level; i++) {
    ctx.fillStyle = '#f59e0b'
    ctx.beginPath()
    ctx.arc(st.x - 10 + i * 10, st.y + 24, 3.2, 0, Math.PI * 2)
    ctx.fill()
  }
}

// ---------- Призрак при размещении ----------
function drawGhost(ctx: CanvasRenderingContext2D, engine: GameEngine, view: RenderView) {
  if (!engine.placing) return
  const def = STATIONS[engine.placing]

  // подсветка всех доступных клеток
  ctx.fillStyle = 'rgba(34,197,94,0.10)'
  for (let cx = 0; cx < COLS; cx++) {
    for (let cy = 0; cy < ROWS; cy++) {
      if (engine.canPlaceAt(cx, cy)) {
        rr(ctx, cx * CELL + 3, cy * CELL + 3, CELL - 6, CELL - 6, 9)
        ctx.fill()
      }
    }
  }

  if (!view.hover) return
  const { cx, cy } = view.hover
  const ok = engine.canPlaceAt(cx, cy)
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

  ctx.globalAlpha = 0.72
  ctx.fillStyle = ok ? def.color : '#fca5a5'
  rr(ctx, x - 32, y - 32, 64, 64, 12)
  ctx.fill()
  ctx.strokeStyle = ok ? def.border : '#dc2626'
  ctx.lineWidth = 3
  rr(ctx, x - 32, y - 32, 64, 64, 12)
  ctx.stroke()
  drawMachine(ctx, engine.placing, x, y, view.timeMs, 0)
  ctx.globalAlpha = 1
}

// ---------- Блюда ----------
const STEP_CHIP: Record<string, { bg: string; border: string }> = {
  chop: { bg: '#fef3c7', border: '#f59e0b' },
  fry: { bg: '#fee2e2', border: '#ef4444' },
  season: { bg: '#f3e8ff', border: '#a855f7' },
  plate: { bg: '#e0f2fe', border: '#0ea5e9' },
}

function drawDish(ctx: CanvasRenderingContext2D, d: Dish, engine: GameEngine, timeMs: number) {
  const r = RECIPES[d.recipeId]
  const pos = pointAt(d.dist)
  const bobY = Math.sin(d.bob) * 2.5

  // тень
  ctx.fillStyle = 'rgba(0,0,0,0.18)'
  ctx.beginPath()
  ctx.ellipse(pos.x, pos.y + 16, 17, 5, 0, 0, Math.PI * 2)
  ctx.fill()

  // тарелка-подставка
  ctx.fillStyle = d.spoiled ? '#9e9a94' : '#fbfaf8'
  ctx.beginPath()
  ctx.ellipse(pos.x, pos.y + 8, 19, 11, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = d.spoiled ? '#78716c' : '#cfc9c1'
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.fillStyle = d.spoiled ? '#8a8680' : '#efece7'
  ctx.beginPath()
  ctx.ellipse(pos.x, pos.y + 7, 13, 7, 0, 0, Math.PI * 2)
  ctx.fill()

  // само блюдо
  const alpha = d.spoiled ? 0.8 : 1
  emoji(ctx, r.emoji, pos.x, pos.y - 12 + bobY, 30, alpha)
  if (d.spoiled) {
    // подгоревший налёт
    ctx.fillStyle = 'rgba(60,50,40,0.28)'
    ctx.beginPath()
    ctx.arc(pos.x, pos.y - 12 + bobY, 17, 0, Math.PI * 2)
    ctx.fill()
    emoji(ctx, '💀', pos.x + 15, pos.y - 24 + bobY, 15)
  } else if (d.heat >= 1) {
    const fa = 0.55 + Math.sin(timeMs / 130) * 0.35
    emoji(ctx, d.heat >= 2 ? '🔥' : '♨️', pos.x + 15, pos.y - 24 + bobY, 16, fa)
  }
  if (d.slowNow && !d.spoiled) emoji(ctx, '❄️', pos.x - 17, pos.y - 26 + bobY, 14, 0.9)

  // чипсы шагов рецепта
  const chips = r.steps
  const cw = 36
  const gap = 3
  const totalW = chips.length * cw + (chips.length - 1) * gap
  let x0 = pos.x - totalW / 2
  const y0 = pos.y + 22 + bobY * 0.4
  for (const s of chips) {
    const done = d.prog[s.type] >= s.count
    const style = STEP_CHIP[s.type]
    ctx.fillStyle = done ? 'rgba(34,197,94,0.95)' : (style ? style.bg : '#fff')
    rr(ctx, x0, y0, cw, 16, 8)
    ctx.fill()
    ctx.strokeStyle = done ? '#16a34a' : (style ? style.border : 'rgba(0,0,0,0.2)')
    ctx.lineWidth = 1.2
    rr(ctx, x0, y0, cw, 16, 8)
    ctx.stroke()
    const info = { chop: '🔪', fry: '🍳', season: '🧂', plate: '🍽️' }[s.type]
    emoji(ctx, info, x0 + 10, y0 + 8, 10)
    text(ctx, `${d.prog[s.type]}/${s.count}`, x0 + 24, y0 + 9, 10, done ? '#064e3b' : '#57534e', 700)
    x0 += cw + gap
  }
}

// ---------- Частицы ----------
function drawParticles(ctx: CanvasRenderingContext2D, engine: GameEngine) {
  for (const p of engine.particles) {
    const lf = Math.max(0, p.life / p.maxLife)
    switch (p.kind) {
      case 'steam':
      case 'smoke': {
        const grow = 1 + (1 - lf) * 1.4
        ctx.fillStyle = p.color
        ctx.globalAlpha = lf * (p.kind === 'steam' ? 0.4 : 0.32)
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * grow, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
        break
      }
      case 'spark': {
        ctx.fillStyle = p.color
        ctx.globalAlpha = lf
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#fffbeb'
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * 0.4, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
        break
      }
      case 'star': {
        emoji(ctx, '⭐', p.x, p.y, p.size * lf, lf)
        break
      }
      case 'puff': {
        ctx.fillStyle = p.color
        ctx.globalAlpha = lf * 0.5
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * (1 + (1 - lf)), 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
        break
      }
    }
  }
}

// ---------- Всплывающие тексты (с pop-масштабом) ----------
function drawFloats(ctx: CanvasRenderingContext2D, engine: GameEngine) {
  for (const f of engine.floats) {
    const t = 1 - f.life / f.maxLife
    const alpha = Math.min(1, f.life / (f.maxLife * 0.5))
    const scale = t < 0.14 ? 0.55 + (t / 0.14) * 0.5 : 1.05 - Math.min(0.05, (t - 0.14) * 0.3)
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.translate(f.x, f.y - t * 34)
    ctx.scale(scale, scale)
    text(ctx, f.text, 0, 0, f.size, f.color, 700)
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

  for (const d of engine.dishes) drawDish(ctx, d, engine, view.timeMs)

  drawParticles(ctx, engine)

  // превью очереди у склада
  const q = engine.queuePreview()
  if (q.length > 0 && (engine.phase === 'wave' || engine.phase === 'build')) {
    text(ctx, 'далее:', 105, 258, 11, '#78716c', 600)
    q.forEach((em, i) => emoji(ctx, em, 70 + i * 34, 276, 24))
  }

  drawFloats(ctx, engine)
}

export { PATH_LEN }
