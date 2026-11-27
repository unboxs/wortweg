import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, Turtle, Volume2 } from 'lucide-react'
import { IpaLine } from './IpaLine'
import { Gloss } from './Gloss'
import { TtsNotice } from './TtsNotice'
import { useSpeech } from '../hooks/useSpeech'
import { explainWrong, nounPhrase, transcribed, type Exercise, type ExEntry } from '../lib/exercises'

/**
 * 练习卡：根据题型渲染，解出即自动翻下一词。
 * 七种题型全部由 lib/exercises 从词条数据派生，见 exercises.ts。
 */

const PROMPT: Record<Exercise['kind'], string> = {
  copy: '抄写',
  article: '冠词',
  letters: '补全字母',
  dictation: '听写',
  cloze: '例句填空',
  recall: '释义 → 德语',
  sentence: '句子重组',
}

export default function ExerciseCard({
  entry,
  ex,
  onSolved,
}: {
  entry: ExEntry
  ex: Exercise
  onSolved: () => void
}) {
  const { speak } = useSpeech()
  const [typed, setTyped] = useState('')
  const [pickedIdx, setPickedIdx] = useState<number[]>([])
  const [wrong, setWrong] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [solved, setSolved] = useState(false)

  const succeed = () => {
    if (solved) return
    setSolved(true)
    window.setTimeout(onSolved, 750)
  }
  const fail = (attempt = '') => {
    setWrong(true)
    setFeedback(explainWrong(entry, ex, attempt))
  }

  // ── 所有钩子必须在任何提前 return 之前（React 规则）──
  // 换题时重置本地状态
  useEffect(() => {
    setTyped('')
    setPickedIdx([])
    setWrong(false)
    setFeedback('')
    setRevealed(false)
    setSolved(false)
  }, [ex])

  // sentence：选满自动判分（钩子位置不能在题型分支里）
  const allPicked = ex.kind === 'sentence' && pickedIdx.length === (ex.shuffled?.length ?? 0)
  useEffect(() => {
    if (ex.kind !== 'sentence' || !allPicked) return
    const built = pickedIdx.map((i) => ex.shuffled![i]).join(' ')
    if (transcribed(built, ex.answer ?? '')) succeed()
    else {
      fail(built)
      setPickedIdx([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPicked])

  const checkTyped = () => {
    if (solved) return
    if (transcribed(typed, ex.answer ?? '')) succeed()
    else fail(typed)
  }

  const feedbackLine = feedback ? (
    <p role="alert" className="mx-auto mt-4 max-w-md text-base font-medium leading-relaxed text-red-600 dark:text-red-300">
      {feedback}
    </p>
  ) : null

  const clearFeedback = () => {
    setFeedback('')
    setWrong(false)
  }

  const inputCls = `input text-center font-mono ${wrong ? 'border-red-400 dark:border-red-500/60' : ''}`
  const badges = 'chip border border-zinc-200 text-zinc-500 dark:border-white/10 dark:text-zinc-400'

  // ── 解出后的标准面：完整词形 + 释义 + 例句 ──
  if (solved)
    return (
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-xl text-center">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-amber-400/15">
          <Check className="text-amber-500 dark:text-amber-300" />
        </motion.div>
        <h2 className="px-2 text-4xl font-bold tracking-tight sm:text-5xl">{entry.german}</h2>
        <IpaLine text={entry.german} />
        <Gloss className="mt-2">{entry.zh}</Gloss>
        {entry.example && <div className="mt-3 text-sm italic text-zinc-400 dark:text-zinc-500">„{entry.example}“</div>}
      </motion.div>
    )

  const promptBadge = (
    <div className="mb-4 flex justify-center">
      <span className={badges}>
        {PROMPT[ex.kind]}
        {ex.kind === 'article' && ` · ${ex.family}`}
      </span>
    </div>
  )

  const hintLink = (label: string) => (
    <button
      onClick={() => setRevealed(true)}
      className="mt-3 cursor-pointer text-[11px] text-zinc-400 underline decoration-dotted dark:text-zinc-500"
    >
      {label}
    </button>
  )

  const audioRow = (text: string) => (
    <>
      <div className="mt-5 flex items-center justify-center gap-3">
        <button onClick={() => speak(text)} className="btn btn-ghost h-11 w-11 rounded-full px-0">
          <Volume2 size={18} />
        </button>
        <button onClick={() => speak(text, useSpeechSlow())} className="btn btn-ghost h-11 w-11 rounded-full px-0">
          <Turtle size={17} />
        </button>
      </div>
      <TtsNotice text={text} />
    </>
  )

  // ── 抄写：词 + 释义都给出，打一遍 ──
  if (ex.kind === 'copy')
    return (
      <div className="w-full max-w-xl text-center">
        {promptBadge}
        <h2 className="px-2 text-4xl font-bold tracking-tight sm:text-5xl">{entry.german}</h2>
        <IpaLine text={entry.german} />
        <Gloss className="mt-4">{entry.zh}</Gloss>
        {entry.example && <div className="mt-3 text-sm italic text-zinc-400 dark:text-zinc-500">„{entry.example}“</div>}
        <div className="mx-auto mt-6 max-w-xs">
          <input
            autoFocus
            className={inputCls}
            placeholder="把这个词打出来…"
            value={typed}
            onChange={(e) => {
              setTyped(e.target.value)
              clearFeedback()
            }}
            onKeyDown={(e) => e.key === 'Enter' && checkTyped()}
          />
        </div>
        {feedbackLine}
        {audioRow(entry.german)}
      </div>
    )

  // ── 冠词：裸名词 + 释义，按家族选 ──
  if (ex.kind === 'article')
    return (
      <div className="w-full max-w-xl text-center">
        {promptBadge}
        <h2 className="px-2 text-4xl font-bold tracking-tight sm:text-5xl">{ex.display}</h2>
        {ex.display && <IpaLine text={ex.display} />}
        <Gloss className="mt-4">{entry.zh}</Gloss>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {ex.options!.map((o) => (
            <button key={o} onClick={() => (o === ex.answer ? succeed() : fail(o))} className="btn btn-ghost h-12 min-w-28 font-mono text-base">
              {o}
            </button>
          ))}
        </div>
        {feedbackLine}
      </div>
    )

  // ── 补全字母：骨架 + 释义，输入缺失字母 ──
  if (ex.kind === 'letters')
    return (
      <div className="w-full max-w-xl text-center">
        {promptBadge}
        <h2 className="px-2 font-mono text-4xl font-bold tracking-widest sm:text-5xl">{ex.display}</h2>
        <Gloss className="mt-4">{entry.zh}</Gloss>
        <div className="mx-auto mt-6 max-w-[14rem]">
          <input
            autoFocus
            className={inputCls}
            placeholder="依次输入缺失的字母…"
            value={typed}
            onChange={(e) => {
              setTyped(e.target.value)
              clearFeedback()
            }}
            onKeyDown={(e) => e.key === 'Enter' && checkTyped()}
          />
        </div>
        {feedbackLine}
      </div>
    )

  // ── 听写：不显示词，听发音（或看提示）写整词 ──
  if (ex.kind === 'dictation')
    return (
      <div className="w-full max-w-xl text-center">
        {promptBadge}
        <Gloss>{entry.zh}</Gloss>
        <button onClick={() => speak(entry.german)} className="btn btn-gold mx-auto mt-6 h-14 w-14 rounded-full px-0">
          <Volume2 size={22} />
        </button>
        <div className="mx-auto mt-5 max-w-xs">
          <input
            autoFocus
            lang="de"
            className={inputCls}
            placeholder="写下你听到的…"
            value={typed}
            onChange={(e) => {
              setTyped(e.target.value)
              clearFeedback()
            }}
            onKeyDown={(e) => e.key === 'Enter' && checkTyped()}
          />
        </div>
        {revealed ? (
          <div className="mt-3 font-mono text-sm text-amber-600 dark:text-amber-300">提示：{entry.german.slice(0, 2)}…</div>
        ) : (
          hintLink('听不出来？看提示')
        )}
        {feedbackLine}
        <TtsNotice text={entry.german} />
      </div>
    )

  // ── 例句填空：例句挖掉目标词 ──
  if (ex.kind === 'cloze')
    return (
      <div className="w-full max-w-xl text-center">
        {promptBadge}
        <h2 className="px-2 font-mono text-2xl font-semibold leading-relaxed sm:text-3xl">{ex.display}</h2>
        <Gloss className="mt-4">{entry.zh}</Gloss>
        <div className="mx-auto mt-6 max-w-xs">
          <input
            autoFocus
            lang="de"
            className={inputCls}
            placeholder="把空缺的词填上…"
            value={typed}
            onChange={(e) => {
              setTyped(e.target.value)
              clearFeedback()
            }}
            onKeyDown={(e) => e.key === 'Enter' && checkTyped()}
          />
        </div>
        {feedbackLine}
      </div>
    )

  // ── 释义 → 德语：只给中文，写德语（含冠词）──
  if (ex.kind === 'recall')
    return (
      <div className="w-full max-w-xl text-center">
        {promptBadge}
        <h2 className="px-2 text-3xl font-bold tracking-tight sm:text-4xl">{entry.zh}</h2>
        <div className="mt-3 text-base text-zinc-700 dark:text-zinc-200">
          {nounPhrase(entry.german) ? '它的德语是——（名词请带冠词）' : '它的德语是——'}
        </div>
        <div className="mx-auto mt-6 max-w-xs">
          <input
            autoFocus
            lang="de"
            className={inputCls}
            placeholder="德语…"
            value={typed}
            onChange={(e) => {
              setTyped(e.target.value)
              clearFeedback()
            }}
            onKeyDown={(e) => e.key === 'Enter' && checkTyped()}
          />
        </div>
        {revealed ? (
          <div className="mt-3 font-mono text-sm text-amber-600 dark:text-amber-300">提示：{entry.german.slice(0, 2)}…</div>
        ) : (
          hintLink('想不起来？看提示')
        )}
        {feedbackLine}
      </div>
    )

  // ── 句子重组：打乱的例句按序点回 ──
  const shuffled = ex.shuffled!

  return (
    <div className="w-full max-w-xl text-center">
      {promptBadge}
      <Gloss className="text-center">{entry.zh}</Gloss>
      <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">按正确顺序点击组句</div>

      {/* 已选区 */}
      <div className={`mx-auto mt-5 flex min-h-16 max-w-lg flex-wrap items-center justify-center gap-2 rounded-2xl border p-3 ${wrong ? 'border-red-400 dark:border-red-500/60' : 'border-zinc-200 dark:border-white/10'}`}>
        {pickedIdx.length === 0 && <span className="text-xs text-zinc-300 dark:text-zinc-600">点的词会出现在这里</span>}
        {pickedIdx.map((i, n) => (
          <button
            key={n}
            onClick={() => setPickedIdx(pickedIdx.filter((x) => x !== i))}
            className="chip border border-amber-400/50 bg-amber-400/10 font-mono text-amber-600 dark:text-amber-300"
          >
            {shuffled[i]}
          </button>
        ))}
      </div>

      {/* 备选区 */}
      <div className="mx-auto mt-4 flex max-w-lg flex-wrap items-center justify-center gap-2">
        {shuffled.map((w, i) => {
          const used = pickedIdx.includes(i)
          return (
            <button
              key={i}
              disabled={used}
              onClick={() => setPickedIdx([...pickedIdx, i])}
              className={`chip border font-mono ${
                used
                  ? 'cursor-default border-zinc-200 text-zinc-300 dark:border-white/10 dark:text-zinc-600'
                  : 'border-zinc-200 text-zinc-600 hover:border-amber-400/60 dark:border-white/10 dark:text-zinc-300'
              }`}
            >
              {w}
            </button>
          )
        })}
      </div>
      {feedbackLine}
    </div>
  )
}

// 慢速档直接读 store，避免再引一个 hook 层
import { useStore } from '../store'
function useSpeechSlow() {
  return useStore((s) => s.settings.slowRate)
}
