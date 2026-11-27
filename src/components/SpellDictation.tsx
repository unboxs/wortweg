import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, Keyboard, Turtle, Volume2, X } from 'lucide-react'
import { useStore } from '../store'
import { useSpeech } from '../hooks/useSpeech'
import { speakSequence, stopSpeaking } from '../lib/tts'
import { parseNoun, transcribed } from '../lib/exercises'
import { BANK } from '../data/bank'

/**
 * 字母听写：播放德语单词的逐字母拼写（每个字母读它的德语名，
 * be / ce / eff / jot / ku / vau / ypsilon / zet / eszett…），
 * 用户写下听到的词 —— 练字母名 + 真实拼写听写。
 * 词源优先用已掌握的词（拼自己正在学的词汇最有意义），
 * 不足 3 个可拼写词时回退到词库随机主题。
 */

const LETTER_NAMES: Record<string, string> = {
  a: 'a', b: 'be', c: 'ce', d: 'de', e: 'e', f: 'eff', g: 'ge', h: 'ha',
  i: 'i', j: 'jot', k: 'ka', l: 'el', m: 'em', n: 'en', o: 'o', p: 'pe',
  q: 'ku', r: 'er', s: 'es', t: 'te', u: 'u', v: 'vau', w: 'we', x: 'iks',
  y: 'ypsilon', z: 'zet', ä: 'ä', ö: 'ö', ü: 'ü', ß: 'eszett',
}

function toSpelling(word: string): string[] {
  return [...word.toLowerCase()].map((c) => LETTER_NAMES[c] ?? c)
}

interface SpellQ {
  word: string
  zh: string
}

/** 可拼写的题：纯字母 3–12 字符；名词取裸词根 */
function spellable(entry: { german: string; zh: string }): SpellQ | null {
  const noun = parseNoun(entry.german)
  const word = (noun?.base ?? entry.german).trim()
  if (word.length < 3 || word.length > 12) return null
  if (!/^[a-zA-ZäöüÄÖÜß]+$/.test(word)) return null
  return { word, zh: entry.zh }
}

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]

