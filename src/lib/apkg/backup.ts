// 备份：JSON 只带走文字。完整包才包含媒体，而且会在界面里说明到底有没有写进去。

import {
  BlobReader,
  BlobWriter,
  TextReader,
  TextWriter,
  ZipReader,
  ZipWriter,
  configure,
  type Entry,
  type FileEntry,
} from '@zip.js/zip.js'
import { useStore } from '../../store'
import { ARCHIVE_INCOMPLETE_NOTE, BACKUP_MEDIA_NOTE } from './messages'
import { fingerprint } from './fingerprint'
import { deckTitle } from './map'
import {
  deleteDeckMedia,
  deleteDeckNotes,
  findDeckForImport,
  getDeck,
  getMediaBlob,
  listDecks,
  listNotes,
  putDeck,
  putMedia,
  putNotes,
} from './storage'
import type { DeckRecord, MappedNote, StoredNote } from './types'

configure({ useWebWorkers: false })

export const FULL_EXPORT_WARN_BYTES = 80 * 1024 * 1024

export interface TextDeckBackup {
  id?: string
  name: string
  packId: string
  guids: string[]
  level?: string
  levels: string[]
  sourceFileName?: string
  notes: MappedNote[]
  mediaIncluded: false
}

interface ArchivePayload {
  app: 'wortweg-deck'
  v: 1
  mediaIncluded: boolean
  mediaComplete: boolean
  mediaNote: string
  deck: {
    name: string
    packId: string
    guids?: string[]
    level?: string
    levels?: string[]
    sourceFileName?: string
  }
  notes: MappedNote[]
  media: { name: string; file: string }[]
}

export async function exportImportedText(): Promise<TextDeckBackup[]> {
  const decks = await listDecks()
  const backups: TextDeckBackup[] = []
  for (const deck of decks) {
    const notes = await listNotes(deck.id)
    backups.push({
      id: deck.id,
      name: deck.name,
      packId: deck.packId,
      guids: deck.guids,
      level: deck.level,
      levels: deck.levels,
      sourceFileName: deck.sourceFileName,
      notes: notes.map(toMapped),
      mediaIncluded: false,
    })
  }
  return backups
}

/** 学习记录在 localStorage；已导入牌组的文字附在同一份 JSON 里。媒体不在其中。 */
export async function exportAppBackup(): Promise<string> {
  const { toasts: _toasts, ...state } = useStore.getState()
  const importedDecks = await exportImportedText()
  return JSON.stringify(
    {
      app: 'wortweg',
      v: 2,
      exportedAt: new Date().toISOString(),
      importedMedia: false,
      mediaNote: BACKUP_MEDIA_NOTE,
      state,
      importedDecks,
    },
    null,
    2,
  )
}

export async function restoreImportedText(input: unknown): Promise<{ decks: number; notes: number }> {
  if (!Array.isArray(input)) return { decks: 0, notes: 0 }
  let decks = 0
  let notes = 0
  for (const item of input) {
    const saved = await restoreOne(item, { writeMedia: false })
    if (!saved) continue
    decks++
    notes += saved
  }
  return { decks, notes }
}

export async function exportDeckArchive(
  deckId: string,
  onProgress?: (current: number, total: number) => void,
): Promise<{ blob: Blob; mediaIncluded: boolean; mediaNote: string }> {
  const deck = await getDeck(deckId)
  if (!deck) throw new Error('找不到这套牌组')
  const notes = await listNotes(deckId)
  const wanted = referencedNames(notes)
  const present: string[] = []
  for (const name of wanted) {
    const blob = await getMediaBlob(deckId, name)
    if (blob && blob.size > 0) present.push(name)
  }
  const files: { name: string; file: string }[] = []
  const used = new Set<string>()
  for (const name of present) {
    files.push({ name, file: `media/${uniqueSafe(name, used)}` })
  }
  const mediaIncluded = files.length > 0
  const mediaComplete = mediaIncluded && !deck.mediaIncomplete && files.length === wanted.length
  const mediaNote = !mediaIncluded ? BACKUP_MEDIA_NOTE : mediaComplete ? '这个包包含文字，以及当时保存在本机的音频和图片。' : ARCHIVE_INCOMPLETE_NOTE
  const payload: ArchivePayload = {
    app: 'wortweg-deck',
    v: 1,
    mediaIncluded,
    mediaComplete,
    mediaNote,
    deck: {
      name: deck.name,
      packId: deck.packId,
      guids: deck.guids,
      level: deck.level,
      levels: deck.levels,
      sourceFileName: deck.sourceFileName,
    },
    notes: notes.map(toMapped),
    media: files,
  }
  const writer = new ZipWriter(new BlobWriter('application/zip'), { useWebWorkers: false })
  await writer.add('wortweg-deck.json', new TextReader(JSON.stringify(payload)))
  for (let index = 0; index < files.length; index++) {
    const file = files[index]!
    const blob = await getMediaBlob(deckId, file.name)
    if (!blob) continue
    onProgress?.(index + 1, files.length)
    await writer.add(file.file, new BlobReader(blob), { level: 0 })
  }
  const blob = await writer.close()
  return { blob, mediaIncluded, mediaNote }
}

