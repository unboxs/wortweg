// 发音代理自检：密钥只出现在上游请求里，浏览器拿到的是本站音频响应。
import { proxyTtsPath, voiceForSource } from '../functions/tts-contract.ts'
import { handleTtsRequest, type TtsEnv } from '../functions/tts-handler.ts'

const VOICERSS_KEY = 'secret-voicerss-key'
const ELEVEN_KEY = 'secret-eleven-key'
const LILY = 'pFZP5JQG7iQjIQuC4Bku'
const DANIEL = 'onwK4e9ZLuTAKqWW03F9'

let fail = 0
function check(cond: boolean, message: string): void {
  if (cond) return
  fail++
  console.error(`FAIL  ${message}`)
}

function mp3(): Uint8Array {
  const bytes = new Uint8Array(96)
  bytes[0] = 0xff
  bytes[1] = 0xfb
  return bytes
}

function headerOf(init: RequestInit | undefined, name: string): string | null {
  const headers = init?.headers
  if (!headers) return null
  if (headers instanceof Headers) return headers.get(name)
  if (Array.isArray(headers)) {
    const found = headers.find(([key]) => key.toLowerCase() === name.toLowerCase())
    return found ? found[1] : null
  }
  const record = headers as Record<string, string>
  return record[name] ?? record[name.toLowerCase()] ?? null
}

interface Call {
  url: string
  init?: RequestInit
}

async function withFetch(handler: (calls: Call[]) => Promise<Response> | Response, run: () => Promise<void>): Promise<void> {
  const calls: Call[] = []
  const original = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    calls.push({ url, init })
    const response = await handler(calls)
    return response
  }
  try {
    await run()
  } finally {
    globalThis.fetch = original
  }
}

function request(path: string, headers?: Record<string, string>): Request {
  return new Request(`https://wortweg.pages.dev${path}`, { headers })
}

async function bodyText(response: Response): Promise<string> {
  return response.text()
}

