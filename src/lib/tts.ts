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

/** Android Chrome 把语言码写成 de_DE；统一成 de-de 再比较 */
function normLang(lang?: string): string {
  return (lang || '').replace(/_/g, '-').toLowerCase()
}

function bcp47(lang?: string): string {
  const n = normLang(lang)
  if (!n) return 'de-DE'
  const [language, region] = n.split('-')
  return region ? `${language}-${region.toUpperCase()}` : language
}

function pickGerman(): VoicePick {
  const de = voices.filter((v) => normLang(v.lang).startsWith('de'))
  if (de.length === 0) return null
  // 优先 Google / Microsoft 的在线高音质语音，其次任何 de-DE
  return (
    de.find((v) => /google/i.test(v.name) && normLang(v.lang) === 'de-de') ??
    de.find((v) => /google|microsoft|deutsch/i.test(v.name)) ??
    de.find((v) => normLang(v.lang) === 'de-de') ??
    de[0]
  )
}

/**
 * 手机浏览器（iOS Safari / 主屏 Chrome，以及 Android Chrome）。
 * iPadOS 13+ 的 UA 伪装成 Mac，用触点数量识别。
 */
export function isMobileSpeechDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/Android/i.test(ua)) return true
  if (/iPhone|iPad|iPod/i.test(ua)) return true
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/iPhone|iPad|iPod/i.test(ua)) return true
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

/** 初始化语音列表；voiceschanged 在部分浏览器上异步触发 */
let mobileVoicePull: (() => void) | null = null
let mobileVoiceWatchStarted = false
export function initVoices(onUpdate?: (voices: SpeechSynthesisVoice[]) => void): void {
  if (!ttsSupported()) return
  const load = () => {
    voices = window.speechSynthesis.getVoices()
    preferred = pickGerman()
    onUpdate?.(germanVoices())
  }
  load()
  window.speechSynthesis.onvoiceschanged = load
  // Android 的语音列表常常要过一会儿才到；在用户点击前先刷一次，
  // 这样朗读按钮的同步路径能选中德语嗓音。
  if (isMobileSpeechDevice()) {
    mobileVoicePull = load
    if (!mobileVoiceWatchStarted) {
      mobileVoiceWatchStarted = true
      const pull = () => mobileVoicePull?.()
      window.addEventListener('touchend', pull, { capture: true, passive: true })
      window.addEventListener('click', pull, { capture: true })
      let tries = 0
      const id = window.setInterval(() => {
        pull()
        if (++tries >= 12 || germanVoices().length > 0) window.clearInterval(id)
      }, 300)
    }
  }
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

// ─── 手机：iOS Safari / Android Chrome ──────────────────────────────────
// 点击朗读在手机上没声音，有三层原因，桌面路径刻意不走这里：
// 1. 每次 speak() 都先 speechSynthesis.cancel()。Safari 会丢掉紧跟在
//    cancel() 后面的那条 utterance，所以 iOS 上点了也是静音（即使装了 Anna）。
// 2. 没有德语系统语音时直接 return。手机通常没装德语语音包，于是永远不发声，
//    提示还是 Windows 的安装步骤。
// 3. iOS 要求 speak()/audio.play() 发生在点击事件的同一次调用栈里；
//    <audio> 还必须在文档中且带 playsinline，否则 play() 被自动播放策略拒绝。

let heldUtterances: SpeechSynthesisUtterance[] = []
let mobileAudio: HTMLAudioElement | null = null
let mobileAudioGen = 0
let settleMobileAudio: (() => void) | null = null
let warnedMobileDown = false

function warnMobileSpeechFailed(): void {
  if (warnedMobileDown) return
  warnedMobileDown = true
  useStore.getState().pushToast({
    kind: 'goal',
    title: '手机上暂时没有声音',
    desc: '没有可用的德语系统语音，在线发音也没能播放。请检查网络，或在系统里下载德语语音后再试。',
  })
}

/** 本次点击里重新取语音对象。iOS 会拒绝过期的 voice 引用。 */
function germanVoiceFor(voiceURI?: string): SpeechSynthesisVoice | null {
  if (!ttsSupported()) return null
  const list = window.speechSynthesis.getVoices()
  if (list.length > 0) {
    voices = list
    preferred = pickGerman()
  }
  const de = list.filter((v) => normLang(v.lang).startsWith('de'))
  if (voiceURI) {
    const chosen = de.find((v) => v.voiceURI === voiceURI)
    if (chosen) return chosen
  }
  // 手机上优先本地语音：Android 的网络嗓音经常在离线或第一次点击时不起声
  const local = de.filter((v) => v.localService)
  const pool = local.length > 0 ? local : de
  return pool.find((v) => normLang(v.lang) === 'de-de') ?? pool[0] ?? null
}

function ensureMobileAudio(): HTMLAudioElement {
  if (mobileAudio?.isConnected) return mobileAudio
  const el = document.createElement('audio')
  el.preload = 'auto'
  const media = el as HTMLAudioElement & { playsInline?: boolean; referrerPolicy?: string }
  media.playsInline = true
  el.setAttribute('playsinline', 'true')
  el.setAttribute('webkit-playsinline', 'true')
  // Google 翻译 TTS 看到 Referer 会 404。媒体元素默认带上页面来源，必须关掉。
  media.referrerPolicy = 'no-referrer'
  el.setAttribute('referrerpolicy', 'no-referrer')
  // display:none / hidden 在 iOS 上会导致 play() 被静默忽略
  el.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;'
  document.body.appendChild(el)
  mobileAudio = el
  return el
}

function stopMobileAudio(): void {
  mobileAudioGen++
  const settle = settleMobileAudio
  settleMobileAudio = null
  if (settle) settle()
  // 只暂停，不 load()/清空 src。iOS 上 load() 会打断同一次点击里紧接着的 play()。
  if (mobileAudio) mobileAudio.pause()
}

/** 作废进行中的序列和在线音频，但不 cancel 语音引擎——空队列上的 cancel() 会让紧接着的 speak() 在 Safari 里丢失 */
function armNewSpeech(): number {
  token++
  stopAudio()
  stopMobileAudio()
  return token
}

function clampPlayback(rate?: number): number {
  if (rate == null || Number.isNaN(rate)) return 1
  return Math.min(2, Math.max(0.5, rate))
}

/** Google 翻译 TTS 的查询大约到 200 字就失败，按词切短 */
function googleChunks(text: string): string[] {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= 180) return [clean]
  const parts: string[] = []
  let rest = clean
  while (rest.length > 180) {
    let cut = rest.lastIndexOf(' ', 180)
    if (cut < 40) cut = 180
    parts.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut).trim()
  }
  if (rest) parts.push(rest)
  return parts.filter(Boolean)
}