export async function importDeckArchive(
  file: Blob,
  opts: {
    onProgress?: (message: string, current: number, total: number) => void
    signal?: AbortSignal
    putMediaFile?: (deckId: string, name: string, blob: Blob) => Promise<void>
  } = {},
): Promise<{
  deckId: string
  deckName: string
  imported: number
  replaced: boolean
  mediaStored: number
  mediaBytes: number
  mediaIncluded: boolean
  mediaIncomplete: boolean
  mediaNote: string
}> {
  const reader = new ZipReader(new BlobReader(file), { useWebWorkers: false })
  try {
    const entries = await reader.getEntries()
    const header = entries.find((entry): entry is FileEntry => !entry.directory && baseName(entry.filename) === 'wortweg-deck.json')
    if (!header) throw new Error('这不是 Wortweg 牌组包')
    const payload = JSON.parse(await header.getData(new TextWriter())) as ArchivePayload
    if (payload?.app !== 'wortweg-deck' || !Array.isArray(payload.notes)) throw new Error('牌组包格式不对')
    const notes = payload.notes.filter((note) => note && typeof note.german === 'string' && note.german.trim() && typeof note.guid === 'string')
    if (notes.length === 0) throw new Error('牌组包里没有词条')
    const guids = notes.map((note) => note.guid)
    const packId = payload.deck?.packId || (await fingerprint(guids))
    const existing = await findDeckForImport(packId, guids)
    const replaced = !!existing
    const deckId = existing?.id ?? `imp_${packId.slice(0, 16)}`
    await deleteDeckNotes(deckId)
    const stored: StoredNote[] = notes.map((note) => ({ ...note, german: note.german.trim(), zh: note.zh ?? '', id: `${deckId}\u0000${note.guid}`, deckId }))
    await putNotes(stored)
    const mediaIncluded = payload.mediaIncluded === true && Array.isArray(payload.media) && payload.media.length > 0
    if (mediaIncluded) await deleteDeckMedia(deckId)
    let mediaStored = 0
    let mediaBytes = 0
    if (mediaIncluded) {
      const byName = new Map<string, FileEntry>()
      for (const entry of entries) {
        if (entry.directory) continue
        byName.set(entry.filename, entry)
        byName.set(baseName(entry.filename), entry)
      }
      const files = payload.media
      for (let index = 0; index < files.length; index++) {
        if (opts.signal?.aborted) break
        const file = files[index]!
        if (!file?.name || typeof file.file !== 'string' || file.file.includes('..')) continue
        opts.onProgress?.(`正在恢复音频和图片（${index + 1} / ${files.length}）…`, index + 1, files.length)
        const entry = byName.get(file.file) ?? byName.get(baseName(file.file))
        if (!entry) continue
        const blob = await entry.getData(new BlobWriter())
        await (opts.putMediaFile ?? putMedia)(deckId, file.name, blob)
        mediaStored++
        mediaBytes += blob.size
      }
    }
    const expectsMedia = referencedNames(notes).length > 0
    const previous = existing ?? null
    const deck: DeckRecord = {
      id: deckId,
      name: payload.deck?.name || previous?.name || deckTitle([], '已导入牌组'),
      packId,
      guids,
      importedAt: Date.now(),
      noteCount: stored.length,
      skipped: 0,
      mediaCount: mediaIncluded ? mediaStored : (previous?.mediaCount ?? 0),
      mediaBytes: mediaIncluded ? mediaBytes : (previous?.mediaBytes ?? 0),
      mediaIncomplete: mediaIncluded ? !payload.mediaComplete || mediaStored < (payload.media?.length ?? 0) : (previous?.mediaIncomplete ?? false),
      mediaFromBackupOnly: mediaIncluded ? mediaStored === 0 && expectsMedia : (previous ? previous.mediaCount === 0 && expectsMedia : expectsMedia),
      level: payload.deck?.level,
      levels: payload.deck?.levels ?? [],
      sourceFileName: payload.deck?.sourceFileName,
      expectsMedia,
    }
    await putDeck(deck)
    return {
      deckId,
      deckName: deck.name,
      imported: stored.length,
      replaced,
      mediaStored: mediaIncluded ? mediaStored : 0,
      mediaBytes: mediaIncluded ? mediaBytes : 0,
      mediaIncluded,
      mediaIncomplete: deck.mediaIncomplete,
      mediaNote: payload.mediaNote || (mediaIncluded ? ARCHIVE_INCOMPLETE_NOTE : BACKUP_MEDIA_NOTE),
    }
  } finally {
    await reader.close()
  }
}

