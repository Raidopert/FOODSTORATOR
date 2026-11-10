'use client'

import dynamic from 'next/dynamic'

const GameShell = dynamic(() => import('@/components/game/GameShell'), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-screen items-center justify-center bg-stone-950">
      <div className="flex flex-col items-center gap-3">
        <div className="text-5xl">🥦</div>
        <div className="text-sm font-semibold text-green-300">FOODSTORATOR TD загружается…</div>
      </div>
    </div>
  ),
})

export default function Home() {
  return <GameShell />
}
