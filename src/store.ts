// ─── 全局状态（Zustand + localStorage 持久化） ─────────────────────────
// 动作是唯一写入口；XP、streak、成就、每日目标都在动作内部一次性结算，
// 组件只调用动作、读结果。所有蒸馏状态（可蒸馏/冷却中）不持久化，
// 由 lib/goldlist 在渲染时按当前时间推导。

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  Achievement,
} from './lib/xp'
import type {
  DistillEvent,
  DistillResult,
  Entry,
  GList,
  Settings,
  ToastMsg,
} from './types'
import {
  activeEntries,
  canDistill,
  clampCooldown,
  dayKey,
  normalizeDe,
  studyCountsForGoal,
  totalMastered,
  uid,
  yesterdayKey,
} from './lib/goldlist'
import { migrateTtsSource } from '../functions/tts-contract.ts'
import { checkAchievements, levelName, levelOf, XP } from './lib/xp'

export interface NewEntrySeed {
  german: string
  zh: string
  en?: string
  example?: string
  tags?: string[]
}

interface Store {
  lists: GList[]
  settings: Settings
  xp: number
  streakDays: number
  bestStreak: number
  lastActiveDay: string | null
  /** 每日进度：count = 蒸馏检视，practice = 还不能蒸馏时的学习模式 */
  daily: { day: string; count: number; practice: number }
  goalCelebratedDay: string | null
  history: DistillEvent[]
  achievements: string[]
  /** 瞬时提示（不持久化） */
  toasts: ToastMsg[]

  setSettings: (patch: Partial<Settings>) => void
  createList: (name: string, seeds: NewEntrySeed[], theme?: string) => string
  /** 抄写页逐词记下。未完成抄写的列表才能调用。 */
  markCopied: (listId: string, entryId: string) => void
  /** 全部抄完后才开始冷却。返回是否成功。 */
  finishWriting: (id: string) => boolean
  /** 学习模式练过一个词。没有可蒸馏列表时计入今日目标。 */
  recordStudy: (n?: number) => void
  renameList: (id: string, name: string) => void
  deleteList: (id: string) => void
  addEntries: (id: string, seeds: NewEntrySeed[]) => void
  updateEntry: (listId: string, entryId: string, patch: Partial<Entry>) => void
  removeEntry: (listId: string, entryId: string) => void
  /** 核心：蒸馏。remembered = 本轮判为"已记住"的词条 id 列表 */
  distillList: (id: string, remembered: string[]) => DistillResult | null
  importData: (raw: string) => { ok: boolean; error?: string }
  resetAll: () => void
  pushToast: (t: Omit<ToastMsg, 'id'>) => void
  dismissToast: (id: string) => void
}

const defaultSettings: Settings = {
  cooldownDays: 14,
  meaningLang: 'zh',
  ttsSource: 'system',
  onlineVoice: 'Hanna',
  studyMode: 'teach',
  rate: 1,
  slowRate: 0.6,
  voiceURI: '',
  autoSpeak: true,
  writeMode: false,
  dailyGoal: 25,
  theme: 'dark',
}

const makeEntry = (seed: NewEntrySeed): Entry => ({
  id: uid(),
  german: seed.german.trim(),
  zh: seed.zh.trim(),
  en: seed.en?.trim() || undefined,
  example: seed.example?.trim() || undefined,
  tags: seed.tags?.length ? seed.tags : ['自定义'],
  mastered: false,
  createdAt: Date.now(),
})

/**
 * 动作统一收尾：结算新的一天（streak + 每日 XP + 每日计数重置）、
 * 累加 XP、检查成就与升级，一次性组装出最终 patch（含 toasts）。
 */
