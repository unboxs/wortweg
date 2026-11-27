// 已导入的牌组和媒体只放在本机 IndexedDB。localStorage 装不下音频和图片。

import { SAME_DECK_OVERLAP, overlapRatio } from './fingerprint'
import type { DeckRecord, StoredNote } from './types'

const DB_NAME = 'wortweg-apkg'
const DB_VERSION = 1

let dbPromise: Promise<IDBDatabase> | null = null

function mediaKey(deckId: string, name: string): string {
  return `${deckId}\u0000${name}`
}

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('这个浏览器没有 IndexedDB，无法保存导入的牌组'))
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('decks')) db.createObjectStore('decks', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('notes')) {
        const notes = db.createObjectStore('notes', { keyPath: 'id' })
        notes.createIndex('byDeck', 'deckId', { unique: false })
      }
      if (!db.objectStoreNames.contains('media')) {
        const media = db.createObjectStore('media', { keyPath: 'id' })
        media.createIndex('byDeck', 'deckId', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => {
      dbPromise = null
      reject(request.error ?? new Error('无法打开本机牌组库'))
    }
  })
  return dbPromise
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    const fail = (err: unknown) => {
      if (settled) return
      settled = true
      reject(err ?? new Error('本机牌组库写入失败'))
    }
    const ok = () => {
      if (settled) return
      settled = true
      resolve()
    }
    tx.oncomplete = () => ok()
    tx.onabort = () => fail(tx.error)
    tx.onerror = () => fail(tx.error)
  })
}

export async function listDecks(): Promise<DeckRecord[]> {
  const db = await openDb()
  const tx = db.transaction('decks', 'readonly')
  const done = transactionDone(tx)
  const request = tx.objectStore('decks').getAll()
  const rows = await new Promise<DeckRecord[]>((resolve, reject) => {
    request.onsuccess = () => resolve((request.result as DeckRecord[]) ?? [])
    request.onerror = () => reject(request.error)
  })
  await done
  return rows.sort((a, b) => b.importedAt - a.importedAt)
}

export async function getDeck(id: string): Promise<DeckRecord | null> {
  const db = await openDb()
  const tx = db.transaction('decks', 'readonly')
  const done = transactionDone(tx)
  const request = tx.objectStore('decks').get(id)
  const row = await new Promise<DeckRecord | undefined>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as DeckRecord | undefined)
    request.onerror = () => reject(request.error)
  })
  await done
  return row ?? null
}

export async function putDeck(deck: DeckRecord): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('decks', 'readwrite')
  const done = transactionDone(tx)
  tx.objectStore('decks').put(deck)
  await done
}

export async function listNotes(deckId: string): Promise<StoredNote[]> {
  const db = await openDb()
  const tx = db.transaction('notes', 'readonly')
  const done = transactionDone(tx)
  const request = tx.objectStore('notes').index('byDeck').getAll(deckId)
  const rows = await new Promise<StoredNote[]>((resolve, reject) => {
    request.onsuccess = () => resolve((request.result as StoredNote[]) ?? [])
    request.onerror = () => reject(request.error)
  })
  await done
  return rows
}

export async function putNotes(notes: StoredNote[]): Promise<void> {
  const chunkSize = 200
  for (let index = 0; index < notes.length; index += chunkSize) {
    const slice = notes.slice(index, index + chunkSize)
    const db = await openDb()
    const tx = db.transaction('notes', 'readwrite')
    const done = transactionDone(tx)
    const store = tx.objectStore('notes')
    for (const note of slice) store.put(note)
    await done
  }
}

export async function putMedia(deckId: string, name: string, blob: Blob): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('media', 'readwrite')
  const done = transactionDone(tx)
  tx.objectStore('media').put({ id: mediaKey(deckId, name), deckId, name, blob })
  await done
}

export async function getMediaBlob(deckId: string, name: string): Promise<Blob | null> {
  const db = await openDb()
  const tx = db.transaction('media', 'readonly')
  const done = transactionDone(tx)
  const request = tx.objectStore('media').get(mediaKey(deckId, name))
  const row = await new Promise<{ blob?: Blob } | undefined>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as { blob?: Blob } | undefined)
    request.onerror = () => reject(request.error)
  })
  await done
  const blob = row?.blob
  if (!blob) return null
  if (typeof Blob !== 'undefined' && blob instanceof Blob) return blob
  return blob as Blob
}

async function deleteByDeck(storeName: 'notes' | 'media', deckId: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(storeName, 'readwrite')
  const done = transactionDone(tx)
  const request = tx.objectStore(storeName).index('byDeck').openCursor(IDBKeyRange.only(deckId))
  request.onsuccess = () => {
    const cursor = request.result
    if (!cursor) return
    cursor.delete()
    cursor.continue()
  }
  await done
}

export async function deleteDeckNotes(deckId: string): Promise<void> {
  await deleteByDeck('notes', deckId)
}

export async function deleteDeckMedia(deckId: string): Promise<void> {
  await deleteByDeck('media', deckId)
}

export async function deleteDeck(deckId: string): Promise<void> {
  await deleteDeckNotes(deckId)
  await deleteDeckMedia(deckId)
  const db = await openDb()
  const tx = db.transaction('decks', 'readwrite')
  const done = transactionDone(tx)
  tx.objectStore('decks').delete(deckId)
  await done
}

export async function findDeckForImport(packId: string, guids: string[]): Promise<DeckRecord | null> {
  const decks = await listDecks()
  const exact = decks.find((deck) => deck.packId === packId)
  if (exact) return exact
  let best: { deck: DeckRecord; ratio: number } | null = null
  for (const deck of decks) {
    const ratio = overlapRatio(deck.guids, guids)
    if (ratio < SAME_DECK_OVERLAP) continue
    if (!best || ratio > best.ratio) best = { deck, ratio }
  }
  return best?.deck ?? null
}

export async function clearAllImported(): Promise<void> {
  if (dbPromise) {
    try {
      const db = await dbPromise
      db.close()
    } catch {
      /* 已经关了也没关系 */
    }
    dbPromise = null
  }
  if (typeof indexedDB === 'undefined') return
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => resolve()
  })
}
