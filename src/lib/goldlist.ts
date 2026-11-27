// ─── Goldlist 引擎：所有蒸馏状态都是"当前时间的纯函数" ─────────────────
// 状态不持久化（done/ready/cooling 由列表数据 + 设置实时推导），
// 这样用户修改冷却天数后所有列表状态自动重算，永远不会出现脏状态。

import type { DistillEvent, Entry, GList, Settings } from '../types'

export const DAY = 86_400_000

export const activeEntries = (l: GList): Entry[] => l.entries.filter((e) => !e.mastered)
export const masteredEntries = (l: GList): Entry[] => l.entries.filter((e) => e.mastered)

export type ListStage = 'done' | 'ready' | 'cooling' | 'writing' | 'empty'

/** 冷却天数只接受 5–30，默认 14。超出范围的设置在这里夹紧，避免把冷却写成 0 天。 */
export function clampCooldown(days: number): number {
  const n = Number(days)
  if (!Number.isFinite(n)) return 14
  return Math.min(30, Math.max(5, Math.round(n)))
}

/** 列表当前阶段：待抄写 / 空 / 已完成 / 可蒸馏 / 冷却中。状态不落库。 */
export function stageOf(l: GList, cooldownDays: number, now = Date.now()): ListStage {
  if (l.writePending) return 'writing'
  if (l.entries.length === 0) return 'empty'
  if (activeEntries(l).length === 0) return 'done'
  return now - l.lastActivityAt >= clampCooldown(cooldownDays) * DAY ? 'ready' : 'cooling'
}

/** 能否把这份列表蒸馏进长期记忆。冷却中、还没抄写、已完成都不行。 */
export function canDistill(l: GList, cooldownDays: number, now = Date.now()): boolean {
  return stageOf(l, cooldownDays, now) === 'ready'
}

/** 现在没有一份列表可以蒸馏（例如第一份还在冷却）。这时学习模式计入今日目标。 */
export function studyCountsForGoal(lists: GList[], cooldownDays: number, now = Date.now()): boolean {
  return !lists.some((l) => stageOf(l, cooldownDays, now) === 'ready')
}

export interface DailyCounts {
  day: string
  /** 蒸馏检视数 */
  count: number
  /** 冷却期里学习模式练过的词条数 */
  practice?: number
}

/** 仪表盘环上该显示的数字，以及这句话该叫「蒸馏」还是「学习模式」。 */
export function goalProgress(lists: GList[], cooldownDays: number, daily: DailyCounts, now = Date.now()) {
  const today = dayKey(new Date(now))
  const fresh = daily.day === today
  const count = fresh ? daily.count : 0
  const practice = fresh ? (daily.practice ?? 0) : 0
  const waiting = studyCountsForGoal(lists, cooldownDays, now)
  return {
    shown: waiting ? count + practice : count,
    mode: waiting ? ('practice' as const) : ('distill' as const),
    waiting,
  }
}

/** 距冷却完成还剩多少毫秒（负数 = 已超期） */
export const remainingMs = (l: GList, cooldownDays: number, now = Date.now()) =>
  l.lastActivityAt + clampCooldown(cooldownDays) * DAY - now

/** 已冷却天数 / 总天数，0-1，用于进度条 */
export const cooldownProgress = (l: GList, cooldownDays: number, now = Date.now()) =>
  Math.min(1, (now - l.lastActivityAt) / (clampCooldown(cooldownDays) * DAY))

/** 剩余天数（向上取整，0 = 今天到期） */
export const daysLeft = (l: GList, cooldownDays: number, now = Date.now()) =>
  Math.max(0, Math.ceil(remainingMs(l, cooldownDays, now) / DAY))

export const roundName = (r: number) => (r === 0 ? 'Headlist' : `D${r}`)

/** 词条"年龄"：距创建或上次蒸馏的天数（Goldlist 语境下的词龄） */
export const ageDays = (l: GList) => Math.floor((Date.now() - l.lastActivityAt) / DAY)

export const STAGE_META: Record<ListStage, { label: string; cls: string }> = {
  writing: { label: '待抄写', cls: 'text-amber-700 dark:text-amber-200 bg-amber-400/15 border-amber-400/50' },
  ready: { label: '可蒸馏', cls: 'text-amber-500 dark:text-amber-300 bg-amber-400/10 border-amber-400/40' },
  cooling: { label: '冷却中', cls: 'text-sky-600 dark:text-sky-300 bg-sky-400/10 border-sky-400/30' },
  done: { label: '已完成', cls: 'text-emerald-600 dark:text-emerald-300 bg-emerald-400/10 border-emerald-400/30' },
  empty: { label: '空列表', cls: 'text-zinc-400 border-zinc-300 dark:border-white/10' },
}

// ─── 全局统计（意义感的核心数字都从这里来） ────────────────────────────

export const allEntries = (lists: GList[]) => lists.flatMap((l) => l.entries)
export const totalMastered = (lists: GList[]) =>
  allEntries(lists).filter((e) => e.mastered).length
export const totalActive = (lists: GList[]) =>
  allEntries(lists).filter((e) => !e.mastered).length

/** 蒸馏成功率 = 历史上被判"已记住"的比例 */
export function successRate(history: DistillEvent[]): number | null {
  const reviewed = history.reduce((s, e) => s + e.reviewed, 0)
  if (reviewed === 0) return null
  const mastered = history.reduce((s, e) => s + e.mastered, 0)
  return mastered / reviewed
}

/** 按主题统计掌握进度（用户所有列表中带该标签的词条） */
export function themeStats(lists: GList[]) {
  const map = new Map<string, { total: number; mastered: number }>()
  for (const e of allEntries(lists))
    for (const t of e.tags) {
      const s = map.get(t) ?? { total: 0, mastered: 0 }
      s.total++
      if (e.mastered) s.mastered++
      map.set(t, s)
    }
  return [...map.entries()]
    .map(([theme, s]) => ({ theme, ...s }))
    .sort((a, b) => b.mastered - a.mastered || b.total - a.total)
}

// ─── 日期工具（本地时区，用于 streak / 每日目标） ───────────────────────

export function dayKey(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function yesterdayKey(): string {
  return dayKey(new Date(Date.now() - DAY))
}

// ─── 词条归一化（去重、模糊匹配用） ────────────────────────────────────

export function normalizeDe(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/\s+/g, ' ')
}

export const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
