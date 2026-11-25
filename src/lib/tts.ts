// ─── TTS：Web Speech API（免密钥、离线可用、德语优先） ──────────────────
//shortcut: 无语音环境（个别浏览器/无障碍设置关闭）时静默降级，按钮仍可点击但不发声

import { useStore } from '../store'

type VoicePick = SpeechSynthesisVoice | null

let voices: SpeechSynthesisVoice[] = []
let preferred: VoicePick = null
let token = 0 // 播放队列的取消令牌
let warnedNoGerman = false

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

/** 惰性补一次语音列表（Chrome 首次同步取列表可能为空） */
function refreshVoices(): void {
  const list = window.speechSynthesis.getVoices()
  if (list.length > 0 && list.length !== voices.length) {
    voices = list
    preferred = pickGerman()
  }
}

function warnNoGermanVoice(): void {
  if (warnedNoGerman) return
  warnedNoGerman = true
  useStore.getState().pushToast({
    kind: 'goal',
    title: '未检测到德语语音',
    desc: 'Windows：设置 → 时间和语言 → 添加德语（勾选语音包）后重启浏览器；或改用在线发音源',
  })
}

let warnedOnline = false
function warnOnlineFallback(): void {
  if (warnedOnline) return
  warnedOnline = true
  useStore.getState().pushToast({
    kind: 'goal',
    title: '在线语音不可达',
    desc: '已临时回落系统语音；可在设置里切换发音源',
  })
}

// ─── 在线发音源（免 Key）：StreamElements 的 Amazon Polly / Google 翻译 ──

let audioEl: HTMLAudioElement | null = null

function onlineUrl(text: string, source: 'polly' | 'google', voice: string): string {
  if (source === 'polly')
    return `https://api.streamelements.com/kappa/v2/speech?voice=${encodeURIComponent(voice)}&text=${encodeURIComponent(text)}`
  return `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=de&q=${encodeURIComponent(text)}`
}

/** 用 <audio> 播放在线语音；失败（网络/超时）reject 以便回落系统语音 */
function playOnline(text: string): Promise<void> {
  const s = useStore.getState().settings
  const url = onlineUrl(text, s.ttsSource === 'google' ? 'google' : 'polly', s.onlineVoice)
  return new Promise((resolve, reject) => {
    const el = new Audio()
    audioEl = el
    el.src = url
    el.onended = () => resolve()
    el.onerror = () => reject(new Error('online tts failed'))
    el.play().catch(reject)
    // 兜底：网络挂起 10s 后 reject
    window.setTimeout(() => {
      if (el.readyState < 2) reject(new Error('online tts timeout'))
    }, 10000)
  })
}

function stopAudio(): void {
  if (audioEl) {
    audioEl.pause()
    audioEl.removeAttribute('src')
    audioEl = null
  }
}

/** 发出一条系统话语并等待结束：纯排队，不取消、不动令牌（序列内部复用） */
function utterSystem(text: string, opts: { rate?: number; voiceURI?: string }): Promise<void> {
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text)
    const v = resolveVoice(opts.voiceURI ?? '')
    if (v) {
      u.voice = v
      u.lang = v.lang
    }
    u.rate = opts.rate ?? 1
    u.onend = () => resolve()
    u.onerror = () => resolve()
    window.speechSynthesis.speak(u)
    // 兜底：引擎静默失败 3.5s 后 resolve，避免 UI 卡住
    window.setTimeout(() => {
      if (!window.speechSynthesis.speaking) resolve()
    }, 3500)
  })
}

/** 有语音守卫的单条系统话语（在线回落时用，绝不无语音硬读） */
function guardedSystemUtter(text: string, opts: { rate?: number; voiceURI?: string }): Promise<void> {
  if (!voices.length) refreshVoices()
  const v = resolveVoice(opts.voiceURI ?? '')
  if (!v) {
    warnNoGermanVoice()
    return Promise.resolve()
  }
  return utterSystem(text, opts)
}

export function stopSpeaking(): void {
  token++
  stopAudio()
  if (ttsSupported()) window.speechSynthesis.cancel()
}

/** 按当前设置分发一条话语（序列内部也用它）：
 *  在线源失败自动回落系统语音；系统源无德语语音则静默提示。 */
function utterAny(text: string, opts: { rate?: number; voiceURI?: string }): Promise<void> {
  const source = useStore.getState().settings.ttsSource
  if (source === 'system') return utterSystem(text, opts)
  return playOnline(text).catch(() => {
    warnOnlineFallback()
    return guardedSystemUtter(text, opts)
  })
}

/** 朗读一段德语文本；resolve 在朗读结束/取消时触发。
 *  没有可用德语语音时拒绝发声并提示——绝不用错误语言的嗓音读德语。 */
export function speak(
  text: string,
  opts: { rate?: number; voiceURI?: string } = {},
): Promise<void> {
  if (!text.trim()) return Promise.resolve()
  const source = useStore.getState().settings.ttsSource
  if (source !== 'system') {
    stopSpeaking() // 取消当前播放，并使正在进行的序列作废
    return utterAny(text, opts)
  }
  if (!ttsSupported()) return Promise.resolve()
  if (!voices.length) refreshVoices()
  const v = resolveVoice(opts.voiceURI ?? '')
  if (!v) {
    warnNoGermanVoice()
    return Promise.resolve()
  }
  stopSpeaking() // 取消当前播放，并使正在进行的序列作废
  return utterAny(text, opts)
}

/** 顺序朗读多段文本（整列表连读 / 字母拼写 / 数字串），可随时 stopAll。
 *  修复：曾在此循环内调用 speak()，其 stopSpeaking() 会递增令牌导致
 *  序列读完美第一项就中止——只有装了德语语音的环境才会触发。 */
export async function speakSequence(
  texts: string[],
  opts: { rate?: number; voiceURI?: string; gapMs?: number; onIndex?: (i: number) => void } = {},
): Promise<void> {
  if (texts.length === 0) return
  if (useStore.getState().settings.ttsSource === 'system') {
    if (!ttsSupported()) return
    if (!voices.length) refreshVoices()
    if (!resolveVoice(opts.voiceURI ?? '')) {
      warnNoGermanVoice()
      return Promise.resolve()
    }
  }
  stopSpeaking() // 先取消旧播放，令牌自增使旧序列作废
  const my = token
  for (let i = 0; i < texts.length; i++) {
    if (my !== token) return
    opts.onIndex?.(i)
    await utterAny(texts[i], opts)
    if (my !== token) return
    if (opts.gapMs && i < texts.length - 1) await new Promise((r) => setTimeout(r, opts.gapMs))
  }
}
