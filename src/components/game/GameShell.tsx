'use client'

import { useEffect, useRef, useState } from 'react'
import { GameEngine } from '@/game/engine'
import { renderGame, drawTowerIcon, drawEnemyIcon } from '@/game/render'
import { Sfx } from '@/game/audio'
import { loadSave, persistSave } from '@/game/storage'
import {
  W, H, CELL, TOWERS, TOWER_ORDER, ENEMIES, WAVES, TOTAL_WAVES, makeEndlessWave,
} from '@/game/config'
import type { EnemyId, HudState, SaveData, TowerId } from '@/game/types'

const DEFAULT_SAVE: SaveData = { sound: true, bestWave: 0, wins: 0, runs: 0 }

const DEFAULT_HUD: HudState = {
  phase: 'menu',
  money: 0,
  teeth: 10,
  maxTeeth: 10,
  waveIdx: 0,
  totalWaves: TOTAL_WAVES,
  alive: 0,
  remaining: 0,
  speed: 1,
  paused: false,
  placing: null,
  selected: null,
  waveName: '',
  endless: false,
}

/* ---------- Мини-иконки на canvas ---------- */
function TowerIcon({ id, size = 46 }: { id: TowerId; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (ctx) drawTowerIcon(ctx, id, size, 0)
  }, [id, size])
  return <canvas ref={ref} width={size} height={size} className="shrink-0" />
}

function EnemyIcon({ id, size = 34 }: { id: EnemyId; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (ctx) drawEnemyIcon(ctx, id, size, 0)
  }, [id, size])
  return <canvas ref={ref} width={size} height={size} className="shrink-0" />
}

/* ---------- Зубки ---------- */
function Tooth({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 28" className="w-[15px] h-[17px]" aria-hidden>
      <path
        d="M5 3 C1.5 3 1 6.5 2 10 C3 14 4.5 24 7 24 C9 24 8 16 12 16 C16 16 15 24 17 24 C19.5 24 21 14 22 10 C23 6.5 22.5 3 19 3 Z"
        fill={filled ? '#ffffff' : '#57534e'}
        stroke={filled ? '#a8a29e' : '#3f3f36'}
        strokeWidth="1.4"
      />
    </svg>
  )
}

function TeethRow({ teeth, max }: { teeth: number; max: number }) {
  return (
    <div className="flex items-center gap-[3px]">
      {Array.from({ length: max }, (_, i) => (
        <Tooth key={i} filled={i < teeth} />
      ))}
    </div>
  )
}