function finalize(
  get: () => Store,
  base: Partial<Store>,
  xpDelta: number,
): { patch: Partial<Store>; unlocked: Achievement[]; levelBefore: number; levelAfter: number } {
  const s = get()
  const today = dayKey()
  const isNewDay = s.lastActiveDay !== today
  const streakDays = isNewDay
    ? s.lastActiveDay === yesterdayKey()
      ? s.streakDays + 1
      : 1
    : s.streakDays
  const daily =
    s.daily.day === today
      ? { day: today, count: s.daily.count, practice: s.daily.practice ?? 0 }
      : { day: today, count: 0, practice: 0 }
  const nextXp = s.xp + xpDelta + (isNewDay ? XP.activeDay : 0)
  const lists = base.lists ?? s.lists
  const history = base.history ?? s.history
  const have = base.achievements ?? s.achievements
  const unlocked = checkAchievements([...have], { lists, history, streakDays })
  const levelBefore = levelOf(s.xp)
  const levelAfter = levelOf(nextXp)

  const toasts = [...s.toasts]
  for (const a of unlocked)
    toasts.push({ id: uid(), kind: 'achievement', title: `成就解锁 · ${a.name}`, desc: a.desc })
  if (levelAfter > levelBefore)
    toasts.push({
      id: uid(),
      kind: 'level',
      title: `等级提升 · Lv.${levelAfter}`,
      desc: levelName(levelAfter),
    })

  return {
    patch: {
      ...base,
      streakDays,
      bestStreak: Math.max(s.bestStreak, streakDays),
      lastActiveDay: today,
      xp: nextXp,
      daily,
      achievements: unlocked.length ? [...have, ...unlocked.map((a) => a.id)] : have,
      toasts,
    },
    unlocked,
    levelBefore,
    levelAfter,
  }
}

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      lists: [],
      settings: defaultSettings,
      xp: 0,
      streakDays: 0,
      bestStreak: 0,
      lastActiveDay: null,
      daily: { day: dayKey(), count: 0, practice: 0 },
      goalCelebratedDay: null,
      history: [],
      achievements: [],
      toasts: [],

      setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

      createList: (name, seeds, theme) => {
        const list: GList = {
          id: uid(),
          name: name.trim() || `Headlist ${dayKey()}`,
          theme,
          round: 0,
          createdAt: Date.now(),
          lastActivityAt: Date.now(),
          writePending: true,
          copiedIds: [],
          entries: seeds.map(makeEntry),
        }
        const r = finalize(get, { lists: [list, ...get().lists] }, XP.createList)
        set(r.patch)
        return list.id
      },

      renameList: (id, name) =>
        set((s) => ({ lists: s.lists.map((l) => (l.id === id ? { ...l, name } : l)) })),

      deleteList: (id) => set((s) => ({ lists: s.lists.filter((l) => l.id !== id) })),

      addEntries: (id, seeds) =>
        set((s) => ({
          lists: s.lists.map((l) =>
            l.id === id ? { ...l, entries: [...l.entries, ...seeds.map(makeEntry)] } : l,
          ),
        })),

      updateEntry: (listId, entryId, patch) =>
        set((s) => ({
          lists: s.lists.map((l) =>
            l.id === listId
              ? {
                  ...l,
                  entries: l.entries.map((e) => (e.id === entryId ? { ...e, ...patch } : e)),
                }
              : l,
          ),
        })),

      removeEntry: (listId, entryId) =>
        set((s) => ({
          lists: s.lists.map((l) =>
            l.id === listId ? { ...l, entries: l.entries.filter((e) => e.id !== entryId) } : l,
          ),
        })),

      markCopied: (listId, entryId) =>
        set((s) => ({
          lists: s.lists.map((l) => {
            if (l.id !== listId || !l.writePending) return l
            const copied = new Set(l.copiedIds ?? [])
            copied.add(entryId)
            return { ...l, copiedIds: [...copied] }
          }),
        })),

      finishWriting: (id) => {
        const s = get()
        const list = s.lists.find((l) => l.id === id)
        if (!list?.writePending) return false
        const copied = new Set(list.copiedIds ?? [])
        if (list.entries.length === 0 || !list.entries.every((e) => copied.has(e.id))) return false
        const now = Date.now()
        const lists = s.lists.map((l) =>
          l.id === id ? { ...l, writePending: false, copiedIds: undefined, lastActivityAt: now } : l,
        )
        const waiting = studyCountsForGoal(lists, s.settings.cooldownDays, now)
        const r = finalize(get, { lists }, 0)
        const today = dayKey()
        const base = r.patch.daily ?? { day: today, count: 0, practice: 0 }
        const count = base.count
        const practice = base.practice + (waiting ? list.entries.length : 0)
        const shown = waiting ? count + practice : count
        const days = clampCooldown(s.settings.cooldownDays)
        const patch: Partial<Store> = {
          ...r.patch,
          daily: { day: today, count, practice },
          toasts: [
            ...(r.patch.toasts ?? []),
            {
              id: uid(),
              kind: 'goal',
              title: '抄写完成，冷却开始',
              desc: `这 ${days} 天不用复习这份列表。去学习模式听读、跟读，会计入今日目标。`,
            },
          ],
        }
        if (waiting && s.settings.dailyGoal > 0 && shown >= s.settings.dailyGoal && s.goalCelebratedDay !== today) {
          patch.goalCelebratedDay = today
          patch.toasts = [
            ...(patch.toasts ?? []),
            { id: uid(), kind: 'goal', title: '今日目标达成', desc: `冷却期里已完成 ${shown} 个词条` },
          ]
        }
        set(patch)
        return true
      },

      recordStudy: (n = 1) => {
        const add = Math.max(0, Math.floor(n))
        if (!add) return
        const s = get()
        const today = dayKey()
        const waiting = studyCountsForGoal(s.lists, s.settings.cooldownDays)
        if (!waiting && s.lastActiveDay === today) return
        const r = finalize(get, {}, 0)
        const base = r.patch.daily ?? { day: today, count: 0, practice: 0 }
        const count = base.count
        const practice = base.practice + (waiting ? add : 0)
        const shown = waiting ? count + practice : count
        const patch: Partial<Store> = { ...r.patch, daily: { day: today, count, practice } }
        if (waiting && s.settings.dailyGoal > 0 && shown >= s.settings.dailyGoal && s.goalCelebratedDay !== today) {
          patch.goalCelebratedDay = today
          patch.toasts = [
            ...(patch.toasts ?? []),
            { id: uid(), kind: 'goal', title: '今日目标达成', desc: `冷却期里已在学习模式练了 ${shown} 个词条` },
          ]
        }
        set(patch)
      },

      distillList: (id, remembered) => {
        const s = get()
        const list = s.lists.find((l) => l.id === id)
        if (!list) return null
        // 冷却、未抄写、已完成都不能通过直接打开 /distill/:id 记成长期记忆。
        if (!canDistill(list, s.settings.cooldownDays)) return null
        const active = activeEntries(list)
        const rememberedSet = new Set(remembered)
        const mastered = active.filter((e) => rememberedSet.has(e.id))
        const kept = active.filter((e) => !rememberedSet.has(e.id))
        const now = Date.now()
        const listDone = kept.length === 0

        const lists = s.lists.map((l) =>
          l.id !== id
            ? l
            : {
                ...l,
                round: l.round + 1,
                lastActivityAt: now,
                entries: l.entries.map((e) =>
                  rememberedSet.has(e.id) ? { ...e, mastered: true, masteredAt: now } : e,
                ),
              },
        )
        const event: DistillEvent = { at: now, listId: id, reviewed: active.length, mastered: mastered.length }
        const xpDelta =
          XP.reviewEntry * active.length +
          XP.masteredEntry * mastered.length +
          (listDone ? XP.listDone : 0)

        const r = finalize(get, { lists, history: [...s.history, event] }, xpDelta)

        // 每日目标进度 + 一次性庆祝
        const today = dayKey()
        const count = (r.patch.daily?.count ?? 0) + active.length
        const practice = r.patch.daily?.practice ?? 0
        const patch: Partial<Store> = { ...r.patch, daily: { day: today, count, practice } }
        if (
          s.settings.dailyGoal > 0 &&
          count >= s.settings.dailyGoal &&
          s.goalCelebratedDay !== today
        ) {
          patch.goalCelebratedDay = today
          patch.toasts = [
            ...(patch.toasts ?? []),
            { id: uid(), kind: 'goal', title: '今日目标达成', desc: `已蒸馏检视 ${count} 个词条` },
          ]
        }
        set(patch)

        return {
          reviewed: active.length,
          mastered: mastered.length,
          kept: kept.length,
          keptRatio: active.length > 0 ? kept.length / active.length : 0,
          listDone,
          xpGained: (patch.xp ?? s.xp) - s.xp,
          levelBefore: r.levelBefore,
          levelAfter: r.levelAfter,
        }
      },

      importData: (raw) => {
        try {
          const data = JSON.parse(raw)
          const src = data?.state ?? data
          const lists = src?.lists
          if (!Array.isArray(lists)) return { ok: false, error: '文件中没有列表数据' }
          for (const l of lists)
            if (typeof l?.id !== 'string' || !Array.isArray(l?.entries))
              return { ok: false, error: '列表结构不合法' }
          set({
            settings: {
              ...defaultSettings,
              ...(src?.settings ?? {}),
              ttsSource: migrateTtsSource(src?.settings?.ttsSource),
              cooldownDays: clampCooldown(src?.settings?.cooldownDays ?? defaultSettings.cooldownDays),
            },
            xp: src?.xp ?? 0,
            streakDays: src?.streakDays ?? 0,
            bestStreak: src?.bestStreak ?? 0,
            lastActiveDay: src?.lastActiveDay ?? null,
            lists: lists.map((l: GList) => ({
              ...l,
              writePending: l.writePending === true,
              copiedIds: l.writePending === true ? l.copiedIds : undefined,
            })),
            daily: {
              day: typeof src?.daily?.day === 'string' ? src.daily.day : dayKey(),
              count: typeof src?.daily?.count === 'number' ? src.daily.count : 0,
              practice: typeof src?.daily?.practice === 'number' ? src.daily.practice : 0,
            },
            goalCelebratedDay: src?.goalCelebratedDay ?? null,
            history: Array.isArray(src?.history) ? src.history : [],
            achievements: Array.isArray(src?.achievements) ? src.achievements : [],
            toasts: [],
          })
          return { ok: true }
        } catch {
          return { ok: false, error: 'JSON 解析失败' }
        }
      },

      resetAll: () =>
        set({
          lists: [],
          xp: 0,
          streakDays: 0,
          bestStreak: 0,
          lastActiveDay: null,
          daily: { day: dayKey(), count: 0, practice: 0 },
          goalCelebratedDay: null,
          history: [],
          achievements: [],
          toasts: [],
        }),

      pushToast: (t) => set((s) => ({ toasts: [...s.toasts, { ...t, id: uid() }] })),
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    }),
    {
      name: 'wortweg-storage',
      version: 3,
      migrate: (persisted) => {
        const state = persisted as {
          settings?: { ttsSource?: string; cooldownDays?: number }
          daily?: { day?: string; count?: number; practice?: number }
          lists?: GList[]
        }
        if (state?.settings) {
          state.settings.ttsSource = migrateTtsSource(state.settings.ttsSource)
          if (typeof state.settings.cooldownDays === 'number')
            state.settings.cooldownDays = clampCooldown(state.settings.cooldownDays)
        }
        if (state?.daily) {
          if (typeof state.daily.practice !== 'number') state.daily.practice = 0
          if (typeof state.daily.count !== 'number') state.daily.count = 0
        }
        // 旧列表没有 writePending。不要改 lastActivityAt，冷却时钟保持原样。
        if (Array.isArray(state?.lists)) {
          for (const l of state.lists) {
            if (l.writePending !== true) {
              l.writePending = false
              l.copiedIds = undefined
            }
          }
        }
        return state
      },
      // toasts 是瞬态的，不落盘
      partialize: (s) => {
        const { toasts: _toasts, ...rest } = s
        return rest as Store
      },
    },
  ),
)

// ─── 备份 / 导出工具 ────────────────────────────────────────────────────

export function exportBackupJSON(): string {
  const { toasts: _toasts, ...data } = useStore.getState()
  return JSON.stringify(
    { app: 'wortweg', v: 1, exportedAt: new Date().toISOString(), state: data },
    null,
    2,
  )
}

export function exportMasteredCSV(): string {
  const rows = useStore
    .getState()
    .lists.flatMap((l) =>
      l.entries
        .filter((e) => e.mastered)
        .map((e) => [
          e.german,
          e.zh,
          e.en ?? '',
          e.tags.join(' '),
          new Date(e.masteredAt ?? Date.now()).toLocaleDateString(),
        ]),
    )
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
  return ['\uFEFF德语,释义,英文,主题,掌握日期', ...rows.map((r) => r.map(esc).join(','))].join('\r\n')
}

export { normalizeDe, totalMastered }
