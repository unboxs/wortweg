// 在浏览器里拆开 .apkg：zip +（可能经 zstd 压缩的）SQLite。
// 不发起任何网络请求；媒体按条目读取，不把整个包一次性解进内存。

import {
  BlobReader,
  TextWriter,
  Uint8ArrayWriter,
  ZipReader,
  configure,
  type Entry,
  type FileEntry,
} from '@zip.js/zip.js'
import { decompress } from 'fzstd'
import type { Database, SqlJsStatic } from 'sql.js'
import { BAD_COLLECTION_MESSAGE, NO_COLLECTION_MESSAGE, NOT_AN_APKG_MESSAGE } from './messages'
import { loadSqlJs } from './sqlite-runtime'
import type { RawNote } from './types'

configure({ useWebWorkers: false })

const COLLECTION_NAMES = ['collection.anki21b', 'collection.anki21', 'collection.anki2']

export class ApkgError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ApkgError'
  }
}

export interface OpenedApkg {
  fileName: string
  notes: RawNote[]
  /** 笔记里的文件名 → zip 条目。只在 close() 之前有效。 */
  mediaByName: Map<string, FileEntry>
  close: () => Promise<void>
}

function baseName(path: string): string {
  const parts = path.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? path
}

function isJunk(path: string): boolean {
  return path.split('/').some((part) => part === '__MACOSX' || part.startsWith('._'))
}

function isFile(entry: Entry): entry is FileEntry {
  return !entry.directory
}

function isZstd(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x28 && bytes[1] === 0xb5 && bytes[2] === 0x2f && bytes[3] === 0xfd
}

function isSqlite(bytes: Uint8Array): boolean {
  if (bytes.length < 15) return false
  let head = ''
  for (let i = 0; i < 15; i++) head += String.fromCharCode(bytes[i]!)
  return head === 'SQLite format 3'
}

function sqliteBytes(raw: Uint8Array): Uint8Array {
  if (isSqlite(raw)) return raw
  if (!isZstd(raw)) throw new ApkgError(BAD_COLLECTION_MESSAGE)
  let inflated: Uint8Array
  try {
    inflated = decompress(raw)
  } catch {
    throw new ApkgError(BAD_COLLECTION_MESSAGE)
  }
  if (!isSqlite(inflated)) throw new ApkgError(BAD_COLLECTION_MESSAGE)
  return inflated
}

function textOf(value: unknown): string {
  if (value == null) return ''
  return typeof value === 'string' ? value : String(value)
}