export async function zipHasWortwegDeck(file: Blob): Promise<boolean> {
  const reader = new ZipReader(new BlobReader(file), { useWebWorkers: false })
  try {
    const entries = await reader.getEntries()
    return entries.some((entry: Entry) => !entry.directory && baseName(entry.filename) === 'wortweg-deck.json')
  } catch {
    return false
  } finally {
    await reader.close()
  }
}

function toMapped(note: StoredNote): MappedNote {
  const { id: _id, deckId: _deckId, ...rest } = note
  return rest
}

async function restoreOne(item: unknown, _opts: { writeMedia: false }): Promise<number | null> {
  if (!item || typeof item !== 'object') return null
  const record = item as Partial<TextDeckBackup>
  if (typeof record.name !== 'string' || !Array.isArray(record.notes)) return null
  const notes = record.notes.filter((note): note is MappedNote => !!note && typeof note.german === 'string' && !!note.german.trim() && typeof note.guid === 'string')
  if (notes.length === 0) return null
  const guids = notes.map((note) => note.guid)
  const packId = typeof record.packId === 'string' && record.packId ? record.packId : await fingerprint(guids)
  const existing = await findDeckForImport(packId, guids)
  const deckId = existing?.id ?? (typeof record.id === 'string' && record.id.startsWith('imp_') ? record.id : `imp_${packId.slice(0, 16)}`)
  await deleteDeckNotes(deckId)
  const stored: StoredNote[] = notes.map((note) => ({
    ...note,
    german: note.german.trim(),
    zh: note.zh ?? '',
    id: `${deckId}\u0000${note.guid}`,
    deckId,
  }))
  await putNotes(stored)
  const expectsMedia = referencedNames(notes).length > 0
  const deck: DeckRecord = {
    id: deckId,
    name: record.name,
    packId,
    guids,
    importedAt: Date.now(),
    noteCount: stored.length,
    skipped: 0,
    mediaCount: existing?.mediaCount ?? 0,
    mediaBytes: existing?.mediaBytes ?? 0,
    mediaIncomplete: existing?.mediaIncomplete ?? false,
    mediaFromBackupOnly: existing ? existing.mediaCount === 0 && expectsMedia : expectsMedia,
    level: record.level ?? existing?.level,
    levels: record.levels ?? existing?.levels ?? [],
    sourceFileName: record.sourceFileName ?? existing?.sourceFileName,
    expectsMedia,
  }
  await putDeck(deck)
  return stored.length
}

function referencedNames(notes: MappedNote[]): string[] {
  const names = new Set<string>()
  for (const note of notes) {
    if (note.audioName) names.add(note.audioName)
    if (note.imageName) names.add(note.imageName)
    for (const example of note.examples ?? []) if (example.audioName) names.add(example.audioName)
  }
  return [...names]
}

function baseName(path: string): string {
  const parts = path.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? path
}

function uniqueSafe(name: string, used: Set<string>): string {
  const base = (name.split('/').pop() || 'file').replace(/[\\/]+/g, '_')
  const cleaned = base.replace(/^\.+/, '') || 'file'
  if (!used.has(cleaned)) {
    used.add(cleaned)
    return cleaned
  }
  const dot = cleaned.lastIndexOf('.')
  const stem = dot > 0 ? cleaned.slice(0, dot) : cleaned
  const ext = dot > 0 ? cleaned.slice(dot) : ''
  let index = 2
  while (used.has(`${stem}-${index}${ext}`)) index++
  const next = `${stem}-${index}${ext}`
  used.add(next)
  return next
}
