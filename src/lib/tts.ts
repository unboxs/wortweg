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
    desc: 'Windows：设置 → 时间和语言 → 添加德语（勾选语音包）后重启浏览器；或改用 Edge',
  })
}

export function stopSpeaking(): void {
  if (!ttsSupported()) return
  token++
  window.speechSynthesis.cancel()
}

/** 发出一条话语并等待结束：纯排队，不取消、不动令牌（序列内部复用） */
function utter(text: string, opts: { rate?: number; voiceURI?: string }): Promise<void> {
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

/** 朗读一段德语文本；resolve 在朗读结束/取消时触发。
 *  没有可用德语语音时拒绝发声并提示安装——绝不用错误语言的嗓音读德语。 */
export function speak(
  text: string,
  opts: { rate?: number; voiceURI?: string } = {},
): Promise<void> {
  if (!ttsSupported() || !text.trim()) return Promise.resolve()
  if (!voices.length) refreshVoices()
  const v = resolveVoice(opts.voiceURI ?? '')
  if (!v) {
    warnNoGermanVoice()
    return Promise.resolve()
  }
  stopSpeaking() // 取消当前播放，并使正在进行的序列作废
  return utter(text, opts)
}

/** 顺序朗读多段文本（整列表连读 / 字母拼写 / 数字串），可随时 stopAll。
 *  修复：曾在此循环内调用 speak()，其 stopSpeaking() 会递增令牌导致
 *  序列读完美第一项就中止——只有装了德语语音的环境才会触发。 */
export async function speakSequence(
  texts: string[],
  opts: { rate?: number; voiceURI?: string; gapMs?: number; onIndex?: (i: number) => void } = {},
): Promise<void> {
  if (!ttsSupported() || texts.length === 0) return
  if (!voices.length) refreshVoices()
  const v = resolveVoice(opts.voiceURI ?? '')
  if (!v) {
    warnNoGermanVoice()
    return Promise.resolve()
  }
  stopSpeaking() // 先取消旧播放，令牌自增使旧序列作废
  const my = token
  for (let i = 0; i < texts.length; i++) {
    if (my !== token) return
    opts.onIndex?.(i)
    await utter(texts[i], opts)
    if (my !== token) return
    if (opts.gapMs && i < texts.length - 1) await new Promise((r) => setTimeout(r, opts.gapMs))
  }
}
