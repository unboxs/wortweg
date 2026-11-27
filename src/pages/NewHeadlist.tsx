import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  BookOpen,
  Brain,
  Briefcase,
  Check,
  ClipboardList,
  Clock,
  Coffee,
  FileText,
  Globe,
  GraduationCap,
  Hash,
  Heart,
  HeartPulse,
  Landmark,
  Leaf,
  MessagesSquare,
  Palette,
  Plane,
  PlusCircle,
  Quote,
  Search,
  Shuffle,
  Sprout,
  Type,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useStore, type NewEntrySeed } from '../store'
import { normalizeDe } from '../lib/goldlist'
import { BANK } from '../data/bank'
import { SpeakButtons } from '../components/ui'
import type { BankEntry } from '../types'

const CAT_ICONS: Record<string, LucideIcon> = {
  a1: Sprout,
  a2: BookOpen,
  jcabk: FileText,
  jcfamilie: Users,
  jcpruefung: ClipboardList,
  jcfarben: Palette,
  jcberufe: Briefcase,
  jclaender: Globe,
  jcschule: GraduationCap,
  jczeit: Clock,
  jczahl: Hash,
  jcalpha: Type,
  alltag: Coffee,
  arbeit: Briefcase,
  reisen: Plane,
  gefuehle: Heart,
  meinung: MessagesSquare,
  abstrakt: Brain,
  bildung: GraduationCap,
  gesundheit: HeartPulse,
  wirtschaft: Landmark,
  umwelt: Leaf,
  zeit: Clock,
  wendungen: Quote,
  verben: Type,
}

type Picked = { cat: string; e: BankEntry }
const keyOf = (p: Picked) => `${p.cat}|${p.e.german}`

const B1_FOCUS = ['alltag', 'arbeit', 'reisen', 'gesundheit', 'verben', 'meinung', 'zeit']

