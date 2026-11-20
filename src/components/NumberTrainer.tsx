import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Hash, Turtle, Volume2, X } from 'lucide-react'
import { useSpeech } from '../hooks/useSpeech'
import { speakSequence, stopSpeaking } from '../lib/tts'
import { normalizeDe } from '../lib/goldlist'
import { NUMBER_ANCHORS, NUMBER_RANGES, numberToGerman, type RangeId } from '../lib/numbers'

/**
 * 德语数字训练（整合自 GermanLearn 项目）：
 * 锚点表 + IPA 数据保留；发音改用 Wortweg 的 TTS 引擎，
 * 由 numberToGerman() 合成 0–9999 任意数字 —— 补上原项目只覆盖
 * 29 个录音锚点、无法训练合成数的缺口。
 */

type Drill = 'listen' | 'spell' | 'sequence' | 'table'

const DRILLS: { id: Drill; label: string }[] = [
  { id: 'listen', label: '听音辨数' },
  { id: 'spell', label: '看数写词' },
  { id: 'sequence', label: '数字串听力' },
  { id: 'table', label: '数字表' },
]

const rnd = (max: number) => Math.floor(Math.random() * (max + 1))

const typingIn = (e: KeyboardEvent): boolean => {
  const t = e.target as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')
}

/** 抄写/拼写比对：忽略大小写、变音符号写法与标点 */
const sameGerman = (a: string, b: string) => {
  const norm = (s: string) => normalizeDe(s).replace(/[^a-z0-9 ]/g, '').trim()
  return norm(a) !== '' && norm(a) === norm(b)
}

