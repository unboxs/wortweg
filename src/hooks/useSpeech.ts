import { useCallback, useEffect, useState } from 'react'
import { useStore } from '../store'
import { playDeckAudio, stopDeckAudio, type DeckPlayEnd } from '../lib/apkg/playback'
import { germanVoices, initVoices, isMobileSpeechDevice, speak as say, stopSpeaking, ttsSupported } from '../lib/tts'

export interface SpokenEntry {
  german: string
  sourceDeckId?: string
  audioName?: string
}

/** 朗读 hook：读取设置里的语音/语速，自动降级无语音环境 */
export function useSpeech() {
  const voiceURI = useStore((s) => s.settings.voiceURI)
  const rate = useStore((s) => s.settings.rate)
  const [busy, setBusy] = useState(false)

  const speak = useCallback(
    async (text: string, r?: number) => {
      stopDeckAudio()
      // 手机没有 speechSynthesis 时仍可走在线音频；桌面保持「不支持就直接返回」
      if (!text.trim()) return
      if (!ttsSupported() && !isMobileSpeechDevice()) return
      setBusy(true)
      try {
        await say(text, { rate: r ?? rate, voiceURI })
      } finally {
        setBusy(false)
      }
    },
    [rate, voiceURI],
  )

  /** 学习卡自动朗读：常速一遍，再用同一段音频慢速一遍。 */
  const speakLesson = useCallback(
    async (text: string) => {
      stopDeckAudio()
      if (!text.trim()) return
      if (!ttsSupported() && !isMobileSpeechDevice()) return
      setBusy(true)
      try {
        await say(text, { rate, voiceURI, thenSlow: true })
      } finally {
        setBusy(false)
      }
    },
    [rate, voiceURI],
  )

  const speakEntry = useCallback(
    async (entry: SpokenEntry, r?: number) => {
      if (entry.sourceDeckId && entry.audioName) {
        setBusy(true)
        let end: DeckPlayEnd = 'missing'
        try {
          end = await playDeckAudio(entry.sourceDeckId, entry.audioName, r ?? 1)
        } finally {
          setBusy(false)
        }
        if (end === 'ended' || end === 'stopped') return
      }
      await speak(entry.german, r)
    },
    [speak],
  )

  const speakEntryLesson = useCallback(
    async (entry: SpokenEntry) => {
      if (entry.sourceDeckId && entry.audioName) {
        setBusy(true)
        try {
          const end = await playDeckAudio(entry.sourceDeckId, entry.audioName, 1)
          if (end === 'stopped') return
          if (end === 'ended') {
            await playDeckAudio(entry.sourceDeckId, entry.audioName, useStore.getState().settings.slowRate)
            return
          }
        } finally {
          setBusy(false)
        }
      }
      await speakLesson(entry.german)
    },
    [speakLesson],
  )

  const stop = useCallback(() => {
    stopDeckAudio()
    stopSpeaking()
  }, [])

  return {
    speak,
    speakLesson,
    speakEntry,
    speakEntryLesson,
    stop,
    supported: ttsSupported() || isMobileSpeechDevice(),
    busy,
  }
}

/** 语音列表 hook（设置页选择德语语音用） */
export function useGermanVoices() {
  const [voices, setVoices] = useState(() => germanVoices())
  useEffect(() => {
    initVoices(() => setVoices(germanVoices()))
    setVoices(germanVoices())
  }, [])
  return voices
}
