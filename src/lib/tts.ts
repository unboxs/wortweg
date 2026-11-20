// ─── TTS：Web Speech API（免密钥、离线可用、德语优先） ──────────────────
//shortcut: 无语音环境（个别浏览器/无障碍设置关闭）时静默降级，按钮仍可点击但不发声

type VoicePick = SpeechSynthesisVoice | null

let voices: SpeechSynthesisVoice[] = []
let preferred: VoicePick = null
let token = 0 // 播放队列的取消令牌

export const ttsSupported = () =>
  typeof window !== 'undefined' && 'speechSynthesis' in window

function pickGerman(): VoicePick {
  const de = voices.filter((v) => v.lang?.toLowerCase().startsWith('de'))
  if (de.length === 0) return null
  // 优先 Google / Microsoft 的在线高音质语音，其次任何 de-DE
  return (
    de.find((v) => /google/i.test(v.name) && v.lang.toLowerCase() === 'de-de') ??
    de.find((v) => /google|microsoft|deutsch/i.test(v.name)) ??
    de.find((v) => v.lang.toLowerCase() === 'de-de') ??
    de[0]
  )
}

/** 初始化语音列表；voiceschanged 在部分浏览器上异步触发 */
export function initVoices(onUpdate?: (voices: SpeechSynthesisVoice[]) => void): void {
  if (!ttsSupported()) return
  const load = () => {
    voices = window.speechSynthesis.getVoices()
    preferred = pickGerman()
    onUpdate?.(germanVoices())
  }
  load()
  window.speechSynthesis.onvoiceschanged = load
}

export const germanVoices = () =>
  voices.filter((v) => v.lang?.toLowerCase().startsWith('de'))

export function resolveVoice(voiceURI: string): VoicePick {
  if (voiceURI) {
    const v = voices.find((x) => x.voiceURI === voiceURI)
    if (v) return v
  }
  return preferred
}

export function stopSpeaking(): void {
  if (!ttsSupported()) return
  token++
  window.speechSynthesis.cancel()
}

/** 朗读一段德语文本；resolve 在朗读结束/取消时触发 */
export function speak(
  text: string,
  opts: { rate?: number; voiceURI?: string } = {},
): Promise<void> {
  if (!ttsSupported()) return Promise.resolve()
  stopSpeaking()
  const my = ++token
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text)
    const v = resolveVoice(opts.voiceURI ?? '')
    if (v) u.voice = v
    u.lang = v?.lang ?? 'de-DE'
    u.rate = opts.rate ?? 1
    u.onend = () => resolve()
    u.onerror = () => resolve()
    // Chrome 的长文本 bug 规避：短句直接朗读即可
    window.speechSynthesis.speak(u)
    // 兜底：若引擎静默失败 3s 后 resolve，避免 UI 卡住
    window.setTimeout(() => {
      if (my === token && !window.speechSynthesis.speaking) resolve()
    }, 3000)
  })
}

/** 顺序朗读多段文本（整列表自动朗读），可随时 stopAll */
export async function speakSequence(
  texts: string[],
  opts: { rate?: number; voiceURI?: string; onIndex?: (i: number) => void } = {},
): Promise<void> {
  const my = ++token
  for (let i = 0; i < texts.length; i++) {
    if (my !== token) return
    opts.onIndex?.(i)
    await speak(texts[i], opts)
    if (my !== token) return
  }
}
