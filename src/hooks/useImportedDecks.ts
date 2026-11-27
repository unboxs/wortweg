import { useCallback, useEffect, useState } from 'react'
import { listDecks } from '../lib/apkg/storage'
import type { DeckRecord } from '../lib/apkg/types'

const EVENT = 'wortweg-apkg-changed'

export function notifyApkgChanged() {
  window.dispatchEvent(new Event(EVENT))
}

export function useImportedDecks() {
  const [decks, setDecks] = useState<DeckRecord[]>([])
  const [ready, setReady] = useState(false)
  const reload = useCallback(async () => {
    try {
      setDecks(await listDecks())
    } catch {
      setDecks([])
    }
    setReady(true)
  }, [])
  useEffect(() => {
    void reload()
    const onChange = () => {
      void reload()
    }
    window.addEventListener(EVENT, onChange)
    return () => window.removeEventListener(EVENT, onChange)
  }, [reload])
  return { decks, ready, reload }
}
