// ─── Goldlist 引擎：所有蒸馏状态都是"当前时间的纯函数" ─────────────────
// 状态不持久化（done/ready/cooling 由列表数据 + 设置实时推导），
// 这样用户修改冷却天数后所有列表状态自动重算，永远不会出现脏状态。

import type { DistillEvent, Entry, GList, Settings } from '../types'

export const DAY = 86_400_000

export const activeEntries = (l: GList): Entry[] => l.entries.filter((e) => !e.mastered)
export const masteredEntries = (l: GList): Entry[] => l.entries.filter((e) => e.mastered)

export type ListStage = 'done' | 'ready' | 'cooling' | 'empty'

/** 列表当前阶段：空 / 已完成 / 可蒸馏 / 冷却中 */
export function stageOf(l: GList, cooldownDays: number): ListStage {
  if (l.entries.length === 0) return 'empty'
  if (activeEntries(l).length === 0) return 'done'
  return Date.now() - l.lastActivityAt >= cooldownDays * DAY ? 'ready' : 'cooling'
}

/** 距冷却完成还剩多少毫秒（负数 = 已超期） */
export const remainingMs = (l: GList, cooldownDays: number) =>
  l.lastActivityAt + cooldownDays * DAY - Date.now()

/** 已冷却天数 / 总天数，0-1，用于进度条 */
export const cooldownProgress = (l: GList, cooldownDays: number) =>
  Math.min(1, (Date.now() - l.lastActivityAt) / (cooldownDays * DAY))

/** 剩余天数（向上取整，0 = 今天到期） */
export const daysLeft = (l: GList, cooldownDays: number) =>
  Math.max(0, Math.ceil(remainingMs(l, cooldownDays) / DAY))

export const roundName = (r: number) => (r === 0 ? 'Headlist' : `D${r}`)

/** 词条"年龄"：距创建或上次蒸馏的天数（Goldlist 语境下的词龄） */
export const ageDays = (l: GList) => Math.floor((Date.now() - l.lastActivityAt) / DAY)

export const STAGE_META: Record<ListStage, { label: string; cls: string }> = {
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
