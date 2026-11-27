import { useRef } from 'react'
import { FileUp, X } from 'lucide-react'
import { useApkgImport } from '../hooks/useApkgImport'
import { Bar } from './ui'

/** 选择本机 .apkg。解析和保存都在浏览器里完成。 */
export default function ApkgImporter() {
  const fileRef = useRef<HTMLInputElement>(null)
  const { busy, progress, result, run, cancel } = useApkgImport()
  const pct = progress && progress.total > 0 ? progress.current / progress.total : busy ? 0.05 : 0

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-gold" disabled={busy} onClick={() => fileRef.current?.click()}>
          <FileUp size={15} /> 选择 .apkg
        </button>
        {busy && (
          <button className="btn btn-ghost h-10" onClick={cancel}>
            <X size={14} /> 取消
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".apkg,.zip,application/zip,application/octet-stream"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void run(file)
            event.target.value = ''
          }}
        />
      </div>
      {progress && (
        <div className="space-y-2">
          <Bar pct={pct} gold />
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{progress.message}</p>
        </div>
      )}
      {result && (
        <p
          className={`rounded-xl border px-3 py-2 text-xs leading-relaxed ${
            result.ok && !result.mediaIncomplete
              ? 'border-amber-400/40 bg-amber-400/10 text-amber-800 dark:text-amber-100'
              : 'border-red-300 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200'
          }`}
        >
          {result.message}
        </p>
      )}
      <p className="text-[11px] leading-relaxed text-zinc-400 dark:text-zinc-500">
        请选择你自己的 Anki 牌组。解析、词条和媒体都只留在这台浏览器里，不会上传。AnkiWeb 上的共享牌组只供个人学习，不能再公开分发。大文件会显示进度；如果浏览器拒绝分配存储空间，会用中文说明，文字词条仍然保留。
      </p>
    </div>
  )
}