export default function SpellDictation({ onExit }: { onExit: () => void }) {
  const lists = useStore((s) => s.lists)
  const rate = useStore((s) => s.settings.rate)
  const voiceURI = useStore((s) => s.settings.voiceURI)
  const { speak } = useSpeech()

  const masteredPool = useMemo(
    () =>
      lists
        .flatMap((l) => l.entries)
        .filter((e) => e.mastered)
        .map(spellable)
        .filter((q): q is SpellQ => q !== null),
    [lists],
  )

  const [q, setQ] = useState<SpellQ>(() => pickQ(masteredPool))
  const [text, setText] = useState('')
  const [result, setResult] = useState<boolean | null>(null)
  const [speakingIdx, setSpeakingIdx] = useState(-1)
  const [revealed, setRevealed] = useState(false)
  const [score, setScore] = useState({ ok: 0, total: 0 })

  function pickQ(pool: SpellQ[]): SpellQ {
    if (pool.length > 0) return pick(pool)
    const cat = pick(BANK)
    const candidates = cat.entries.map(spellable).filter((x): x is SpellQ => x !== null)
    return candidates.length > 0 ? pick(candidates) : { word: 'Apfel', zh: '苹果' }
  }

  const play = (word: string, slow = false) => {
    speakSequence(toSpelling(word), {
      rate,
      voiceURI,
      gapMs: slow ? 950 : 450,
      onIndex: setSpeakingIdx,
    }).then(() => setSpeakingIdx(-1))
  }

  const nextQ = () => {
    const nq = pickQ(masteredPool)
    setQ(nq)
    setText('')
    setResult(null)
    setRevealed(false)
    play(nq.word)
  }

  // 离开训练器停朗读
  useEffect(() => () => stopSpeaking(), [])

  // 答对 1.1s / 答错 2.4s 后自动下一题
  useEffect(() => {
    if (result === null) return
    const t = setTimeout(nextQ, result ? 1100 : 2400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result])

  const submit = () => {
    if (result !== null || !text.trim()) return
    const ok = transcribed(text, q.word)
    setResult(ok)
    if (ok) useStore.getState().recordStudy(1)
    setScore((s) => ({ ok: s.ok + (ok ? 1 : 0), total: s.total + 1 }))
  }

  // 空格重播（未在输入时）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      if (e.key === ' ' && result === null) {
        e.preventDefault()
        play(q.word)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, result])

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 pb-10 pt-5">
      <div className="flex items-center justify-between">
        <button onClick={onExit} className="cursor-pointer rounded-lg p-1.5 text-zinc-400 transition hover:text-zinc-700 dark:hover:text-zinc-200">
          <X size={18} />
        </button>
        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-500 dark:text-zinc-400">
          <Keyboard size={16} className="text-amber-500 dark:text-amber-300" />
          字母听写 · {score.ok} / {score.total}
        </div>
        <span className="text-[10px] text-zinc-400 dark:text-zinc-600">
          {masteredPool.length >= 3 ? '你的已掌握词' : '词库'}
        </span>
      </div>

      <p className="mt-4 text-center text-xs text-zinc-400 dark:text-zinc-500">
        听字母拼写（be, ce, eff, jot…），写下这个词 · Enter 提交 · 空格 重播
      </p>

      {/* 字母槽：播放时高亮当前字母位置 */}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {[...q.word].map((_, i) => (
          <motion.span
            key={i}
            animate={{ scale: speakingIdx === i ? 1.25 : 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className={`flex h-9 w-9 items-center justify-center rounded-xl border text-lg font-bold ${
              speakingIdx === i
                ? 'border-amber-400/70 bg-amber-400/10 text-amber-500 dark:text-amber-300'
                : 'border-zinc-200 text-zinc-400 dark:border-white/10 dark:text-zinc-600'
            }`}
          >
            {result !== null ? q.word[i] : '·'}
          </motion.span>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-center gap-3">
        <button onClick={() => play(q.word)} className="btn btn-gold h-14 w-14 rounded-full px-0">
          <Volume2 size={22} />
        </button>
        <button onClick={() => play(q.word, true)} className="btn btn-ghost h-12 w-12 rounded-full px-0" title="慢速（停顿更久）">
          <Turtle size={18} />
        </button>
      </div>

      <div className="mx-auto mt-6 w-full max-w-xs">
        <input
          autoFocus
          lang="de"
          autoCapitalize="none"
          spellCheck={false}
          className="input text-center font-mono text-lg"
          placeholder={result !== null ? '稍后自动下一题…' : '写下听到的词…'}
          value={text}
          disabled={result !== null}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
      </div>

      {result === null ? (
        revealed ? (
          <div className="mt-3 text-center font-mono text-sm text-amber-600 dark:text-amber-300">
            提示：{q.word[0]}…（{q.word.length} 个字母）
          </div>
        ) : (
          <button
            onClick={() => setRevealed(true)}
            className="mx-auto mt-3 block cursor-pointer text-[11px] text-zinc-400 underline decoration-dotted dark:text-zinc-500"
          >
            听不出来？看提示
          </button>
        )
      ) : (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-4 text-center">
          <div className={`flex items-center justify-center gap-1.5 text-lg font-bold ${result ? 'text-emerald-500 dark:text-emerald-300' : 'text-red-500 dark:text-red-400'}`}>
            {result ? (
              <>
                <Check size={20} /> 正确
              </>
            ) : (
              `✗ 正确拼写：${q.word}`
            )}
          </div>
          <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{q.zh}</div>
          <button onClick={() => speak(q.word)} className="mt-2 cursor-pointer text-xs text-amber-600 hover:underline dark:text-amber-300">
            整词发音
          </button>
        </motion.div>
      )}
    </div>
  )
}
