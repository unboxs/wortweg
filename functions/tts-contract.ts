/** Shared by the Pages Function and the browser. No secrets and no network calls. */

export const VOICERSS_VOICES = ['Hanna', 'Lina', 'Jonas'] as const
export const ELEVEN_VOICES = ['Lily', 'Charlotte', 'Daniel'] as const
export const POLLY_VOICES = ['Vicki', 'Marlene', 'Hans'] as const

export type VoiceRssVoice = (typeof VOICERSS_VOICES)[number]
export type ElevenVoice = (typeof ELEVEN_VOICES)[number]
export type PollyVoice = (typeof POLLY_VOICES)[number]

export const PROXY_SOURCES = ['voicerss', 'elevenlabs'] as const
export type ProxySource = (typeof PROXY_SOURCES)[number]

/** A public preview URL must not be able to spend the daily quota on long passages. */
export const TTS_TEXT_MAX = 300

export function isProxySource(source: string): source is ProxySource {
  return source === 'voicerss' || source === 'elevenlabs'
}

function inList<T extends string>(list: readonly T[], value: string): value is T {
  return (list as readonly string[]).includes(value)
}

/** Voice chip for the active source. Unknown names fall back to that source's default. */
export function voiceForSource(source: string, voice: string): string {
  if (source === 'voicerss') return inList(VOICERSS_VOICES, voice) ? voice : 'Hanna'
  if (source === 'elevenlabs') return inList(ELEVEN_VOICES, voice) ? voice : 'Lily'
  if (source === 'polly') return inList(POLLY_VOICES, voice) ? voice : 'Vicki'
  return voice
}

export function cleanTtsText(raw: string): string {
  return raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Same-origin URL an <audio> element can start inside a click handler. */
export function proxyTtsPath(source: ProxySource, voice: string, text: string): string {
  const params = new URLSearchParams({
    source,
    voice: voiceForSource(source, voice),
    text: cleanTtsText(text),
  })
  return `/api/tts?${params.toString()}`
}
