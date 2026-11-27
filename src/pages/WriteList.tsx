import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Check, X } from 'lucide-react'
import { useStore } from '../store'
import { transcribed } from '../lib/exercises'
import { Gloss } from '../components/Gloss'
import { TtsNotice } from '../components/TtsNotice'
import { IpaLine } from '../components/IpaLine'
import { Bar, EmptyState, SpeakButtons } from '../components/ui'

/** 新建 Headlist 之后的抄写。逐词打出来才开始冷却，手机上一次只看一个词。 */
export default function WriteList() {
  const { id } = useParams()
  const nav = useNavigate()
  const list = useStore((s) => s.lists.find((l) => l.id === id))
  const markCopied = useStore((s) => s.markCopied)
  const finishWriting = useStore((s) => s.finishWriting)
  const [typed, setTyped] = useState('')
  const [wrong, setWrong] = useState(false)

  const pending = useMemo(() => {
    if (!list) return []
    const done = new Set(list.copiedIds ?? [])
    return list.entries.filter((e) => !done.has(e.id))
  }, [list])
  const entry = pending[0]
  const total = list?.entries.length ?? 0
  const doneCount = total - pending.length

  useEffect(() => {
    setTyped('')
    setWrong(false)
  }, [entry?.id])

  if (!list)
    return (
      <div className="flex min-h-dvh items-center justify-center p-4">
        <EmptyState title="列表不存在">
          <Link to="/lists" className="btn btn-ghost h-9">
            返回
          </Link>
        </EmptyState>
      </div>
    )

  if (!list.writePending) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-4">
        <EmptyState title="这份列表已经抄过了" desc="冷却从抄写完成时开始算。">
          <Link to={`/lists/${list.id}`} className="btn btn-gold h-9">
            查看列表
          </Link>
        </EmptyState>
      </div>
    )
  }

  const submit = () => {
    if (!entry) {
      finishWriting(list.id)
      nav(`/lists/${list.id}`)
      return
    }
    if (!transcribed(typed, entry.german)) {
      setWrong(true)
      return
    }
    markCopied(list.id, entry.id)
    const remaining = pending.length - 1
    if (remaining <= 0) {
      finishWriting(list.id)
      nav(`/lists/${list.id}`)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-zinc-50 dark:bg-[#0c0c0e]">
      <div className="px-5 pt-5">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <button
            type="button"
            onClick={() => nav(`/lists/${list.id}`)}
            className="cursor-pointer rounded-lg p-1.5 text-zinc-400 transition hover:text-zinc-700 dark:hover:text-zinc-200"
            aria-label="离开抄写"
          >
            <X size={18} />
          </button>
          <span className="shrink-0 text-xs tabular-nums text-zinc-400">
            抄写 {Math.min(doneCount + (entry ? 1 : 0), total)} / {total}
          </span>
          <Bar pct={total ? doneCount / total : 0} gold />
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-5 py-8">
        {!entry ? (
          <div className="w-full max-w-md text-center">
            <h1 className="text-2xl font-bold">词都抄完了</h1>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">点下面开始冷却。在这之前可以离开，进度还在。</p>
            <button type="button" className="btn btn-gold mt-6" onClick={submit}>
              开始冷却
            </button>
          </div>
        ) : (
          <motion.div key={entry.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-xl text-center">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">看着这个词，抄写一遍。抄完冷却才开始。</p>
            <h2 className="mt-4 px-2 text-4xl font-bold tracking-tight sm:text-5xl">{entry.german}</h2>
            <IpaLine text={entry.german} />
            <Gloss className="mt-4">{entry.zh || '（释义待补充）'}</Gloss>
            <div className="mt-3 flex justify-center">
              <SpeakButtons text={entry.german} />
            </div>
            <TtsNotice text={entry.german} />
            <div className="mx-auto mt-6 max-w-xs">
              <input
                autoFocus
                lang="de"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint={pending.length === 1 ? 'done' : 'next'}
                className={`input h-12 text-center font-mono text-base ${wrong ? 'border-red-400 dark:border-red-500/60' : ''}`}
                placeholder="在这里抄一遍"
                value={typed}
                onChange={(e) => {
                  setTyped(e.target.value)
                  setWrong(false)
                }}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
              />
            </div>
            {wrong && (
              <p role="alert" className="mt-3 text-sm font-medium text-red-600 dark:text-red-300">
                不对。对照上面的词再抄一遍。
              </p>
            )}
            <button type="button" className="btn btn-gold mt-5 h-12 min-w-40" onClick={submit}>
              <Check size={16} />
              {pending.length === 1 ? '抄完，开始冷却' : '下一个'}
            </button>
            <p className="mt-4 text-[11px] leading-relaxed text-zinc-400 dark:text-zinc-500">
              纸上抄也很好。这里再打一遍，是为了确认抄写这一步真的发生了。长短不限，6 个词也可以。
            </p>
          </motion.div>
        )}
      </div>
    </div>
  )
}
