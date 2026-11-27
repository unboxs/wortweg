import { useState } from 'react'
import { Download, Trash2 } from 'lucide-react'
import ApkgImporter from './ApkgImporter'
import { Modal, SectionTitle } from './ui'
import { useImportedDecks, notifyApkgChanged } from '../hooks/useImportedDecks'
import { exportDeckArchive, FULL_EXPORT_WARN_BYTES } from '../lib/apkg/backup'
import { formatBytes } from '../lib/apkg/format'
import { FULL_EXPORT_FAILED, FULL_EXPORT_WARN } from '../lib/apkg/messages'
import { revokeDeckObjectUrls } from '../lib/apkg/playback'
import { deleteDeck } from '../lib/apkg/storage'
import type { DeckRecord } from '../lib/apkg/types'

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export default function AnkiPanel() {
  const { decks } = useImportedDecks()
  const [pendingDelete, setPendingDelete] = useState<DeckRecord | null>(null)
  const [pendingExport, setPendingExport] = useState<DeckRecord | null>(null)
  const [exportingId, setExportingId] = useState<string | null>(null)
  const [exportMsg, setExportMsg] = useState<string | null>(null)

  const runExport = async (deck: DeckRecord) => {
    setExportingId(deck.id)
    setExportMsg(null)
    try {
      const result = await exportDeckArchive(deck.id)
      const safe = deck.name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'deck'
      downloadBlob(`wortweg-${safe}.zip`, result.blob)
      setExportMsg(result.mediaIncluded ? result.mediaNote : `${result.mediaNote} 刚才下载的文件里没有音频和图片。`)
    } catch {
      setExportMsg(FULL_EXPORT_FAILED)
    } finally {
      setExportingId(null)
    }
  }

  return (
    <section>
      <SectionTitle>Anki 牌组（只存在这台浏览器）</SectionTitle>
      <div className="card space-y-4 p-5">
        <ApkgImporter />
        {decks.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">还没有导入的牌组。选好 .apkg 之后，可以在「新建 Headlist」和「学习模式」里使用，和内置词库分开。</p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-white/5">
            {decks.map((deck) => (
              <li key={deck.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{deck.name}</span>
                    <span className="chip border border-amber-400/50 bg-amber-400/10 text-[10px] text-amber-700 dark:text-amber-200">已导入</span>
                    {deck.level && <span className="text-[11px] text-zinc-400">{deck.level}</span>}
                  </div>
                  <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                    {deck.noteCount} 条
                    {deck.skipped > 0 ? ` · 跳过 ${deck.skipped} 条` : ''}
                    {deck.mediaCount > 0 ? ` · 音频和图片 ${formatBytes(deck.mediaBytes)}` : deck.expectsMedia ? ' · 音频和图片不在本机' : ' · 无音频图片'}
                    {deck.mediaIncomplete ? ' · 保存不完整' : ''}
                    {deck.mediaFromBackupOnly ? ' · 来自不含媒体的备份' : ''}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    className="btn btn-ghost h-9"
                    disabled={exportingId === deck.id}
                    onClick={() => {
                      if (deck.mediaBytes > FULL_EXPORT_WARN_BYTES) setPendingExport(deck)
                      else void runExport(deck)
                    }}
                  >
                    <Download size={14} /> {exportingId === deck.id ? '正在导出…' : '导出牌组包'}
                  </button>
                  <button className="btn btn-danger h-9" onClick={() => setPendingDelete(deck)}>
                    <Trash2 size={14} /> 移除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {exportMsg && <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-200">{exportMsg}</p>}
      </div>

      <Modal
        open={!!pendingDelete}
        title="移除这套牌组？"
        onClose={() => setPendingDelete(null)}
        footer={
          <>
            <button className="btn btn-ghost h-9" onClick={() => setPendingDelete(null)}>
              取消
            </button>
            <button
              className="btn btn-danger h-9"
              onClick={() => {
                const deck = pendingDelete
                if (!deck) return
                void deleteDeck(deck.id).then(() => {
                  revokeDeckObjectUrls(deck.id)
                  notifyApkgChanged()
                  setPendingDelete(null)
                })
              }}
            >
              移除
            </button>
          </>
        }
      >
        「{pendingDelete?.name}」的词条、音频和图片会从这台浏览器删掉。已经放进 Headlist 的文字会留下，但原声和图片会失效。
      </Modal>

      <Modal
        open={!!pendingExport}
        title="导出含媒体的完整包？"
        onClose={() => setPendingExport(null)}
        footer={
          <>
            <button className="btn btn-ghost h-9" onClick={() => setPendingExport(null)}>
              取消
            </button>
            <button
              className="btn btn-gold h-9"
              onClick={() => {
                const deck = pendingExport
                setPendingExport(null)
                if (deck) void runExport(deck)
              }}
            >
              仍然导出
            </button>
          </>
        }
      >
        {FULL_EXPORT_WARN}
        {pendingExport ? ` 这套牌组的媒体大约 ${formatBytes(pendingExport.mediaBytes)}。` : ''}
      </Modal>
    </section>
  )
}
