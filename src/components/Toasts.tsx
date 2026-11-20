import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Sparkles, Target, TrendingUp } from 'lucide-react'
import { useStore } from '../store'
import type { ToastMsg } from '../types'

const META: Record<ToastMsg['kind'], { icon: typeof Target; cls: string }> = {
  achievement: { icon: Sparkles, cls: 'text-amber-500 dark:text-amber-300' },
  level: { icon: TrendingUp, cls: 'text-emerald-500 dark:text-emerald-300' },
  goal: { icon: Target, cls: 'text-amber-500 dark:text-amber-300' },
}

function Toast({ t }: { t: ToastMsg }) {
  const dismiss = useStore((s) => s.dismissToast)
  useEffect(() => {
    const timer = setTimeout(() => dismiss(t.id), 3800)
    return () => clearTimeout(timer)
  }, [t.id, dismiss])
  const M = META[t.kind]
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 60, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 60, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      className="card pointer-events-auto flex w-72 items-start gap-3 p-3.5 shadow-lg"
    >
      <M.icon size={20} className={`mt-0.5 shrink-0 ${M.cls}`} />
      <div className="min-w-0">
        <div className="text-sm font-semibold">{t.title}</div>
        {t.desc && <div className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">{t.desc}</div>}
      </div>
    </motion.div>
  )
}

export default function Toasts() {
  const toasts = useStore((s) => s.toasts)
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[60] flex flex-col items-end gap-2">
      <AnimatePresence>
        {toasts.slice(-4).map((t) => (
          <Toast key={t.id} t={t} />
        ))}
      </AnimatePresence>
    </div>
  )
}