/**
 * 在当前调用栈里对共享 <audio> 调用 play()。
 * 第一段必须同步开播，iOS 才承认这是用户手势。
 */
function playMobileOnline(
  text: string,
  rate: number | undefined,
  my: number,
  source: 'polly' | 'google',
): Promise<void> {
  if (my !== token) return Promise.resolve()
  if (typeof document === 'undefined' || !document.body) return Promise.reject(new Error('no document'))
  const settings = useStore.getState().settings
  const chunks = source === 'google' ? googleChunks(text) : [text.trim()]
  const el = ensureMobileAudio()
  const playback = clampPlayback(rate)
  try {
    el.preservesPitch = true
  } catch {
    /* ignore */
  }

  const playChunk = (chunk: string): Promise<void> => {
    if (my !== token) return Promise.resolve()
    const gen = ++mobileAudioGen
    const url = onlineUrl(chunk, source, settings.onlineVoice)
    el.pause()
    el.src = url
    const applyRate = () => {
      try {
        el.playbackRate = playback
      } catch {
        /* iOS 在元数据到达前可能拒绝 */
      }
    }
    applyRate()
    el.addEventListener('loadedmetadata', applyRate)
    let playResult: Promise<void> | undefined
    try {
      const started = el.play()
      if (started) playResult = started.then(() => applyRate())
    } catch (err) {
      el.removeEventListener('loadedmetadata', applyRate)
      return Promise.reject(err instanceof Error ? err : new Error('online tts failed'))
    }
    return new Promise((resolve, reject) => {
      let settled = false
      const cleanup = () => {
        el.removeEventListener('loadedmetadata', applyRate)
        el.onended = null
        el.onerror = null
        if (settleMobileAudio === finishOk) settleMobileAudio = null
      }
      const finishOk = () => {
        if (settled) return
        settled = true
        cleanup()
        resolve()
      }
      const finishErr = (error: Error) => {
        if (settled) return
        settled = true
        cleanup()
        reject(error)
      }
      settleMobileAudio = finishOk
      el.onended = () => {
        if (gen !== mobileAudioGen || my !== token) finishOk()
        else finishOk()
      }
      el.onerror = () => finishErr(new Error('online tts failed'))
      playResult?.catch((err) => finishErr(err instanceof Error ? err : new Error('online tts failed')))
      window.setTimeout(() => {
        if (!settled && gen === mobileAudioGen && el.readyState < 2) finishErr(new Error('online tts timeout'))
      }, 10000)
    })
  }

  const first = playChunk(chunks[0] || text)
  if (chunks.length <= 1) return first
  return first.then(async () => {
    for (let i = 1; i < chunks.length; i++) {
      if (my !== token) return
      await playChunk(chunks[i])
    }
  })
}