async function main(): Promise<void> {
  check(voiceForSource('voicerss', 'Vicki') === 'Hanna', 'VoiceRSS 未知音色应回落到 Hanna')
  check(voiceForSource('elevenlabs', 'Hanna') === 'Lily', 'ElevenLabs 未知音色应回落到 Lily')
  const clientPath = proxyTtsPath('voicerss', 'Vicki', 'Guten Tag! Ich lerne gern Deutsch.')
  check(clientPath.startsWith('/api/tts?'), '浏览器地址应是本站 /api/tts')
  check(clientPath.includes('source=voicerss') && clientPath.includes('voice=Hanna'), '代理地址带上来源和音色')
  check(!clientPath.includes('voicerss.org') && !clientPath.includes('elevenlabs') && !clientPath.includes('key='), '浏览器地址不含上游或密钥')

  const logs: string[] = []
  const originalLog = console.log
  console.log = (...args: unknown[]) => {
    logs.push(args.map((part) => String(part)).join(' '))
  }

  try {
    await withFetch(
      () => new Response(mp3(), { status: 200, headers: { 'content-type': 'application/octet-stream' } }),
      async () => {
        const response = await handleTtsRequest(
          request(clientPath, { 'sec-fetch-site': 'same-origin' }),
          { VOICERSS_API_KEY: VOICERSS_KEY },
        )
        check(response.status === 200, `VoiceRSS 成功应返回 200，实际 ${response.status}`)
        check(response.headers.get('content-type') === 'audio/mpeg', '成功响应应为 audio/mpeg')
        check(response.headers.get('cache-control')?.includes('public') === true, '成功音频应可缓存')
        const bytes = new Uint8Array(await response.arrayBuffer())
        check(bytes[0] === 0xff, '响应体应是音频字节')
      },
    )

    const voiceCalls: Call[] = []
    const original = globalThis.fetch
    globalThis.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      voiceCalls.push({ url, init })
      return new Response(mp3(), { status: 200 })
    }
    const spoken = request('/api/tts?source=voicerss&voice=Lina&text=Hallo', { 'sec-fetch-site': 'same-origin' })
    await handleTtsRequest(spoken, { VOICERSS_API_KEY: VOICERSS_KEY })
    globalThis.fetch = original
    check(voiceCalls.length === 1, 'VoiceRSS 应只请求一次上游')
    check(voiceCalls[0]?.url === 'https://api.voicerss.org/', 'VoiceRSS 上游应是 api.voicerss.org')
    const form = voiceCalls[0]?.init?.body
    check(form instanceof URLSearchParams, 'VoiceRSS 密钥应放在 POST 表单，而不是 URL')
    if (form instanceof URLSearchParams) {
      check(form.get('key') === VOICERSS_KEY, 'VoiceRSS 表单带上密钥')
      check(form.get('hl') === 'de-de' && form.get('v') === 'Lina', 'VoiceRSS 使用 de-de 与所选音色')
      check(form.get('c') === 'MP3' && form.get('ssml') === 'false', 'VoiceRSS 输出 MP3 且关闭 SSML')
      check(form.get('src') === 'Hallo', 'VoiceRSS 文本原样传递')
    }
    check(!voiceCalls[0]?.url.includes(VOICERSS_KEY), 'VoiceRSS 密钥不应出现在上游 URL')

    await withFetch(
      () => new Response(`ERROR: The API key is wrong ${VOICERSS_KEY}`, { status: 200, headers: { 'content-type': 'text/plain' } }),
      async () => {
        const response = await handleTtsRequest(
          request('/api/tts?source=voicerss&voice=Jonas&text=Hallo'),
          { VOICERSS_API_KEY: VOICERSS_KEY },
        )
        const text = await bodyText(response)
        check(response.status === 502, 'VoiceRSS 的 ERROR 正文应变成失败')
        check(!text.includes(VOICERSS_KEY), '失败响应不能回显密钥')
      },
    )

    const missing = await handleTtsRequest(request('/api/tts?source=voicerss&voice=Hanna&text=Hallo'), {})
    const missingText = await bodyText(missing)
    check(missing.status === 503, '没有 VoiceRSS 密钥应返回 503')
    check(missingText.includes('VOICERSS_API_KEY'), '503 应指出要配置的变量名')
    check(!missingText.includes(VOICERSS_KEY), '503 不能带密钥')

    const blocked = await handleTtsRequest(
      request('/api/tts?source=voicerss&voice=Hanna&text=Hallo', { 'sec-fetch-site': 'cross-site' }),
      { VOICERSS_API_KEY: VOICERSS_KEY },
    )
    check(blocked.status === 403, '跨站引用应被拒绝')

    const tooLong = 'a'.repeat(301)
    const longResponse = await handleTtsRequest(
      request(`/api/tts?source=elevenlabs&voice=Lily&text=${tooLong}`),
      { ELEVENLABS_API_KEY: ELEVEN_KEY },
    )
    check(longResponse.status === 400, '超长文本应被拒绝')

    const badVoice = await handleTtsRequest(
      request('/api/tts?source=elevenlabs&voice=Hanna&text=Hallo'),
      { ELEVENLABS_API_KEY: ELEVEN_KEY },
    )
    check(badVoice.status === 400, '不属于该来源的音色应被拒绝')

    const posted = await handleTtsRequest(
      new Request('https://wortweg.pages.dev/api/tts?source=voicerss&voice=Hanna&text=Hallo', { method: 'POST' }),
      { VOICERSS_API_KEY: VOICERSS_KEY },
    )
    check(posted.status === 405, '只接受 GET，方便 audio 元素直接播放')

    const elevenCalls: Call[] = []
    globalThis.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      elevenCalls.push({ url, init })
      return new Response(mp3(), { status: 200, headers: { 'content-type': 'audio/mpeg' } })
    }
    const elevenPath = proxyTtsPath('elevenlabs', 'Daniel', 'schön')
    const elevenResponse = await handleTtsRequest(request(elevenPath, { 'sec-fetch-site': 'same-origin' }), {
      ELEVENLABS_API_KEY: ELEVEN_KEY,
    })
    globalThis.fetch = original
    check(elevenResponse.status === 200, 'ElevenLabs 成功应返回音频')
    check(elevenCalls.length === 1, 'ElevenLabs 正常路径只请求一次')
    check(elevenCalls[0]?.url === `https://api.elevenlabs.io/v1/text-to-speech/${DANIEL}`, 'ElevenLabs 使用 Daniel 的预置音色')
    check(headerOf(elevenCalls[0]?.init, 'xi-api-key') === ELEVEN_KEY, 'ElevenLabs 密钥只放在请求头')
    const payload = JSON.parse(String(elevenCalls[0]?.init?.body)) as {
      text?: string
      model_id?: string
      language_code?: string
    }
    check(payload.text === 'schön', '德语字符应原样送到 ElevenLabs')
    check(payload.model_id === 'eleven_flash_v2_5', '默认使用 flash v2.5，省免费额度')
    check(payload.language_code === 'de', '应指定德语')
    check(!String(elevenCalls[0]?.init?.body).includes(ELEVEN_KEY), '密钥不应出现在 JSON 正文')

    const overrideId = 'AccountVoice12345678'
    const overrideCalls: Call[] = []
    globalThis.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      overrideCalls.push({ url, init })
      return new Response(mp3(), { status: 200 })
    }
    await handleTtsRequest(request('/api/tts?source=elevenlabs&voice=Lily&text=Hallo'), {
      ELEVENLABS_API_KEY: ELEVEN_KEY,
      ELEVENLABS_VOICE_LILY: overrideId,
    })
    globalThis.fetch = original
    check(overrideCalls[0]?.url.endsWith(`/${overrideId}`), '音色覆盖应使用环境变量里的 voice id')

    const ignoredCalls: Call[] = []
    globalThis.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      ignoredCalls.push({ url, init })
      return new Response(mp3(), { status: 200 })
    }
    await handleTtsRequest(request('/api/tts?source=elevenlabs&voice=Lily&text=Hallo'), {
      ELEVENLABS_API_KEY: ELEVEN_KEY,
      ELEVENLABS_VOICE_LILY: ELEVEN_KEY,
    })
    globalThis.fetch = original
    check(ignoredCalls[0]?.url.endsWith(`/${LILY}`), '把 API key 误填进音色变量时必须忽略')

    let elevenAttempt = 0
    globalThis.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      elevenAttempt++
      if (url.includes('/v1/voices')) {
        return new Response(JSON.stringify({ voices: [{ voice_id: overrideId, name: 'Mila' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      if (elevenAttempt === 1) {
        return new Response(JSON.stringify({ detail: { status: 'voice_not_found' } }), { status: 404 })
      }
      check(url.endsWith(`/${overrideId}`), '预置音色不存在时应改用账号里的音色')
      const body = JSON.parse(String(init?.body)) as { model_id?: string }
      check(body.model_id === 'eleven_flash_v2_5', '换音色后仍先用 flash')
      return new Response(mp3(), { status: 200 })
    }
    const fallback = await handleTtsRequest(request('/api/tts?source=elevenlabs&voice=Lily&text=Hallo'), {
      ELEVENLABS_API_KEY: ELEVEN_KEY,
    })
    globalThis.fetch = original
    check(fallback.status === 200, '账号音色回落后应返回音频')
    const fallbackText = await bodyText(fallback.clone())
    check(!fallbackText.includes(ELEVEN_KEY), '回落成功的响应不含密钥')

    let modelAttempt = 0
    globalThis.fetch = async (_input, init) => {
      modelAttempt++
      if (modelAttempt === 1) return new Response('{"detail":"invalid model"}', { status: 400 })
      const body = JSON.parse(String(init?.body)) as { model_id?: string; language_code?: string }
      check(body.model_id === 'eleven_multilingual_v2', 'flash 被拒绝后改用 multilingual v2')
      check(body.language_code === undefined, 'multilingual v2 不带 language_code')
      return new Response(mp3(), { status: 200 })
    }
    const modelFallback = await handleTtsRequest(request('/api/tts?source=elevenlabs&voice=Charlotte&text=Hallo'), {
      ELEVENLABS_API_KEY: ELEVEN_KEY,
    })
    globalThis.fetch = original
    check(modelFallback.status === 200, '模型回落后应返回音频')
    check(modelAttempt === 2, '模型回落只再请求一次')

    let authAttempt = 0
    globalThis.fetch = async () => {
      authAttempt++
      return new Response(`{"detail":"invalid ${ELEVEN_KEY}"}`, { status: 401 })
    }
    const unauthorized = await handleTtsRequest(request('/api/tts?source=elevenlabs&voice=Lily&text=Hallo'), {
      ELEVENLABS_API_KEY: ELEVEN_KEY,
    })
    globalThis.fetch = original
    const unauthorizedText = await bodyText(unauthorized)
    check(unauthorized.status === 502, '上游拒绝凭证时应失败')
    check(authAttempt === 1, '401 不应继续重试烧额度')
    check(!unauthorizedText.includes(ELEVEN_KEY), '401 响应不能回显密钥')

    const store = new Map<string, Response>()
    const puts: string[] = []
    const cachesGlobal = globalThis as { caches?: { default: Cache } }
    cachesGlobal.caches = {
      default: {
        match: async (key: RequestInfo | URL) => {
          const url = key instanceof Request ? key.url : String(key)
          return store.get(url)?.clone()
        },
        put: async (key: RequestInfo | URL, response: Response) => {
          const url = key instanceof Request ? key.url : String(key)
          puts.push(url)
          store.set(url, response.clone())
        },
      } as Cache,
    }
    let cachedFetches = 0
    globalThis.fetch = async () => {
      cachedFetches++
      return new Response(mp3(), { status: 200 })
    }
    const env: TtsEnv = { VOICERSS_API_KEY: VOICERSS_KEY }
    const cachePath = '/api/tts?source=voicerss&voice=Hanna&text=Danke'
    const first = await handleTtsRequest(request(cachePath), env)
    const second = await handleTtsRequest(request(cachePath), env)
    globalThis.fetch = original
    delete cachesGlobal.caches
    check(first.status === 200 && second.status === 200, '缓存命中仍返回音频')
    check(cachedFetches === 1, '相同文本第二次不应再打上游')
    check(puts.length === 1 && !puts[0].includes(VOICERSS_KEY), '缓存键不能包含密钥')
    check(!puts[0].includes('voicerss.org'), '缓存键应是本站地址')
  } finally {
    console.log = originalLog
  }

  const leaked = logs.filter((line) => line.includes(VOICERSS_KEY) || line.includes(ELEVEN_KEY))
  check(leaked.length === 0, '日志不能包含密钥')

  if (fail === 0) console.log('发音代理检查通过')
  else console.error(`${fail} 项失败`)
  process.exit(fail ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
