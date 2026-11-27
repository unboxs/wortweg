import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, BookOpen, FlaskConical, ListChecks, PenLine, PlusCircle, Sparkles } from 'lucide-react'
import { useStore } from '../store'
import {
  ageDays,
  cooldownProgress,
  daysLeft,
  goalProgress,
  masteredEntries,
  roundName,
  stageOf,
  successRate,
  totalMastered,
} from '../lib/goldlist'
import { Bar, Ring, SectionTitle, StageBadge } from '../components/ui'
import FocusTimer from '../components/FocusTimer'

export default function Dashboard() {
  const lists = useStore((s) => s.lists)
  const settings = useStore((s) => s.settings)
  const daily = useStore((s) => s.daily)
  const history = useStore((s) => s.history)
  const mastered = totalMastered(lists)
  const goal = goalProgress(lists, settings.cooldownDays, daily)
  const count = goal.shown
  const goalPct = settings.dailyGoal > 0 ? count / settings.dailyGoal : 0

  const withStage = lists.map((l) => ({ l, stage: stageOf(l, settings.cooldownDays) }))
  const writing = withStage.filter((x) => x.stage === 'writing')
  const ready = withStage.filter((x) => x.stage === 'ready').sort((a, b) => a.l.lastActivityAt - b.l.lastActivityAt)
  const cooling = withStage.filter((x) => x.stage === 'cooling').sort((a, b) => a.l.lastActivityAt - b.l.lastActivityAt)
  const rate = successRate(history)

  // ── 首次进入：说明 Goldlist 方法，引导创建 ──
  if (lists.length === 0) return <Welcome />

  return (
    <div className="space-y-8">
      {/* 意义感主卡：已送入长期记忆的词 */}
      <div className="card relative overflow-hidden p-6">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-amber-400/15 blur-3xl" />
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">你已经把</p>
            <p className="my-1 text-5xl font-bold tracking-tight">
              <span className="text-gold-gradient tabular-nums">{mastered}</span>
              <span className="ml-2 text-2xl font-semibold text-zinc-400 dark:text-zinc-500">个词</span>
            </p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">送入了长期记忆 —— 它们至少经受住了一轮蒸馏。</p>
          </div>
          <div className="flex items-center gap-5">
            <Ring pct={goalPct} size={84} stroke={7}>
              <span className="text-lg font-bold tabular-nums">{count}</span>
              <span className="text-[9px] text-zinc-400">/ {settings.dailyGoal} 今日</span>
            </Ring>
            <div className="space-y-1.5 text-xs text-zinc-500 dark:text-zinc-400">
              <div>
                {goal.mode === 'practice'
                  ? `今日目标：学习模式练 ${settings.dailyGoal} 个词（现在没有可蒸馏的列表，练习算数）`
                  : `今日目标：蒸馏检视 ${settings.dailyGoal} 词条`}
              </div>
              {rate !== null && (
                <div>
                  蒸馏成功率 <span className="font-semibold text-amber-600 dark:text-amber-300">{Math.round(rate * 100)}%</span>
                </div>
              )}
              <Link to="/progress" className="inline-flex items-center gap-1 text-amber-600 hover:underline dark:text-amber-300">
                查看词汇森林 <ArrowRight size={12} />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {writing.length > 0 && (
        <section>
          <SectionTitle right={<span className="text-[11px] text-zinc-400">抄完才开始冷却</span>}>待抄写</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            {writing.map(({ l }) => (
              <Link key={l.id} to={`/write/${l.id}`} className="card block border-amber-400/40 p-4 transition hover:border-amber-400">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{l.name}</span>
                  <StageBadge stage="writing" />
                </div>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                  已抄 {(l.copiedIds ?? []).length} / {l.entries.length}。冷却还没开始。
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 可蒸馏 */}
      {ready.length > 0 && (
        <section>
          <SectionTitle right={<span className="text-[11px] text-zinc-400">冷却完毕，可以蒸馏</span>}>
            <span className="inline-flex items-center gap-1.5">
              <FlaskConical size={14} className="text-amber-500 dark:text-amber-300" /> 可蒸馏
            </span>
          </SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            {ready.map(({ l }, i) => (
              <motion.div key={l.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <Link
                  to={`/distill/${l.id}`}
                  className="card block border-amber-400/50 bg-gradient-to-br from-amber-50 to-white p-4 transition hover:border-amber-400 dark:border-amber-400/30 dark:from-amber-400/10 dark:to-zinc-900/60"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{l.name}</span>
                    <span className="chip border border-amber-400/50 bg-amber-400/10 text-amber-600 dark:text-amber-300">
                      {roundName(l.round)} · 已冷却 {ageDays(l)} 天
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400">
                    <span>{masteredEntries(l).length} 词已掌握 · 剩 {l.entries.filter((e) => !e.mastered).length} 词</span>
                    <span className="inline-flex items-center gap-1 font-medium text-amber-600 dark:text-amber-300">
                      开始蒸馏 <ArrowRight size={14} />
                    </span>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* 冷却中 */}
      {cooling.length > 0 && (
        <section>
          <SectionTitle right={<Link to="/study" className="text-[11px] text-amber-600 hover:underline dark:text-amber-300">冷却期的正事：去学习模式</Link>}>冷却中 —— 这份列表先放下</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            {cooling.map(({ l }) => {
              const pct = cooldownProgress(l, settings.cooldownDays)
              return (
                <Link key={l.id} to={`/lists/${l.id}`} className="card block p-4 transition hover:border-zinc-300 dark:hover:border-white/20">
                  <div className="flex items-center justify-between">
                    <span className="truncate font-medium">{l.name}</span>
                    <StageBadge stage="cooling" />
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <Bar pct={pct} />
                    <span className="shrink-0 text-[11px] tabular-nums text-zinc-400">
                      {daysLeft(l, settings.cooldownDays)} 天后可蒸馏
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* 专注 + 方法提醒 */}
      <section className="grid gap-4 md:grid-cols-2">
        <FocusTimer />
        <div className="card flex flex-col justify-between p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-500 dark:text-zinc-400">
            <BookOpen size={16} className="text-amber-500 dark:text-amber-300" /> Goldlist 原则
          </div>
          <ul className="mt-3 space-y-2 text-sm text-zinc-600 dark:text-zinc-300">
            <li>· 每份 Headlist 建议 20–25 词，短一点也可以。抄写完成后再放下这份列表</li>
            <li>· 冷却的日子不翻它、不蒸馏。去学习模式听读、跟读别的内容，这些练习算进今日目标</li>
            <li>· 冷却 {settings.cooldownDays} 天后回来蒸馏：只保留还没记住的。不靠闪卡逼回忆</li>
          </ul>
          <Link to="/new" className="btn btn-gold mt-4 self-start">
            <PlusCircle size={15} /> 新建 Headlist
          </Link>
        </div>
      </section>

      <LevelPaths />
    </div>
  )
}

function LevelPaths() {
  return (
    <section className="card p-5">
      <div className="text-sm font-semibold">B1 和《走遍德国》</div>
      <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
        备考 Goethe / telc B1，或正在学《走遍德国》，都可以从这里建 Headlist。词库含 A1、A2 和 B1–B2，不是只有 B2。按课次对齐的词表还没做。
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link to="/new?from=b1" className="btn btn-gold h-9">
          B1 入口
        </Link>
        <Link to="/new?from=zoubian" className="btn btn-ghost h-9">
          《走遍德国》入口
        </Link>
      </div>
    </section>
  )
}

// ─── 首次进入引导 ────────────────────────────────────────────────────────

function Welcome() {
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400 font-bold text-xl text-zinc-950 shadow-[0_0_30px_-6px_var(--color-amber-500)]">
          W
        </div>
        <h1 className="text-2xl font-bold tracking-tight">
          Willkommen bei <span className="text-gold-gradient">Wortweg</span>
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
          面向准备 Goethe / telc B1 的成人，也适合已经在冲 B2 的人。Goldlist 还是三步：认真抄写，冷却大约两周，再蒸馏。词库里有 A1、A2 和 B1–B2，不是只收 B2。
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link to="/new?from=b1" className="btn btn-gold">
            <PlusCircle size={16} /> 我在备考 B1
          </Link>
          <Link to="/new?from=zoubian" className="btn btn-ghost">
            我在学《走遍德国》
          </Link>
          <Link to="/new" className="btn btn-ghost">
            自己从词库挑
          </Link>
        </div>
      </motion.div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { icon: PenLine, t: '1 · 写下', d: '挑一批词（B1 主题或教材里的 6 个词也行），在这里逐词抄写。抄完冷却才开始' },
          { icon: ListChecks, t: '2 · 冷却', d: '这几天不翻这份列表。去学习模式听读、跟读，今日目标按这些练习算' },
          { icon: FlaskConical, t: '3 · 蒸馏', d: '冷却结束后逐条问自己记住了没，只把没记住的留到下一轮' },
        ].map(({ icon: Icon, t, d }) => (
          <div key={t} className="card p-4">
            <Icon size={18} className="mb-2 text-amber-500 dark:text-amber-300" />
            <div className="text-sm font-semibold">{t}</div>
            <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{d}</div>
          </div>
        ))}
      </div>

      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-zinc-400 dark:text-zinc-600">
        <Sparkles size={12} className="text-amber-400" />
        没有账号、没有服务器 —— 所有数据只存在你的浏览器里
      </p>
    </div>
  )
}
