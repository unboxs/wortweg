import type { EntryExample, ImportedGrammar } from '../../types'

/** 从牌组读出、尚未映射的一条笔记。字段保持原来的 HTML。 */
export interface RawNote {
  guid: string
  modelName: string
  deckName: string
  tags: string[]
  fields: { name: string; value: string }[]
}

/** 映射后、写入 IndexedDB 之前的笔记。 */
export interface MappedNote {
  guid: string
  modelName: string
  deckName: string
  german: string
  zh: string
  en?: string
  ipa?: string
  example?: string
  examples?: EntryExample[]
  note?: string
  grammar?: ImportedGrammar
  level?: string
  audioName?: string
  imageName?: string
  ankiTags: string[]
}

export interface DeckRecord {
  id: string
  name: string
  packId: string
  guids: string[]
  importedAt: number
  noteCount: number
  skipped: number
  mediaCount: number
  mediaBytes: number
  /** 写入媒体时配额不够，音频/图片不完整 */
  mediaIncomplete: boolean
  /** 从 JSON 备份恢复的文字。备份本身不含媒体。 */
  mediaFromBackupOnly: boolean
  level?: string
  levels: string[]
  sourceFileName?: string
  /** 笔记里引用了音频或图片（不管本机有没有存下来） */
  expectsMedia: boolean
}

export interface StoredNote extends MappedNote {
  id: string
  deckId: string
}

export interface ParsedMediaFile {
  /** 笔记里引用的文件名 */
  name: string
  /** zip 里的条目名；没有对应文件时为空 */
  zipName?: string
}