/* ---------- Кнопка ---------- */
function Btn({
  children, onClick, tone = 'dark', disabled = false, title, className = '',
}: {
  children: React.ReactNode
  onClick?: () => void
  tone?: 'dark' | 'green' | 'amber' | 'red'
  disabled?: boolean
  title?: string
  className?: string
}) {
  const tones: Record<string, string> = {
    dark: 'bg-stone-800 hover:bg-stone-700 border-stone-600 text-stone-100',
    green: 'bg-green-600 hover:bg-green-500 border-green-400 text-white',
    amber: 'bg-amber-500 hover:bg-amber-400 border-amber-300 text-stone-900',
    red: 'bg-red-700 hover:bg-red-600 border-red-400 text-white',
  }
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg border px-2.5 py-1.5 text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${tones[tone]} ${className}`}
    >
      {children}
    </button>
  )
}

/* ---------- Правила ---------- */
function Rules({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`text-stone-300 ${compact ? 'text-[13px]' : 'text-sm'} space-y-2`}>
      <p>
        <b className="text-red-400">Вредная еда</b> (сахар, фри, чипсы-пончики, кола) едет по дороге к{' '}
        <b className="text-rose-400">огромному открытому рту</b>. Каждая вредность, попавшая внутрь, —{' '}
        <b className="text-rose-400">минус зуб</b>. Потеряешь все 10 — кариес победил.
      </p>
      <p>
        <b className="text-green-400">Башни из здоровой еды</b> стреляют по вредностям и сбивают их.
        Выбери карточку (или клавиши <b>1–6</b>), затем кликни по свободной плитке.
      </p>
      <p>
        Клик по своей башне — <b className="text-amber-400">улучшение</b> до 3 уровня или{' '}
        <b>продажа</b> за 70%. За сбитую вредность дают <b className="text-amber-400">₽</b>.
      </p>
      {!compact && (
        <>
          <p>
            Волна отправляется кнопкой <b className="text-green-400">▶ Волна</b> (или <b>Пробел</b>).
            Успей построиться! Всего <b>{TOTAL_WAVES} волн</b>, дальше — бесконечный режим.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
            {TOWER_ORDER.map((id, i) => (
              <div key={id} className="flex items-center gap-2 rounded-lg bg-stone-900/70 border border-stone-700 px-2 py-1">
                <span className="text-[10px] text-stone-500 font-mono w-3">{i + 1}</span>
                <TowerIcon id={id} size={34} />
                <div className="min-w-0">
                  <div className="text-[12px] font-bold text-stone-100 leading-tight">{TOWERS[id].name}</div>
                  <div className="text-[11px] text-stone-400 leading-tight">{TOWERS[id].desc}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-[11px] text-stone-400">
            {(['candy', 'fries', 'cupcake', 'donut', 'cola', 'pizza', 'burger', 'choco', 'cake'] as EnemyId[]).map((id) => (
              <span key={id} className="inline-flex items-center gap-1">
                <EnemyIcon id={id} size={22} /> {ENEMIES[id].name}
                {ENEMIES[id].armor > 0 ? ` (броня ${ENEMIES[id].armor})` : ''}
              </span>
            ))}
          </div>
        </>
      )}
      <p className="text-[11px] text-stone-500">
        Горячие клавиши: <b>1–6</b> башни · <b>Пробел</b> волна · <b>U</b> улучшить · <b>X</b> продать ·{' '}
        <b>F</b> скорость ×2 · <b>P</b> пауза · <b>Esc</b> отмена
      </p>
    </div>
  )
}

/* ---------- Главный компонент ---------- */
export default function GameShell() {
  const engineRef = useRef<GameEngine | null>(null)
  if (engineRef.current == null) engineRef.current = new GameEngine()
  const sfxRef = useRef<Sfx | null>(null)
  if (sfxRef.current == null) sfxRef.current = new Sfx()

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hoverRef = useRef<{ cx: number; cy: number } | null>(null)
  const [hud, setHud] = useState<HudState>(DEFAULT_HUD)
  const [save, setSave] = useState<SaveData>(() => loadSave())
  const [showRules, setShowRules] = useState(false)
  const [musicOn, setMusicOn] = useState(false)

  // синхронизация звука с состоянием
  useEffect(() => {
    sfxRef.current!.enabled = save.sound
  }, [save.sound])

  // инициализация движка и игрового цикла
  useEffect(() => {
    const engine = engineRef.current!
    const sfx = sfxRef.current!

    engine.sfx = (n) => sfx.play(n)
    engine.onHud = () => setHud(engine.getHud())
    engine.onRunEnd = (win, waveReached) => {
      setSave((prev) => {
        const next: SaveData = {
          ...prev,
          runs: prev.runs + 1,
          wins: prev.wins + (win ? 1 : 0),
          bestWave: Math.max(prev.bestWave, win ? TOTAL_WAVES : waveReached),
        }
        persistSave(next)
        return next
      })
    }

    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      engine.update(dt)
      renderGame(ctx, engine, { hover: hoverRef.current, timeMs: now })
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  // горячие клавиши
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const engine = engineRef.current!
      if (e.repeat) return
      if (e.key === 'Escape') {
        if (showRules) setShowRules(false)
        else engine.cancelPlacing()
        return
      }
      if (e.code === 'Space') {
        e.preventDefault()
        engine.startWave()
        return
      }
      const k = e.key.toLowerCase()
      const idx = Number(e.key)
      if (idx >= 1 && idx <= TOWER_ORDER.length) engine.beginPlacing(TOWER_ORDER[idx - 1])
      else if (k === 'u' || k === 'у') engine.upgradeSelected()
      else if (k === 'x' || k === 'ч') engine.sellSelected()
      else if (k === 'f' || k === 'а') engine.toggleSpeed()
      else if (k === 'p' || k === 'з') engine.togglePause()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showRules])

  // указатель мыши / пальца
  const cellFromEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * W
    const y = ((e.clientY - rect.top) / rect.height) * H
    return { cx: Math.floor(x / CELL), cy: Math.floor(y / CELL) }
  }

  const engine = engineRef.current!
  const sfx = sfxRef.current!

  const toggleSound = () => {
    setSave((prev) => {
      const next = { ...prev, sound: !prev.sound }
      persistSave(next)
      return next
    })
  }

  const toggleMusic = () => {
    const on = !musicOn
    setMusicOn(on)
    sfx.setMusic(on)
  }

  const startGame = () => {
    engine.startRun()
    const w = Number(new URLSearchParams(window.location.search).get('wave'))
    if (w >= 1) engine.debugJump(w)
    sfx.play('click')
  }

  // состав следующей волны (для превью)
  const nextWave = hud.waveIdx < TOTAL_WAVES ? WAVES[hud.waveIdx] : makeEndlessWave(hud.waveIdx + 1)
  const waveComp = new Map<EnemyId, number>()
  for (const g of nextWave.groups) waveComp.set(g.type, (waveComp.get(g.type) ?? 0) + g.count)

  const inGame = hud.phase !== 'menu'

  return (
    <div className="min-h-screen w-full bg-stone-950 bg-[radial-gradient(ellipse_at_top,#292524_0%,#0c0a09_70%)] flex flex-col items-center px-2 py-3 gap-2 select-none">
      {/* ---------- Верхняя панель ---------- */}
      <header className="w-full max-w-[1200px] flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <div className="font-black tracking-tight text-lg text-green-400 flex items-center gap-1.5">
          <span className="text-2xl">🥦</span>
          <span>
            FOODSTORATOR <span className="text-stone-400 font-bold">TD</span>
          </span>
        </div>

        {inGame && (
          <div className="flex flex-wrap items-center gap-1.5 ml-auto">
            <div className="rounded-full bg-stone-900/90 border border-amber-500/40 px-3 py-1 text-amber-300 font-bold text-sm" title="Монеты">
              ₽ {hud.money}
            </div>
            <div className="rounded-full bg-stone-900/90 border border-rose-500/40 px-3 py-1 flex items-center" title="Зубы рта">
              <TeethRow teeth={hud.teeth} max={hud.maxTeeth} />
            </div>
            <div className="rounded-full bg-stone-900/90 border border-stone-600 px-3 py-1 text-stone-200 text-sm font-bold">
              {hud.endless ? `∞ волна ${hud.waveIdx + 1}` : `Волна ${Math.min(hud.waveIdx + 1, TOTAL_WAVES)}/${TOTAL_WAVES}`}
              <span className="hidden sm:inline text-stone-400 font-semibold"> — {hud.waveName}</span>
            </div>
            {hud.phase === 'wave' && (
              <div className="rounded-full bg-stone-900/90 border border-red-500/40 px-3 py-1 text-red-300 text-xs font-bold">
                врагов: {hud.remaining}
              </div>
            )}
            <Btn onClick={() => engine.toggleSpeed()} title="Скорость игры (F)">
              {hud.speed}×
            </Btn>
            <Btn onClick={() => engine.togglePause()} disabled={hud.phase !== 'wave'} title="Пауза (P)">
              {hud.paused ? '▶' : '⏸'}
            </Btn>
            <Btn onClick={toggleSound} title="Звук">
              {save.sound ? '🔊' : '🔇'}
            </Btn>
            <Btn onClick={toggleMusic} tone={musicOn ? 'green' : 'dark'} title="Музыка">
              ♪
            </Btn>
            <Btn onClick={() => setShowRules(true)} title="Правила">
              ?
            </Btn>
            <Btn onClick={startGame} tone="red" title="Начать заново">
              ↺
            </Btn>
          </div>
        )}
        {!inGame && save.bestWave > 0 && (
          <div className="ml-auto text-xs text-stone-400">
            Рекорд: волна <b className="text-amber-300">{save.bestWave}</b> · побед: <b className="text-green-300">{save.wins}</b>
          </div>
        )}
      </header>

      {/* ---------- Игровое поле + магазин ---------- */}
      <div className="w-full max-w-[1200px] flex flex-col lg:flex-row gap-2.5 items-stretch">
        {/* Поле */}
        <div className="relative flex-1 min-w-0">
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            className="w-full h-auto rounded-xl border-2 border-stone-700 shadow-[0_10px_40px_rgba(0,0,0,0.6)] touch-none"
            style={{ cursor: hud.placing ? 'crosshair' : 'pointer' }}
            onPointerDown={(e) => {
              const { cx, cy } = cellFromEvent(e)
              engine.canvasClick(cx, cy)
            }}
            onPointerMove={(e) => {
              hoverRef.current = cellFromEvent(e)
            }}
            onPointerLeave={() => {
              hoverRef.current = null
            }}
            onContextMenu={(e) => {
              e.preventDefault()
              engine.cancelPlacing()
            }}
          />

          {/* Кнопка старта волны */}
          {hud.phase === 'build' && (
            <div className="absolute inset-x-0 bottom-3 flex justify-center pointer-events-none">
              <Btn tone="green" className="pointer-events-auto text-base px-5 py-2 animate-pulse shadow-lg" onClick={() => engine.startWave()}>
                ▶ Волна {hud.waveIdx + 1}
              </Btn>
            </div>
          )}

          {/* Пауза */}
          {hud.paused && hud.phase === 'wave' && (
            <div className="absolute inset-0 bg-stone-950/70 rounded-xl flex flex-col items-center justify-center gap-3">
              <div className="text-3xl font-black text-stone-100">Пауза</div>
              <Btn tone="green" onClick={() => engine.togglePause()}>Продолжить</Btn>
            </div>
          )}

          {/* Меню */}
          {hud.phase === 'menu' && (
            <div className="absolute inset-0 bg-stone-950/88 rounded-xl flex flex-col items-center justify-center p-4 overflow-auto">
              <div className="text-5xl sm:text-6xl mb-1">🥦⚔️🍬</div>
              <h1 className="text-3xl sm:text-4xl font-black text-green-400 tracking-tight text-center">
                FOODSTORATOR TD
              </h1>
              <p className="text-stone-300 text-center mt-1 mb-3 max-w-md text-sm sm:text-base">
                Вредная еда лезет в огромный рот. Расставь здоровую еду-башни
                и не дай кариесу выбить все зубы!
              </p>
              <div className="flex items-center gap-2">
                <Btn tone="green" className="text-lg px-6 py-2.5" onClick={startGame}>
                  ▶ Играть
                </Btn>
                <Btn onClick={() => setShowRules(true)}>Как играть</Btn>
              </div>
              <div className="mt-4 max-w-lg w-full rounded-xl bg-stone-900/80 border border-stone-700 p-3">
                <Rules compact />
              </div>
              {save.bestWave > 0 && (
                <div className="mt-2 text-xs text-stone-400">
                  Рекорд: волна <b className="text-amber-300">{save.bestWave}</b> · побед:{' '}
                  <b className="text-green-300">{save.wins}</b> · попыток: {save.runs}
                </div>
              )}
            </div>
          )}

          {/* Гейм-овер */}
          {hud.phase === 'gameover' && (
            <div className="absolute inset-0 bg-stone-950/88 rounded-xl flex flex-col items-center justify-center p-4 text-center">
              <div className="text-5xl mb-2">🦷💥</div>
              <h2 className="text-3xl font-black text-red-400">КАРИЕС ПОБЕДИЛ!</h2>
              <p className="text-stone-300 mt-1 mb-3 text-sm">
                Вредная еда дошла до рта на волне <b className="text-amber-300">{hud.waveIdx + 1}</b>.
                Зубов осталось: <b className="text-rose-300">{hud.teeth}</b>.
              </p>
              <div className="flex gap-2">
                <Btn tone="green" onClick={startGame}>Заново</Btn>
                <Btn onClick={() => engine.openMenu()}>В меню</Btn>
              </div>
            </div>
          )}

          {/* Победа */}
          {hud.phase === 'victory' && (
            <div className="absolute inset-0 bg-stone-950/88 rounded-xl flex flex-col items-center justify-center p-4 text-center">
              <div className="text-5xl mb-2">🥗🏆</div>
              <h2 className="text-3xl font-black text-green-400">ЖЕЛУДОК СПАСЁН!</h2>
              <p className="text-stone-300 mt-1 mb-3 text-sm">
                Все {TOTAL_WAVES} волн вредной еды отбиты. Рот цел, зубы на месте!
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <Btn tone="green" onClick={() => engine.continueEndless()}>∞ Бесконечный режим</Btn>
                <Btn tone="amber" onClick={startGame}>Заново</Btn>
                <Btn onClick={() => engine.openMenu()}>В меню</Btn>
              </div>
            </div>
          )}

          {/* Правила */}
          {showRules && (
            <div
              className="absolute inset-0 bg-stone-950/90 rounded-xl p-4 overflow-auto"
              onClick={(e) => {
                if (e.target === e.currentTarget) setShowRules(false)
              }}
            >
              <div className="max-w-xl mx-auto rounded-xl bg-stone-900 border border-stone-700 p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-black text-green-400">Как играть</h3>
                  <Btn onClick={() => setShowRules(false)}>✕</Btn>
                </div>
                <Rules />
              </div>
            </div>
          )}
        </div>

        {/* Магазин (справа на десктопе, снизу на мобиле) */}
        {inGame && (
          <aside className="w-full lg:w-[236px] shrink-0 flex lg:flex-col flex-row gap-2 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0">
            {/* Карточки башен */}
            <div className="lg:contents contents">
              <div className="flex lg:flex-col flex-row gap-2">
                {TOWER_ORDER.map((id, i) => {
                  const def = TOWERS[id]
                  const afford = hud.money >= def.cost
                  const active = hud.placing === id
                  return (
                    <button
                      key={id}
                      type="button"
                      title={`${def.name} — ${def.desc}`}
                      disabled={!afford}
                      onClick={() => {
                        if (active) engine.cancelPlacing()
                        else engine.beginPlacing(id)
                      }}
                      className={`shrink-0 w-[150px] lg:w-full flex items-center gap-2 rounded-xl border px-2 py-1.5 text-left transition-colors ${
                        active
                          ? 'border-green-400 bg-green-900/40'
                          : afford
                            ? 'border-stone-700 bg-stone-900/80 hover:border-stone-500'
                            : 'border-stone-800 bg-stone-900/50 opacity-45 cursor-not-allowed'
                      }`}
                    >
                      <span className="text-[10px] font-mono text-stone-500 w-3">{i + 1}</span>
                      <TowerIcon id={id} size={38} />
                      <div className="min-w-0">
                        <div className="text-[12px] font-bold text-stone-100 leading-tight truncate">{def.name}</div>
                        <div className="text-[11px] text-amber-400 font-bold">₽ {def.cost}</div>
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Состав волны */}
              <div className="shrink-0 lg:shrink rounded-xl border border-stone-700 bg-stone-900/80 px-2.5 py-2 min-w-[150px] lg:w-full">
                <div className="text-[11px] uppercase tracking-wide text-stone-500 font-bold mb-1">
                  {hud.phase === 'wave' ? 'Сейчас в волне' : 'Следующая волна'}
                </div>
                <div className="flex lg:flex-col flex-wrap gap-1">
                  {[...waveComp.entries()].map(([id, count]) => (
                    <div key={id} className="flex items-center gap-1.5">
                      <EnemyIcon id={id} size={26} />
                      <span className="text-[12px] text-stone-300">
                        {ENEMIES[id].name} <b className="text-stone-100">×{count}</b>
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Выбранная башня */}
              {hud.selected && (
                <div className="shrink-0 lg:shrink rounded-xl border border-amber-500/50 bg-stone-900/90 px-2.5 py-2 lg:w-full">
                  <div className="text-[13px] font-bold text-amber-300">
                    {TOWERS[hud.selected.type].name} <span className="text-stone-400">ур. {hud.selected.level}</span>
                  </div>
                  <div className="text-[11px] text-stone-400 mt-0.5 grid grid-cols-2 gap-x-2">
                    <span>урон: <b className="text-stone-200">{hud.selected.dmg}</b></span>
                    <span>
                      {TOWERS[hud.selected.type].kind === 'flame' ? 'струя' : 'темп'}:{' '}
                      <b className="text-stone-200">{TOWERS[hud.selected.type].kind === 'flame' ? '—' : hud.selected.rate.toFixed(2)}</b>
                    </span>
                    <span>радиус: <b className="text-stone-200">{hud.selected.range}</b></span>
                    <span>DPS: <b className="text-green-300">{hud.selected.dps}</b></span>
                  </div>
                  <div className="flex gap-1.5 mt-1.5">
                    <Btn
                      tone="amber"
                      disabled={hud.selected.maxed || hud.money < hud.selected.upCost}
                      onClick={() => engine.upgradeSelected()}
                      className="flex-1 text-[12px] px-1.5"
                    >
                      {hud.selected.maxed ? 'Макс.' : `↑ ${hud.selected.upCost}₽`}
                    </Btn>
                    <Btn tone="red" onClick={() => engine.sellSelected()} className="text-[12px] px-1.5">
                      ✕ {hud.selected.sell}₽
                    </Btn>
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      <footer className="text-[11px] text-stone-600 pb-1">
        Овощной спецназ против джанк-фуда · {hud.phase === 'menu' ? 'FOODSTORATOR TD v2.0' : 'защищай рот от вредной еды'}
      </footer>
    </div>
  )
}
