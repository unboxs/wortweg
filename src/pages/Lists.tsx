import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronRight, PlusCircle } from 'lucide-react'
import { useStore } from '../store'
import {
  activeEntries,
  ageDays,
  cooldownProgress,
  daysLeft,
  masteredEntries,
  roundName,
  stageOf,
  type ListStage,
} from '../lib/goldlist'
import { Bar, EmptyState, StageBadge } from '../components/ui'

const TABS: { key: ListStage | 'all'; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'ready', label: '可蒸馏' },
  { key: 'cooling', label: '冷却中' },
  { key: 'done', label: '已完成' },
]

export default function Lists() {
  const lists = useStore((s) => s.lists)
  const settings = useStore((s) => s.settings)
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('all')

  const items = lists
    .map((l) => ({ l, stage: stageOf(l, settings.cooldownDays) }))
    .filter((x) => tab === 'all' || x.stage === tab)
    .sort((a, b) => {
      // 可蒸馏优先（最久未动最前），其余按最近活动倒序
      if (a.stage !== b.stage) {
        const w = (s: ListStage) => (s === 'ready' ? 0 : s === 'cooling' ? 1 : 2)
        return w(a.stage) - w(b.stage)
      }
      return b.l.lastActivityAt - a.l.lastActivityAt
    })

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold tracking-tight">我的列表</h1>
        <Link to="/new" className="btn btn-gold h-9">
          <PlusCircle size={15} /> 新建 Headlist
        </Link>
      </div>

      <div className="mb-5 flex gap-2 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`chip border ${
              tab === t.key
                ? 'border-amber-400/60 bg-amber-400/10 text-amber-600 dark:text-amber-300'
                : 'border-zinc-200 text-zinc-500 hover:border-zinc-300 dark:border-white/10 dark:text-zinc-400'
            }`}
          >
            {t.label}
            <span className="tabular-nums opacity-60">
              {t.key === 'all' ? lists.length : lists.filter((l) => stageOf(l, settings.cooldownDays) === t.key).length}
            </span>
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <EmptyState
          title={lists.length === 0 ? '还没有列表' : '这个分类下暂时没有列表'}
          desc="Headlist 是一切的起点：挑 20–25 个词，蒸馏会从这里生长出来。"
        >
          <Link to="/new" className="btn btn-gold h-9">
            <PlusCircle size={15} /> 创建 Headlist
          </Link>
        </EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map(({ l, stage }, i) => {
            const active = activeEntries(l).length
            const done = masteredEntries(l).length
            return (
              <motion.div key={l.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                <Link to={`/lists/${l.id}`} className="card block p-4 transition hover:border-zinc-300 dark:hover:border-white/20">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold">{l.name}</span>
                    <StageBadge stage={stage} />
                  </div>
                  <div className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                    {roundName(l.round)} · 词龄 {ageDays(l)} 天
                  </div>
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className="text-zinc-500 dark:text-zinc-400">
                      待蒸馏 <span className="font-semibold tabular-nums text-zinc-700 dark:text-zinc-200">{active}</span>
                      <span className="mx-1.5 text-zinc-300 dark:text-zinc-600">·</span>
                      已掌握 <span className="font-semibold tabular-nums text-amber-600 dark:text-amber-300">{done}</span>
                    </span>
                    {stage === 'cooling' ? (
                      <span className="flex w-32 items-center gap-2">
                        <Bar pct={cooldownProgress(l, settings.cooldownDays)} />
                        <span className="shrink-0 text-[11px] tabular-nums text-zinc-400">{daysLeft(l, settings.cooldownDays)}天</span>
                      </span>
                    ) : (
                      <ChevronRight size={16} className="text-zinc-300 dark:text-zinc-600" />
                    )}
                  </div>
                </Link>
              </motion.div>
            )
          })}
        </div>
      )}

    </div>
  )
}
