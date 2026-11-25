// ─── Wortweg 核心数据模型 ───────────────────────────────────────────────
// Goldlist 的最小忠实实现：一个列表 = Headlist + 后续蒸馏轮（D1、D2…）
// 蒸馏不生成新列表对象，只推进 round 并给词条打 mastered 标记。

export type Difficulty = 1 | 2 | 3

/** 单个词条 */
export interface Entry {
  id: string
  german: string
  /** 中文释义 */
  zh: string
  /** 可选英文释义（内置词库默认只有中文；手动/导入可补充） */
  en?: string
  /** 可选德语例句 */
  example?: string
  /** 个人笔记 */
  note?: string
  /** 难度标记 1=简单 2=中等 3=难 */
  difficulty?: Difficulty
  /** 主题标签（来自词库分类或自定义） */
  tags: string[]
  /** 进入长期记忆（至少经历一轮蒸馏且被判为"已记住"） */
  mastered: boolean
  masteredAt?: number
  createdAt: number
}

export interface GList {
  id: string
  name: string
  /** 来源主题（词库分类 id 或 undefined = 手动） */
  theme?: string
  /** 0 = Headlist，n = D(n)，即已完成 n 次蒸馏 */
  round: number
  createdAt: number
  /** 冷却时钟起点：创建时间或最近一次蒸馏时间 */
  lastActivityAt: number
  entries: Entry[]
}

export interface DistillEvent {
  at: number
  listId: string
  /** 本轮检视的词条数 */
  reviewed: number
  /** 本轮被判"已记住"（送入长期记忆）的数量 */
  mastered: number
}

export type ThemeMode = 'dark' | 'light'

/** 发音源：系统 Web Speech / 在线 Polly / 在线 Google 翻译 */
export type TtsSource = 'system' | 'polly' | 'google'

export type OnlineVoice = 'Vicki' | 'Marlene' | 'Hans'

export interface Settings {
  /** 冷却期天数，默认 14 */
  cooldownDays: number
  /** 释义显示语言 */
  meaningLang: 'zh' | 'en'
  /** 发音源 */
  ttsSource: TtsSource
  /** Polly 在线音色 */
  onlineVoice: OnlineVoice
  /** TTS 常速 */
  rate: number
  /** TTS 慢速 */
  slowRate: number
  /** 指定德语语音的 voiceURI（空 = 自动选择） */
  voiceURI: string
  /** 蒸馏时自动朗读 */
  autoSpeak: boolean
  /** 蒸馏时开启"抄写模式"（可选仪式感，不强制） */
  writeMode: boolean
  /** 每日目标：蒸馏检视的词条数 */
  dailyGoal: number
  theme: ThemeMode
}

export interface ToastMsg {
  id: string
  kind: 'achievement' | 'level' | 'goal'
  title: string
  desc?: string
}

/** distillList 动作的返回结果，用于蒸馏总结页 */
export interface DistillResult {
  reviewed: number
  mastered: number
  kept: number
  /** 本轮保留率 0-1 */
  keptRatio: number
  listDone: boolean
  xpGained: number
  levelBefore: number
  levelAfter: number
}

/** 内置词库的原始行，"德语|释义" 或 "德语|释义|例句" */
export interface BankEntry {
  german: string
  zh: string
  example?: string
}

export interface BankCategory {
  id: string
  /** 中文名 */
  name: string
  /** 德文名 */
  nameDe: string
  entries: BankEntry[]
}
