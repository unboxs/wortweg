import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { BookOpen, Gem, Headphones, Hash, Keyboard, Link2, PlusCircle, RefreshCw, Shuffle, X } from 'lucide-react'
import { useStore, type NewEntrySeed } from '../store'
import { useSpeech } from '../hooks/useSpeech'
import { normalizeDe } from '../lib/goldlist'
import { buildExercise, shuffle } from '../lib/exercises'
import { BANK } from '../data/bank'
import { Bar } from '../components/ui'
import NumberTrainer from '../components/NumberTrainer'
import MatchGame from '../components/MatchGame'
import ExerciseCard from '../components/ExerciseCard'
import SpellDictation from '../components/SpellDictation'

/**
 * 学习区（全屏沉浸）：冷却期里唯一该待的地方。
 * 温习已掌握词 / 探索词库 —— 七题型练习流（抄写、冠词、补字母、听写、
 * 例句填空、释义→德语、句子重组），解出自动翻页；连线练习、数字训练为独立模式。
 * 刻意不含"冷却中的列表"——保护 Goldlist 的自然遗忘筛选。
 * 卡片切换用"只进不出"动画（mode="wait" 在失焦窗口会永久卡死）。
 */

type Mode = 'review' | 'explore' | 'match' | 'spell' | 'numbers'

interface StudyCard {
  german: string
  zh: string
  example?: string
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
  // 已解出的下标集合；解出才能继续
  const [solved, setSolved] = useState<Set<number>>(() => new Set())

  const mastered = useMemo(() => lists.flatMap((l) => l.entries).filter((e) => e.mastered), [lists])
  const used = useMemo(() => new Set(lists.flatMap((l) => l.entries.map((e) => normalizeDe(e.german)))), [lists])

  const startReview = () => {
    setMode('review')
    setPool(shuffle(mastered).slice(0, 25))
    setIdx(0)
    setFinished(false)
    setSolved(new Set())
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
    setSolved(new Set())
  }

  const card = pool[idx]
  const catName = theme ? BANK.find((c) => c.id === theme)?.name : null
  // 每个词条随机派生一种题型（父级持有，便于按题型决定是否自动朗读）
  const ex = useMemo(() => (card ? buildExercise(card) : null), [card, idx])

  // 自动朗读：只对不泄题的题型（抄写/听写）
  useEffect(() => {
    if (!card || finished || !ex || mode === 'numbers' || mode === 'match' || mode === 'spell') return
    if (settings.autoSpeak && ex.speakOnEnter) speak(card.german)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, card?.german, finished])

  const advance = (mark: boolean) => {
    if (!card) return
    if (mark) {
      setSolved((prev) => {
        const next = new Set(prev)
        next.add(idx)
        return next
      })
    } else if (!solved.has(idx)) return
    const n = idx + 1
    if (n >= pool.length) {
      setFinished(true)
      return
    }
    setIdx(n)
  }

  // 键盘：→ 在已解出时可翻词；← 回看；S/D 朗读。正在输入时忽略。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!card || finished || mode === 'numbers' || mode === 'match' || mode === 'spell') return
      if (typingIn(e)) return
      if (e.key === 'ArrowRight') advance(false)
      else if (e.key === 'ArrowLeft') {
        if (idx > 0) setIdx(idx - 1)
      } else if (e.key.toLowerCase() === 's') speak(card.german)
      else if (e.key.toLowerCase() === 'd') speak(card.german, settings.slowRate)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, card, finished, solved, settings.slowRate])

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

  // ── 独立模式 ──
  if (mode === 'numbers') return <NumberTrainer onExit={() => setMode(null)} />
  if (mode === 'match') return <MatchGame onExit={() => setMode(null)} />
  if (mode === 'spell') return <SpellDictation onExit={() => setMode(null)} />

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
              随机抽 25 个已入册的词做多题型练习 —— 只巩固，不测验。已掌握 {mastered.length} 词。
            </p>
          </button>

          <div className="card p-5">
            <div className="flex items-center gap-2 font-semibold">
              <BookOpen size={16} className="text-amber-500 dark:text-amber-300" /> 探索词库
            </div>
            <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
              精听一个主题里你还没学过的词，配合抄写、冠词、听写等题型；读完可一键建成下一份 Headlist。
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

          <button onClick={() => setMode('match')} className="card block w-full p-5 text-left transition hover:border-amber-400/60">
            <div className="flex items-center gap-2 font-semibold">
              <Link2 size={16} className="text-amber-500 dark:text-amber-300" /> 连线练习
            </div>
            <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
              左词右义点选配对，一轮 4 词。优先配已掌握的词，不够则从词库抽新词。
            </p>
          </button>

          <button onClick={() => setMode('spell')} className="card block w-full p-5 text-left transition hover:border-amber-400/60">
            <div className="flex items-center gap-2 font-semibold">
              <Keyboard size={16} className="text-amber-500 dark:text-amber-300" /> 字母听写
            </div>
            <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
              播放单词的逐字母拼写（be, ce, eff, jot…），写下听到的词 —— 练德语字母名。词源优先用你已掌握的词。
            </p>
          </button>

          <button onClick={() => setMode('numbers')} className="card block w-full p-5 text-left transition hover:border-amber-400/60">
            <div className="flex items-center gap-2 font-semibold">
              <Hash size={16} className="text-amber-500 dark:text-amber-300" /> 数字训练
            </div>
            <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
              听音辨数 · 看数写词 · 数字串听力（电话号码式）· 数字表 · 0–9999 任意数字合成发音。
            </p>
          </button>

          <p className="px-2 text-center text-[11px] leading-relaxed text-zinc-400 dark:text-zinc-600">
            题型从词条自动派生：抄写、定/不定/否定/物主冠词、补全字母、听写、例句填空、释义→德语、句子重组。
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
                练完了 {pool.length} 个已入册的词 —— 长期记忆需要偶尔浇浇水。
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
              <h1 className="text-xl font-bold tracking-tight">这批生词练完了</h1>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                {pool.length} 个「{catName}」新词多过了一遍。喜欢的话，把它们变成下一份 Headlist。
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

  // ── 练习流 ──
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
          <span className="text-xs tabular-nums text-amber-500 dark:text-amber-300">{solved.size} 已练习</span>
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
            <ExerciseCard key={`${idx}-${card.german}`} entry={card} ex={ex!} onSolved={() => advance(true)} />
          </div>

          <div className="px-5 pb-8">
            <div className="mx-auto flex max-w-xl gap-3">
              <button onClick={() => (idx > 0 ? setIdx(idx - 1) : undefined)} disabled={idx === 0} className="btn btn-ghost h-12 flex-1 text-base">
                上一词
              </button>
              <button onClick={() => advance(true)} className="btn btn-ghost h-12 px-5 text-xs">
                跳过此题
              </button>
            </div>
            <p className="mt-3 text-center text-[11px] text-zinc-400 dark:text-zinc-600">
              {solved.has(idx) ? 'Enter / → 继续' : '解出这道题自动翻页'} —— <span className="kbd">S</span> 朗读
              <span className="kbd ml-1">D</span> 慢速
            </p>
          </div>
        </>
      )}
    </div>
  )
}
