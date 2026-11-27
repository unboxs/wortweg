// ─── Wortweg 核心数据模型 ───────────────────────────────────────────────
// Goldlist 的最小忠实实现：一个列表 = Headlist + 后续蒸馏轮（D1、D2…）
// 蒸馏不生成新列表对象，只推进 round 并给词条打 mastered 标记。

export type Difficulty = 1 | 2 | 3

/** 牌组里的一句例句。audioName 只是本机媒体文件名，不是网址。 */
export interface EntryExample {
  de: string
  zh?: string
  audioName?: string
}

/**
 * 从用户自己的牌组抄来的语法，缺哪项就没有哪项。
 * 不在这里补造音标、变位或例句。
 */
export interface ImportedGrammar {
  pos?: string
  article?: string
  /** m / f / n，或牌组里原来的写法 */
  gender?: string
  plural?: string
  /** 例如「仅复数」 */
  number?: string
  genitive?: string
  pres3?: string
  praet?: string
  partizip?: string
  aux?: string
  verbClass?: string
  separable?: string
  reflexive?: string
  government?: string
  comparative?: string
  superlative?: string
  feminine?: string
  nDeclension?: string
}

/** 单个词条 */
export interface Entry {
  id: string
  german: string
  /** 中文释义 */
  zh: string
  /** 可选英文释义（内置词库默认只有中文；手动/导入可补充） */
  en?: string
  /** 可选德语例句（练习题用这一条；更多句在 examples） */
  example?: string
  /** 牌组里的例句（最多几句），含释义和原声音频文件名 */
  examples?: EntryExample[]
  /** 个人笔记 */
  note?: string
  /** 牌组自带的音标。没有这项时，已导入词条不回退到词典音标。 */
  ipa?: string
  /** 牌组里的语法，供教学卡和练习反馈 */
  grammar?: ImportedGrammar
  /** CEFR，例如 A1、B2、A1–B1 */
  level?: string
  /** 牌组原声音频文件名（IndexedDB，配合 sourceDeckId） */
  audioName?: string
  /** 牌组图片文件名（IndexedDB，配合 sourceDeckId） */
  imageName?: string
  /** 已导入牌组的 id。媒体在 IndexedDB，不进 localStorage。 */
  sourceDeckId?: string
  /** Anki note guid，用来认出同一条笔记 */
  sourceGuid?: string
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

/** 发音源：系统 Web Speech / VoiceRSS / ElevenLabs */
export type TtsSource = 'system' | 'voicerss' | 'elevenlabs'

export type OnlineVoice = 'Hanna' | 'Lina' | 'Jonas' | 'Lily' | 'Charlotte' | 'Daniel'

export interface Settings {
  /** 冷却期天数，默认 14 */
  cooldownDays: number
  /** 释义显示语言 */
  meaningLang: 'zh' | 'en'
  /** 发音源 */
  ttsSource: TtsSource
  /** VoiceRSS / ElevenLabs 音色 */
  onlineVoice: OnlineVoice
  /** 学习流模式：教学（看词听音）/ 练习（七题型检验） */
  studyMode: 'teach' | 'practice'
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
