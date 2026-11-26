/**
 * Cloudflare Pages Function core for German pronunciation.
 * API keys are read only from the environment (Pages secrets / .dev.vars).
 * This module never embeds a key and never redirects the browser to the upstream URL.
 */
import {
  ELEVEN_VOICES,
  TTS_TEXT_MAX,
  VOICERSS_VOICES,
  cleanTtsText,
  isProxySource,
  type ElevenVoice,
  type ProxySource,
} from './tts-contract.ts'

export interface TtsEnv {
  VOICERSS_API_KEY?: string
  ELEVENLABS_API_KEY?: string
  /** Optional voice-id overrides when the account cannot use the premade defaults. */
  ELEVENLABS_VOICE_LILY?: string
  ELEVENLABS_VOICE_CHARLOTTE?: string
  ELEVENLABS_VOICE_DANIEL?: string
}

const ELEVEN_DEFAULT_IDS: Record<ElevenVoice, string> = {
  Lily: 'pFZP5JQG7iQjIQuC4Bku',
  Charlotte: 'XB0fDUnXU5powFXDhCwa',
  Daniel: 'onwK4e9ZLuTAKqWW03F9',
}

const VOICE_ID = /^[A-Za-z0-9]{16,32}$/
const AUDIO_MAX_BYTES = 1_500_000

/** Older Pages compatibility dates may not have AbortSignal.timeout. Playback still works without it. */
function timeoutSignal(ms: number): AbortSignal | undefined {
  const timeout = (AbortSignal as { timeout?: (n: number) => AbortSignal }).timeout
  if (typeof timeout !== 'function') return undefined
  return timeout(ms)
}

interface Parsed {
  source: ProxySource
  voice: string
  text: string
}

interface EdgeCache {
  match(request: Request): Promise<Response | undefined>
  put(request: Request, response: Response): Promise<void>
}

type Upstream =
  | { ok: true; bytes: Uint8Array; contentType: string }
  | { ok: false; response: Response }

function json(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}

function redact(message: string, secrets: Array<string | undefined>): string {
  let out = message
  for (const secret of secrets) {
    if (secret) out = out.split(secret).join('[redacted]')
  }
  return out.slice(0, 180)
}

function logError(source: string, status: number, message: string, secrets: Array<string | undefined>): void {
  console.log(
    JSON.stringify({
      event: 'tts_proxy_error',
      source,
      status,
      message: redact(message, secrets),
    }),
  )
}

function fail(
  status: number,
  source: string,
  message: string,
  secrets: Array<string | undefined>,
  publicError: string,
): Upstream {
  logError(source, status, message, secrets)
  return { ok: false, response: json(status, publicError) }
}

function inList(list: readonly string[], value: string): boolean {
  return list.includes(value)
}

function parseRequest(request: Request): { ok: true; value: Parsed } | { ok: false; response: Response } {
  let url: URL
  try {
    url = new URL(request.url)
  } catch {
    return { ok: false, response: json(400, 'bad url') }
  }
  const source = url.searchParams.get('source') ?? ''
  const voice = url.searchParams.get('voice') ?? ''
  const text = cleanTtsText(url.searchParams.get('text') ?? '')
  if (!isProxySource(source)) return { ok: false, response: json(400, 'unknown source') }
  if (source === 'voicerss' && !inList(VOICERSS_VOICES, voice))
    return { ok: false, response: json(400, 'unknown voice') }
  if (source === 'elevenlabs' && !inList(ELEVEN_VOICES, voice))
    return { ok: false, response: json(400, 'unknown voice') }
  if (!text) return { ok: false, response: json(400, 'empty text') }
  if (text.length > TTS_TEXT_MAX) return { ok: false, response: json(400, 'text too long') }
  return { ok: true, value: { source, voice, text } }
}

function edgeCache(): EdgeCache | null {
  const store = (globalThis as { caches?: { default?: Cache } }).caches?.default
  if (!store) return null
  return {
    match: async (request) => (await store.match(request)) ?? undefined,
    put: (request, response) => store.put(request, response),
  }
}

function cacheRequest(request: Request, parsed: Parsed): Request {
  const url = new URL(request.url)
  const canonical = new URL(url.origin + url.pathname)
  canonical.searchParams.set('source', parsed.source)
  canonical.searchParams.set('voice', parsed.voice)
  canonical.searchParams.set('text', parsed.text)
  return new Request(canonical.toString(), { method: 'GET' })
}

