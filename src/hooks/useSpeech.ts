import { useCallback, useEffect, useState } from 'react'
import { useStore } from '../store'
import {
  germanVoices,
  initVoices,
  isMobileSpeechDevice,
  readTtsStatus,
  speak as say,
  stopSpeaking,
  TTS_STATUS_EVENT,
  ttsSupported,
  type TtsStatus,
} from '../lib/tts'

/** 朗读 hook：读不出来时 ttsStatus 会变成 silent，界面必须把它显示出来。 */
export function useSpeech() {
  const voiceURI = useStore((s) => s.settings.voiceURI)
  const rate = useStore((s) => s.settings.rate)
  const [busy, setBusy] = useState(false)
  const [ttsStatus, setTtsStatus] = useState<TtsStatus>(() => readTtsStatus())

  useEffect(() => {
    const onStatus = (event: Event) => setTtsStatus((event as CustomEvent<TtsStatus>).detail)
    window.addEventListener(TTS_STATUS_EVENT, onStatus)
    return () => window.removeEventListener(TTS_STATUS_EVENT, onStatus)
  }, [])

  const speak = useCallback(
    async (text: string, r?: number) => {
      if (!text.trim()) return
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
      if (!text.trim()) return
      setBusy(true)
      try {
        await say(text, { rate, voiceURI, thenSlow: true })
      } finally {
        setBusy(false)
      }
    },
    [rate, voiceURI],
  )

  return { speak, speakLesson, stop: stopSpeaking, supported: ttsSupported() || isMobileSpeechDevice(), busy, ttsStatus }
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
