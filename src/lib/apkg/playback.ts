// 播放牌组里的原声。没有文件就返回 missing，调用方再决定要不要用系统朗读。

import { stopSpeaking } from '../tts'
import { getMediaBlob } from './storage'

let token = 0
let current: HTMLAudioElement | null = null
let finishCurrent: (() => void) | null = null
const objectUrls = new Map<string, string>()

export type DeckPlayEnd = 'ended' | 'stopped' | 'missing' | 'error'

export function stopDeckAudio(): void {
  token++
  const audio = current
  current = null
  const finish = finishCurrent
  finishCurrent = null
  if (audio) {
    audio.onended = null
    audio.onerror = null
    audio.pause()
    audio.removeAttribute('src')
    try {
      audio.load()
    } catch {
      /* 已经拆掉的元素不必再管 */
    }
  }
  finish?.()
}

export async function playDeckAudio(deckId: string, name: string, rate: number): Promise<DeckPlayEnd> {
  const blob = await getMediaBlob(deckId, name)
  if (!blob || blob.size === 0) return 'missing'
  stopSpeaking()
  const my = ++token
  if (current) {
    current.pause()
    current = null
  }
  const url = URL.createObjectURL(blob)
  const audio = new Audio(url)
  audio.preload = 'auto'
  audio.playbackRate = rate > 0 ? rate : 1
  current = audio
  try {
    await audio.play()
  } catch {
    URL.revokeObjectURL(url)
    if (current === audio) current = null
    return my === token ? 'error' : 'stopped'
  }
  await new Promise<void>((resolve) => {
    finishCurrent = resolve
    audio.onended = () => resolve()
    audio.onerror = () => resolve()
  })
  URL.revokeObjectURL(url)
  if (current === audio) current = null
  finishCurrent = null
  return my === token ? 'ended' : 'stopped'
}

export async function mediaObjectUrl(deckId: string, name: string): Promise<string | null> {
  const key = `${deckId}\u0000${name}`
  const cached = objectUrls.get(key)
  if (cached) return cached
  const blob = await getMediaBlob(deckId, name)
  if (!blob || blob.size === 0) return null
  const url = URL.createObjectURL(blob)
  objectUrls.set(key, url)
  return url
}

export function revokeDeckObjectUrls(deckId: string): void {
  const prefix = `${deckId}\u0000`
  for (const [key, url] of objectUrls) {
    if (!key.startsWith(prefix)) continue
    URL.revokeObjectURL(url)
    objectUrls.delete(key)
  }
}

export function revokeAllObjectUrls(): void {
  for (const url of objectUrls.values()) URL.revokeObjectURL(url)
  objectUrls.clear()
  stopDeckAudio()
}
