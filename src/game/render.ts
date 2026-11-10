import {
  W, H, CELL, COLS, ROWS, PATH, MOUTH, BLOCKED,
  TOWERS, ENEMIES, pointAt,
} from './config'
import type { GameEngine } from './engine'
import type { Enemy, EnemyId, TowerId } from './types'

export interface RenderView {
  hover: { cx: number; cy: number } | null
  timeMs: number
}

const FONT = "'Segoe UI',system-ui,-apple-system,Roboto,sans-serif"

// ---------- Утилиты ----------
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, stroke?: string, lw = 2) {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = fill
  ctx.fill()
  if (stroke) {
    ctx.strokeStyle = stroke
    ctx.lineWidth = lw
    ctx.stroke()
  }
}

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, weight = 700, align: CanvasTextAlign = 'center') {
  ctx.save()
  ctx.font = `${weight} ${size}px ${FONT}`
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  ctx.fillText(s, x, y)
  ctx.restore()
}

/** Детерминированный ГПСЧ для декора */
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const PATH_LEN_CACHE = (() => {
  let acc = 0
  for (let i = 0; i < PATH.length - 1; i++) acc += Math.hypot(PATH[i + 1].x - PATH[i].x, PATH[i + 1].y - PATH[i].y)
  return acc
})()

// ---------- Фон (кэшируется один раз) ----------
let bgCache: HTMLCanvasElement | null = null

