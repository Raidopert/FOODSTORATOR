'use client'

import { useEffect, useRef, useState } from 'react'
import { GameEngine } from '@/game/engine'
import { renderGame } from '@/game/render'
import { Sfx } from '@/game/audio'
import { loadSave, persistSave } from '@/game/storage'
import {
  W, H, CELL, STATIONS, STATION_ORDER, WAVES, RECIPES, STEP_INFO,
  upgradeCost, sellValue, LEVEL_NAME, LEVEL_COUNT, WAVE_SKIP_BONUS,
} from '@/game/config'
import type { HudState, SaveData, RecipeDef } from '@/game/types'

const DEFAULT_SAVE: SaveData = { sound: true, music: true, bestWave: 0, wins: 0, runs: 0, bestTips: 0, seenHowTo: false }

const DEFAULT_HUD: HudState = {
  phase: 'menu',
  money: 0,
  rep: 100,
  waveIdx: 0,
  totalWaves: WAVES.length,
  alive: 0,
  remaining: 0,
  speed: 1,
  paused: false,
  draft: [],
  draftPicked: false,
  selectedStationId: null,
  selectedStation: null,
  placing: null,
  freeStation: false,
  stats: { perfect: 0, failed: 0, spoiled: 0, tips: 0 },
  preBoost: false,
  lastWaveResult: null,
  nextWave: [],
}

function stepsStr(r: RecipeDef): string {
  return r.steps.map((s) => STEP_INFO[s.type].emoji + (s.count > 1 ? `×${s.count}` : '')).join(' → ')
}

