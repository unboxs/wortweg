import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Link2, X } from 'lucide-react'
import { useStore } from '../store'
import { normalizeDe } from '../lib/goldlist'
import { shuffle } from '../lib/exercises'
import { BANK } from '../data/bank'

/**
 * 连线练习：左词右义，点词点义配对。
 * 优先用已掌握的词（巩固长期记忆）；不足 4 个时从词库随机主题抽未学的词。
 */

interface Pair {
  german: string
  zh: string
}

function makeBatch(mastered: Pair[], used: Set<string>): { pairs: Pair[]; fromBank: boolean } {
  if (mastered.length >= 4) return { pairs: shuffle(mastered).slice(0, 4), fromBank: false }
  const cat = BANK[Math.floor(Math.random() * BANK.length)]
  const fresh = cat.entries
    .filter((e) => !used.has(normalizeDe(e.german)))
    .map((e) => ({ german: e.german, zh: e.zh }))
    .filter((p, i, arr) => arr.findIndex((x) => x.zh === p.zh) === i) // 释义去重，避免二义
  return { pairs: shuffle(fresh).slice(0, 4), fromBank: true }
}

export default function MatchGame({ onExit }: { onExit: () => void }) {
  const lists = useStore((s) => s.lists)
  const mastered = useMemo(
    () =>
      lists
        .flatMap((l) => l.entries)
        .filter((e) => e.mastered)
        .map((e) => ({ german: e.german, zh: e.zh })),
    [lists],
  )
  const used = useMemo(() => new Set(lists.flatMap((l) => l.entries.map((e) => normalizeDe(e.german)))), [lists])

  const [round, setRound] = useState(0)
  const [batch, setBatch] = useState(() => makeBatch(mastered, used))
  const [locked, setLocked] = useState<Set<string>>(new Set())
  const [selWord, setSelWord] = useState<string | null>(null)
  const [wrongZh, setWrongZh] = useState<string | null>(null)

  const rightCol = useMemo(() => shuffle(batch.pairs.map((p) => p.zh)), [batch])

  const tapWord = (g: string) => {
    if (locked.has(g)) return
    setSelWord(g === selWord ? null : g)
    setWrongZh(null)
  }

  const tapZh = (zh: string) => {
    if (!selWord) return
    const pair = batch.pairs.find((p) => p.german === selWord)
    if (pair && pair.zh === zh) {
      // 副作用不能放进 setState updater（StrictMode 双调用会重复触发）
      const willComplete = locked.size + 1 === batch.pairs.length
      setLocked((prev) => {
        const next = new Set(prev)
        next.add(selWord)
        return next
      })
      setSelWord(null)
      useStore.getState().recordStudy(1)
      if (willComplete) {
        window.setTimeout(() => {
          setRound((r) => r + 1)
          setBatch(makeBatch(mastered, used))
          setLocked(new Set())
        }, 700)
      }
    } else {
      setWrongZh(zh)
      window.setTimeout(() => setWrongZh(null), 550)
      setSelWord(null)
    }
  }

  const cellCls = (state: 'idle' | 'sel' | 'locked' | 'wrong') =>
    `card cursor-pointer p-3 text-center text-sm transition ${
      state === 'sel'
        ? 'border-amber-400/70 bg-amber-400/10 text-amber-600 dark:text-amber-300'
        : state === 'locked'
          ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-600 opacity-60 dark:border-emerald-400/30 dark:text-emerald-300'
          : state === 'wrong'
            ? 'border-red-400 bg-red-50 text-red-500 dark:border-red-500/60 dark:bg-red-500/10 dark:text-red-400'
            : 'hover:border-zinc-300 dark:hover:border-white/20'
    }`

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 pb-10 pt-5">
      <div className="flex items-center justify-between">
        <button onClick={onExit} className="cursor-pointer rounded-lg p-1.5 text-zinc-400 transition hover:text-zinc-700 dark:hover:text-zinc-200">
          <X size={18} />
        </button>
        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-500 dark:text-zinc-400">
          <Link2 size={16} className="text-amber-500 dark:text-amber-300" />
          连线练习 · 第 {round + 1} 轮 · {locked.size}/{batch.pairs.length}
        </div>
        <span className="text-[10px] text-zinc-400 dark:text-zinc-600">
          {batch.fromBank ? '词库新词' : '已掌握'}
        </span>
      </div>

      <p className="mt-3 text-center text-xs text-zinc-400 dark:text-zinc-500">先点一个德语词，再点它对应的释义</p>

      {batch.pairs.length < 4 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">可用词条不足 4 个，先去蒸馏或扩充列表吧。</p>
          <button className="btn btn-ghost" onClick={onExit}>返回</button>
        </div>
      ) : (
        <div className="mt-6 grid flex-1 grid-cols-2 content-start gap-2">
          <div className="space-y-2">
            {batch.pairs.map((p) => (
              <motion.button
                key={p.german}
                layout
                onClick={() => tapWord(p.german)}
                className={`${cellCls(locked.has(p.german) ? 'locked' : selWord === p.german ? 'sel' : 'idle')} block w-full`}
              >
                {p.german}
              </motion.button>
            ))}
          </div>
          <div className="space-y-2">
            {rightCol.map((zh) => {
              const pairZh = batch.pairs.find((p) => p.zh === zh)
              const isLocked = pairZh ? locked.has(pairZh.german) : false
              return (
                <motion.button
                  key={zh}
                  layout
                  onClick={() => tapZh(zh)}
                  className={`${cellCls(isLocked ? 'locked' : wrongZh === zh ? 'wrong' : 'idle')} block w-full`}
                >
                  {zh}
                </motion.button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