function utterMobileSystem(
  text: string,
  opts: { rate?: number; voiceURI?: string },
  my: number,
): Promise<void> {
  return new Promise((resolve) => {
    if (!ttsSupported() || my !== token) {
      resolve()
      return
    }
    const synth = window.speechSynthesis
    const voice = germanVoiceFor(opts.voiceURI)
    const u = new SpeechSynthesisUtterance(text)
    heldUtterances.push(u)
    if (heldUtterances.length > 6) heldUtterances.splice(0, heldUtterances.length - 6)
    if (voice) {
      u.lang = bcp47(voice.lang)
      try {
        u.voice = voice
        // 老版本 Android 认 utterance.voiceURI；iOS 设了它有时反而不出声
        if (!isIOSDevice()) {
          ;(u as SpeechSynthesisUtterance & { voiceURI?: string }).voiceURI = voice.voiceURI
        }
      } catch {
        // 个别环境拒绝这个 voice 对象。语言已经设成德语，继续朗读，不要让点击抛错变成静音。
      }
    } else {
      u.lang = 'de-DE'
    }
    u.rate = opts.rate ?? 1

    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      resolve()
    }
    u.onend = finish
    u.onerror = finish

    const kick = () => {
      if (my !== token) return finish()
      try {
        synth.speak(u)
        // resume 只能放在 speak 之后。空队列上先 resume() 会让 iOS 丢掉下一条。
        if (synth.paused) synth.resume()
      } catch {
        finish()
      }
    }

    const busy = synth.speaking || synth.pending
    if (!busy) {
      // 没在读就不要 cancel()。Safari 会吞掉紧跟 cancel 的 speak()，点一下完全没声音。
      kick()
    } else if (isIOSDevice()) {
      synth.cancel()
      // 同一轮里 cancel 之后的第一条会被丢掉，第二条才出声。
      const decoy = new SpeechSynthesisUtterance('\u00a0')
      decoy.volume = 0
      decoy.rate = 2
      decoy.lang = u.lang
      if (voice) decoy.voice = voice
      heldUtterances.push(decoy)
      synth.speak(decoy)
      synth.speak(u)
      if (synth.paused) synth.resume()
    } else {
      // Android Chrome：cancel() 后立刻 speak() 会被忽略，挪到下一个任务。
      synth.cancel()
      window.setTimeout(kick, 80)
    }

    window.setTimeout(finish, Math.min(15000, 4000 + text.length * 120))
  })
}

async function utterOnMobile(
  text: string,
  opts: { rate?: number; voiceURI?: string },
  my: number,
): Promise<void> {
  if (!text.trim() || my !== token) return
  const source = useStore.getState().settings.ttsSource
  const voice = source === 'system' && ttsSupported() ? germanVoiceFor(opts.voiceURI) : null

  if (source === 'system' && voice) {
    await utterMobileSystem(text, opts, my)
    return
  }

  // 没有德语系统语音，或用户选了在线源：在这次点击里直接 play()。
  // 系统源回落用 Google。StreamElements Polly 对多数词句返回 401，不能当手机上的唯一出路。
  const primary: 'polly' | 'google' = source === 'polly' ? 'polly' : 'google'
  const secondary: 'polly' | 'google' = primary === 'google' ? 'polly' : 'google'
  if (ttsSupported() && (window.speechSynthesis.speaking || window.speechSynthesis.pending)) {
    window.speechSynthesis.cancel()
  }
  try {
    await playMobileOnline(text, opts.rate, my, primary)
    return
  } catch {
    if (my !== token) return
    try {
      await playMobileOnline(text, opts.rate, my, secondary)
      return
    } catch {
      if (my !== token) return
      const lateVoice = ttsSupported() ? germanVoiceFor(opts.voiceURI) : null
      if (lateVoice) {
        await utterMobileSystem(text, opts, my)
        return
      }
      warnMobileSpeechFailed()
    }
  }
}

function speakOnMobile(text: string, opts: { rate?: number; voiceURI?: string }): Promise<void> {
  const my = armNewSpeech()
  return utterOnMobile(text, opts, my)
}

async function speakSequenceOnMobile(
  texts: string[],
  opts: { rate?: number; voiceURI?: string; gapMs?: number; onIndex?: (i: number) => void },
): Promise<void> {
  if (texts.length === 0) return
  const my = armNewSpeech()
  for (let i = 0; i < texts.length; i++) {
    if (my !== token) return
    opts.onIndex?.(i)
    await utterOnMobile(texts[i], opts, my)
    if (my !== token) return
    if (opts.gapMs && i < texts.length - 1) await new Promise((r) => setTimeout(r, opts.gapMs))
  }
}

/**
 * 在进入「会自动朗读」的界面之前调用（点击开始的那个处理函数里）。
 * iOS 只有在用户手势里真正调用过 speak() 之后，才允许后面 useEffect 里的朗读。
 */
export function unlockMobileSpeech(): void {
  if (!isIOSDevice() || !ttsSupported()) return
  const synth = window.speechSynthesis
  if (synth.speaking || synth.pending) return
  const u = new SpeechSynthesisUtterance(' ')
  u.volume = 0
  u.rate = 2
  u.lang = 'de-DE'
  const voice = germanVoiceFor()
  if (voice) {
    u.voice = voice
    u.lang = bcp47(voice.lang)
  }
  heldUtterances.push(u)
  synth.speak(u)
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
  stopMobileAudio()
  heldUtterances = []
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
  // 手机走独立路径：同步开声、无语音时改播在线音频。桌面逻辑保持原样。
  if (isMobileSpeechDevice()) return speakOnMobile(text, opts)
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
  if (isMobileSpeechDevice()) {
    await speakSequenceOnMobile(texts, opts)
    return
  }
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
