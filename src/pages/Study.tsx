import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Gem,
  Headphones,
  Hash,
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
import NumberTrainer from '../components/NumberTrainer'

/**
 * 学习区（全屏沉浸）：冷却期里唯一该待的地方。
 * 温习已掌握词 → 强化长期记忆；探索词库 → 精听生词、读完可一键建 Headlist；
 * 数字训练 → 整合自 GermanLearn 项目。
 * 刻意不含"冷却中的列表"——保护 Goldlist 的自然遗忘筛选。
 * 无 XP、无判断：读、听、写。
 *
 * 抄写门槛：每个词必须亲手写下来才能翻到下一个 —— 动觉记忆是
 * Goldlist"手抄"仪式的核心，在数字界面里用打字还原。
 *
 * 卡片切换用"只进不出"动画：AnimatePresence mode="wait" 依赖退场完成回调，
 * 在失焦/后台窗口会永久卡死（Chromium 节流动画时钟）；新内容直接挂载 +
 * 淡入，任何时钟条件下都不会卡。
 */

type Mode = 'review' | 'explore' | 'numbers'

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

/** 抄写比对：忽略大小写、ä/ae 等变音写法与标点（词库含 "…" 句型，必须能打） */
const transcribed = (typed: string, german: string): boolean => {
  const norm = (s: string) => normalizeDe(s).replace(/[^a-z0-9 ]/g, '').trim()
  return norm(typed) !== '' && norm(typed) === norm(german)
}

