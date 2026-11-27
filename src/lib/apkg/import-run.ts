// 把用户选中的 .apkg 解析后写入 IndexedDB。文件、笔记和媒体都不会发到网络上。

import { BlobWriter } from '@zip.js/zip.js'
import type { SqlJsStatic } from 'sql.js'
import { importDeckArchive, zipHasWortwegDeck } from './backup'
import { fingerprint } from './fingerprint'
import { formatBytes, mimeFor } from './format'
import { deckTitle, majorityLevel, mapNote } from './map'
import {
  CANCELLED_MESSAGE,
  CANCELLED_PARTIAL_MESSAGE,
  FILE_TOO_BIG_MESSAGE,
  QUOTA_MESSAGE,
} from './messages'
import { ApkgError, openApkg, type OpenedApkg } from './parse'
import { isQuotaError } from './quota'
import {
  deleteDeckMedia,
  deleteDeckNotes,
  findDeckForImport,
  putDeck,
  putMedia,
  putNotes,
} from './storage'
import type { DeckRecord, MappedNote, StoredNote } from './types'

/** 1.5 GB 以上就不要整包读进内存。目标牌组大约一两百 MB。 */
export const MAX_APKG_BYTES = Math.floor(1.5 * 1024 * 1024 * 1024)

export interface ImportProgress {
  phase: 'open' | 'parse' | 'notes' | 'media' | 'done'
  message: string
  current: number
  total: number
}

export interface ImportResult {
  ok: boolean
  cancelled?: boolean
  deckId?: string
  deckName?: string
  imported: number
  skipped: number
  replaced: boolean
  mediaStored: number
  mediaBytes: number
  mediaIncomplete: boolean
  message: string
}