function tableExists(db: Database, name: string): boolean {
  const stmt = db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`)
  stmt.bind([name])
  const found = stmt.step()
  stmt.free()
  return found
}

function rowsOf(db: Database, sql: string): Record<string, string | number | Uint8Array | null>[] {
  const stmt = db.prepare(sql)
  const rows: Record<string, string | number | Uint8Array | null>[] = []
  while (stmt.step()) rows.push(stmt.getAsObject())
  stmt.free()
  return rows
}

interface ModelShape {
  name: string
  fields: string[]
}

function readModels(db: Database): Map<string, ModelShape> {
  const models = new Map<string, ModelShape>()
  if (tableExists(db, 'notetypes') && tableExists(db, 'fields')) {
    const types = rowsOf(db, 'SELECT id, name FROM notetypes')
    const fields = rowsOf(db, 'SELECT ntid, ord, name FROM fields')
    const grouped = new Map<string, { ord: number; name: string }[]>()
    for (const field of fields) {
      const id = textOf(field.ntid)
      const list = grouped.get(id) ?? []
      list.push({ ord: Number(field.ord) || 0, name: textOf(field.name) || `Field${list.length + 1}` })
      grouped.set(id, list)
    }
    for (const model of types) {
      const id = textOf(model.id)
      const list = (grouped.get(id) ?? []).sort((a, b) => a.ord - b.ord)
      models.set(id, { name: textOf(model.name) || 'Note', fields: list.map((item) => item.name) })
    }
    if (models.size > 0) return models
  }
  if (!tableExists(db, 'col')) return models
  const col = rowsOf(db, 'SELECT models FROM col LIMIT 1')
  const raw = textOf(col[0]?.models)
  if (!raw) return models
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return models
  }
  if (!parsed || typeof parsed !== 'object') return models
  for (const [id, model] of Object.entries(parsed as Record<string, unknown>)) {
    if (!model || typeof model !== 'object') continue
    const record = model as { name?: unknown; flds?: { name?: unknown; ord?: unknown }[] }
    const fields = Array.isArray(record.flds) ? record.flds.slice() : []
    fields.sort((a, b) => (Number(a?.ord) || 0) - (Number(b?.ord) || 0))
    models.set(String(record && (model as { id?: unknown }).id != null ? (model as { id?: unknown }).id : id), {
      name: textOf(record.name) || 'Note',
      fields: fields.map((field, index) => textOf(field?.name) || `Field${index + 1}`),
    })
  }
  return models
}

function readDecks(db: Database): Map<string, string> {
  const decks = new Map<string, string>()
  if (tableExists(db, 'decks')) {
    for (const deck of rowsOf(db, 'SELECT id, name FROM decks')) {
      decks.set(textOf(deck.id), textOf(deck.name) || '已导入牌组')
    }
    if (decks.size > 0) return decks
  }
  if (!tableExists(db, 'col')) return decks
  const col = rowsOf(db, 'SELECT decks FROM col LIMIT 1')
  const raw = textOf(col[0]?.decks)
  if (!raw) return decks
  try {
    const parsed = JSON.parse(raw) as Record<string, { id?: unknown; name?: unknown }>
    for (const [id, deck] of Object.entries(parsed)) {
      if (!deck || typeof deck !== 'object') continue
      decks.set(textOf(deck.id ?? id), textOf(deck.name) || '已导入牌组')
    }
  } catch {
    /* 没有牌组名也还能导入笔记 */
  }
  return decks
}

export function readNotes(db: Database): RawNote[] {
  if (!tableExists(db, 'notes')) throw new ApkgError(BAD_COLLECTION_MESSAGE)
  const models = readModels(db)
  const decks = readDecks(db)
  const deckByNote = new Map<string, string>()
  if (tableExists(db, 'cards')) {
    for (const card of rowsOf(db, 'SELECT nid, did FROM cards')) {
      const nid = textOf(card.nid)
      if (!deckByNote.has(nid)) deckByNote.set(nid, textOf(card.did))
    }
  }
  const notes: RawNote[] = []
  for (const row of rowsOf(db, 'SELECT id, guid, mid, flds, tags FROM notes')) {
    const guid = textOf(row.guid) || textOf(row.id)
    if (!guid) continue
    const model = models.get(textOf(row.mid))
    const names = model?.fields ?? []
    const parts = textOf(row.flds).split('\x1f')
    const fields = parts.map((value, index) => ({
      name: names[index] || `Field${index + 1}`,
      value,
    }))
    const deckId = deckByNote.get(textOf(row.id))
    const deckName = (deckId && decks.get(deckId)) || '已导入牌组'
    const tags = textOf(row.tags).split(/\s+/).map((tag) => tag.trim()).filter(Boolean)
    notes.push({
      guid,
      modelName: model?.name || 'Note',
      deckName,
      tags,
      fields,
    })
  }
  return notes
}

export async function openApkg(file: Blob, opts?: { sql?: SqlJsStatic; fileName?: string }): Promise<OpenedApkg> {
  const reader = new ZipReader(new BlobReader(file), { useWebWorkers: false })
  try {
    const entries = await reader.getEntries()
    const files = entries.filter(isFile).filter((entry) => !isJunk(entry.filename))
    const collection = COLLECTION_NAMES.map((name) => files.find((entry) => baseName(entry.filename) === name)).find(Boolean)
    if (!collection) throw new ApkgError(NO_COLLECTION_MESSAGE)
    const compressed = await collection.getData(new Uint8ArrayWriter())
    const SQL = opts?.sql ?? (await loadSqlJs())
    const db = new SQL.Database(sqliteBytes(compressed))
    let notes: RawNote[]
    try {
      notes = readNotes(db)
    } finally {
      db.close()
    }
    const mediaByName = await readMediaMap(files)
    return {
      fileName: opts?.fileName || ('name' in file && typeof file.name === 'string' ? file.name : 'deck.apkg'),
      notes,
      mediaByName,
      close: () => reader.close(),
    }
  } catch (err) {
    await reader.close().catch(() => undefined)
    if (err instanceof ApkgError) throw err
    throw new ApkgError(NOT_AN_APKG_MESSAGE)
  }
}

async function readMediaMap(files: FileEntry[]): Promise<Map<string, FileEntry>> {
  const byBase = new Map<string, FileEntry>()
  for (const file of files) {
    byBase.set(file.filename, file)
    byBase.set(baseName(file.filename), file)
  }
  const mediaFile = files.find((file) => baseName(file.filename) === 'media')
  const mapped = new Map<string, FileEntry>()
  if (!mediaFile) return mapped
  let parsed: unknown
  try {
    parsed = JSON.parse(await mediaFile.getData(new TextWriter()))
  } catch {
    return mapped
  }
  if (!parsed || typeof parsed !== 'object') return mapped
  for (const [index, filename] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof filename !== 'string' || !filename.trim()) continue
    const entry = byBase.get(index) ?? byBase.get(baseName(index)) ?? byBase.get(filename) ?? byBase.get(baseName(filename))
    if (entry && baseName(entry.filename) !== 'media') mapped.set(filename, entry)
  }
  return mapped
}