export default function NewHeadlist() {
  const [params] = useSearchParams()
  const from = params.get('from')
  const [tab, setTab] = useState<'bank' | 'manual'>('bank')
  return (
    <div className="mx-auto max-w-3xl">
      <PathBanner from={from} />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold tracking-tight">新建 Headlist</h1>
        <div className="flex rounded-xl border border-zinc-200 p-1 dark:border-white/10">
          {(
            [
              ['bank', '内置词库'],
              ['manual', '手动 / 导入'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`cursor-pointer rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${
                tab === k ? 'bg-amber-400/15 text-amber-600 dark:text-amber-300' : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {tab === 'bank' ? <BankPicker from={from} /> : <ManualInput />}
    </div>
  )
}

function PathBanner({ from }: { from: string | null }) {
  if (from === 'b1')
    return (
      <div className="card mb-5 p-4 text-sm leading-relaxed">
        <div className="font-semibold">B1 入口</div>
        <p className="mt-1 text-zinc-600 dark:text-zinc-300">
          给准备 Goethe / telc B1 的成人。下面先打开日常、工作、旅行这些 B1 常用主题。建议 20–25 词，少一些也可以。选完要逐词抄写，冷却才会开始。这一版没有完整的考试大纲。
        </p>
      </div>
    )
  if (from === 'zoubian')
    return (
      <div className="card mb-5 p-4 text-sm leading-relaxed">
        <div className="font-semibold">《走遍德国》入口</div>
        <p className="mt-1 text-zinc-600 dark:text-zinc-300">
          按课次对齐的词表还没做，这里不会假装已经对上每一课。可以先从教材主题里挑一批，例如「教材·考试用语」只有 6 个词，适合当第一份小 Headlist。选完同样要抄写。
        </p>
      </div>
    )
  return null
}

// ─── 从内置词库挑选 ─────────────────────────────────────────────────────

function BankPicker({ from }: { from: string | null }) {
  const nav = useNavigate()
  const createList = useStore((s) => s.createList)
  const lists = useStore((s) => s.lists)
  const [cat, setCat] = useState(from === 'zoubian' ? 'jcpruefung' : from === 'b1' ? 'alltag' : BANK[0].id)
  const [focusOnly, setFocusOnly] = useState(from === 'b1' || from === 'zoubian')
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<Picked[]>([])
  const [name, setName] = useState('')

  // 已在任何列表中的词条（含已掌握）不再重复推荐
  const used = useMemo(
    () => new Set(lists.flatMap((l) => l.entries.map((e) => normalizeDe(e.german)))),
    [lists],
  )
  const pickedKeys = useMemo(() => new Set(picked.map(keyOf)), [picked])

  const q = query.trim().toLowerCase()
  const searching = q.length > 0
  const pool = useMemo(() => {
    if (searching)
      return BANK.flatMap((c) =>
        c.entries.filter((e) => e.german.toLowerCase().includes(q) || e.zh.includes(query.trim())).map((e) => ({ cat: c.id, catName: c.name, e })),
      )
    const c = BANK.find((x) => x.id === cat)!
    return c.entries.map((e) => ({ cat: c.id, catName: c.name, e }))
  }, [cat, q, searching, query])

  const toggle = (p: Picked) =>
    setPicked((prev) => (prev.some((x) => keyOf(x) === keyOf(p)) ? prev.filter((x) => keyOf(x) !== keyOf(p)) : [...prev, p]))

  const random25 = () => {
    const candidates = pool.filter((p) => !used.has(normalizeDe(p.e.german)) && !pickedKeys.has(keyOf(p)))
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[candidates[i], candidates[j]] = [candidates[j], candidates[i]]
    }
    setPicked(candidates.slice(0, 25).map((p) => ({ cat: p.cat, e: p.e })))
  }

  const create = () => {
    if (picked.length === 0) return
    const theme = picked.every((p) => p.cat === picked[0].cat) ? picked[0].cat : undefined
    const themeName = theme ? BANK.find((c) => c.id === theme)?.name : undefined
    const seeds: NewEntrySeed[] = picked.map((p) => ({
      german: p.e.german,
      zh: p.e.zh,
      example: p.e.example,
      tags: [p.cat],
    }))
    const id = createList(name || (themeName ? `Headlist · ${themeName}` : `Headlist · ${new Date().toLocaleDateString()}`), seeds, theme)
    nav(`/write/${id}`)
  }

  return (
    <div>
      {/* 分类 */}
      {!searching && (
        <div className="mb-4 flex flex-wrap gap-2">
          {focusOnly && (
            <button type="button" onClick={() => setFocusOnly(false)} className="chip border border-zinc-200 text-zinc-500 dark:border-white/10 dark:text-zinc-400">
              显示全部主题
            </button>
          )}
          {BANK.filter((c) => {
            if (!focusOnly) return true
            if (from === 'zoubian') return c.id.startsWith('jc')
            return B1_FOCUS.includes(c.id)
          }).map((c) => {
            const Icon = CAT_ICONS[c.id] ?? Type
            return (
              <button
                key={c.id}
                onClick={() => setCat(c.id)}
                className={`chip border ${
                  cat === c.id
                    ? 'border-amber-400/60 bg-amber-400/10 text-amber-600 dark:text-amber-300'
                    : 'border-zinc-200 text-zinc-500 hover:border-zinc-300 dark:border-white/10 dark:text-zinc-400'
                }`}
              >
                <Icon size={13} />
                {c.name}
                <span className="tabular-nums opacity-50">{c.entries.length}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* 搜索 */}
      <div className="relative mb-4">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
        <input
          className="input pl-9"
          placeholder="搜索全部主题：德语或释义…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* 词条池 */}
      <div className="card max-h-[46vh] divide-y divide-zinc-100 overflow-y-auto dark:divide-white/5">
        {pool.map(({ cat: c, catName, e }) => {
          const isUsed = used.has(normalizeDe(e.german))
          const isPicked = pickedKeys.has(`${c}|${e.german}`)
          return (
            <button
              key={`${c}-${e.german}`}
              disabled={isUsed}
              onClick={() => toggle({ cat: c, e })}
              className={`flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left transition ${
                isUsed ? 'cursor-not-allowed opacity-35' : 'hover:bg-zinc-50 dark:hover:bg-white/[0.03]'
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium">{e.german}</span>
                  {searching && <span className="text-[10px] text-zinc-400">{catName}</span>}
                </div>
                <div className="truncate text-xs text-zinc-400 dark:text-zinc-500">{e.zh}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <SpeakButtons text={e.german} size={14} />
                {isUsed ? (
                  <span className="text-[10px] text-zinc-300 dark:text-zinc-600">已在学习中</span>
                ) : (
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-md border transition ${
                      isPicked ? 'border-amber-400 bg-amber-400 text-zinc-950' : 'border-zinc-300 dark:border-white/20'
                    }`}
                  >
                    {isPicked && <Check size={13} strokeWidth={3} />}
                  </span>
                )}
              </div>
            </button>
          )
        })}
        {pool.length === 0 && <div className="p-8 text-center text-sm text-zinc-400">没有匹配的词条</div>}
      </div>

      {/* 底部操作条 */}
      <div className="card sticky bottom-20 z-10 mt-4 flex flex-wrap items-center gap-3 p-3 md:bottom-4">
        <div className="flex items-center gap-2">
          <motion.span
            key={picked.length}
            initial={{ scale: 1.25 }}
            animate={{ scale: 1 }}
            className={`text-lg font-bold tabular-nums ${picked.length >= 20 && picked.length <= 25 ? 'text-amber-500 dark:text-amber-300' : 'text-zinc-700 dark:text-zinc-200'}`}
          >
            {picked.length}
          </motion.span>
          <span className="text-xs text-zinc-400">已选 · 建议 20–25，短列表也可以</span>
        </div>
        <button onClick={random25} className="btn btn-ghost h-9">
          <Shuffle size={14} /> 随机选 25
        </button>
        <input className="input h-9 min-w-40 flex-1" placeholder="列表名（可留空自动生成）" value={name} onChange={(e) => setName(e.target.value)} />
        <button onClick={create} className="btn btn-gold h-9" disabled={picked.length === 0}>
          <PlusCircle size={15} /> 去抄写
        </button>
      </div>
    </div>
  )
}

// ─── 手动输入 / 粘贴导入 ────────────────────────────────────────────────

function ManualInput() {
  const nav = useNavigate()
  const createList = useStore((s) => s.createList)
  const [name, setName] = useState('')
  const [text, setText] = useState('')

  const seeds = useMemo<NewEntrySeed[]>(() => {
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [german, zh] = line.split('|').map((p) => p.trim())
        return { german: german ?? '', zh: zh ?? '', tags: ['自定义'] as string[] }
      })
      .filter((s) => s.german.length > 0)
  }, [text])

  const create = () => {
    if (seeds.length === 0) return
    const id = createList(
      name || `Headlist · ${new Date().toLocaleDateString()}`,
      seeds,
    )
    nav(`/write/${id}`)
  }

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-xs text-zinc-400">列表名</span>
        <input className="input" placeholder="例：Redemittel für Diskussionen" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-zinc-400">
          词条 —— 一行一个，格式 <code className="rounded bg-zinc-100 px-1 dark:bg-white/10">德语 | 释义</code>（释义可省略，稍后补）
        </span>
        <textarea
          className="input h-56 resize-y py-3 font-mono leading-relaxed"
          placeholder={'sich herantrauen | 敢于靠近\nes darauf ankommen lassen | 听天由命\ndie Fassung verlieren | 失去镇定'}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <div className="card flex flex-wrap items-center justify-between gap-3 p-3">
        <span className="text-sm text-zinc-500 dark:text-zinc-400">
          解析出 <span className="font-semibold text-amber-600 dark:text-amber-300 tabular-nums">{seeds.length}</span> 个词条
        </span>
        <button onClick={create} className="btn btn-gold" disabled={seeds.length === 0}>
          <PlusCircle size={15} /> 去抄写
        </button>
      </div>
      <p className="text-xs text-zinc-400 dark:text-zinc-600">
        粘贴后还要逐词抄写一遍，冷却才会开始。从别处复制的生词表（如 Anki 导出、课文词汇表）可以直接贴进来。
      </p>
    </div>
  )
}