export async function importApkgFile(
  file: Blob & { name?: string },
  opts: {
    onProgress?: (progress: ImportProgress) => void
    signal?: AbortSignal
    sql?: SqlJsStatic
    /** 测试用来模拟配额失败。默认写入 IndexedDB。 */
    putMediaFile?: (deckId: string, name: string, blob: Blob) => Promise<void>
  } = {},
): Promise<ImportResult> {
  const report = (progress: ImportProgress) => opts.onProgress?.(progress)
  if (file.size > MAX_APKG_BYTES) {
    return fail(FILE_TOO_BIG_MESSAGE)
  }
  if (opts.signal?.aborted) return fail(CANCELLED_MESSAGE, true)

  report({ phase: 'open', message: openingMessage(file), current: 0, total: 1 })
  if (await zipHasWortwegDeck(file)) {
    try {
      const restored = await importDeckArchive(file, {
        signal: opts.signal,
        onProgress: (message, current, total) => report({ phase: 'media', message, current, total }),
      })
      const message = restored.mediaIncluded
        ? `已恢复「${restored.deckName}」：${restored.imported} 条，音频/图片 ${restored.mediaStored} 个。${restored.mediaNote}`
        : `已恢复「${restored.deckName}」的文字 ${restored.imported} 条。${restored.mediaNote}`
      report({ phase: 'done', message, current: 1, total: 1 })
      return {
        ok: true,
        deckId: restored.deckId,
        deckName: restored.deckName,
        imported: restored.imported,
        skipped: 0,
        replaced: restored.replaced,
        mediaStored: restored.mediaStored,
        mediaBytes: restored.mediaBytes,
        mediaIncomplete: restored.mediaIncomplete,
        message,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '牌组包无法读取'
      return fail(message)
    }
  }

  let opened: OpenedApkg | null = null
  try {
    if (typeof navigator !== 'undefined') {
      try {
        await navigator.storage?.persist?.()
      } catch {
        /* 持久化只是尽量申请，失败不影响导入 */
      }
    }
    opened = await openApkg(file, { sql: opts.sql, fileName: file.name })
    if (opts.signal?.aborted) return fail(CANCELLED_MESSAGE, true)

    report({ phase: 'parse', message: '正在整理词条…', current: 0, total: opened.notes.length })
    const mapped: MappedNote[] = []
    const seen = new Set<string>()
    let skipped = 0
    for (const raw of opened.notes) {
      if (seen.has(raw.guid)) {
        skipped++
        continue
      }
      seen.add(raw.guid)
      const note = mapNote(raw)
      if (!note) {
        skipped++
        continue
      }
      mapped.push(note)
    }
    if (mapped.length === 0) {
      return fail(skipped > 0 ? `没有能用的词条（跳过 ${skipped} 条）。` : '这份牌组里没有笔记。')
    }

    const guids = mapped.map((note) => note.guid)
    const packId = await fingerprint(guids)
    const existing = await findDeckForImport(packId, guids)
    const replaced = !!existing
    const deckId = existing?.id ?? `imp_${packId.slice(0, 16)}`
    const counts = new Map<string, number>()
    for (const note of mapped) counts.set(note.deckName, (counts.get(note.deckName) ?? 0) + 1)
    const name = deckTitle([...counts.entries()].map(([deckName, count]) => ({ name: deckName, count })), opened.fileName)
    const levels = [...new Set(mapped.map((note) => note.level).filter((level): level is string => !!level))]
    const expectsMedia = mapped.some((note) => note.audioName || note.imageName || note.examples?.some((example) => example.audioName))

    report({
      phase: 'notes',
      message: replaced ? '正在更新已导入的牌组…' : `正在写入 ${mapped.length} 条词条…`,
      current: 0,
      total: mapped.length,
    })
    if (replaced) {
      await deleteDeckNotes(deckId)
      await deleteDeckMedia(deckId)
    }
    const storedNotes: StoredNote[] = mapped.map((note) => ({ ...note, id: `${deckId}\u0000${note.guid}`, deckId }))
    await putNotes(storedNotes)

    const shell: DeckRecord = {
      id: deckId,
      name,
      packId,
      guids,
      importedAt: Date.now(),
      noteCount: mapped.length,
      skipped,
      mediaCount: 0,
      mediaBytes: 0,
      mediaIncomplete: false,
      mediaFromBackupOnly: false,
      level: majorityLevel(mapped.map((note) => note.level).filter((level): level is string => !!level)),
      levels,
      sourceFileName: opened.fileName,
      expectsMedia,
    }
    await putDeck(shell)

    const mediaNames = referencedNames(mapped)
    let mediaStored = 0
    let mediaBytes = 0
    let mediaIncomplete = false
    let cancelled = false
    let quota = false
    for (let index = 0; index < mediaNames.length; index++) {
      if (opts.signal?.aborted) {
        cancelled = true
        break
      }
      const mediaName = mediaNames[index]!
      report({
        phase: 'media',
        message: `正在保存音频和图片（${index + 1} / ${mediaNames.length}）…`,
        current: index + 1,
        total: mediaNames.length,
      })
      const entry = opened.mediaByName.get(mediaName)
      if (!entry) continue
      try {
        const blob = await entry.getData(new BlobWriter(mimeFor(mediaName)))
        await (opts.putMediaFile ?? putMedia)(deckId, mediaName, blob)
        mediaStored++
        mediaBytes += blob.size
      } catch (err) {
        if (isQuotaError(err)) {
          quota = true
          mediaIncomplete = true
          break
        }
        // 单个坏文件不影响其余词条
      }
      if (index % 25 === 0) await new Promise((resolve) => setTimeout(resolve, 0))
    }

    const deck: DeckRecord = {
      ...shell,
      mediaCount: mediaStored,
      mediaBytes,
      mediaIncomplete: mediaIncomplete || cancelled,
    }
    await putDeck(deck)

    const models = new Map<string, number>()
    for (const note of mapped) models.set(note.modelName, (models.get(note.modelName) ?? 0) + 1)
    const message = describeResult({
      name,
      imported: mapped.length,
      skipped,
      replaced,
      mediaStored,
      mediaBytes,
      expectsMedia,
      quota,
      cancelled,
      models,
    })
    report({ phase: 'done', message, current: 1, total: 1 })
    return {
      ok: true,
      cancelled,
      deckId,
      deckName: name,
      imported: mapped.length,
      skipped,
      replaced,
      mediaStored,
      mediaBytes,
      mediaIncomplete: deck.mediaIncomplete,
      message,
    }
  } catch (err) {
    if (isQuotaError(err)) {
      return fail('浏览器存储空间不足，导入停住了。请清理空间后重试。已经写进去的文字会留在本机；这次没有把牌组上传到任何服务器。')
    }
    const message = err instanceof ApkgError ? err.message : '导入失败。文件留在你的电脑上，没有上传。'
    return fail(message)
  } finally {
    await opened?.close()
  }
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

function openingMessage(file: Blob): string {
  const size = formatBytes(file.size)
  if (file.size >= 50 * 1024 * 1024) return `正在打开 ${size} 的牌组。文件较大，请先不要关闭这个页面。`
  return '正在打开牌组…'
}

function describeResult(input: {
  name: string
  imported: number
  skipped: number
  replaced: boolean
  mediaStored: number
  mediaBytes: number
  expectsMedia: boolean
  quota: boolean
  cancelled: boolean
  models: Map<string, number>
}): string {
  const bits = [`已导入「${input.name}」：${input.imported} 条`]
  if (input.skipped) bits.push(`跳过 ${input.skipped} 条`)
  let message = `${bits.join('，')}。`
  if (input.replaced) message += '这是重新导入，没有另建一套重复词条。'
  if (input.mediaStored > 0) message += `已保存 ${input.mediaStored} 个音频/图片（${formatBytes(input.mediaBytes)}）。`
  else if (input.expectsMedia && !input.quota && !input.cancelled) message += '牌组引用了音频或图片，但包里没有找到对应文件。'
  const modelText = [...input.models.entries()].map(([name, count]) => `${name} ${count} 条`).join('、')
  if (modelText) message += `笔记类型：${modelText}。`
  if (input.quota) message += QUOTA_MESSAGE
  else if (input.cancelled) message += CANCELLED_PARTIAL_MESSAGE
  return message
}

function fail(message: string, cancelled = false): ImportResult {
  return {
    ok: false,
    cancelled,
    imported: 0,
    skipped: 0,
    replaced: false,
    mediaStored: 0,
    mediaBytes: 0,
    mediaIncomplete: false,
    message,
  }
}