const typingIn = (e: KeyboardEvent): boolean => {
  const t = e.target as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')
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
  // 抄写门槛：已抄写的下标集合；翻页必须先抄写当前词
  const [written, setWritten] = useState<Set<number>>(() => new Set())
  const [typed, setTyped] = useState('')

  const mastered = useMemo(() => lists.flatMap((l) => l.entries).filter((e) => e.mastered), [lists])
  const used = useMemo(() => new Set(lists.flatMap((l) => l.entries.map((e) => normalizeDe(e.german)))), [lists])

  const startReview = () => {
    setMode('review')
    setPool(shuffle(mastered).slice(0, 25))
    setIdx(0)
    setFinished(false)
    setWritten(new Set())
    setTyped('')
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
    setWritten(new Set())
    setTyped('')
  }

  const card = pool[idx]
  const catName = theme ? BANK.find((c) => c.id === theme)?.name : null
  const canAdvance = !!card && (written.has(idx) || transcribed(typed, card.german))

  // 每个词出现时自动朗读
  useEffect(() => {
    if (!card || finished || mode === 'numbers') return
    if (settings.autoSpeak) speak(card.german)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, card?.german, finished])

  const go = (dir: 1 | -1) => {
    if (dir === 1) {
      if (!card || !canAdvance) return
      if (!written.has(idx)) setWritten((prev) => new Set(prev).add(idx))
      const next = idx + 1
      if (next >= pool.length) {
        setFinished(true)
        return
      }
      setIdx(next)
      setTyped('')
    } else {
      if (idx === 0) return
      setIdx(idx - 1)
      setTyped('')
    }
  }

  // 键盘：Enter 抄写后翻词；← →；S/D 朗读。正在输入时只响应 Enter。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!card || finished) return
      if (typingIn(e)) {
        if (e.key === 'Enter' && canAdvance) {
          e.preventDefault()
          go(1)
        }
        return
      }
      if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
      else if (e.key.toLowerCase() === 's') speak(card.german)
      else if (e.key.toLowerCase() === 'd') speak(card.german, settings.slowRate)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, card, finished, canAdvance, settings.slowRate])

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

  // ── 数字训练（整合自 GermanLearn）──
  if (mode === 'numbers') return <NumberTrainer onExit={() => setMode(null)} />

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
              随机抽 25 个已入册的词，逐词朗读 + 抄写 —— 只巩固，不测验。已掌握 {mastered.length} 词。
            </p>
          </button>

          <div className="card p-5">
            <div className="flex items-center gap-2 font-semibold">
              <BookOpen size={16} className="text-amber-500 dark:text-amber-300" /> 探索词库
            </div>
            <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
              精听一个主题里你还没学过的词；每个词都要抄写下来，读完可一键建成下一份 Headlist。
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

          <button onClick={() => setMode('numbers')} className="card block w-full p-5 text-left transition hover:border-amber-400/60">
            <div className="flex items-center gap-2 font-semibold">
              <Hash size={16} className="text-amber-500 dark:text-amber-300" /> 数字训练
            </div>
            <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
              听音辨数 · 看数写词 · 数字串听力（电话号码式）· 数字表 · 0–9999 任意数字合成发音。
            </p>
          </button>

          <p className="px-2 text-center text-[11px] leading-relaxed text-zinc-400 dark:text-zinc-600">
            温习与探索都要亲手抄写每个词 —— 动觉记忆是吸收的一部分。
            冷却中的列表刻意不在这里出现，那 14 天的"想不起来"正是 Goldlist 在工作的声音。
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
                又亲手写了一遍 {pool.length} 个已入册的词 —— 长期记忆需要偶尔浇浇水。
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
              <h1 className="text-xl font-bold tracking-tight">这批生词抄完了</h1>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                {pool.length} 个「{catName}」新词听了一遍、写了一遍。喜欢的话，把它们变成下一份 Headlist。
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
          <span className="text-xs tabular-nums text-amber-500 dark:text-amber-300">{written.size} 已抄写</span>
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
          <div className="flex flex-1 items-center justify-center px-5 py-6">
            {/* 只进不出：新卡立即挂载淡入，无退场完成依赖，不会卡死 */}
            <motion.div
              key={card.german}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
              className="w-full max-w-xl text-center"
            >
              <h2 className="px-2 text-4xl font-bold tracking-tight sm:text-5xl">{card.german}</h2>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="mt-4">
                <div className="text-lg text-zinc-500 dark:text-zinc-400">{card.zh}</div>
                {card.example && <div className="mt-3 text-sm italic text-zinc-400 dark:text-zinc-500">„{card.example}“</div>}
              </motion.div>

              {/* 抄写门槛：写下来，才能翻页 */}
              <div className="mx-auto mt-6 flex max-w-xs items-center gap-2">
                <input
                  autoFocus
                  className="input text-center font-mono"
                  placeholder={written.has(idx) ? '已抄写 ✓ —— Enter 翻词' : '把这个词抄写下来…'}
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && canAdvance) go(1)
                  }}
                />
                {canAdvance && (
                  <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}>
                    <Check size={20} className="text-amber-400" strokeWidth={3} />
                  </motion.span>
                )}
              </div>

              <div className="mt-5 flex items-center justify-center gap-3">
                <button onClick={() => speak(card.german)} className="btn btn-ghost h-11 w-11 rounded-full px-0">
                  <Volume2 size={18} />
                </button>
                <button onClick={() => speak(card.german, settings.slowRate)} className="btn btn-ghost h-11 w-11 rounded-full px-0">
                  <Turtle size={17} />
                </button>
              </div>
            </motion.div>
          </div>

          <div className="px-5 pb-8">
            <div className="mx-auto flex max-w-xl gap-3">
              <button onClick={() => go(-1)} disabled={idx === 0} className="btn btn-ghost h-14 flex-1 text-base">
                <ArrowLeft size={17} /> 上一词
              </button>
              <button
                onClick={() => go(1)}
                disabled={!canAdvance}
                className="btn btn-gold h-14 flex-1 text-base"
                title={canAdvance ? undefined : '先抄写这个词才能继续'}
              >
                {idx + 1 === pool.length ? '完成' : '下一词'} <ArrowRight size={17} />
              </button>
            </div>
            <p className="mt-3 text-center text-[11px] text-zinc-400 dark:text-zinc-600">
              {canAdvance ? 'Enter / → 翻词' : '把这个词写下来才能翻页（ä 可输 ae，标点随意）'}
              {' '}—— <span className="kbd">S</span> 朗读 <span className="kbd">D</span> 慢速
            </p>
          </div>
        </>
      )}
    </div>
  )
}