export default function GameShell() {
  // Ленивая инициализация мутируемых инстансов — паттерн, одобренный react-hooks
  const engineRef = useRef<GameEngine | null>(null)
  if (engineRef.current == null) {
    engineRef.current = new GameEngine()
  }
  const sfxRef = useRef<Sfx | null>(null)
  if (sfxRef.current == null) {
    sfxRef.current = new Sfx()
  }

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const hoverRef = useRef<{ cx: number; cy: number } | null>(null)
  const soundRef = useRef(true)

  const [hud, setHud] = useState<HudState>(DEFAULT_HUD)
  // страница грузится с ssr: false — localStorage доступен при первом рендере
  const [save, setSave] = useState<SaveData>(() => loadSave())
  const [showHowTo, setShowHowTo] = useState(false)
  const [banner, setBanner] = useState<{ text: string; tone: 'good' | 'info' } | null>(null)

  const E = () => engineRef.current as GameEngine

  // ---------- Движок → React (внешние подписки) ----------
  useEffect(() => {
    const engine = engineRef.current as GameEngine
    const sfx = sfxRef.current as Sfx
    engine.onHud = () => setHud(engine.getHud())
    engine.sfx = (n) => {
      if (soundRef.current) sfx.play(n)
    }
    engine.onBanner = (text, tone) => setBanner({ text, tone })
    engine.onRunEnd = (win, stats, waveIdx) => {
      setSave((s) => {
        const next: SaveData = {
          ...s,
          runs: s.runs + 1,
          wins: s.wins + (win ? 1 : 0),
          bestWave: Math.max(s.bestWave, Math.min(waveIdx, LEVEL_COUNT)),
          bestTips: Math.max(s.bestTips, stats.tips),
        }
        persistSave(next)
        return next
      })
    }
    soundRef.current = loadSave().sound
    sfx.enabled = soundRef.current
    // музыка стартует после первого клика (политика автоплея браузеров)
    const startMusicOnce = () => {
      if (loadSave().music) sfx.setMusic(true)
      window.removeEventListener('pointerdown', startMusicOnce)
    }
    window.addEventListener('pointerdown', startMusicOnce)
    // отладочный хук для автотестов и балансировки
    ;(window as unknown as { __engine: GameEngine }).__engine = engine
  }, [])

  // ---------- Игровой цикл ----------
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const engine = engineRef.current as GameEngine
    let raf = 0
    let last = performance.now()
    const loop = (ts: number) => {
      const dt = Math.min(0.06, (ts - last) / 1000)
      last = ts
      engine.update(dt)
      renderGame(ctx, engine, { hover: hoverRef.current, timeMs: ts })
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  // ---------- Масштабирование canvas ----------
  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current
      const wrap = wrapRef.current
      if (!canvas || !wrap) return
      const cw = wrap.clientWidth
      const ch = wrap.clientHeight
      const scale = Math.min(cw / W, ch / H)
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.style.width = `${Math.floor(W * scale)}px`
      canvas.style.height = `${Math.floor(H * scale)}px`
      canvas.width = Math.max(1, Math.floor(W * scale * dpr))
      canvas.height = Math.max(1, Math.floor(H * scale * dpr))
      const c = canvas.getContext('2d')
      if (c) c.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)
    window.addEventListener('orientationchange', resize)
    return () => {
      window.removeEventListener('resize', resize)
      window.removeEventListener('orientationchange', resize)
    }
  }, [])

  // ---------- Service Worker (только production: в dev чанки без хешей) ----------
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator && window.isSecureContext) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  }, [])

  // ---------- Баннер исчезает сам ----------
  useEffect(() => {
    if (!banner) return
    const t = setTimeout(() => setBanner(null), 2400)
    return () => clearTimeout(t)
  }, [banner])

  // ---------- Пауза при сворачивании ----------
  useEffect(() => {
    const onVis = () => {
      const engine = engineRef.current as GameEngine
      if (document.hidden && engine.phase === 'wave') engine.setPaused(true)
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  // ---------- Клавиатура ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const engine = engineRef.current as GameEngine
      if (e.key === 'Escape') {
        engine.cancelPlacing()
        engine.selectStation(null)
      } else if (e.code === 'Space' && engine.phase === 'wave') {
        e.preventDefault()
        engine.togglePause()
      } else if (e.key >= '1' && e.key <= '5') {
        const t = STATION_ORDER[Number(e.key) - 1]
        if (t) engine.beginPlacing(t)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ---------- Ввод на canvas ----------
  const toCell = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const x = (clientX - rect.left) * (W / rect.width)
    const y = (clientY - rect.top) * (H / rect.height)
    return { x, y, cx: Math.floor(x / CELL), cy: Math.floor(y / CELL) }
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = toCell(e.clientX, e.clientY)
    const engine = E()
    if (!p) return
    if (engine.placing) {
      engine.tryPlace(p.cx, p.cy)
      return
    }
    let hit: number | null = null
    for (const st of engine.stations) {
      if (Math.hypot(st.x - p.x, st.y - p.y) <= 38) {
        hit = st.id
        break
      }
    }
    engine.selectStation(hit)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = toCell(e.clientX, e.clientY)
    if (p) hoverRef.current = { cx: p.cx, cy: p.cy }
  }

  const onPointerLeave = () => {
    hoverRef.current = null
  }

  // ---------- Действия ----------
  const startRun = () => {
    E().startRun()
    if (!save.seenHowTo) {
      setShowHowTo(true)
      setSave((s) => {
        const next = { ...s, seenHowTo: true }
        persistSave(next)
        return next
      })
    }
  }

  const toggleSound = () => {
    const sfx = sfxRef.current as Sfx
    setSave((s) => {
      const next = { ...s, sound: !s.sound }
      soundRef.current = next.sound
      sfx.enabled = next.sound
      persistSave(next)
      return next
    })
  }

  const toggleMusic = () => {
    const sfx = sfxRef.current as Sfx
    setSave((s) => {
      const next = { ...s, music: !s.music }
      sfx.setMusic(next.music)
      persistSave(next)
      return next
    })
  }

  // ---------- Выбранная станция (данные из HUD-снапшота) ----------
  const selected = hud.selectedStation

  const gameActive = hud.phase === 'build' || hud.phase === 'wave' || hud.phase === 'draft'
  const stars = Math.ceil(hud.rep / 20)

  return (
    <div
      ref={wrapRef}
      className="fixed inset-0 flex select-none items-center justify-center overflow-hidden bg-stone-950"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="relative shadow-2xl">
        <canvas
          ref={canvasRef}
          className="block touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerLeave={onPointerLeave}
        />

        {/* ---------- ВЕРХНЯЯ ПАНЕЛЬ ---------- */}
        {gameActive && (
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-1 p-1.5 sm:p-2">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="rounded-lg bg-stone-900/85 px-2 py-1 text-xs font-bold text-amber-300 shadow sm:px-2.5 sm:text-sm">
                💰 {hud.money}₽
              </div>
              <div className="flex items-center gap-1.5 rounded-lg bg-stone-900/85 px-2 py-1 shadow sm:px-2.5">
                <span className="text-xs sm:text-sm">⭐</span>
                <div className="h-2.5 w-14 overflow-hidden rounded-full bg-stone-700 sm:w-24">
                  <div
                    className={`h-full rounded-full transition-all ${hud.rep > 60 ? 'bg-green-500' : hud.rep > 30 ? 'bg-amber-500' : 'bg-red-500'}`}
                    style={{ width: `${hud.rep}%` }}
                  />
                </div>
                <span className="text-[10px] font-bold text-white sm:text-xs">{hud.rep}</span>
              </div>
            </div>

            <div className="rounded-lg bg-stone-900/85 px-2.5 py-1 text-xs font-bold text-white shadow sm:text-sm">
              Волна {Math.min(hud.waveIdx + 1, hud.totalWaves)}/{hud.totalWaves} · 🧾 {hud.remaining}
            </div>

            <div className="pointer-events-auto flex items-center gap-1 sm:gap-1.5">
              {hud.phase === 'wave' && (
                <>
                  <button
                    aria-label="Скорость"
                    onClick={() => E().toggleSpeed()}
                    className="h-8 w-8 rounded-lg bg-stone-900/85 text-xs font-bold text-white shadow transition hover:bg-stone-800 active:scale-95 sm:h-9 sm:w-9 sm:text-sm"
                  >
                    ×{hud.speed}
                  </button>
                  <button
                    aria-label="Пауза"
                    onClick={() => E().togglePause()}
                    className="h-8 w-8 rounded-lg bg-stone-900/85 text-sm text-white shadow transition hover:bg-stone-800 active:scale-95 sm:h-9 sm:w-9"
                  >
                    {hud.paused ? '▶️' : '⏸️'}
                  </button>
                </>
              )}
              <button
                aria-label="Звук"
                onClick={toggleSound}
                className="h-8 w-8 rounded-lg bg-stone-900/85 text-sm text-white shadow transition hover:bg-stone-800 active:scale-95 sm:h-9 sm:w-9"
              >
                {save.sound ? '🔊' : '🔇'}
              </button>
              <button
                aria-label="Музыка"
                onClick={toggleMusic}
                className="h-8 w-8 rounded-lg bg-stone-900/85 text-sm text-white shadow transition hover:bg-stone-800 active:scale-95 sm:h-9 sm:w-9"
              >
                <span className={save.music ? '' : 'opacity-40'}>🎵</span>
              </button>
              <button
                aria-label="Как играть"
                onClick={() => setShowHowTo(true)}
                className="h-8 w-8 rounded-lg bg-stone-900/85 text-sm text-white shadow transition hover:bg-stone-800 active:scale-95 sm:h-9 sm:w-9"
              >
                ❓
              </button>
            </div>
          </div>
        )}

        {/* ---------- БАННЕР ---------- */}
        {banner && gameActive && (
          <div className="pointer-events-none absolute inset-x-0 top-12 flex justify-center sm:top-14">
            <div
              className={`rounded-full px-4 py-1.5 text-sm font-bold text-white shadow-lg ${banner.tone === 'good' ? 'bg-green-600' : 'bg-stone-900/90'}`}
            >
              {banner.text}
            </div>
          </div>
        )}

        {/* ---------- ПОДСКАЗКА БЕСПЛАТНОЙ СТАНЦИИ ---------- */}
        {hud.freeStation && (
          <div className="pointer-events-none absolute inset-x-0 top-24 flex justify-center">
            <div className="animate-pulse rounded-full bg-green-600 px-4 py-1.5 text-xs font-bold text-white shadow-lg sm:text-sm">
              🎁 Выбери станцию внизу и поставь бесплатно
            </div>
          </div>
        )}

        {/* ---------- КНОПКА СТАРТА ВОЛНЫ + ПРЕВЬЮ ---------- */}
        {hud.phase === 'build' && (
          <div className="pointer-events-none absolute inset-x-0 bottom-16 flex flex-col items-center gap-1 sm:bottom-[76px]">
            {hud.waveIdx === 0 && !hud.freeStation && (
              <div className="rounded-full bg-stone-900/85 px-3 py-1 text-[11px] font-semibold text-amber-200 shadow sm:text-xs">
                Построй станции у конвейера 🔪🍳 — потом стартуй
              </div>
            )}
            {hud.nextWave.length > 0 && (
              <div className="flex max-w-[95%] flex-wrap items-center justify-center gap-1 rounded-xl bg-stone-900/85 px-2.5 py-1.5 shadow">
                <span className="text-[10px] font-bold text-stone-300 sm:text-xs">Идут:</span>
                {hud.nextWave.map((n) => (
                  <span key={n.emoji} className="rounded-md bg-stone-800 px-1.5 py-0.5 text-[11px] sm:text-sm">
                    {n.emoji}×{n.count} <span className="text-stone-400">{n.steps}</span>
                  </span>
                ))}
              </div>
            )}
            <button
              onClick={() => E().startWave()}
              className="pointer-events-auto rounded-xl bg-green-600 px-6 py-2.5 text-base font-extrabold text-white shadow-xl transition hover:bg-green-500 active:scale-95 sm:text-lg"
            >
              ▶ Старт волны {hud.waveIdx + 1}
            </button>
          </div>
        )}

        {/* ---------- ПАНЕЛЬ СТАНЦИИ ---------- */}
        {selected && (
          <div className="absolute bottom-16 right-1.5 w-44 rounded-xl bg-stone-900/95 p-2.5 shadow-xl sm:bottom-[76px] sm:right-2 sm:w-52 sm:p-3">
            <div className="mb-1 flex items-center justify-between">
              <div className="text-sm font-bold text-white">
                {STATIONS[selected.type].emoji} {STATIONS[selected.type].name}
              </div>
              <div className="flex gap-0.5">
                {[1, 2, 3].map((i) => (
                  <span key={i} className={`h-1.5 w-3 rounded-full ${i <= selected.level ? 'bg-amber-400' : 'bg-stone-700'}`} />
                ))}
              </div>
            </div>
            <div className="mb-2 text-[10px] leading-snug text-stone-400 sm:text-[11px]">
              {STATIONS[selected.type].desc}
            </div>
            <div className="flex gap-1.5">
              {selected.level < 3 ? (
                <button
                  onClick={() => E().upgradeStation(selected.id)}
                  disabled={hud.money < upgradeCost(selected.type, selected.level)}
                  className="flex-1 rounded-lg bg-amber-500 px-1.5 py-1.5 text-[11px] font-bold text-white shadow transition enabled:hover:bg-amber-400 disabled:opacity-40 sm:text-xs"
                >
                  ⬆ {upgradeCost(selected.type, selected.level)}₽
                </button>
              ) : (
                <div className="flex-1 rounded-lg bg-stone-800 px-1.5 py-1.5 text-center text-[11px] font-bold text-amber-300 sm:text-xs">
                  МАКС
                </div>
              )}
              <button
                onClick={() => E().sellStation(selected.id)}
                className="flex-1 rounded-lg bg-red-600/80 px-1.5 py-1.5 text-[11px] font-bold text-white shadow transition hover:bg-red-500 sm:text-xs"
              >
                🗑 +{sellValue(selected.invested)}₽
              </button>
              <button
                aria-label="Закрыть"
                onClick={() => E().selectStation(null)}
                className="rounded-lg bg-stone-700 px-2 py-1.5 text-[11px] font-bold text-white transition hover:bg-stone-600"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* ---------- НИЖНЯЯ ПАНЕЛЬ (МАГАЗИН) ---------- */}
        {gameActive && (
          <div className="pointer-events-auto absolute inset-x-0 bottom-0 flex items-end justify-center gap-1 bg-gradient-to-t from-stone-950/90 to-transparent p-1.5 sm:gap-1.5 sm:p-2">
            {STATION_ORDER.map((t, i) => {
              const def = STATIONS[t]
              const afford = hud.freeStation || hud.money >= def.cost
              const active = hud.placing === t
              return (
                <button
                  key={t}
                  aria-label={`Построить: ${def.name}`}
                  onClick={() => E().beginPlacing(t)}
                  disabled={!afford}
                  className={`flex min-w-[62px] flex-col items-center rounded-xl border-2 px-1.5 py-1 shadow-lg transition active:scale-95 sm:min-w-[76px] sm:px-2 sm:py-1.5 ${
                    active ? 'border-amber-400 bg-amber-500/90' : 'border-stone-700 bg-stone-900/90'
                  } ${afford ? '' : 'opacity-40'}`}
                >
                  <span className="text-xl sm:text-2xl">{def.emoji}</span>
                  <span className="text-[9px] font-bold leading-tight text-white sm:text-[11px]">{def.name}</span>
                  <span className={`text-[9px] font-bold leading-tight sm:text-[10px] ${active ? 'text-white' : 'text-amber-300'}`}>
                    {hud.freeStation ? 'бесплатно' : `${def.cost}₽`}
                  </span>
                  <span className="text-[8px] leading-none text-stone-400">{i + 1}</span>
                </button>
              )
            })}
            {(hud.placing || hud.freeStation) && (
              <button
                onClick={() => E().cancelPlacing()}
                className="ml-1 h-[52px] rounded-xl border-2 border-red-500/60 bg-red-600/80 px-2 text-xs font-bold text-white shadow-lg transition hover:bg-red-500 sm:h-[60px] sm:px-3"
              >
                ✕<br />отмена
              </button>
            )}
          </div>
        )}

        {/* ---------- ПАУЗА ---------- */}
        {hud.paused && hud.phase === 'wave' && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/70">
            <div className="text-3xl font-black text-white">⏸️ Пауза</div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => E().setPaused(false)}
                className="w-52 rounded-xl bg-green-600 px-4 py-2.5 font-bold text-white shadow-lg transition hover:bg-green-500"
              >
                ▶ Продолжить
              </button>
              <button
                onClick={() => { E().setPaused(false); E().startRun() }}
                className="w-52 rounded-xl bg-amber-600 px-4 py-2.5 font-bold text-white shadow-lg transition hover:bg-amber-500"
              >
                🔄 Заново
              </button>
              <button
                onClick={() => setShowHowTo(true)}
                className="w-52 rounded-xl bg-sky-700 px-4 py-2.5 font-bold text-white shadow-lg transition hover:bg-sky-600"
              >
                📖 Правила
              </button>
              <button
                onClick={() => { E().setPaused(false); E().openMenu() }}
                className="w-52 rounded-xl bg-stone-700 px-4 py-2.5 font-bold text-white shadow-lg transition hover:bg-stone-600"
              >
                🏠 В меню
              </button>
            </div>
          </div>
        )}

        {/* ---------- DRAFT ---------- */}
        {hud.phase === 'draft' && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/70 p-2">
            <div className="w-full max-w-2xl rounded-2xl bg-stone-900 p-3 shadow-2xl sm:p-5">
              <div className="mb-1 text-center text-lg font-black text-white sm:text-2xl">
                🃏 Волна {hud.waveIdx} пройдена! Выбери буст
              </div>
              <div className="mb-3 text-center text-[11px] text-stone-400 sm:text-sm">
                Следующая: «{WAVES[hud.waveIdx]?.name}»
              </div>
              <div className="mb-3 grid grid-cols-3 gap-2 sm:gap-3">
                {hud.draft.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => E().pickDraft(c.id)}
                    className="flex flex-col items-center gap-1 rounded-xl border-2 border-stone-700 bg-stone-800 px-2 py-3 text-center shadow-lg transition hover:-translate-y-0.5 hover:border-stone-500 active:scale-95"
                    style={{ borderTopColor: c.accent, borderTopWidth: 4 }}
                  >
                    <span className="text-3xl sm:text-4xl">{c.emoji}</span>
                    <span className="text-xs font-bold leading-tight text-white sm:text-sm">{c.title}</span>
                    <span className="text-[9px] leading-tight text-stone-400 sm:text-[11px]">{c.desc}</span>
                  </button>
                ))}
              </div>
              <div className="flex justify-center">
                <button
                  onClick={() => E().skipDraft()}
                  className="rounded-lg bg-stone-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-stone-600 sm:text-sm"
                >
                  Пропустить (+{WAVE_SKIP_BONUS}₽)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ---------- КОНЕЦ ИГРЫ ---------- */}
        {(hud.phase === 'gameover' || hud.phase === 'victory') && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80 p-2">
            <div className="w-full max-w-md rounded-2xl bg-stone-900 p-4 text-center shadow-2xl sm:p-6">
              <div className="text-4xl sm:text-5xl">{hud.phase === 'victory' ? '🎉' : '😖'}</div>
              <div className={`mt-1 text-2xl font-black sm:text-3xl ${hud.phase === 'victory' ? 'text-green-400' : 'text-red-400'}`}>
                {hud.phase === 'victory' ? 'Смена пройдена!' : 'Ресторан закрыт'}
              </div>
              <div className="mt-1 text-xs text-stone-400 sm:text-sm">{LEVEL_NAME}</div>
              {hud.phase === 'victory' && (
                <div className="mt-2 text-2xl tracking-widest">{'⭐'.repeat(Math.max(1, stars))}</div>
              )}
              <div className="mt-3 grid grid-cols-2 gap-1.5 text-left text-xs sm:gap-2 sm:text-sm">
                <div className="rounded-lg bg-stone-800 px-2.5 py-1.5 text-white">💰 Чаевые: <b className="text-amber-300">{hud.stats.tips}₽</b></div>
                <div className="rounded-lg bg-stone-800 px-2.5 py-1.5 text-white">🌊 Волн: <b>{hud.waveIdx}/{hud.totalWaves}</b></div>
                <div className="rounded-lg bg-stone-800 px-2.5 py-1.5 text-white">✅ Идеально: <b className="text-green-400">{hud.stats.perfect}</b></div>
                <div className="rounded-lg bg-stone-800 px-2.5 py-1.5 text-white">❌ Провалы: <b className="text-orange-400">{hud.stats.failed}</b></div>
                <div className="rounded-lg bg-stone-800 px-2.5 py-1.5 text-white">🔥 Испорчено: <b className="text-red-400">{hud.stats.spoiled}</b></div>
                <div className="rounded-lg bg-stone-800 px-2.5 py-1.5 text-white">⭐ Репутация: <b>{hud.rep}</b></div>
              </div>
              <div className="mt-4 flex justify-center gap-2">
                <button
                  onClick={() => E().startRun()}
                  className="rounded-xl bg-green-600 px-5 py-2.5 font-bold text-white shadow-lg transition hover:bg-green-500"
                >
                  🔄 Ещё смена
                </button>
                <button
                  onClick={() => E().openMenu()}
                  className="rounded-xl bg-stone-700 px-5 py-2.5 font-bold text-white shadow-lg transition hover:bg-stone-600"
                >
                  🏠 В меню
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ---------- МЕНЮ ---------- */}
        {hud.phase === 'menu' && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-stone-950/85 p-2">
            <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-2xl bg-stone-900/95 p-4 shadow-2xl sm:p-6">
              <div className="text-center">
                <img src="/logo.svg" alt="FOODSTORATOR" className="mx-auto h-24 w-24 drop-shadow-lg sm:h-28 sm:w-28" />
                <h1 className="mt-1 bg-gradient-to-r from-amber-300 via-orange-400 to-red-400 bg-clip-text text-3xl font-black tracking-tight text-transparent sm:text-4xl">
                  ШЕФ-КОНВЕЙЕР
                </h1>
                <p className="mt-1 text-xs text-stone-400 sm:text-sm">
                  Тауэр-дефенс на кухне: блюда едут конвейером, а ты готовишь их станциями-поварами
                </p>
              </div>

              <div className="mt-3 flex flex-col gap-2">
                <button
                  onClick={startRun}
                  className="rounded-xl bg-green-600 px-4 py-3 text-lg font-extrabold text-white shadow-lg transition hover:bg-green-500 active:scale-95"
                >
                  ▶ Начать смену
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowHowTo(true)}
                    className="flex-1 rounded-xl bg-stone-700 px-4 py-2.5 font-bold text-white shadow transition hover:bg-stone-600"
                  >
                    📖 Как играть
                  </button>
                  <button
                    onClick={toggleSound}
                    className="rounded-xl bg-stone-700 px-4 py-2.5 font-bold text-white shadow transition hover:bg-stone-600"
                  >
                    {save.sound ? '🔊' : '🔇'}
                  </button>
                  <button
                    onClick={toggleMusic}
                    className="rounded-xl bg-stone-700 px-4 py-2.5 font-bold text-white shadow transition hover:bg-stone-600"
                  >
                    <span className={save.music ? '' : 'opacity-40'}>🎵</span>
                  </button>
                </div>
              </div>

              {save.runs > 0 && (
                <div className="mt-3 grid grid-cols-3 gap-1.5 text-center text-[11px] sm:text-xs">
                  <div className="rounded-lg bg-stone-800 px-2 py-1.5 text-white">🏆 Волн: <b className="text-amber-300">{save.bestWave}</b></div>
                  <div className="rounded-lg bg-stone-800 px-2 py-1.5 text-white">🎉 Побед: <b className="text-green-400">{save.wins}</b></div>
                  <div className="rounded-lg bg-stone-800 px-2 py-1.5 text-white">💰 Рекорд: <b className="text-amber-300">{save.bestTips}₽</b></div>
                </div>
              )}

              <div className="mt-3 rounded-xl bg-stone-800/60 p-2.5">
                <div className="text-[11px] font-bold text-stone-300 sm:text-xs">📱 Установка на устройство:</div>
                <ul className="mt-1 space-y-0.5 text-[10px] leading-snug text-stone-400 sm:text-[11px]">
                  <li>• iPhone/iPad: «Поделиться» → «На экран „Домой“»</li>
                  <li>• Android: меню браузера → «Установить приложение»</li>
                  <li>• Windows: значок ⤓ в адресной строке Edge/Chrome</li>
                </ul>
              </div>

              <div className="mt-2 text-center text-[10px] text-stone-600">
                FOODSTORATOR v0.2 · {LEVEL_NAME} · {LEVEL_COUNT} волн
              </div>
            </div>
          </div>
        )}

        {/* ---------- ПРАВИЛА ---------- */}
        {showHowTo && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/75 p-2" onClick={() => setShowHowTo(false)}>
            <div
              className="max-h-full w-full max-w-lg overflow-y-auto rounded-2xl bg-stone-900 p-3 shadow-2xl sm:p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-2 text-center text-xl font-black text-white sm:text-2xl">📖 Правила кухни</div>

              {/* Цель */}
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs leading-snug text-amber-100 sm:text-sm">
                <b className="text-amber-300">Цель:</b> подавай блюда, пока они едут по конвейеру. Репутация на нуле — ресторан закрыт. Продержись все {LEVEL_COUNT} волн и прими «БАНКЕТ»!
              </div>

              {/* Схема потока */}
              <div className="mt-2 flex flex-wrap items-center justify-center gap-1 rounded-xl bg-stone-800/70 p-2 text-[11px] font-semibold text-white sm:text-sm">
                <span className="rounded-lg bg-stone-900 px-2 py-1">📦 Склад</span>
                <span className="text-stone-500">→</span>
                <span className="rounded-lg bg-stone-900 px-2 py-1">🔪 готовка на станциях</span>
                <span className="text-stone-500">→</span>
                <span className="rounded-lg bg-stone-900 px-2 py-1">🧑‍🍳 Стойка</span>
              </div>

              {/* Станции */}
              <div className="mt-3">
                <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-stone-400 sm:text-xs">Станции-башни</div>
                <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {STATION_ORDER.map((t) => {
                    const d = STATIONS[t]
                    return (
                      <div key={t} className="flex items-center gap-2 rounded-lg bg-stone-800/70 px-2 py-1.5">
                        <span className="text-lg">{d.emoji}</span>
                        <div className="min-w-0">
                          <div className="truncate text-xs font-bold text-white">
                            {d.name} · <span className="text-amber-300">{d.cost}₽</span>
                          </div>
                          <div className="truncate text-[10px] leading-tight text-stone-400">{d.desc}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Рецепты */}
              <div className="mt-3">
                <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-stone-400 sm:text-xs">Рецепты: шаги цепочкой</div>
                <div className="rounded-xl bg-stone-800/70 p-2">
                  {Object.values(RECIPES).map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-2 py-0.5 text-[11px] sm:text-xs">
                      <span className="shrink-0 font-bold text-white">{r.emoji} {r.name}</span>
                      <span className="truncate text-stone-300">{stepsStr(r)} <span className="font-bold text-amber-300">· {r.price}₽</span></span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Важно знать */}
              <div className="mt-3 grid grid-cols-2 gap-1.5 text-[10px] leading-snug sm:grid-cols-3 sm:text-[11px]">
                <div className="rounded-lg bg-green-500/15 p-2 text-green-200"><b className="text-green-400">✅ Идеал:</b> все шаги → чаевые ×1.25 и +2⭐</div>
                <div className="rounded-lg bg-orange-500/15 p-2 text-orange-200"><b className="text-orange-400">❌ Провал:</b> шаги пропущены → −12⭐</div>
                <div className="rounded-lg bg-red-500/15 p-2 text-red-200"><b className="text-red-400">🔥 Перегрев:</b> 3 лишних жарки — блюдо сгорело, −20⭐</div>
                <div className="rounded-lg bg-sky-500/15 p-2 text-sky-200"><b className="text-sky-400">❄️ Морозилка:</b> тормозит конвейер — у поваров больше времени</div>
                <div className="rounded-lg bg-violet-500/15 p-2 text-violet-200"><b className="text-violet-400">🃏 Draft:</b> после волны выбор 1 из 3 карт; пропуск +{WAVE_SKIP_BONUS}₽</div>
                <div className="rounded-lg bg-stone-700/60 p-2 text-stone-200"><b className="text-white">👀 Разведка:</b> перед волной виден состав блюд — строй станции под них</div>
              </div>

              {/* Управление */}
              <div className="mt-3 rounded-xl bg-stone-800/70 p-2.5 text-[11px] leading-snug text-stone-300 sm:text-xs">
                <b className="text-white">Управление:</b> кнопка станции внизу → свободная клетка у конвейера. Тап по построенной — улучшить или продать. Клавиши: 1–5 станции, Space — пауза, Esc — отмена.
              </div>

              <div className="mt-3 flex justify-center">
                <button
                  onClick={() => setShowHowTo(false)}
                  className="rounded-xl bg-amber-500 px-6 py-2.5 font-bold text-white shadow-lg transition hover:bg-amber-400"
                >
                  Понятно!
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ---------- ПОВОРОТ ЭКРАНА ---------- */}
      <div className="rotate-hint fixed inset-0 z-50 flex-col items-center justify-center gap-3 bg-stone-950 p-6 text-center">
        <div className="text-6xl">🔄</div>
        <div className="text-lg font-bold text-white">Поверни телефон горизонтально</div>
        <div className="text-sm text-stone-400">Игра рассчитана на альбомный режим</div>
      </div>

      <style jsx global>{`
        .rotate-hint {
          display: none;
        }
        @media (orientation: portrait) and (max-width: 820px) {
          .rotate-hint {
            display: flex;
          }
        }
      `}</style>
    </div>
  )
}
