import type { NewEntrySeed } from '../../store'
import type { StoredNote } from './types'

/** 从已导入笔记生成 Headlist 词条。媒体仍留在 IndexedDB，这里只放文件名。 */
export function noteToSeed(note: StoredNote, deckName: string): NewEntrySeed {
  const tags = ['已导入', deckName, note.level].filter((tag): tag is string => !!tag)
  return {
    german: note.german,
    zh: note.zh,
    en: note.en,
    example: note.example,
    examples: note.examples,
    note: note.note,
    ipa: note.ipa,
    grammar: note.grammar,
    level: note.level,
    audioName: note.audioName,
    imageName: note.imageName,
    sourceDeckId: note.deckId,
    sourceGuid: note.guid,
    tags,
  }
}