async function readLimited(response: Response, max: number): Promise<Uint8Array | null> {
  const declared = Number(response.headers.get('content-length') ?? '')
  if (Number.isFinite(declared) && declared > max) return null
  if (!response.body) {
    const buf = new Uint8Array(await response.arrayBuffer())
    return buf.byteLength > max ? null : buf
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    total += value.byteLength
    if (total > max) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

/** Accept real audio. VoiceRSS reports failures as a 200 body that starts with "ERROR". */
export function sniffAudio(bytes: Uint8Array, headerType: string | null): string | null {
  if (bytes.byteLength < 32) return null
  const head = new TextDecoder().decode(bytes.slice(0, 12))
  if (head.startsWith('ERROR') || head.startsWith('{') || head.startsWith('<!') || head.startsWith('<h'))
    return null
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return 'audio/mpeg'
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return 'audio/mpeg'
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return 'audio/wav'
  if (bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) return 'audio/ogg'
  const type = (headerType ?? '').split(';')[0].trim().toLowerCase()
  if (type.startsWith('audio/')) return type
  return null
}

function audioBody(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

function audioResponse(bytes: Uint8Array, contentType: string): Response {
  return new Response(audioBody(bytes), {
    status: 200,
    headers: {
      'content-type': contentType,
      'cache-control': 'public, max-age=604800',
      'x-content-type-options': 'nosniff',
    },
  })
}

async function synthesizeVoiceRss(parsed: Parsed, env: TtsEnv): Promise<Upstream> {
  const key = env.VOICERSS_API_KEY?.trim()
  if (!key) return fail(503, 'voicerss', 'VOICERSS_API_KEY is not configured', [], 'VOICERSS_API_KEY is not configured')
  const body = new URLSearchParams({
    key,
    hl: 'de-de',
    v: parsed.voice,
    src: parsed.text,
    c: 'MP3',
    f: '44khz_16bit_mono',
    r: '0',
    ssml: 'false',
    b64: 'false',
  })
  let upstream: Response
  try {
    upstream = await fetch('https://api.voicerss.org/', {
      method: 'POST',
      body,
      signal: timeoutSignal(9000),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'fetch failed'
    return fail(502, 'voicerss', message, [key], 'upstream speech failed')
  }
  const bytes = await readLimited(upstream, AUDIO_MAX_BYTES)
  if (!bytes) return fail(502, 'voicerss', 'upstream body too large', [key], 'upstream speech failed')
  const contentType = sniffAudio(bytes, upstream.headers.get('content-type'))
  if (!upstream.ok || !contentType) {
    const message = new TextDecoder().decode(bytes.slice(0, 180))
    return fail(502, 'voicerss', message || `upstream ${upstream.status}`, [key], 'upstream speech failed')
  }
  return { ok: true, bytes, contentType }
}

function elevenOverride(name: ElevenVoice, env: TtsEnv): string | undefined {
  if (name === 'Lily') return env.ELEVENLABS_VOICE_LILY
  if (name === 'Charlotte') return env.ELEVENLABS_VOICE_CHARLOTTE
  return env.ELEVENLABS_VOICE_DANIEL
}

function elevenVoiceId(name: ElevenVoice, env: TtsEnv): string {
  const override = elevenOverride(name, env)?.trim()
  const apiKey = env.ELEVENLABS_API_KEY?.trim()
  if (override && VOICE_ID.test(override) && override !== apiKey) return override
  return ELEVEN_DEFAULT_IDS[name]
}

type ElevenAttempt =
  | { kind: 'ok'; bytes: Uint8Array; contentType: string }
  | { kind: 'voice_missing' | 'model_rejected' | 'error'; status: number; message: string }

async function postEleven(
  text: string,
  voiceId: string,
  model: string,
  language: string | undefined,
  apiKey: string,
): Promise<ElevenAttempt> {
  const payload: {
    text: string
    model_id: string
    language_code?: string
    voice_settings: { stability: number; similarity_boost: number }
  } = {
    text,
    model_id: model,
    voice_settings: { stability: 0.55, similarity_boost: 0.8 },
  }
  if (language) payload.language_code = language
  let upstream: Response
  try {
    upstream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'content-type': 'application/json',
        accept: 'audio/mpeg',
      },
      body: JSON.stringify(payload),
      signal: timeoutSignal(9000),
    })
  } catch (err) {
    return { kind: 'error', status: 502, message: err instanceof Error ? err.message : 'fetch failed' }
  }
  if (upstream.status === 404) {
    const message = await upstream.text().catch(() => '')
    return { kind: 'voice_missing', status: 404, message: message.slice(0, 180) }
  }
  if (upstream.status === 400 || upstream.status === 422) {
    const message = await upstream.text().catch(() => '')
    return { kind: 'model_rejected', status: upstream.status, message: message.slice(0, 180) }
  }
  if (!upstream.ok) {
    const message = await upstream.text().catch(() => '')
    return { kind: 'error', status: upstream.status, message: message.slice(0, 180) || `upstream ${upstream.status}` }
  }
  const bytes = await readLimited(upstream, AUDIO_MAX_BYTES)
  if (!bytes) return { kind: 'error', status: 502, message: 'upstream body too large' }
  const contentType = sniffAudio(bytes, upstream.headers.get('content-type'))
  if (!contentType) {
    const message = new TextDecoder().decode(bytes.slice(0, 180))
    return { kind: 'error', status: 502, message: message || 'upstream did not return audio' }
  }
  return { kind: 'ok', bytes, contentType }
}

async function discoverVoice(apiKey: string, requested: string): Promise<string | null> {
  let upstream: Response
  try {
    upstream = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': apiKey, accept: 'application/json' },
      signal: timeoutSignal(9000),
    })
  } catch {
    return null
  }
  if (!upstream.ok) return null
  let data: { voices?: Array<{ voice_id?: string; name?: string }> }
  try {
    data = (await upstream.json()) as { voices?: Array<{ voice_id?: string; name?: string }> }
  } catch {
    return null
  }
  const voices = Array.isArray(data.voices) ? data.voices : []
  const valid = (id: string | undefined): id is string => !!id && VOICE_ID.test(id) && id !== apiKey
  const named = voices.find((v) => v.name?.toLowerCase() === requested.toLowerCase() && valid(v.voice_id))
  const first = voices.find((v) => valid(v.voice_id))
  return (named ?? first)?.voice_id ?? null
}

