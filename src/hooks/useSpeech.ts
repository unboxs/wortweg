import { useCallback, useEffect, useState } from 'react'
import { useStore } from '../store'
import { germanVoices, initVoices, speak as say, stopSpeaking, ttsSupported } from '../lib/tts'

/** 朗读 hook：读取设置里的语音/语速，自动降级无语音环境 */
export function useSpeech() {
  const voiceURI = useStore((s) => s.settings.voiceURI)
  const rate = useStore((s) => s.settings.rate)
  const [busy, setBusy] = useState(false)

  const speak = useCallback(
    async (text: string, r?: number) => {
      if (!ttsSupported() || !text.trim()) return
      setBusy(true)
      try {
        await say(text, { rate: r ?? rate, voiceURI })
      } finally {
        setBusy(false)
      }
    },
    [rate, voiceURI],
  )

  return { speak, stop: stopSpeaking, supported: ttsSupported(), busy }
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
