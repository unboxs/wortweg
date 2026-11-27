import { useSpeech } from '../hooks/useSpeech'
import { useStore } from '../store'
import type { TtsSource } from '../types'

const COPY: Record<string, string> = {
  'no-german-voice': '这次没有读出来：这台设备没有德语系统语音。',
  unsupported: '这次没有读出来：这个浏览器没有语音接口。',
  'proxy-failed': '这次没有读出来：在线发音失败，系统里也没有德语语音。',
  unconfigured: '这次没有读出来：在线发音还没配好，系统里也没有德语语音。',
}

/** 朗读失败时留在页面上的说明，并给出切换发音源的按钮。成功朗读后自动消失。 */
export function TtsNotice({ text, className = '' }: { text?: string; className?: string }) {
  const { ttsStatus, speak } = useSpeech()
  const source = useStore((s) => s.settings.ttsSource)
  const setSettings = useStore((s) => s.setSettings)
  if (ttsStatus.state !== 'silent') return null
  if (ttsStatus.reason === 'no-german-voice' && source !== 'system') return null

  const switchTo = (next: TtsSource) => {
    setSettings({ ttsSource: next, onlineVoice: next === 'elevenlabs' ? 'Lily' : 'Hanna' })
    if (text) void speak(text)
  }

  return (
    <div
      role="alert"
      className={`mx-auto mt-4 max-w-md rounded-xl border border-amber-400/50 bg-amber-400/10 px-3 py-3 text-left text-sm leading-relaxed text-amber-950 dark:text-amber-50 ${className}`}
    >
      <p className="font-medium">{COPY[ttsStatus.reason] ?? '这次没有读出来。'}</p>
      <p className="mt-1 text-xs opacity-80">不会静默跳过。可以改用在线发音，密钥在 Cloudflare，不在这个网页里。</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {source !== 'voicerss' && (
          <button type="button" className="btn btn-gold h-9" onClick={() => switchTo('voicerss')}>
            改用 VoiceRSS
          </button>
        )}
        {source !== 'elevenlabs' && (
          <button type="button" className="btn btn-ghost h-9" onClick={() => switchTo('elevenlabs')}>
            改用 ElevenLabs
          </button>
        )}
        {source !== 'system' && (
          <button type="button" className="btn btn-ghost h-9" onClick={() => setSettings({ ttsSource: 'system' })}>
            改用系统语音
          </button>
        )}
      </div>
    </div>
  )
}
