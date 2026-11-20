import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Gem,
  Headphones,
  PlusCircle,
  RefreshCw,
  Shuffle,
  Turtle,
  Volume2,
  X,
} from 'lucide-react'
import { useStore, type NewEntrySeed } from '../store'
import { useSpeech } from '../hooks/useSpeech'
import { normalizeDe } from '../lib/goldlist'
import { BANK } from '../data/bank'
import { Bar } from '../components/ui'

/**
 * 学习区（全屏沉浸）：冷却期里唯一该待的地方。
 * 温习已掌握词 → 强化长期记忆；探索词库 → 精听生词、读完可一键建 Headlist。
 * 刻意不含"冷却中的列表"——保护 Goldlist 的自然遗忘筛选。
 * 无 XP、无判断、无压力：读、听、走。
 */

type Mode = 'review' | 'explore'

interface StudyCard {
  german: string
  zh: string
  example?: string
  /** explore 模式下来自的词库主题（用于一键建表） */
  theme?: string
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function Study() {
  const nav = useNavigate()
  const lists = useStore((s) => s.lists)
  const settings = useStore((s) => s.settings)
  const createList = useStore((s) => s.createList)
  const { speak } = useSpeech()

  const [mode, setMode] = useState<Mode | null>(null)
  const [theme, setTheme] = useState<string | null>(null)
  const [pool, setPool] = useState<StudyCard[]>([])
  const [idx, setIdx] = useState(0)
  const [finished, setFinished] = useState(false)

  const mastered = useMemo(() => lists.flatMap((l) => l.entries).filter((e) => e.mastered), [lists])
  const used = useMemo(() => new Set(lists.flatMap((l) => l.entries.map((e) => normalizeDe(e.german)))), [lists])

  const startReview = () => {
    setMode('review')
    setPool(shuffle(mastered).slice(0, 25))
    setIdx(0)
    setFinished(false)
  }

  const startExplore = (themeId: string) => {
    const cat = BANK.find((c) => c.id === themeId)
    if (!cat) return
    const fresh = cat.entries.filter((e) => !used.has(normalizeDe(e.german)))
    setMode('explore')
    setTheme(themeId)
    setPool(shuffle(fresh).slice(0, 25))
    setIdx(0)
    setFinished(false)
  }

  const card = pool[idx]
  const catName = theme ? BANK.find((c) => c.id === theme)?.name : null

  // 每个词出现时自动朗读
  useEffect(() => {
    if (!card || finished) return
    if (settings.autoSpeak) speak(card.german)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, card?.german, finished])

  // 键盘：→ 下一词，← 上一词，S 朗读，D 慢速
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!card || finished) return
      if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
      else if (e.key.toLowerCase() === 's') speak(card.german)
      else if (e.key.toLowerCase() === 'd') speak(card.german, settings.slowRate)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, card, finished, settings.slowRate])

  const go = (dir: 1 | -1) => {
    const next = idx + dir
    if (next < 0) return
    if (next >= pool.length) {
      setFinished(true)
      return
    }
    setIdx(next)
  }

  const createFromExplore = () => {
    if (!theme || pool.length === 0) return
    const seeds: NewEntrySeed[] = pool.map((c) => ({
      german: c.german,
      zh: c.zh,
      example: c.example,
      tags: [theme],
    }))
    const cat = BANK.find((c) => c.id === theme)
    const id = createList(cat ? `Headlist · ${cat.name}` : 'Headlist', seeds, theme)
    nav(`/lists/${id}`)
  }

  // ── 模式选择 ──
  if (!mode)
    return (
      <div className="flex min-h-dvh items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-lg space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-lg font-bold tracking-tight">
              <Headphones size={20} className="text-amber-500 dark:text-amber-300" />
              学习模式
            </div>
            <button onClick={() => nav('/')} className="btn btn-ghost h-9">
              <X size={15} /> 退出
            </button>
          </div>

          <button
            onClick={startReview}
            disabled={mastered.length === 0}
            className="card block w-full border-amber-400/40 bg-gradient-to-br from-amber-50 to-white p-5 text-left transition hover:border-amber-400 disabled:opacity-40 dark:border-amber-400/25 dark:from-amber-400/10 dark:to-zinc-900/60"
          >
            <div className="flex items-center gap-2 font-semibold">
              <Gem size={16} className="text-amber-500 dark:text-amber-300" /> 温习已掌握的词
            </div>
            <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
              随机抽 25 个已入册的词读一遍、听一遍 —— 只巩固，不测验。已掌握 {mastered.length} 词。
            </p>
          </button>

          <div className="card p-5">
            <div className="flex items-center gap-2 font-semibold">
              <BookOpen size={16} className="text-amber-500 dark:text-amber-300" /> 探索词库
            </div>
            <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
              精听一个主题里你还没学过的词；读完可一键把这批词建成下一份 Headlist。
            </p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {BANK.map((c) => {
                const fresh = c.entries.filter((e) => !used.has(normalizeDe(e.german))).length
                return (
                  <button
                    key={c.id}
                    onClick={() => startExplore(c.id)}
                    disabled={fresh === 0}
                    className={`chip border ${
                      fresh === 0
                        ? 'cursor-not-allowed border-zinc-200 text-zinc-300 dark:border-white/10 dark:text-zinc-600'
                        : 'border-zinc-200 text-zinc-600 hover:border-amber-400/60 hover:text-amber-600 dark:border-white/10 dark:text-zinc-300 dark:hover:text-amber-300'
                    }`}
                  >
                    {c.name}
                    <span className="tabular-nums opacity-50">{fresh === 0 ? '✓' : fresh}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <p className="px-2 text-center text-[11px] leading-relaxed text-zinc-400 dark:text-zinc-600">
            冷却中的列表刻意不在这里出现 —— 那 14 天的"想不起来"正是 Goldlist 在工作的声音。
          </p>
        </motion.div>
      </div>
    )

  // ── 读完 ──
  if (finished)
    return (
      <div className="flex min-h-dvh items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="card w-full max-w-md p-7 text-center">
          {mode === 'review' ? (
            <>
              <Gem size={26} className="mx-auto mb-3 text-amber-500 dark:text-amber-300" />
              <h1 className="text-xl font-bold tracking-tight">温习完成</h1>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                又读了一遍 {pool.length} 个已入册的词 —— 长期记忆需要偶尔浇浇水。
              </p>
              <div className="mt-6 flex gap-2">
                <button className="btn btn-ghost flex-1" onClick={() => nav('/')}>
                  回到仪表盘
                </button>
                <button className="btn btn-gold flex-1" onClick={startReview}>
                  <RefreshCw size={15} /> 再抽一批
                </button>
              </div>
            </>
          ) : (
            <>
              <BookOpen size={26} className="mx-auto mb-3 text-amber-500 dark:text-amber-300" />
              <h1 className="text-xl font-bold tracking-tight">读完了这批生词</h1>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                {pool.length} 个「{catName}」新词听了一遍。喜欢的话，把它们变成下一份 Headlist。
              </p>
              <div className="mt-6 space-y-2">
                <button className="btn btn-gold w-full" onClick={createFromExplore} disabled={pool.length === 0}>
                  <PlusCircle size={15} /> 将这 {pool.length} 词创建为 Headlist
                </button>
                <div className="flex gap-2">
                  <button className="btn btn-ghost flex-1" onClick={() => theme && startExplore(theme)}>
                    <Shuffle size={15} /> 换一批
                  </button>
                  <button className="btn btn-ghost flex-1" onClick={() => setMode(null)}>
                    换主题
                  </button>
                </div>
              </div>
            </>
          )}
        </motion.div>
      </div>
    )

  // ── 词卡流 ──
  return (
    <div className="flex min-h-dvh flex-col bg-zinc-50 dark:bg-[#0c0c0e]">
      <div className="px-5 pt-5">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <button onClick={() => setMode(null)} className="cursor-pointer rounded-lg p-1.5 text-zinc-400 transition hover:text-zinc-700 dark:hover:text-zinc-200">
            <X size={18} />
          </button>
          <span className="text-xs tabular-nums text-zinc-400">
            {mode === 'review' ? '温习' : `探索 · ${catName}`} · {idx + 1} / {pool.length}
          </span>
          <Bar pct={(idx + 1) / pool.length} gold />
        </div>
      </div>

      {pool.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {mode === 'review' ? '还没有已掌握的词 —— 先去蒸馏几份列表吧。' : '这个主题的词都已在你的学习中，换一个主题试试。'}
          </p>
          <button className="btn btn-ghost" onClick={() => setMode(null)}>
            返回选择
          </button>
          <Link to="/new" className="btn btn-gold">
            <PlusCircle size={15} /> 从词库创建 Headlist
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-1 items-center justify-center px-5 py-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={card.german}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -14 }}
                transition={{ duration: 0.22 }}
                className="w-full max-w-xl text-center"
              >
                <h2 className="px-2 text-4xl font-bold tracking-tight sm:text-5xl">{card.german}</h2>
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="mt-4">
                  <div className="text-lg text-zinc-500 dark:text-zinc-400">{card.zh}</div>
                  {card.example && <div className="mt-3 text-sm italic text-zinc-400 dark:text-zinc-500">„{card.example}“</div>}
                </motion.div>
                <div className="mt-7 flex items-center justify-center gap-3">
                  <button onClick={() => speak(card.german)} className="btn btn-gold h-11 w-11 rounded-full px-0">
                    <Volume2 size={18} />
                  </button>
                  <button onClick={() => speak(card.german, settings.slowRate)} className="btn btn-ghost h-11 w-11 rounded-full px-0">
                    <Turtle size={17} />
                  </button>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="px-5 pb-8">
            <div className="mx-auto flex max-w-xl gap-3">
              <button onClick={() => go(-1)} disabled={idx === 0} className="btn btn-ghost h-14 flex-1 text-base">
                <ArrowLeft size={17} /> 上一词
              </button>
              <button onClick={() => go(1)} className="btn btn-gold h-14 flex-1 text-base">
                {idx + 1 === pool.length ? '完成' : '下一词'} <ArrowRight size={17} />
              </button>
            </div>
            <p className="mt-3 text-center text-[11px] text-zinc-400 dark:text-zinc-600">
              只读、只听、不判断 —— <span className="kbd">←</span> <span className="kbd">→</span> 翻词
              <span className="kbd ml-1">S</span> 朗读 <span className="kbd">D</span> 慢速
            </p>
          </div>
        </>
      )}
    </div>
  )
}
