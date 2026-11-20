// ─── 经验值 / 等级 / 成就 ──────────────────────────────────────────────
// XP 全部来自真实学习行为：创建列表、检视词条、送词入长期记忆、保持连续。

import {
  Activity,
  BookOpen,
  Crown,
  Flame,
  Gem,
  GraduationCap,
  Library,
  Medal,
  Mountain,
  Sparkles,
  Target,
  Trophy,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { successRate, themeStats, totalMastered } from './goldlist'
import type { DistillEvent, GList, Settings } from '../types'

// ─── 等级 ──────────────────────────────────────────────────────────────
// 到达等级 n+1 需要累计 XP：50 * n * (n+1)  —— 平滑二次曲线，前期快后期慢

export const LEVEL_NAMES = [
  'Neuling', // 新手
  'Sammler', // 收集者
  'Wanderer', // 漫游者
  'Beobachter', // 观察者
  'Denker', // 思想者
  'Kenner', // 行家
  'Baumeister', // 建造大师
  'Meister', // 大师
  'Goldmeister', // 黄金大师
  'Legende', // 传奇
] as const

export const xpForLevel = (level: number) => 50 * (level - 1) * level

export function levelOf(xp: number): number {
  let level = 1
  while (xp >= xpForLevel(level + 1)) level++
  return level
}

export const levelName = (level: number) =>
  LEVEL_NAMES[Math.min(level - 1, LEVEL_NAMES.length - 1)]

export function levelProgress(xp: number) {
  const level = levelOf(xp)
  const into = xp - xpForLevel(level)
  const need = xpForLevel(level + 1) - xpForLevel(level)
  return { level, name: levelName(level), into, need, pct: Math.min(1, into / need) }
}

/** 事件 → XP（写在 actions 里调用） */
export const XP = {
  createList: 15,
  reviewEntry: 1,
  masteredEntry: 3,
  listDone: 25,
  activeDay: 5,
} as const

// ─── 成就 ──────────────────────────────────────────────────────────────

export interface CoreStats {
  lists: GList[]
  history: DistillEvent[]
  streakDays: number
}

export interface Achievement {
  id: string
  name: string
  desc: string
  icon: LucideIcon
  check: (s: CoreStats) => boolean
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-list', name: '第一步', desc: '创建第一个 Headlist', icon: Sparkles,
    check: (s) => s.lists.length >= 1 },
  { id: 'lists-5', name: '小藏书家', desc: '累计创建 5 份列表', icon: BookOpen,
    check: (s) => s.lists.length >= 5 },
  { id: 'lists-15', name: '图书馆员', desc: '累计创建 15 份列表', icon: Library,
    check: (s) => s.lists.length >= 15 },
  { id: 'first-distill', name: '初次蒸馏', desc: '完成第一次蒸馏', icon: Activity,
    check: (s) => s.history.length >= 1 },
  { id: 'distill-500', name: '五百次回望', desc: '累计蒸馏检视 500 词条', icon: Zap,
    check: (s) => s.history.reduce((a, e) => a + e.reviewed, 0) >= 500 },
  { id: 'distill-2000', name: '登山者', desc: '累计蒸馏检视 2000 词条', icon: Mountain,
    check: (s) => s.history.reduce((a, e) => a + e.reviewed, 0) >= 2000 },
  { id: 'longterm-100', name: '百词入册', desc: '100 个词送入长期记忆', icon: Gem,
    check: (s) => totalMastered(s.lists) >= 100 },
  { id: 'longterm-500', name: '加冕', desc: '500 个词送入长期记忆', icon: Crown,
    check: (s) => totalMastered(s.lists) >= 500 },
  { id: 'list-done', name: '满园金黄', desc: '第一份列表蒸馏完毕（全部入册）', icon: Trophy,
    check: (s) => s.lists.some((l) => l.entries.length > 0 && l.entries.every((e) => e.mastered)) },
  { id: 'theme-50', name: '主题行家', desc: '任一主题掌握 50 词', icon: Medal,
    check: (s) => themeStats(s.lists).some((t) => t.mastered >= 50) },
  { id: 'streak-3', name: '星火', desc: '连续学习 3 天', icon: Flame,
    check: (s) => s.streakDays >= 3 },
  { id: 'streak-7', name: '一周不熄', desc: '连续学习 7 天', icon: Flame,
    check: (s) => s.streakDays >= 7 },
  { id: 'streak-30', name: '长明灯', desc: '连续学习 30 天', icon: GraduationCap,
    check: (s) => s.streakDays >= 30 },
  { id: 'rate-80', name: '蒸馏大师', desc: '检视 100 词以上且成功率 ≥ 80%', icon: Target,
    check: (s) => {
      const r = successRate(s.history)
      return r !== null && r >= 0.8 && s.history.reduce((a, e) => a + e.reviewed, 0) >= 100
    } },
  { id: 'natural-curve', name: '自然遗忘', desc: '单轮 20+ 词条且保留率落在 60–70%', icon: Sparkles,
    check: (s) => s.history.some((e) => e.reviewed >= 20 && e.reviewed - e.mastered >= 0.6 * e.reviewed && e.reviewed - e.mastered <= 0.7 * e.reviewed) },
]

export function checkAchievements(have: string[], s: CoreStats): Achievement[] {
  return ACHIEVEMENTS.filter((a) => !have.includes(a.id) && a.check(s))
}
