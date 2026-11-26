import { useCallback, useEffect, useState } from 'react'
import { useStore } from '../store'
import { germanVoices, initVoices, isMobileSpeechDevice, speak as say, stopSpeaking, ttsSupported } from '../lib/tts'

/** 朗读 hook：读取设置里的语音/语速，自动降级无语音环境 */
export function useSpeech() {
  const voiceURI = useStore((s) => s.settings.voiceURI)
  const rate = useStore((s) => s.settings.rate)
  const [busy, setBusy] = useState(false)

  const speak = useCallback(
    async (text: string, r?: number) => {
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

  return { speak, stop: stopSpeaking, supported: ttsSupported() || isMobileSpeechDevice(), busy }
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