async function synthesizeEleven(parsed: Parsed, env: TtsEnv): Promise<Upstream> {
  const apiKey = env.ELEVENLABS_API_KEY?.trim()
  if (!apiKey)
    return fail(503, 'elevenlabs', 'ELEVENLABS_API_KEY is not configured', [], 'ELEVENLABS_API_KEY is not configured')
  const name = parsed.voice as ElevenVoice
  let voiceId = elevenVoiceId(name, env)
  let model = 'eleven_flash_v2_5'
  let language: string | undefined = 'de'
  let triedVoiceFallback = false
  let triedModelFallback = false
  let last: ElevenAttempt = { kind: 'error', status: 502, message: 'no attempt' }

  for (let attempt = 0; attempt < 3; attempt++) {
    last = await postEleven(parsed.text, voiceId, model, language, apiKey)
    if (last.kind === 'ok') return { ok: true, bytes: last.bytes, contentType: last.contentType }
    if (last.kind === 'voice_missing' && !triedVoiceFallback) {
      triedVoiceFallback = true
      const found = await discoverVoice(apiKey, parsed.voice)
      if (!found || found === voiceId) break
      voiceId = found
      continue
    }
    if (last.kind === 'model_rejected' && !triedModelFallback) {
      triedModelFallback = true
      model = 'eleven_multilingual_v2'
      language = undefined
      continue
    }
    break
  }

  return fail(502, 'elevenlabs', `upstream ${last.status}: ${last.message}`, [apiKey], 'upstream speech failed')
}

export async function handleTtsRequest(request: Request, env: TtsEnv = {}): Promise<Response> {
  if (request.method !== 'GET') return json(405, 'method not allowed')
  const site = request.headers.get('sec-fetch-site')
  if (site === 'cross-site') return json(403, 'cross-origin playback is not allowed')

  const parsed = parseRequest(request)
  if (!parsed.ok) return parsed.response

  const cache = edgeCache()
  const cacheKey = cacheRequest(request, parsed.value)
  if (cache) {
    try {
      const hit = await cache.match(cacheKey)
      if (hit) return hit
    } catch {
      /* a cache miss is not a playback failure */
    }
  }

  const upstream =
    parsed.value.source === 'voicerss'
      ? await synthesizeVoiceRss(parsed.value, env)
      : await synthesizeEleven(parsed.value, env)
  if (!upstream.ok) return upstream.response

  const response = audioResponse(upstream.bytes, upstream.contentType)
  if (cache) {
    try {
      await cache.put(cacheKey, response.clone())
    } catch {
      /* playback still succeeds when the edge cache rejects the put */
    }
  }
  return response
}
