import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Gem, Lock } from 'lucide-react'
import { useStore } from '../store'
import {
  activeEntries,
  masteredEntries,
  roundName,
  successRate,
  themeStats,
  totalActive,
  totalMastered,
} from '../lib/goldlist'
import { ACHIEVEMENTS, levelProgress } from '../lib/xp'
import { Bar, SectionTitle, Stat, TreeIcon } from '../components/ui'
import { tagLabel } from '../lib/labels'

const themeName = (id: string) => tagLabel(id)

export default function Progress() {
  const lists = useStore((s) => s.lists)
  const history = useStore((s) => s.history)
  const xp = useStore((s) => s.xp)
  const streak = useStore((s) => s.streakDays)
  const bestStreak = useStore((s) => s.bestStreak)
  const unlocked = useStore((s) => s.achievements)

  const p = levelProgress(xp)
  const mastered = totalMastered(lists)
  const rate = successRate(history)
  const distillRounds = history.length
  const themes = themeStats(lists).slice(0, 8)

  return (
    <div className="space-y-8">
      {/* 等级卡 */}
      <div className="card relative overflow-hidden p-6">
        <div className="pointer-events-none absolute -left-10 -top-14 h-40 w-40 rounded-full bg-amber-400/10 blur-3xl" />
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs text-zinc-400 dark:text-zinc-500">你的 Wortweg 等级</div>
            <div className="mt-1 text-3xl font-bold tracking-tight">
              <span className="text-gold-gradient">Lv.{p.level}</span>
              <span className="ml-3 text-xl font-semibold text-zinc-500 dark:text-zinc-300">{p.name}</span>
            </div>
          </div>
          <div className="min-w-52 flex-1">
            <div className="mb-1.5 flex justify-between text-[11px] tabular-nums text-zinc-400 dark:text-zinc-500">
              <span>{p.into} XP</span>
              <span>下一级 {p.need} XP</span>
            </div>
            <Bar pct={p.pct} gold className="h-2" />
          </div>
        </div>
      </div>

      {/* 统计 */}
      <section>
        <SectionTitle>数字里的进步</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="已掌握（长期记忆）" value={mastered} sub="经受住至少一轮蒸馏" gold />
          <Stat label="待蒸馏词条" value={totalActive(lists)} sub="还在冷却循环中" />
          <Stat label="蒸馏成功率" value={rate === null ? '—' : `${Math.round(rate * 100)}%`} sub="被自然记住的比例" />
          <Stat label="累计蒸馏轮次" value={distillRounds} sub={`检视 ${history.reduce((s, e) => s + e.reviewed, 0)} 词次`} />
          <Stat label="连续学习" value={`${streak} 天`} sub={`最佳 ${bestStreak} 天`} />
          <Stat label="Headlist 数" value={lists.length} sub="已创建的列表" />
        </div>
      </section>

      {/* 词汇森林 */}
      <section>
        <SectionTitle right={<span className="text-[11px] text-zinc-400">每份列表一棵树：蒸馏一轮长高一分，完成即满树金黄</span>}>
          词汇森林
        </SectionTitle>
        <div className="card p-5">
          {lists.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-400 dark:text-zinc-500">
              森林还是一片空地 —— <Link to="/new" className="text-amber-600 hover:underline dark:text-amber-300">种下第一份 Headlist</Link>
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {lists.map((l, i) => {
                const done = activeEntries(l).length === 0 && l.entries.length > 0
                const growth = done ? 1 : Math.min(0.9, 0.22 + l.round * 0.22)
                return (
                  <motion.div
                    key={l.id}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.03 }}
                    className="flex w-[86px] flex-col items-center rounded-xl px-1 py-3 text-center transition hover:bg-zinc-50 dark:hover:bg-white/[0.03]"
                  >
                    <TreeIcon growth={growth} done={done} size={44} />
                    <span className="mt-1 w-full truncate text-[10px] text-zinc-500 dark:text-zinc-400">{l.name}</span>
                    <span className={`text-[9px] tabular-nums ${done ? 'text-amber-500 dark:text-amber-300' : 'text-zinc-400 dark:text-zinc-600'}`}>
                      {roundName(l.round)} · {masteredEntries(l).length}/{l.entries.length}
                    </span>
                  </motion.div>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {/* 主题掌握 */}
      {themes.length > 0 && (
        <section>
          <SectionTitle>按主题看掌握进度</SectionTitle>
          <div className="card divide-y divide-zinc-100 p-2 dark:divide-white/5">
            {themes.map((t) => (
              <div key={t.theme} className="flex items-center gap-4 px-3 py-3">
                <span className="w-28 shrink-0 truncate text-sm">{themeName(t.theme)}</span>
                <Bar pct={t.mastered / t.total} gold className="flex-1" />
                <span className="shrink-0 text-xs tabular-nums text-zinc-400 dark:text-zinc-500">
                  {t.mastered} / {t.total}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 成就墙 */}
      <section>
        <SectionTitle right={<span className="text-[11px] text-zinc-400">{unlocked.length} / {ACHIEVEMENTS.length} 已解锁</span>}>
          成就墙
        </SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {ACHIEVEMENTS.map((a, i) => {
            const has = unlocked.includes(a.id)
            const Icon = a.icon
            return (
              <motion.div
                key={a.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.02 }}
                className={`card flex flex-col items-center gap-2 p-4 text-center ${
                  has ? 'border-amber-400/50 shadow-[0_0_24px_-10px_var(--color-amber-500)]' : 'opacity-45'
                }`}
              >
                <div className={`flex h-10 w-10 items-center justify-center rounded-full ${has ? 'bg-amber-400/15 text-amber-500 dark:text-amber-300' : 'bg-zinc-100 text-zinc-400 dark:bg-white/5 dark:text-zinc-600'}`}>
                  {has ? <Icon size={19} /> : <Lock size={15} />}
                </div>
                <div className="text-xs font-semibold">{a.name}</div>
                <div className="text-[10px] leading-relaxed text-zinc-400 dark:text-zinc-500">{a.desc}</div>
              </motion.div>
            )
          })}
        </div>
      </section>

      {/* 意义感结语 */}
      <div className="card flex items-center gap-4 p-5">
        <Gem className="shrink-0 text-amber-500 dark:text-amber-300" />
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          你已经把 <span className="font-bold text-gold-gradient text-base">{mastered}</span> 个德语词送入了长期记忆。
          它们不是"背过"，而是被时间亲手验证过 —— 这正是 Goldlist 的意义。
        </p>
      </div>
    </div>
  )
}