export default function NumberTrainer({ onExit }: { onExit: () => void }) {
  const [drill, setDrill] = useState<Drill>('listen')
  const [rangeId, setRangeId] = useState<RangeId>('basic')
  const [score, setScore] = useState({ ok: 0, total: 0 })
  const range = NUMBER_RANGES.find((r) => r.id === rangeId)!

  const onScore = (ok: boolean) => setScore((s) => ({ ok: s.ok + (ok ? 1 : 0), total: s.total + 1 }))

  // 离开训练器时停掉朗读
  useEffect(() => () => stopSpeaking(), [])

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 pb-10 pt-5">
      <div className="flex items-center justify-between gap-3">
        <button onClick={onExit} className="cursor-pointer rounded-lg p-1.5 text-zinc-400 transition hover:text-zinc-700 dark:hover:text-zinc-200">
          <X size={18} />
        </button>
        <div className="flex flex-1 justify-center gap-1 overflow-x-auto">
          {DRILLS.map((d) => (
            <button
              key={d.id}
              onClick={() => setDrill(d.id)}
              className={`chip shrink-0 border ${
                drill === d.id
                  ? 'border-amber-400/60 bg-amber-400/10 text-amber-600 dark:text-amber-300'
                  : 'border-zinc-200 text-zinc-500 dark:border-white/10 dark:text-zinc-400'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
        <span className="shrink-0 text-xs tabular-nums text-zinc-400">
          {score.ok} / {score.total}
        </span>
      </div>

      {drill !== 'table' && (
        <div className="mt-4 flex justify-center gap-2">
          {NUMBER_RANGES.map((r) => (
            <button
              key={r.id}
              onClick={() => setRangeId(r.id)}
              className={`chip border ${
                rangeId === r.id
                  ? 'border-amber-400/60 bg-amber-400/10 text-amber-600 dark:text-amber-300'
                  : 'border-zinc-200 text-zinc-500 dark:border-white/10 dark:text-zinc-400'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}

      <div className="mt-6 flex-1">
        {drill === 'listen' && <ListenDrill key={`l-${rangeId}`} max={range.max} onScore={onScore} />}
        {drill === 'spell' && <SpellDrill key={`s-${rangeId}`} max={range.max} onScore={onScore} />}
        {drill === 'sequence' && <SequenceDrill key={`q-${rangeId}`} max={range.max} onScore={onScore} />}
        {drill === 'table' && <TableDrill />}
      </div>
    </div>
  )
}

// ─── 听音辨数：听德语 → 输入阿拉伯数字 ────────────────────────────────

function ListenDrill({ max, onScore }: { max: number; onScore: (ok: boolean) => void }) {
  const { speak } = useSpeech()
  const slowRate = useStoreSlow()
  const [n, setN] = useState(() => rnd(max))
  const [text, setText] = useState('')
  const [result, setResult] = useState<boolean | null>(null)
  const de = numberToGerman(n)

  const next = () => {
    const v = rnd(max)
    setN(v)
    setText('')
    setResult(null)
    speak(numberToGerman(v))
  }

  const submit = () => {
    if (result !== null) return next()
    const v = parseInt(text, 10)
    if (Number.isNaN(v)) return
    const ok = v === n
    setResult(ok)
    onScore(ok)
    if (!ok) speak(de) // 答错立刻重听
  }

  useEffect(() => {
    speak(numberToGerman(n))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 答对 1.1s 后自动下一题
  useEffect(() => {
    if (result !== true) return
    const t = setTimeout(next, 1100)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typingIn(e)) return
      if (e.key === ' ') {
        e.preventDefault()
        speak(de)
      } else if (e.key === 'Enter' && result !== null) {
        e.preventDefault()
        next()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, n])

  return (
    <div className="flex flex-col items-center gap-5">
      <p className="text-xs text-zinc-400">输入听到的数字 · Enter 确认 · 空格 重播（答对自动下一题）</p>
      <button onClick={() => speak(de)} className="btn btn-gold h-14 w-14 rounded-full px-0">
        <Volume2 size={22} />
      </button>
      <button onClick={() => speak(de, slowRate)} className="btn btn-ghost h-9">
        <Turtle size={15} /> 慢速
      </button>
      <input
        autoFocus
        inputMode="numeric"
        className="input max-w-56 text-center text-2xl font-bold"
        value={text}
        disabled={result !== null}
        onChange={(e) => setText(e.target.value.replace(/[^\d]/g, ''))}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="?"
      />
      {result !== null && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="text-center">
          <div className={`text-2xl font-bold ${result ? 'text-emerald-500 dark:text-emerald-300' : 'text-red-500 dark:text-red-400'}`}>
            {result ? '✓ 正确' : `✗ 是 ${n}`}
          </div>
          <div className="mt-1 text-sm italic text-zinc-500 dark:text-zinc-400">{de}</div>
        </motion.div>
      )}
    </div>
  )
}

// ─── 看数写词：看数字 → 写出德语单词 ──────────────────────────────────

function SpellDrill({ max, onScore }: { max: number; onScore: (ok: boolean) => void }) {
  const { speak } = useSpeech()
  const [n, setN] = useState(() => rnd(max))
  const [text, setText] = useState('')
  const [result, setResult] = useState<boolean | null>(null)
  const de = numberToGerman(n)

  const next = () => {
    const v = rnd(max)
    setN(v)
    setText('')
    setResult(null)
  }

  const submit = () => {
    if (result !== null) return next()
    if (!text.trim()) return
    const ok = sameGerman(text, de)
    setResult(ok)
    onScore(ok)
    if (!ok) speak(de)
  }

  useEffect(() => {
    if (result !== true) return
    const t = setTimeout(next, 1100)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result])

  return (
    <div className="flex flex-col items-center gap-5">
      <p className="text-xs text-zinc-400">写出这个数字的德语读法（ä 可输 ae）· Enter 确认</p>
      <motion.div key={n} initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-6xl font-bold tabular-nums">
        {n}
      </motion.div>
      <input
        autoFocus
        lang="de"
        autoCapitalize="none"
        spellCheck={false}
        className="input max-w-xs text-center font-mono"
        value={text}
        disabled={result !== null}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="zweiundvierzig"
      />
      {result !== null && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="text-center">
          <div className={`text-2xl font-bold ${result ? 'text-emerald-500 dark:text-emerald-300' : 'text-red-500 dark:text-red-400'}`}>
            {result ? '✓ 正确' : '✗ 正确拼写'}
          </div>
          <div className="mt-1 flex items-center justify-center gap-2 text-sm italic text-zinc-500 dark:text-zinc-400">
            {de}
            <button onClick={() => speak(de)} className="cursor-pointer text-amber-500 hover:underline dark:text-amber-300">
              播放
            </button>
          </div>
        </motion.div>
      )}
    </div>
  )
}

// ─── 数字串听力：听一串德语数字 → 依次输入（电话号码式训练） ──────────

type SeqPhase = 'idle' | 'playing' | 'answering' | 'checked'

function SequenceDrill({ max, onScore }: { max: number; onScore: (ok: boolean) => void }) {
  const { speak } = useSpeech()
  const settings = useStoreSettings()
  const [len, setLen] = useState(4)
  const [seq, setSeq] = useState<number[]>([])
  const [slots, setSlots] = useState<number[]>([])
  const [buf, setBuf] = useState('')
  const [phase, setPhase] = useState<SeqPhase>('idle')
  const [current, setCurrent] = useState(-1)

  const start = () => {
    const s = Array.from({ length: len }, () => rnd(max))
    setSeq(s)
    setSlots([])
    setBuf('')
    play(s)
  }

  const play = (s: number[]) => {
    setPhase('playing')
    setCurrent(-1)
    speakSequence(
      s.map(numberToGerman),
      { rate: settings.rate, voiceURI: settings.voiceURI, gapMs: 700, onIndex: setCurrent },
    ).then(() => {
      setPhase((p) => (p === 'playing' ? 'answering' : p))
      setCurrent(-1)
    })
  }

  const commit = () => {
    if (phase !== 'answering') return
    const v = parseInt(buf, 10)
    if (Number.isNaN(v)) return
    const next = [...slots, v]
    setSlots(next)
    setBuf('')
    if (next.length === seq.length) {
      setPhase('checked')
      onScore(next.every((x, i) => x === seq[i]))
    }
  }

  // 全对 1.4s 后自动下一组
  useEffect(() => {
    if (phase === 'checked' && slots.length > 0 && slots.every((v, i) => v === seq[i])) {
      const t = setTimeout(start, 1400)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typingIn(e)) return
      if (e.key === 'Enter' && phase !== 'playing') {
        e.preventDefault()
        if (phase === 'checked') start()
        else if (phase === 'idle') start()
      } else if (e.key === ' ' && seq.length > 0 && phase !== 'playing') {
        e.preventDefault()
        play(seq)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, seq])

  const canConfig = phase === 'idle' || phase === 'checked'
  const allCorrect = phase === 'checked' && slots.length === seq.length && slots.every((v, i) => v === seq[i])

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex gap-1.5">
        {[3, 4, 5, 6].map((n) => (
          <button
            key={n}
            onClick={() => setLen(n)}
            disabled={!canConfig}
            className={`chip border disabled:opacity-40 ${
              len === n ? 'border-amber-400/60 bg-amber-400/10 text-amber-600 dark:text-amber-300' : 'border-zinc-200 text-zinc-500 dark:border-white/10 dark:text-zinc-400'
            }`}
          >
            {n} 个
          </button>
        ))}
      </div>
      <p className="text-center text-xs text-zinc-400">输入每个数字后按 Enter · 空格 重播 · 末尾数字可两位数</p>

      <div className="flex flex-wrap justify-center gap-2 py-2">
        {seq.length === 0
          ? Array.from({ length: len }).map((_, i) => <SlotCard key={i} state="empty" />)
          : seq.map((_, i) => {
              if (phase === 'playing') return <SlotCard key={i} state={current === i ? 'now' : 'playing'} />
              const shown = phase === 'checked' ? slots[i] : slots[i] ?? (i === slots.length && buf !== '' ? buf : undefined)
              const wrong = phase === 'checked' && slots[i] !== seq[i]
              return <SlotCard key={i} state={wrong ? 'wrong' : 'normal'} value={shown} correct={wrong ? seq[i] : undefined} />
            })}
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {(phase === 'idle' || phase === 'checked') && (
          <button onClick={start} className="btn btn-gold h-10">
            {phase === 'checked' ? '再来一组' : '开始'}
          </button>
        )}
        {phase !== 'playing' && seq.length > 0 && (
          <button onClick={() => play(seq)} className="btn btn-ghost h-10">
            <Volume2 size={15} /> 再听一遍
          </button>
        )}
      </div>

      <AnimatePresence>
        {phase === 'answering' && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-2">
            <input
              autoFocus
              inputMode="numeric"
              className="input w-40 text-center text-xl font-bold"
              value={buf}
              onChange={(e) => setBuf(e.target.value.replace(/[^\d]/g, ''))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit()
                if (e.key === 'Backspace' && buf === '') {
                  setSlots((s) => s.slice(0, -1))
                }
              }}
              placeholder={`第 ${slots.length + 1} 个`}
            />
            <span className="text-[11px] text-zinc-400">已输入 {slots.length} / {seq.length}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {phase === 'checked' && (
        <div className={`text-lg font-bold ${allCorrect ? 'text-emerald-500 dark:text-emerald-300' : 'text-red-500 dark:text-red-400'}`}>
          {allCorrect ? '✓ 全部正确' : '✗ 红色位置有误，正确值已标出'}
        </div>
      )}
    </div>
  )
}

function SlotCard({ state, value, correct }: { state: 'empty' | 'playing' | 'now' | 'normal' | 'wrong'; value?: string | number; correct?: number }) {
  return (
    <motion.div
      animate={state === 'now' ? { scale: 1.12 } : { scale: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className={`flex h-16 w-16 flex-col items-center justify-center rounded-2xl border text-2xl font-bold tabular-nums ${
        state === 'wrong'
          ? 'border-red-300 bg-red-50 text-red-500 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-400'
          : state === 'now'
            ? 'border-amber-400/70 bg-amber-400/10 text-amber-500 dark:text-amber-300'
            : 'border-zinc-200 bg-white text-zinc-700 dark:border-white/10 dark:bg-zinc-900/60 dark:text-zinc-200'
      }`}
    >
      {state === 'playing' || state === 'now' ? (state === 'now' ? '♪' : '·') : (value ?? '·')}
      {state === 'wrong' && correct !== undefined && <span className="text-[11px] font-medium text-emerald-500 dark:text-emerald-300">{correct}</span>}
    </motion.div>
  )
}

// ─── 数字表：锚点参考（0–20 + 整十，IPA）+ 任意数字查号器 ──────────────

function TableDrill() {
  const { speak } = useSpeech()
  const [ask, setAsk] = useState('42')
  const askNum = parseInt(ask, 10)
  const askDe = Number.isInteger(askNum) && askNum >= 0 && askNum <= 9999 ? numberToGerman(askNum) : ''

  return (
    <div className="flex flex-col items-center gap-6">
      <p className="text-xs text-zinc-400">点击任意数字听发音 —— 锚点数字 + IPA（移植自 GermanLearn）</p>
      <div className="grid w-full max-w-md grid-cols-4 gap-1.5">
        {NUMBER_ANCHORS.map((a) => (
          <button
            key={a.value}
            onClick={() => speak(a.de)}
            className="card cursor-pointer px-1 py-2 text-center transition hover:border-amber-400/60"
          >
            <div className="text-base font-bold tabular-nums">{a.value}</div>
            <div className="truncate text-[10px] text-zinc-500 dark:text-zinc-400">{a.de}</div>
            <div className="hidden truncate text-[8px] text-zinc-400 dark:text-zinc-600 sm:block">{a.ipa}</div>
          </button>
        ))}
      </div>

      <div className="card w-full max-w-md p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-500 dark:text-zinc-400">
          <Hash size={15} className="text-amber-500 dark:text-amber-300" /> 查号器（0–9999 任意数字）
        </div>
        <div className="flex gap-2">
          <input
            inputMode="numeric"
            className="input h-9"
            value={ask}
            onChange={(e) => setAsk(e.target.value.replace(/[^\d]/g, ''))}
            placeholder="输个数字试试：121 → einhunderteinundzwanzig"
          />
          <button className="btn btn-gold h-9" disabled={!askDe} onClick={() => speak(askDe)}>
            <Volume2 size={15} />
          </button>
        </div>
        <div className="mt-3 min-h-6 break-all text-center font-mono text-lg italic text-zinc-600 dark:text-zinc-300">
          {askDe || <span className="text-xs not-italic text-zinc-400">0 – 9999</span>}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-zinc-400 dark:text-zinc-500">
          合成规则：个位在前 + und + 十位（einundzwanzig）；13–19 缩合（sechzehn、siebzehn）；
          百/千直接连写成长词（eintausendzweihundertvierunddreißig）。
        </p>
      </div>
    </div>
  )
}

// 小工具：读 store 设置（避免每个子组件重复引 hook）
import { useStore } from '../store'
function useStoreSlow() {
  return useStore((s) => s.settings.slowRate)
}
function useStoreSettings() {
  const rate = useStore((s) => s.settings.rate)
  const voiceURI = useStore((s) => s.settings.voiceURI)
  return useMemo(() => ({ rate, voiceURI }), [rate, voiceURI])
}
