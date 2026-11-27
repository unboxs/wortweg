import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, Turtle, Volume2, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useSpeech } from '../hooks/useSpeech'
import { STAGE_META, type ListStage } from '../lib/goldlist'

// ─── 通用小组件 ────────────────────────────────────────────────────────

export function StageBadge({ stage }: { stage: ListStage }) {
  const m = STAGE_META[stage]
  return <span className={`chip border ${m.cls}`}>{m.label}</span>
}

export function Bar({ pct, className = '', gold }: { pct: number; className?: string; gold?: boolean }) {
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10 ${className}`}>
      <div
        className={`h-full rounded-full transition-all duration-500 ${
          gold ? 'bg-gradient-to-r from-amber-300 to-amber-500' : 'bg-zinc-400 dark:bg-zinc-500'
        }`}
        style={{ width: `${Math.min(100, Math.max(0, pct * 100))}%` }}
      />
    </div>
  )
}

export function Ring({
  pct,
  size = 72,
  stroke = 6,
  children,
}: {
  pct: number
  size?: number
  stroke?: number
  children?: ReactNode
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} className="stroke-zinc-200 dark:stroke-white/10" fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          className="stroke-amber-400 transition-all duration-700"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(1, Math.max(0, pct)))}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  )
}

export function Stat({ label, value, sub, gold }: { label: string; value: ReactNode; sub?: string; gold?: boolean }) {
  return (
    <div className="card flex flex-col gap-1 p-4">
      <span className="text-xs text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className={`text-2xl font-semibold tabular-nums ${gold ? 'text-gold-gradient' : ''}`}>{value}</span>
      {sub && <span className="text-[11px] text-zinc-400 dark:text-zinc-500">{sub}</span>}
    </div>
  )
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between">
      <h2 className="text-sm font-semibold tracking-wide text-zinc-500 dark:text-zinc-400">{children}</h2>
      {right}
    </div>
  )
}

/** 发音按钮组：正常速 + 慢速 */
export function SpeakButtons({
  text,
  size = 16,
  sourceDeckId,
  audioName,
}: {
  text: string
  size?: number
  sourceDeckId?: string
  audioName?: string
}) {
  const { speak, speakEntry, supported } = useSpeech()
  const slowRate = useStoreEffectlessSlowRate()
  const deck = Boolean(sourceDeckId && audioName)
  const play = (rate?: number) => {
    if (deck) void speakEntry({ german: text, sourceDeckId, audioName }, rate)
    else void speak(text, rate)
  }
  return (
    <span className="inline-flex items-center gap-0.5">
      <button
        onClick={(e) => {
          e.stopPropagation()
          play()
        }}
        disabled={!deck && !supported}
        title={deck ? '播放牌组原声' : supported ? '朗读' : '当前浏览器不支持语音'}
        className="cursor-pointer rounded-lg p-1.5 text-zinc-400 transition hover:bg-amber-400/15 hover:text-amber-500 disabled:opacity-30 dark:text-zinc-500 dark:hover:text-amber-300"
      >
        <Volume2 size={size} />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation()
          play(slowRate)
        }}
        disabled={!deck && !supported}
        title={deck ? '牌组原声慢放' : '慢速朗读'}
        className="cursor-pointer rounded-lg p-1.5 text-zinc-400 transition hover:bg-amber-400/15 hover:text-amber-500 disabled:opacity-30 dark:text-zinc-500 dark:hover:text-amber-300"
      >
        <Turtle size={size} />
      </button>
    </span>
  )
}

// 小小的 hack：组件里直接读 store 而不触发额外渲染开销
import { useStore } from '../store'
function useStoreEffectlessSlowRate() {
  return useStore((s) => s.settings.slowRate)
}

export function EmptyState({ icon, title, desc, children }: { icon?: ReactNode; title: string; desc?: string; children?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
      {icon && <div className="text-zinc-300 dark:text-zinc-600">{icon}</div>}
      <div className="text-base font-semibold">{title}</div>
      {desc && <div className="max-w-sm text-sm text-zinc-500 dark:text-zinc-400">{desc}</div>}
      {children && <div className="mt-2 flex flex-wrap justify-center gap-3">{children}</div>}
    </div>
  )
}

export function Modal({
  open,
  title,
  children,
  onClose,
  footer,
}: {
  open: boolean
  title: string
  children?: ReactNode
  onClose: () => void
  footer?: ReactNode
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/60 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="card w-full max-w-sm p-5"
            initial={{ scale: 0.96, y: 8 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold">{title}</h3>
              <button onClick={onClose} className="cursor-pointer rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10">
                <X size={16} />
              </button>
            </div>
            <div className="text-sm text-zinc-600 dark:text-zinc-300">{children}</div>
            {footer && <div className="mt-4 flex justify-end gap-2">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function MasteredDot({ mastered }: { mastered: boolean }) {
  if (!mastered) return null
  return <CheckCircle2 size={15} className="shrink-0 text-amber-400" />
}

/** 词汇森林的小树：growth 0-1，done = 金色满冠 */
export function TreeIcon({ growth, done, size = 48 }: { growth: number; done?: boolean; size?: number }) {
  const g = Math.min(1, Math.max(0.12, growth))
  const r = 5 + g * 9
  const cy = 20 - g * 4
  const trunkH = 10 + g * 10
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className="shrink-0">
      <rect x="23" y={48 - 6 - trunkH} width="2.4" rx="1.2" height={trunkH} className="fill-zinc-400 dark:fill-zinc-600" />
      <circle cx="24" cy={cy} r={r} className={done ? 'fill-amber-400' : 'fill-emerald-500/80 dark:fill-emerald-400/70'} />
      {g > 0.5 && (
        <>
          <circle cx={24 - r * 0.75} cy={cy + r * 0.45} r={r * 0.6} className={done ? 'fill-amber-400/90' : 'fill-emerald-500/60 dark:fill-emerald-400/50'} />
          <circle cx={24 + r * 0.75} cy={cy + r * 0.45} r={r * 0.6} className={done ? 'fill-amber-400/90' : 'fill-emerald-500/60 dark:fill-emerald-400/50'} />
        </>
      )}
    </svg>
  )
}
