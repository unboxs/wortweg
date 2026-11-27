import { useEffect, useRef, useState } from 'react'
import { importApkgFile, type ImportProgress, type ImportResult } from '../lib/apkg/import-run'
import { notifyApkgChanged } from './useImportedDecks'

export function useApkgImport() {
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!busy) return
    const onLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onLeave)
    return () => window.removeEventListener('beforeunload', onLeave)
  }, [busy])

  const run = async (file: File) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setBusy(true)
    setResult(null)
    setProgress({ phase: 'open', message: '正在打开牌组…', current: 0, total: 1 })
    let last = 0
    const outcome = await importApkgFile(file, {
      signal: controller.signal,
      onProgress: (next) => {
        const now = Date.now()
        if (next.phase !== 'done' && now - last < 80 && next.current !== next.total) return
        last = now
        setProgress(next)
      },
    })
    setResult(outcome)
    setProgress(null)
    setBusy(false)
    if (outcome.ok) notifyApkgChanged()
  }

  const cancel = () => abortRef.current?.abort()

  return { busy, progress, result, run, cancel }
}
