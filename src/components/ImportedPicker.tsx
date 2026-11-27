import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Check, PlusCircle, Search, Shuffle } from 'lucide-react'
import ApkgImporter from './ApkgImporter'
import { SpeakButtons } from './ui'
import { useImportedDecks } from '../hooks/useImportedDecks'
import { normalizeDe } from '../lib/goldlist'
import { noteToSeed } from '../lib/apkg/seed'
import { listNotes } from '../lib/apkg/storage'
import type { StoredNote } from '../lib/apkg/types'
import { useStore } from '../store'

export default function ImportedPicker() {
  const nav = useNavigate()
  const createList = useStore((s) => s.createList)
  const lists = useStore((s) => s.lists)
  const { decks, ready } = useImportedDecks()
  const [deckId, setDeckId] = useState<string | null>(null)
  const [notes, setNotes] = useState<StoredNote[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [level, setLevel] = useState<string | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [name, setName] = useState('')

  const deck = decks.find((item) => item.id === deckId) ?? null

  useEffect(() => {
    if (!deckId && decks[0]) setDeckId(decks[0].id)
  }, [deckId, decks])

  useEffect(() => {
    if (!deckId) {
      setNotes([])
      return
    }
    let cancelled = false
    setLoading(true)
    void listNotes(deckId).then((rows) => {
      if (cancelled) return
      setNotes(rows)
      setLoading(false)
      setPicked([])
      setLevel(null)
    })
    return () => {
      cancelled = true
    }
  }, [deckId])

  const used = useMemo(() => new Set(lists.flatMap((list) => list.entries.map((entry) => normalizeDe(entry.german)))), [lists])
  const q = query.trim().toLowerCase()
  const filtered = useMemo(() => {
    return notes.filter((note) => {
      if (level && note.level !== level) return false
      if (!q) return true
      return note.german.toLowerCase().includes(q) || note.zh.includes(query.trim()) || (note.en ?? '').toLowerCase().includes(q)
    })
  }, [notes, level, q, query])
  const visible = filtered.slice(0, 120)
  const pickedSet = useMemo(() => new Set(picked), [picked])

  const toggle = (id: string) => setPicked((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))

  const random25 = () => {
    const candidates = filtered.filter((note) => !used.has(normalizeDe(note.german)) && !pickedSet.has(note.id))
    for (let index = candidates.length - 1; index > 0; index--) {
      const swap = Math.floor(Math.random() * (index + 1))
      ;[candidates[index], candidates[swap]] = [candidates[swap]!, candidates[index]!]
    }
    setPicked(candidates.slice(0, 25).map((note) => note.id))
  }

  const create = () => {
    if (!deck || picked.length === 0) return
    const byId = new Map(notes.map((note) => [note.id, note]))
    const seeds = picked.map((id) => byId.get(id)).filter((note): note is StoredNote => !!note).map((note) => noteToSeed(note, deck.name))
    const id = createList(name || `Headlist · ${deck.name}`, seeds, `import:${deck.id}`)
    nav(`/lists/${id}`)
  }

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <ApkgImporter />
      </div>
      {!ready ? (
        <p className="text-sm text-zinc-400">正在读取已导入的牌组…</p>
      ) : decks.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">还没有牌组。上面选择一个 .apkg 之后，词会出现在这里，带上「已导入」标记，不会和内置词库混在一起。</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {decks.map((item) => (
              <button
                key={item.id}
                onClick={() => setDeckId(item.id)}
                className={`chip border ${
                  item.id === deckId
                    ? 'border-amber-400/60 bg-amber-400/10 text-amber-600 dark:text-amber-300'
                    : 'border-zinc-200 text-zinc-500 dark:border-white/10 dark:text-zinc-400'
                }`}
              >
                已导入 · {item.name}
                {item.level ? <span className="opacity-70">{item.level}</span> : null}
                <span className="tabular-nums opacity-50">{item.noteCount}</span>
              </button>
            ))}
          </div>
          {deck && deck.levels.length > 1 && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setLevel(null)}
                className={`chip border ${level === null ? 'border-amber-400/60 text-amber-600 dark:text-amber-300' : 'border-zinc-200 text-zinc-500 dark:border-white/10 dark:text-zinc-400'}`}
              >
                全部等级
              </button>
              {deck.levels.map((item) => (
                <button
                  key={item}
                  onClick={() => setLevel(item)}
                  className={`chip border ${level === item ? 'border-amber-400/60 text-amber-600 dark:text-amber-300' : 'border-zinc-200 text-zinc-500 dark:border-white/10 dark:text-zinc-400'}`}
                >
                  {item}
                </button>
              ))}
            </div>
          )}
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input className="input pl-9" placeholder="在这套牌组里搜索德语或释义…" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <div className="card max-h-[46vh] divide-y divide-zinc-100 overflow-y-auto dark:divide-white/5">
            {loading && <div className="p-8 text-center text-sm text-zinc-400">正在读取词条…</div>}
            {!loading &&
              visible.map((note) => {
                const isUsed = used.has(normalizeDe(note.german))
                const isPicked = pickedSet.has(note.id)
                return (
                  <button
                    key={note.id}
                    disabled={isUsed}
                    onClick={() => toggle(note.id)}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition ${
                      isUsed ? 'cursor-not-allowed opacity-35' : 'cursor-pointer hover:bg-zinc-50 dark:hover:bg-white/[0.03]'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-medium">{note.german}</span>
                        {note.level && <span className="text-[10px] text-zinc-400">{note.level}</span>}
                      </div>
                      <div className="truncate text-xs text-zinc-400 dark:text-zinc-500">{note.zh || '（无释义）'}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <SpeakButtons text={note.german} sourceDeckId={note.deckId} audioName={note.audioName} size={14} />
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
            {!loading && filtered.length === 0 && <div className="p-8 text-center text-sm text-zinc-400">没有匹配的词条</div>}
          </div>
          {filtered.length > visible.length && (
            <p className="text-[11px] text-zinc-400">只显示前 {visible.length} 条，共 {filtered.length} 条。用搜索把范围缩小。随机选取仍会用全部匹配结果。</p>
          )}
          <div className="card sticky bottom-20 z-10 flex flex-wrap items-center gap-3 p-3 md:bottom-4">
            <div className="flex items-center gap-2">
              <motion.span key={picked.length} initial={{ scale: 1.25 }} animate={{ scale: 1 }} className="text-lg font-bold tabular-nums text-zinc-700 dark:text-zinc-200">
                {picked.length}
              </motion.span>
              <span className="text-xs text-zinc-400">已选 · 建议 20–25</span>
            </div>
            <button onClick={random25} className="btn btn-ghost h-9">
              <Shuffle size={14} /> 随机选 25
            </button>
            <input className="input h-9 min-w-40 flex-1" placeholder="列表名（可留空自动生成）" value={name} onChange={(event) => setName(event.target.value)} />
            <button onClick={create} className="btn btn-gold h-9" disabled={picked.length === 0}>
              <PlusCircle size={15} /> 创建
            </button>
          </div>
        </>
      )}
    </div>
  )
}
