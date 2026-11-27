import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  Check,
  ChevronDown,
  FlaskConical,
  Pencil,
  Play,
  Plus,
  Square,
  Trash2,
  Trophy,
  X,
} from 'lucide-react'
import { useStore, type NewEntrySeed } from '../store'
import { useSpeech } from '../hooks/useSpeech'
import { speakSequence, stopSpeaking } from '../lib/tts'
import {
  activeEntries,
  ageDays,
  cooldownProgress,
  daysLeft,
  normalizeDe,
  roundName,
  stageOf,
} from '../lib/goldlist'
import { tagLabel } from '../lib/labels'
import { IpaLine } from '../components/IpaLine'
import { Bar, EmptyState, MasteredDot, Modal, SpeakButtons, StageBadge } from '../components/ui'
import type { Difficulty, Entry } from '../types'

export default function ListDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const list = useStore((s) => s.lists.find((l) => l.id === id))
  const settings = useStore((s) => s.settings)
  const renameList = useStore((s) => s.renameList)
  const deleteList = useStore((s) => s.deleteList)
  const addEntries = useStore((s) => s.addEntries)
  const updateEntry = useStore((s) => s.updateEntry)
  const removeEntry = useStore((s) => s.removeEntry)

  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [confirmDel, setConfirmDel] = useState(false)
  const [quickAdd, setQuickAdd] = useState('')
  const [editing, setEditing] = useState<Entry | null>(null)
  const [playingIdx, setPlayingIdx] = useState<number | null>(null)
  const { speak } = useSpeech()

  // 离开页面时停止朗读
  useEffect(() => () => stopSpeaking(), [])

  if (!list) return <EmptyState title="列表不存在" desc="它可能已被删除。"><Link to="/lists" className="btn btn-ghost h-9">返回列表</Link></EmptyState>

  const stage = stageOf(list, settings.cooldownDays)
  const active = activeEntries(list)
  const mastered = list.entries.filter((e) => e.mastered)
  const meaning = (e: Entry) => (settings.meaningLang === 'en' && e.en ? e.en : e.zh)

  const playAll = async () => {
    if (playingIdx !== null) {
      stopSpeaking()
      return
    }
    const texts = active.map((e) => e.german)
    setPlayingIdx(0)
    await speakSequence(texts, { rate: settings.rate, voiceURI: settings.voiceURI, onIndex: setPlayingIdx })
    setPlayingIdx(null)
  }

  const quickParse = (): NewEntrySeed[] => {
    const line = quickAdd.trim()
    if (!line) return []
    const [german, zh] = line.split('|').map((p) => p.trim())
    if (!german) return []
    return [{ german, zh: zh ?? '', tags: list.theme ? [list.theme] : ['自定义'] }]
  }

  return (
    <div>
      {/* ── 头部 ── */}
      <div className="mb-6">
        <Link to="/lists" className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-400 transition hover:text-zinc-700 dark:hover:text-zinc-200">
          <ArrowLeft size={15} /> 我的列表
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {editingName ? (
              <input
                autoFocus
                className="input h-9 max-w-xs text-lg font-bold"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={() => {
                  renameList(list.id, nameDraft || list.name)
                  setEditingName(false)
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
            ) : (
              <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
                {list.name}
                <button onClick={() => { setNameDraft(list.name); setEditingName(true) }} className="cursor-pointer text-zinc-300 transition hover:text-zinc-500 dark:text-zinc-600 dark:hover:text-zinc-300">
                  <Pencil size={14} />
                </button>
              </h1>
            )}
            <StageBadge stage={stage} />
            <span className="chip border border-zinc-200 text-zinc-500 dark:border-white/10 dark:text-zinc-400">
              {roundName(list.round)} · 词龄 {ageDays(list)} 天
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={playAll} className="btn btn-ghost h-9" disabled={active.length === 0}>
              {playingIdx !== null ? <Square size={14} /> : <Play size={14} />}
              {playingIdx !== null ? '停止' : '朗读整表'}
            </button>
            {stage === 'writing' ? (
              <button onClick={() => nav(`/write/${list.id}`)} className="btn btn-gold h-9">
                继续抄写
              </button>
            ) : stage === 'ready' ? (
              <button onClick={() => nav(`/distill/${list.id}`)} className="btn btn-gold h-9">
                <FlaskConical size={15} /> 开始蒸馏
              </button>
            ) : stage === 'done' ? (
              <span className="chip border border-amber-400/50 bg-amber-400/10 text-amber-600 dark:text-amber-300">
                <Trophy size={13} /> 全部入册
              </span>
            ) : null}
          </div>
        </div>
        {stage === 'writing' && (
          <div className="mt-4 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
            还没抄写完，冷却尚未开始。抄完之前不能蒸馏。
          </div>
        )}
        {stage === 'cooling' && (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 dark:border-sky-400/20 dark:bg-sky-400/10">
            <Bar pct={cooldownProgress(list, settings.cooldownDays)} />
            <span className="shrink-0 text-xs text-sky-700 dark:text-sky-300">
              冷却中 —— {daysLeft(list, settings.cooldownDays)} 天后可蒸馏（第 {settings.cooldownDays} 天）
            </span>
          </div>
        )}
      </div>

      {/* ── 已完成庆祝 ── */}
      {stage === 'done' && (
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="card mb-6 border-amber-400/40 bg-gradient-to-br from-amber-50 to-white p-6 text-center dark:border-amber-400/25 dark:from-amber-400/10 dark:to-zinc-900/60">
          <Trophy className="mx-auto mb-2 text-amber-500 dark:text-amber-300" />
          <div className="text-lg font-bold">这份列表已全部蒸馏完毕</div>
          <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {mastered.length} 个词经受住了每一轮筛选，进入长期记忆。
          </div>
        </motion.div>
      )}

      {/* ── 快速添加词条 ── */}
      <div className="card mb-5 flex items-center gap-2 p-3">
        <input
          className="input h-9 flex-1 border-0 bg-transparent focus:border-0 dark:bg-transparent"
          placeholder="快速添加：德语 | 释义（回车确认）"
          value={quickAdd}
          onChange={(e) => setQuickAdd(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const seeds = quickParse()
              if (seeds.length) {
                addEntries(list.id, seeds)
                setQuickAdd('')
              }
            }
          }}
        />
        <button
          className="btn btn-ghost h-9 px-3"
          onClick={() => {
            const seeds = quickParse()
            if (seeds.length) {
              addEntries(list.id, seeds)
              setQuickAdd('')
            }
          }}
        >
          <Plus size={15} /> 添加
        </button>
      </div>

      {/* ── 词条表 ── */}
      <div className="card divide-y divide-zinc-100 overflow-hidden dark:divide-white/5">
        {list.entries.map((e, i) => (
          <div key={e.id} className={`p-4 ${e.mastered ? 'bg-amber-400/[0.04]' : ''}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setEditing(editing?.id === e.id ? null : e)}>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className={`text-[15px] font-semibold ${e.mastered ? 'text-zinc-400 dark:text-zinc-500' : ''}`}>
                    {e.german}
                  </span>
                  {e.mastered && <MasteredDot mastered />}
                  {playingIdx !== null && i === playingIdx && (
                    <span className="chip border border-amber-400/50 bg-amber-400/10 text-[10px] text-amber-600 dark:text-amber-300">朗读中</span>
                  )}
                </div>
                <IpaLine text={e.german} align="start" />
                <div className={`mt-0.5 text-base ${e.mastered ? 'text-zinc-500 dark:text-zinc-400' : 'text-zinc-800 dark:text-zinc-100'}`}>
                  {meaning(e) || <span className="italic opacity-50">（释义待补充）</span>}
                </div>
                {e.example && <div className="mt-1 text-xs italic text-zinc-400 dark:text-zinc-500">„{e.example}“</div>}
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {e.tags.map((t) => (
                    <span key={t} className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-500 dark:bg-white/5 dark:text-zinc-300">{tagLabel(t)}</span>
                  ))}
                  {e.difficulty && (
                    <span className="text-[10px] tracking-tighter text-zinc-300 dark:text-zinc-600">
                      {'●'.repeat(e.difficulty)}
                    </span>
                  )}
                  {e.note && <span className="text-[10px] text-amber-600/80 dark:text-amber-300/70">笔记 · {e.note}</span>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <SpeakButtons text={e.german} />
                <ChevronDown size={15} className={`text-zinc-300 transition dark:text-zinc-600 ${editing?.id === e.id ? 'rotate-180' : ''}`} />
              </div>
            </div>

            {/* 展开编辑 */}
            <AnimatePresence>
              {editing?.id === e.id && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <EntryEditor
                    entry={e}
                    onSave={(patch) => {
                      updateEntry(list.id, e.id, patch)
                      setEditing(null)
                    }}
                    onDelete={() => {
                      removeEntry(list.id, e.id)
                      setEditing(null)
                    }}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
        {list.entries.length === 0 && (
          <div className="p-8 text-center text-sm text-zinc-400 dark:text-zinc-500">列表为空 —— 用上方输入框添加第一个词。</div>
        )}
      </div>

      {/* ── 底部操作 ── */}
      <div className="mt-6 flex items-center justify-between">
        <span className="text-xs text-zinc-400 dark:text-zinc-600">
          共 {list.entries.length} 词 · 待蒸馏 {active.length} · 已掌握 {mastered.length}
        </span>
        <button onClick={() => setConfirmDel(true)} className="btn btn-danger h-9">
          <Trash2 size={14} /> 删除列表
        </button>
      </div>

      <Modal
        open={confirmDel}
        title="删除这份列表？"
        onClose={() => setConfirmDel(false)}
        footer={
          <>
            <button className="btn btn-ghost h-9" onClick={() => setConfirmDel(false)}>取消</button>
            <button
              className="btn btn-danger h-9"
              onClick={() => {
                deleteList(list.id)
                nav('/lists')
              }}
            >
              删除
            </button>
          </>
        }
      >
        「{list.name}」及其 {list.entries.length} 个词条（含已掌握记录）将一并删除，无法恢复。
      </Modal>
    </div>
  )
}

// ─── 词条内联编辑器 ──────────────────────────────────────────────────────

function EntryEditor({
  entry,
  onSave,
  onDelete,
}: {
  entry: Entry
  onSave: (patch: Partial<Entry>) => void
  onDelete: () => void
}) {
  const [note, setNote] = useState(entry.note ?? '')
  const [example, setExample] = useState(entry.example ?? '')
  const [zh, setZh] = useState(entry.zh)
  const [difficulty, setDifficulty] = useState<Difficulty | undefined>(entry.difficulty)

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-zinc-100 bg-zinc-50/60 p-4 dark:border-white/5 dark:bg-white/[0.03]">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[11px] text-zinc-400">中文释义</span>
          <input className="input h-9" value={zh} onChange={(e) => setZh(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] text-zinc-400">德语例句（可选）</span>
          <input className="input h-9" value={example} onChange={(e) => setExample(e.target.value)} placeholder="Es ist mir ein Bedürfnis, …" />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-[11px] text-zinc-400">个人笔记（可选）</span>
          <input className="input h-9" value={note} onChange={(e) => setNote(e.target.value)} placeholder="和 vorstellen 的区别是…" />
        </label>
        <div>
          <span className="mb-1 block text-[11px] text-zinc-400">难度标记</span>
          <div className="flex gap-1.5">
            {([1, 2, 3] as Difficulty[]).map((d) => (
              <button
                key={d}
                onClick={() => setDifficulty(difficulty === d ? undefined : d)}
                className={`chip border ${
                  difficulty === d
                    ? 'border-amber-400/60 bg-amber-400/10 text-amber-600 dark:text-amber-300'
                    : 'border-zinc-200 text-zinc-500 dark:border-white/10 dark:text-zinc-400'
                }`}
              >
                {'●'.repeat(d)} {['简单', '中等', '难'][d - 1]}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <button onClick={onDelete} className="inline-flex cursor-pointer items-center gap-1 text-xs text-red-400 hover:underline">
          <X size={13} /> 删除词条
        </button>
        <button className="btn btn-gold h-9" onClick={() => onSave({ note: note || undefined, example: example || undefined, zh, difficulty })}>
          <Check size={14} /> 保存
        </button>
      </div>
    </div>
  )
}