function buildBackground(): HTMLCanvasElement {
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const ctx = cv.getContext('2d')!

  // плитка кухни
  for (let cx = 0; cx < COLS; cx++) {
    for (let cy = 0; cy < ROWS; cy++) {
      ctx.fillStyle = (cx + cy) % 2 === 0 ? '#efe7d9' : '#e4d8c4'
      ctx.fillRect(cx * CELL, cy * CELL, CELL, CELL)
    }
  }
  ctx.strokeStyle = 'rgba(120,100,70,0.10)'
  ctx.lineWidth = 1
  for (let cx = 0; cx <= COLS; cx++) {
    ctx.beginPath(); ctx.moveTo(cx * CELL, 0); ctx.lineTo(cx * CELL, H); ctx.stroke()
  }
  for (let cy = 0; cy <= ROWS; cy++) {
    ctx.beginPath(); ctx.moveTo(0, cy * CELL); ctx.lineTo(W, cy * CELL); ctx.stroke()
  }

  // декор: крошки и веточки на свободных клетках
  const rnd = mulberry32(20260207)
  for (let i = 0; i < 90; i++) {
    const px = rnd() * W
    const py = rnd() * H
    const cxi = Math.floor(px / CELL)
    const cyi = Math.floor(py / CELL)
    if (BLOCKED.has(`${cxi},${cyi}`)) continue
    ctx.save()
    ctx.globalAlpha = 0.25
    if (rnd() < 0.5) {
      ctx.fillStyle = '#a8a29e'
      ctx.beginPath()
      ctx.arc(px, py, 1.6 + rnd() * 1.4, 0, Math.PI * 2)
      ctx.fill()
    } else {
      ctx.strokeStyle = '#86efac'
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(px, py)
      ctx.lineTo(px + 4 - rnd() * 8, py - 4 - rnd() * 4)
      ctx.stroke()
    }
    ctx.restore()
  }

  // дорога — разделочная доска
  const drawPath = (lw: number, color: string) => {
    ctx.beginPath()
    ctx.moveTo(PATH[0].x, PATH[0].y)
    for (let i = 1; i < PATH.length; i++) ctx.lineTo(PATH[i].x, PATH[i].y)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = lw
    ctx.strokeStyle = color
    ctx.stroke()
  }
  drawPath(52, 'rgba(76,54,30,0.25)')   // тень
  drawPath(48, '#92610f')
  drawPath(48, '#a4713b')
  drawPath(40, '#c99a5f')
  // волокна доски
  ctx.save()
  ctx.globalAlpha = 0.25
  ctx.setLineDash([26, 34])
  drawPath(2.5, '#8a5a2b')
  ctx.setLineDash([])
  ctx.restore()
  // крошки на дороге
  ctx.save()
  const rnd2 = mulberry32(777)
  for (let d = 30; d < PATH_LEN_CACHE; d += 34) {
    const p = pointAt(d + rnd2() * 16)
    const off = (rnd2() - 0.5) * 26
    ctx.globalAlpha = 0.5
    ctx.fillStyle = rnd2() < 0.5 ? '#8a5a2b' : '#f5deb3'
    ctx.beginPath()
    ctx.arc(p.x - Math.sin(p.ang) * off, p.y + Math.cos(p.ang) * off, 1.5 + rnd2() * 1.8, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()

  // стрелка старта
  const s0 = pointAt(16)
  ctx.save()
  ctx.translate(s0.x + 84, s0.y)
  ctx.fillStyle = '#16a34a'
  ctx.beginPath()
  ctx.moveTo(12, 0)
  ctx.lineTo(-8, -11)
  ctx.lineTo(-3, 0)
  ctx.lineTo(-8, 11)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
  text(ctx, 'СТАРТ', s0.x + 84, s0.y - 24, 12, '#15803d')

  return cv
}

function getBackground(): HTMLCanvasElement {
  if (!bgCache) bgCache = buildBackground()
  return bgCache
}

// ---------- РОТ ----------
function drawMouth(ctx: CanvasRenderingContext2D, eng: GameEngine, timeMs: number) {
  const t = timeMs / 1000
  const bite = eng.chompT > 0 ? Math.sin((1 - eng.chompT / 0.62) * Math.PI) : 0
  const breath = 1 + Math.sin(t * 2.1) * 0.02

  // глаза следят за ближайшей целью
  let lookX = 0
  let lookY = 0
  let bestD = 1e9
  for (const e of eng.enemies) {
    const d = Math.hypot(e.x - MOUTH.x, e.y - MOUTH.y)
    if (d < bestD) { bestD = d; lookX = (e.x - MOUTH.x) / (d || 1); lookY = (e.y - MOUTH.y) / (d || 1) }
  }

  // тень
  ctx.save()
  ctx.globalAlpha = 0.3
  ctx.fillStyle = '#431407'
  ctx.beginPath()
  ctx.ellipse(MOUTH.x + 4, MOUTH.y + 54, MOUTH.r * 0.95, 16, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // губы
  ctx.save()
  ctx.translate(MOUTH.x, MOUTH.y)
  ctx.scale(breath, breath)
  ctx.beginPath()
  ctx.ellipse(0, 0, MOUTH.r, MOUTH.r * 0.92, 0, 0, Math.PI * 2)
  ctx.fillStyle = '#e11d48'
  ctx.fill()
  ctx.lineWidth = 5
  ctx.strokeStyle = '#881337'
  ctx.stroke()

  // блик на верхней губе
  ctx.beginPath()
  ctx.ellipse(-14, -MOUTH.r * 0.55, 22, 7, -0.3, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.28)'
  ctx.fill()

  // раскрытая пасть
  const cavRx = MOUTH.r * 0.62
  const cavRy = MOUTH.r * 0.78 * (1 - bite * 0.42)
  ctx.beginPath()
  ctx.ellipse(0, 2, cavRx, cavRy, 0, 0, Math.PI * 2)
  ctx.fillStyle = '#5b1113'
  ctx.fill()

  // язычок
  ctx.save()
  ctx.beginPath()
  ctx.ellipse(0, 2, cavRx, cavRy, 0, 0, Math.PI * 2)
  ctx.clip()
  ctx.beginPath()
  ctx.ellipse(0, cavRy * 0.62, cavRx * 0.86, cavRy * 0.5, 0, 0, Math.PI * 2)
  ctx.fillStyle = '#fb7185'
  ctx.fill()
  // язычок в глубине
  ctx.beginPath()
  ctx.ellipse(0, -cavRy * 0.5 + Math.sin(t * 3) * 2, 6, 10, 0, 0, Math.PI * 2)
  ctx.fillStyle = '#fda4af'
  ctx.fill()
  ctx.restore()

  // зубы верхние и нижние
  const toothW = 13
  const toothH = 15
  const topY = -cavRy + bite * 26
  const botY = cavRy - toothH - bite * 22
  ctx.fillStyle = '#ffffff'
  ctx.strokeStyle = '#cbd5e1'
  ctx.lineWidth = 1.5
  for (let i = -2; i <= 2; i++) {
    const x = i * (toothW + 1.5)
    rr(ctx, x - toothW / 2, topY, toothW, toothH, 4)
    ctx.fill(); ctx.stroke()
  }
  for (let i = -1; i <= 1; i++) {
    const x = i * (toothW + 2)
    rr(ctx, x - toothW / 2, botY, toothW, toothH, 4)
    ctx.fill(); ctx.stroke()
  }
  ctx.restore()

  // глаза над ртом
  const eyeY = MOUTH.y - MOUTH.r - 24
  for (const side of [-1, 1]) {
    const ex = MOUTH.x + side * 26
    circle(ctx, ex, eyeY, 11, '#ffffff', '#1c1917', 2.5)
    circle(ctx, ex + lookX * 4, eyeY + lookY * 4, 4.6, '#1c1917')
    // сердитая бровь
    ctx.save()
    ctx.strokeStyle = '#1c1917'
    ctx.lineWidth = 3.4
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(ex - side * 9, eyeY - 15 + (side < 0 ? 3 : -3) * 0.4)
    ctx.lineTo(ex + side * 9, eyeY - 11 + (side < 0 ? -3 : 3) * 0.4)
    ctx.stroke()
    ctx.restore()
  }
}

// ---------- БАШНИ ----------
function drawTowerBase(ctx: CanvasRenderingContext2D, color: string) {
  ctx.save()
  ctx.globalAlpha = 0.25
  ctx.fillStyle = '#431407'
  ctx.beginPath()
  ctx.ellipse(0, 12, 15, 6, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  rr(ctx, -16, -16, 32, 32, 9)
  ctx.fillStyle = 'rgba(255,255,255,0.65)'
  ctx.fill()
  rr(ctx, -16, -16, 32, 32, 9)
  ctx.strokeStyle = color
  ctx.lineWidth = 2.5
  ctx.stroke()
}

function drawTowerBody(ctx: CanvasRenderingContext2D, type: TowerId, level: number, ang: number, fire: number, flameOn: number, timeMs: number) {
  const t = timeMs / 1000
  const def = TOWERS[type]
  drawTowerBase(ctx, def.color)

  const muzzle = fire > 0 ? fire / 0.15 : 0
  ctx.save()
  switch (type) {
    case 'broccoli': {
      // стебель
      rr(ctx, -4, 0, 8, 14, 3)
      ctx.fillStyle = '#86efac'; ctx.fill()
      ctx.strokeStyle = '#15803d'; ctx.lineWidth = 1.5; ctx.stroke()
      // кочан
      circle(ctx, -6, -6, 8, '#22c55e', '#15803d', 2)
      circle(ctx, 7, -5, 7.5, '#16a34a', '#15803d', 2)
      circle(ctx, 0, -12, 8.5, '#4ade80', '#15803d', 2)
      // ствол
      ctx.save()
      ctx.rotate(ang)
      ctx.fillStyle = '#166534'
      rr(ctx, 6, -3.4, 14 + muzzle * 3, 6.8, 3)
      ctx.fill()
      if (muzzle > 0) circle(ctx, 24, 0, 5 * muzzle, '#bef264')
      ctx.restore()
      break
    }
    case 'carrot': {
      ctx.save()
      ctx.rotate(ang - Math.PI / 2)
      // корень-снаряд смотрит в сторону ang
      ctx.beginPath()
      ctx.moveTo(0, -16 - muzzle * 3)
      ctx.quadraticCurveTo(7, -2, 4.5, 10)
      ctx.lineTo(-4.5, 10)
      ctx.quadraticCurveTo(-7, -2, 0, -16 - muzzle * 3)
      ctx.fillStyle = '#fb923c'
      ctx.fill()
      ctx.strokeStyle = '#c2410c'
      ctx.lineWidth = 1.6
      ctx.stroke()
      // ботва сзади
      ctx.strokeStyle = '#16a34a'
      ctx.lineWidth = 3
      ctx.lineCap = 'round'
      for (const dx of [-4, 0, 4]) {
        ctx.beginPath()
        ctx.moveTo(dx * 0.6, 9)
        ctx.lineTo(dx * 1.6, 17)
        ctx.stroke()
      }
      ctx.restore()
      break
    }
    case 'tomato': {
      circle(ctx, 0, -2, 13, '#ef4444', '#991b1b', 2)
      ctx.beginPath()
      ctx.ellipse(-4, -7, 4.5, 2.6, -0.6, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.45)'
      ctx.fill()
      // листики
      ctx.fillStyle = '#16a34a'
      for (let i = 0; i < 4; i++) {
        ctx.save()
        ctx.translate(0, -14)
        ctx.rotate((Math.PI * 2 * i) / 4 + 0.4)
        ctx.beginPath()
        ctx.ellipse(0, -4, 2.4, 4.6, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
      // мортира
      ctx.save()
      ctx.rotate(ang)
      ctx.fillStyle = '#7f1d1d'
      rr(ctx, 4, -4.5, 15, 9, 4)
      ctx.fill()
      ctx.fillStyle = '#450a0a'
      ctx.beginPath()
      ctx.ellipse(19, 0, 3, 4.5, 0, 0, Math.PI * 2)
      ctx.fill()
      if (muzzle > 0) circle(ctx, 23, 0, 7 * muzzle, '#fca5a5')
      ctx.restore()
      break
    }
    case 'berry': {
      // гроздь ледяных ягод
      circle(ctx, -6, -4, 7.5, '#a5f3fc', '#0e7490', 2)
      circle(ctx, 7, -3, 7, '#67e8f9', '#0e7490', 2)
      circle(ctx, 0, -11, 8, '#bae6fd', '#0e7490', 2)
      circle(ctx, 0, -11, 3, 'rgba(255,255,255,0.75)')
      // блеск-искра
      const tw = 0.5 + 0.5 * Math.sin(t * 4)
      ctx.save()
      ctx.globalAlpha = tw
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(10, -16); ctx.lineTo(16, -16)
      ctx.moveTo(13, -19); ctx.lineTo(13, -13)
      ctx.stroke()
      ctx.restore()
      // ледяная пушка
      ctx.save()
      ctx.rotate(ang)
      ctx.fillStyle = '#0e7490'
      rr(ctx, 6, -3, 13, 6, 3)
      ctx.fill()
      if (muzzle > 0) circle(ctx, 22, 0, 5 * muzzle, '#cffafe')
      ctx.restore()
      break
    }
    case 'blender': {
      // база
      rr(ctx, -10, 2, 20, 14, 4)
      ctx.fillStyle = '#e7e5e4'; ctx.fill()
      ctx.strokeStyle = '#57534e'; ctx.lineWidth = 1.6; ctx.stroke()
      // кувшин с соком
      rr(ctx, -9, -18, 18, 22, 5)
      ctx.fillStyle = '#ddd6fe'; ctx.fill()
      ctx.strokeStyle = '#6d28d9'; ctx.lineWidth = 2; ctx.stroke()
      rr(ctx, -7, -8 + Math.sin(t * 6) * 1.5, 14, 10, 3)
      ctx.fillStyle = '#8b5cf6'; ctx.fill()
      // крышка-контакт
      circle(ctx, 0, -20, 4.5, '#facc15', '#a16207', 1.5)
      if (muzzle > 0) {
        ctx.save()
        ctx.globalAlpha = muzzle
        circle(ctx, 0, -20, 8 * muzzle, '#fef08a')
        ctx.restore()
      }
      break
    }
    case 'chili': {
      // перчик
      ctx.save()
      ctx.rotate(-0.5)
      ctx.beginPath()
      ctx.moveTo(-3, -14)
      ctx.quadraticCurveTo(10, -8, 8, 6)
      ctx.quadraticCurveTo(6, 14, 0, 13)
      ctx.quadraticCurveTo(-9, 10, -8, -2)
      ctx.quadraticCurveTo(-7, -11, -3, -14)
      ctx.fillStyle = '#dc2626'
      ctx.fill()
      ctx.strokeStyle = '#7f1d1d'
      ctx.lineWidth = 1.6
      ctx.stroke()
      ctx.restore()
      circle(ctx, -2, -15, 3.4, '#16a34a', '#14532d', 1.5)
      // сопло огнемёта
      ctx.save()
      ctx.rotate(ang)
      ctx.fillStyle = '#57534e'
      ctx.beginPath()
      ctx.moveTo(8, -5)
      ctx.lineTo(19, -2.6)
      ctx.lineTo(19, 2.6)
      ctx.lineTo(8, 5)
      ctx.closePath()
      ctx.fill()
      if (flameOn > 0) {
        ctx.globalAlpha = Math.min(1, flameOn * 4)
        circle(ctx, 24, 0, 8, 'rgba(251,146,60,0.8)')
        circle(ctx, 28, 0, 4.5, 'rgba(253,224,71,0.9)')
      }
      ctx.restore()
      break
    }
  }
  ctx.restore()

  // уровень — золотые звёздочки
  for (let i = 0; i < level - 1; i++) {
    const px = (i === 0 ? -5 : 5)
    ctx.save()
    ctx.translate(px, 20)
    ctx.fillStyle = '#fbbf24'
    ctx.strokeStyle = '#92400e'
    ctx.lineWidth = 1
    star(ctx, 0, 0, 4.2)
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  }
}

function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45
    const a = -Math.PI / 2 + (Math.PI * i) / 5
    const x = cx + Math.cos(a) * rad
    const y = cy + Math.sin(a) * rad
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
}

// ---------- ВРЕДНАЯ ЕДА ----------
function face(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, angry = true) {
  circle(ctx, x - 3.4 * s, y, 2.6 * s, '#ffffff')
  circle(ctx, x + 3.4 * s, y, 2.6 * s, '#ffffff')
  circle(ctx, x - 3.0 * s, y + 0.4 * s, 1.3 * s, '#1c1917')
  circle(ctx, x + 3.8 * s, y + 0.4 * s, 1.3 * s, '#1c1917')
  if (angry) {
    ctx.strokeStyle = '#1c1917'
    ctx.lineWidth = 1.4 * s
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(x - 6 * s, y - 4.4 * s); ctx.lineTo(x - 1.4 * s, y - 2.6 * s)
    ctx.moveTo(x + 6 * s, y - 4.4 * s); ctx.lineTo(x + 1.4 * s, y - 2.6 * s)
    ctx.stroke()
  }
}

function drawEnemyBody(ctx: CanvasRenderingContext2D, type: EnemyId, bob: number) {
  const wob = Math.sin(bob) * 0.06
  ctx.save()
  ctx.rotate(wob)
  switch (type) {
    case 'candy': {
      // фантики
      ctx.fillStyle = '#f9a8d4'
      for (const side of [-1, 1]) {
        ctx.beginPath()
        ctx.moveTo(side * 8, 0)
        ctx.lineTo(side * 15, -5)
        ctx.lineTo(side * 13, 0)
        ctx.lineTo(side * 15, 5)
        ctx.closePath()
        ctx.fill()
      }
      circle(ctx, 0, 0, 9, '#f472b6', '#be185d', 2)
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'
      ctx.lineWidth = 2.4
      ctx.beginPath()
      ctx.arc(0, 0, 5.5, -0.8, 1.6)
      ctx.stroke()
      face(ctx, 1.5, -1, 0.9)
      break
    }
    case 'fries': {
      // палочки
      ctx.fillStyle = '#facc15'
      ctx.strokeStyle = '#a16207'
      ctx.lineWidth = 1.4
      for (const dx of [-6, -2, 2, 6]) {
        rr(ctx, dx - 2.6, -20, 5.2, 16, 2.4)
        ctx.fill(); ctx.stroke()
      }
      // коробка
      ctx.beginPath()
      ctx.moveTo(-11, -8)
      ctx.lineTo(11, -8)
      ctx.lineTo(9, 12)
      ctx.lineTo(-9, 12)
      ctx.closePath()
      ctx.fillStyle = '#dc2626'
      ctx.fill()
      ctx.strokeStyle = '#7f1d1d'
      ctx.lineWidth = 2
      ctx.stroke()
      face(ctx, 0, 1, 0.85)
      break
    }
    case 'cupcake': {
      // обёртка
      ctx.beginPath()
      ctx.moveTo(-9, -2)
      ctx.lineTo(9, -2)
      ctx.lineTo(7, 13)
      ctx.lineTo(-7, 13)
      ctx.closePath()
      ctx.fillStyle = '#f472b6'
      ctx.fill()
      ctx.strokeStyle = '#9d174d'
      ctx.lineWidth = 1.6
      ctx.stroke()
      ctx.strokeStyle = '#9d174d'
      ctx.lineWidth = 1
      for (const dx of [-4, 0, 4]) {
        ctx.beginPath()
        ctx.moveTo(dx, -2)
        ctx.lineTo(dx * 0.8, 13)
        ctx.stroke()
      }
      // крем
      circle(ctx, 0, -5, 9, '#fef3c7', '#d97706', 1.6)
      circle(ctx, -5, -1, 5.5, '#fef9c3')
      circle(ctx, 5, -1, 5.5, '#fef9c3')
      circle(ctx, 0, -9, 3, '#ef4444', '#991b1b', 1)
      face(ctx, 0, -4, 0.8)
      break
    }
    case 'donut': {
      circle(ctx, 0, 0, 13, '#eab308', '#92400e', 2)
      // глазурь
      ctx.beginPath()
      ctx.arc(0, 0, 10.5, Math.PI * 0.95, Math.PI * 2.1)
      ctx.arc(0, 0, 4.5, Math.PI * 2.1, Math.PI * 0.95, true)
      ctx.closePath()
      ctx.fillStyle = '#f472b6'
      ctx.fill()
      // посыпка
      const colsSpr = ['#22c55e', '#3b82f6', '#fef08a']
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI * 0.9 + (i / 5) * Math.PI * 1.1
        const px = Math.cos(a) * 8
        const py = Math.sin(a) * 8
        ctx.strokeStyle = colsSpr[i % 3]
        ctx.lineWidth = 1.8
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(px - 2, py - 1)
        ctx.lineTo(px + 2, py + 1)
        ctx.stroke()
      }
      circle(ctx, 0, 0, 4, '#e4d8c4', '#92400e', 1.4)
      face(ctx, 5, 4, 0.75)
      break
    }
    case 'cola': {
      rr(ctx, -8, -13, 16, 26, 5)
      ctx.fillStyle = '#cbd5e1'
      ctx.fill()
      ctx.strokeStyle = '#475569'
      ctx.lineWidth = 1.8
      ctx.stroke()
      ctx.save()
      rr(ctx, -8, -13, 16, 26, 5)
      ctx.clip()
      ctx.fillStyle = '#dc2626'
      ctx.fillRect(-8, -6, 16, 12)
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.moveTo(-8, 2)
      ctx.quadraticCurveTo(0, -4, 8, 2)
      ctx.lineTo(8, 6)
      ctx.quadraticCurveTo(0, 0, -8, 6)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
      face(ctx, 0, 0, 0.85)
      break
    }
    case 'pizza': {
      ctx.beginPath()
      ctx.moveTo(16, 0)
      ctx.quadraticCurveTo(-2, -12, -12, -10)
      ctx.quadraticCurveTo(-15, 0, -12, 10)
      ctx.quadraticCurveTo(-2, 12, 16, 0)
      ctx.closePath()
      ctx.fillStyle = '#fbbf24'
      ctx.fill()
      ctx.strokeStyle = '#b45309'
      ctx.lineWidth = 1.8
      ctx.stroke()
      // корж сзади
      ctx.beginPath()
      ctx.ellipse(-11, 0, 3.6, 9, 0, 0, Math.PI * 2)
      ctx.fillStyle = '#d97706'
      ctx.fill()
      circle(ctx, 0, -3, 2.6, '#dc2626')
      circle(ctx, 4, 3, 2.6, '#dc2626')
      circle(ctx, -4, 4, 2.2, '#dc2626')
      face(ctx, 3, -2, 0.75)
      break
    }
    case 'burger': {
      // нижняя булка
      ctx.beginPath()
      ctx.ellipse(0, 8, 14, 6, 0, 0, Math.PI * 2)
      ctx.fillStyle = '#d97706'
      ctx.fill()
      ctx.strokeStyle = '#92400e'
      ctx.lineWidth = 1.6
      ctx.stroke()
      // котлета
      rr(ctx, -14, 2, 28, 6, 3)
      ctx.fillStyle = '#7c2d12'
      ctx.fill()
      // сыр
      ctx.beginPath()
      ctx.moveTo(-15, 2)
      ctx.lineTo(15, 2)
      ctx.lineTo(11, -2)
      ctx.lineTo(-11, -2)
      ctx.closePath()
      ctx.fillStyle = '#facc15'
      ctx.fill()
      // салат
      ctx.beginPath()
      ctx.moveTo(-14, -2)
      for (let i = 0; i < 5; i++) {
        ctx.quadraticCurveTo(-11 + i * 5.5, -6, -8 + i * 5.5, -2)
      }
      ctx.lineTo(14, -2)
      ctx.closePath()
      ctx.fillStyle = '#84cc16'
      ctx.fill()
      // верхняя булка
      ctx.beginPath()
      ctx.ellipse(0, -6, 14, 9, 0, Math.PI, 0)
      ctx.closePath()
      ctx.fillStyle = '#f59e0b'
      ctx.fill()
      ctx.strokeStyle = '#92400e'
      ctx.stroke()
      ctx.fillStyle = '#fef3c7'
      for (const [sx, sy] of [[-6, -10], [0, -13], [6, -10], [-2, -8]] as const) {
        ctx.beginPath()
        ctx.ellipse(sx, sy, 1.6, 2.6, 0.4, 0, Math.PI * 2)
        ctx.fill()
      }
      face(ctx, 0, -6, 0.85)
      break
    }
    case 'choco': {
      rr(ctx, -13, -16, 26, 32, 4)
      ctx.fillStyle = '#78350f'
      ctx.fill()
      ctx.strokeStyle = '#451a03'
      ctx.lineWidth = 2
      ctx.stroke()
      // плитки
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'
      ctx.lineWidth = 1.4
      for (const dx of [-4.3, 4.3]) {
        ctx.beginPath(); ctx.moveTo(dx, -16); ctx.lineTo(dx, 16); ctx.stroke()
      }
      for (const dy of [-5.3, 5.3]) {
        ctx.beginPath(); ctx.moveTo(-13, dy); ctx.lineTo(13, dy); ctx.stroke()
      }
      // надкус
      circle(ctx, 11, -12, 5.5, '#e4d8c4', '#451a03', 1.6)
      face(ctx, -1, 2, 1)
      break
    }
    case 'cake': {
      // нижний ярус
      rr(ctx, -18, -4, 36, 18, 5)
      ctx.fillStyle = '#f9a8d4'
      ctx.fill()
      ctx.strokeStyle = '#9d174d'
      ctx.lineWidth = 2
      ctx.stroke()
      // кремовые потёки
      ctx.fillStyle = '#fdf2f8'
      for (const [dx, h] of [[-14, 6], [-6, 8], [2, 6], [10, 7]] as const) {
        rr(ctx, dx, -4, 5, h, 2.5)
        ctx.fill()
      }
      // верхний ярус
      rr(ctx, -12, -18, 24, 14, 4)
      ctx.fillStyle = '#fbcfe8'
      ctx.fill()
      ctx.strokeStyle = '#9d174d'
      ctx.stroke()
      // свечи с огоньками
      for (const dx of [-7, 0, 7]) {
        ctx.fillStyle = '#fef9c3'
        rr(ctx, dx - 1.6, -28, 3.2, 10, 1.4)
        ctx.fill()
        ctx.save()
        ctx.globalAlpha = 0.9
        circle(ctx, dx, -31 + Math.sin(bob * 3 + dx) * 1.2, 3, '#fde047', '#f59e0b', 1)
        ctx.restore()
      }
      face(ctx, 0, -11, 1.15)
      break
    }
  }
  ctx.restore()
}

function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, timeMs: number) {
  const def = ENEMIES[e.type]
  const bobY = Math.sin(e.bob) * 2.2

  // тень
  ctx.save()
  ctx.globalAlpha = 0.22
  ctx.fillStyle = '#431407'
  ctx.beginPath()
  ctx.ellipse(e.x, e.y + def.r * 0.9, def.r * 0.9, def.r * 0.34, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  ctx.save()
  ctx.translate(e.x, e.y + bobY)
  drawEnemyBody(ctx, e.type, e.bob)
  ctx.restore()

  // поджог
  if (e.burnT > 0) {
    const fl = Math.sin(timeMs / 40 + e.bob) * 0.5 + 0.5
    circle(ctx, e.x, e.y - def.r - 6 + fl * 2, 3.5 + fl * 1.5, 'rgba(251,146,60,0.85)')
    circle(ctx, e.x - 4, e.y - def.r - 3, 2.5, 'rgba(253,224,71,0.8)')
  }
  // заморозка
  if (e.slowT > 0) {
    ctx.save()
    ctx.globalAlpha = 0.4
    circle(ctx, e.x, e.y + bobY, def.r + 3, '#67e8f9')
    ctx.restore()
    ctx.strokeStyle = '#0e7490'
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.moveTo(e.x, e.y + bobY - def.r - 8)
    ctx.lineTo(e.x, e.y + bobY - def.r - 3)
    ctx.moveTo(e.x - 2.6, e.y + bobY - def.r - 6.5)
    ctx.lineTo(e.x + 2.6, e.y + bobY - def.r - 6.5)
    ctx.stroke()
  }

  // полоска здоровья
  if (e.hp < e.maxHp) {
    const w = def.r * 2.4
    const x0 = e.x - w / 2
    const y0 = e.y + bobY - def.r - 9
    ctx.fillStyle = 'rgba(28,25,23,0.55)'
    rr(ctx, x0 - 1, y0 - 1, w + 2, 5.4, 2.6)
    ctx.fill()
    const frac = Math.max(0, e.hp / e.maxHp)
    ctx.fillStyle = frac > 0.5 ? '#4ade80' : frac > 0.22 ? '#fbbf24' : '#f87171'
    rr(ctx, x0, y0, w * frac, 3.4, 1.7)
    ctx.fill()
  }
}

// ---------- Снаряды / эффекты ----------
function drawProjectile(ctx: CanvasRenderingContext2D, p: import('./types').Projectile) {
  if (p.kind === 'tomato') {
    const t = Math.min(1, p.lobT / p.lobTMax)
    const lift = Math.sin(Math.PI * t) * p.arcH
    // тень на земле
    ctx.save()
    ctx.globalAlpha = 0.2
    circle(ctx, p.x, p.y, 5, '#431407')
    ctx.restore()
    circle(ctx, p.x, p.y - lift, 6, '#ef4444', '#991b1b', 1.6)
    ctx.fillStyle = '#16a34a'
    ctx.save()
    ctx.translate(p.x, p.y - lift - 6)
    ctx.rotate(t * 6)
    ctx.beginPath()
    ctx.ellipse(0, -2, 1.6, 3, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    return
  }
  if (p.kind === 'spike') {
    const a = Math.atan2(p.vy, p.vx)
    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.rotate(a)
    ctx.fillStyle = '#fb923c'
    rr(ctx, -8, -2, 16, 4, 2)
    ctx.fill()
    ctx.strokeStyle = '#16a34a'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(-8, 0)
    ctx.lineTo(-12, 0)
    ctx.stroke()
    ctx.restore()
    return
  }
  if (p.kind === 'ice') {
    circle(ctx, p.x, p.y, 4.5, '#a5f3fc', '#0e7490', 1.4)
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.moveTo(p.x - 2, p.y - 2)
    ctx.lineTo(p.x + 2, p.y + 2)
    ctx.stroke()
    return
  }
  // pea
  circle(ctx, p.x, p.y, 4, '#4ade80', '#15803d', 1.4)
}

function drawZap(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[], life: number) {
  const alpha = Math.max(0, life / 0.18)
  ctx.save()
  ctx.globalAlpha = alpha
  for (const [lw, col] of [[4.5, '#8b5cf6'], [1.6, '#f5f3ff']] as const) {
    ctx.strokeStyle = col
    ctx.lineWidth = lw
    ctx.lineJoin = 'round'
    ctx.beginPath()
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]
      const b = pts[i + 1]
      ctx.moveTo(a.x, a.y)
      const mx = (a.x + b.x) / 2 + (Math.random() - 0.5) * 10
      const my = (a.y + b.y) / 2 + (Math.random() - 0.5) * 10
      ctx.lineTo(mx, my)
      ctx.lineTo(b.x, b.y)
    }
    ctx.stroke()
  }
  ctx.restore()
}

function drawParticle(ctx: CanvasRenderingContext2D, p: import('./types').Particle) {
  const a = Math.max(0, p.life / p.maxLife)
  ctx.save()
  ctx.globalAlpha = a
  switch (p.kind) {
    case 'tooth': {
      ctx.translate(p.x, p.y)
      ctx.rotate(p.vx * 0.02)
      ctx.fillStyle = '#ffffff'
      ctx.strokeStyle = '#cbd5e1'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(-4, -5)
      ctx.quadraticCurveTo(0, -7.5, 4, -5)
      ctx.quadraticCurveTo(5, 1, 2.6, 6)
      ctx.lineTo(1.2, 3.4)
      ctx.lineTo(0, 6)
      ctx.lineTo(-1.2, 3.4)
      ctx.lineTo(-2.6, 6)
      ctx.quadraticCurveTo(-5, 1, -4, -5)
      ctx.fill()
      ctx.stroke()
      break
    }
    case 'frost': {
      ctx.strokeStyle = p.color
      ctx.lineWidth = 1.6
      ctx.beginPath()
      ctx.moveTo(p.x - p.size, p.y)
      ctx.lineTo(p.x + p.size, p.y)
      ctx.moveTo(p.x, p.y - p.size)
      ctx.lineTo(p.x, p.y + p.size)
      ctx.stroke()
      break
    }
    default:
      circle(ctx, p.x, p.y, p.size * (0.5 + a * 0.5), p.color)
  }
  ctx.restore()
}

// ---------- Главный рендер ----------
export function renderGame(ctx: CanvasRenderingContext2D, eng: GameEngine, view: RenderView) {
  const timeMs = view.timeMs
  ctx.save()
  if (eng.shakeT > 0) {
    const s = eng.shakeT * 8
    ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s)
  }

  ctx.drawImage(getBackground(), 0, 0)

  // подсказки строительства
  if ((eng.phase === 'build' || eng.phase === 'wave') && eng.placing) {
    ctx.save()
    ctx.globalAlpha = 0.5
    ctx.strokeStyle = '#16a34a'
    ctx.lineWidth = 1.4
    for (let cx = 0; cx < COLS; cx++) {
      for (let cy = 0; cy < ROWS; cy++) {
        if (!eng.canPlaceAt(cx, cy)) continue
        const x = cx * CELL + CELL / 2
        const y = cy * CELL + CELL / 2
        ctx.beginPath()
        ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y)
        ctx.moveTo(x, y - 5); ctx.lineTo(x, y + 5)
        ctx.stroke()
      }
    }
    ctx.restore()
  }

  // радиус выбранной башни
  const sel = eng.getSelected()
  if (sel) {
    const t = eng.towers.find((tw) => tw.id === sel.id)
    if (t) {
      circle(ctx, t.x, t.y, sel.range, 'rgba(255,255,255,0.10)')
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'
      ctx.lineWidth = 1.6
      ctx.setLineDash([6, 6])
      ctx.beginPath()
      ctx.arc(t.x, t.y, sel.range, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
    }
  }

  // превью размещения
  if (eng.placing && view.hover) {
    const { cx, cy } = view.hover
    const ok = eng.canPlaceAt(cx, cy)
    const x = cx * CELL + CELL / 2
    const y = cy * CELL + CELL / 2
    const def = TOWERS[eng.placing]
    const lv = def.levels[0]
    circle(ctx, x, y, lv.range, ok ? 'rgba(74,222,128,0.12)' : 'rgba(239,68,68,0.15)')
    ctx.strokeStyle = ok ? 'rgba(74,222,128,0.7)' : 'rgba(239,68,68,0.8)'
    ctx.lineWidth = 1.6
    ctx.setLineDash([6, 6])
    ctx.beginPath()
    ctx.arc(x, y, lv.range, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = ok ? 'rgba(34,197,94,0.30)' : 'rgba(239,68,68,0.30)'
    rr(ctx, cx * CELL + 2, cy * CELL + 2, CELL - 4, CELL - 4, 8)
    ctx.fill()
    ctx.save()
    ctx.globalAlpha = 0.75
    ctx.translate(x, y)
    drawTowerBody(ctx, eng.placing, 1, -Math.PI / 2, 0, 0, timeMs)
    ctx.restore()
  }

  // башни
  for (const t of eng.towers) {
    ctx.save()
    ctx.translate(t.x, t.y)
    drawTowerBody(ctx, t.type, t.level, t.ang, t.fireAnim, t.flameOn, timeMs)
    ctx.restore()
    if (sel && sel.id === t.id) {
      ctx.strokeStyle = '#fbbf24'
      ctx.lineWidth = 2.4
      rr(ctx, t.cx * CELL + 2, t.cy * CELL + 2, CELL - 4, CELL - 4, 9)
      ctx.stroke()
    }
  }

  // вредная еда
  for (const e of eng.enemies) drawEnemy(ctx, e, timeMs)

  // снаряды
  for (const p of eng.projectiles) drawProjectile(ctx, p)

  // молнии блендера
  for (const z of eng.zaps) drawZap(ctx, z.pts, z.life)

  // рот — рисуем после еды, чтобы «пища исчезала в нём»
  drawMouth(ctx, eng, timeMs)

  // частицы
  for (const p of eng.particles) drawParticle(ctx, p)

  // всплывающие тексты
  for (const f of eng.floats) {
    const a = Math.max(0, f.life / f.maxLife)
    const y = f.y - (1 - a) * 26
    ctx.save()
    ctx.globalAlpha = Math.min(1, a * 1.6)
    ctx.font = `800 ${f.size}px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 4
    ctx.strokeStyle = 'rgba(28,25,23,0.85)'
    ctx.strokeText(f.text, f.x, y)
    ctx.fillStyle = f.color
    ctx.fillText(f.text, f.x, y)
    ctx.restore()
  }

  ctx.restore()

  // красная вспышка при потере зуба
  if (eng.redFlash > 0) {
    ctx.fillStyle = `rgba(220,38,38,${eng.redFlash * 0.4})`
    ctx.fillRect(0, 0, W, H)
  }
}

// ---------- Иконки для магазина ----------
export function drawTowerIcon(ctx: CanvasRenderingContext2D, type: TowerId, size: number, timeMs: number) {
  const s = size / 44
  ctx.save()
  ctx.clearRect(0, 0, size, size)
  ctx.translate(size / 2, size / 2 + 2 * s)
  ctx.scale(s, s)
  drawTowerBody(ctx, type, 1, -Math.PI / 2, 0, 0, timeMs)
  ctx.restore()
}

export function drawEnemyIcon(ctx: CanvasRenderingContext2D, type: EnemyId, size: number, timeMs: number) {
  const s = size / 44
  ctx.save()
  ctx.clearRect(0, 0, size, size)
  ctx.translate(size / 2, size / 2 + 2 * s)
  ctx.scale(s, s)
  drawEnemyBody(ctx, type, timeMs / 300)
  ctx.restore()
}
