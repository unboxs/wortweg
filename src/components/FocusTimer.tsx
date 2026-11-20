import { useEffect, useRef, useState } from 'react'
import { Pause, Play, RotateCcw, Timer } from 'lucide-react'
import { useStore } from '../store'

const FOCUS_LEN = 25 * 60 // 25 分钟，Pomodoro 经典时长；不强制，随时可停

/** 专注计时器（仪表盘卡片）：不弹窗、不抢占，结束给一声轻响 */
export default function FocusTimer() {
  const pushToast = useStore((s) => s.pushToast)
  const [endAt, setEndAt] = useState<number | null>(null)
  const [left, setLeft] = useState(FOCUS_LEN)
  const endRef = useRef<number>(0)

  useEffect(() => {
    if (endAt === null) return
    const tick = () => {
      const l = Math.max(0, Math.round((endRef.current - Date.now()) / 1000))
      setLeft(l)
      if (l === 0) {
        setEndAt(null)
        setLeft(FOCUS_LEN)
        chime()
        pushToast({ kind: 'goal', title: '专注完成', desc: '25 分钟 — 起身休息一下' })
      }
    }
    tick()
    const timer = setInterval(tick, 250)
    return () => clearInterval(timer)
  }, [endAt, pushToast])

  const start = () => {
    endRef.current = Date.now() + left * 1000
    setEndAt(Date.now() + left * 1000)
  }
  const pause = () => {
    setLeft(Math.max(0, Math.round((endRef.current - Date.now()) / 1000)))
    setEndAt(null)
  }
  const reset = () => {
    setEndAt(null)
    setLeft(FOCUS_LEN)
  }

  const mm = String(Math.floor(left / 60)).padStart(2, '0')
  const ss = String(left % 60).padStart(2, '0')
  const running = endAt !== null
  const pct = 1 - left / FOCUS_LEN

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-zinc-500 dark:text-zinc-400">
        <Timer size={16} className="text-amber-500 dark:text-amber-300" />
        专注计时 · 自愿参加
      </div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className={`font-mono text-4xl font-semibold tabular-nums tracking-tight ${running ? 'text-amber-500 dark:text-amber-300' : 'text-zinc-400 dark:text-zinc-500'}`}>
            {mm}:{ss}
          </div>
          <div className="mt-1 h-1 w-36 overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10">
            <div className="h-full rounded-full bg-amber-400 transition-all" style={{ width: `${pct * 100}%` }} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {running ? (
            <button onClick={pause} className="btn btn-ghost h-9">
              <Pause size={15} /> 暂停
            </button>
          ) : (
            <button onClick={start} className="btn btn-gold h-9" disabled={left === 0}>
              <Play size={15} /> 开始
            </button>
          )}
          <button onClick={reset} className="btn btn-ghost h-9 px-2.5" title="重置">
            <RotateCcw size={15} />
          </button>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-zinc-400 dark:text-zinc-600">
        一次专注 25 分钟，用于抄写或安静地读列表。结束有轻响，随时可关。
      </p>
    </div>
  )
}

function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.frequency.value = 660
    g.gain.value = 0.07
    o.connect(g)
    g.connect(ctx.destination)
    o.start()
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.4)
    o.stop(ctx.currentTime + 1.4)
  } catch {
    // 静默降级
  }
}
