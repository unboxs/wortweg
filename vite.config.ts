import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { handleTtsRequest, type TtsEnv } from './functions/tts-handler.ts'

const DEV_SECRET_KEYS = [
  'VOICERSS_API_KEY',
  'ELEVENLABS_API_KEY',
  'ELEVENLABS_VOICE_LILY',
  'ELEVENLABS_VOICE_CHARLOTTE',
  'ELEVENLABS_VOICE_DANIEL',
] as const

/** Local stand-in for the Pages Function. Values come from the environment or .dev.vars, never from source. */
function loadDevSecrets(): TtsEnv {
  const env: TtsEnv = {}
  for (const key of DEV_SECRET_KEYS) {
    const value = process.env[key]
    if (value) env[key] = value
  }
  try {
    const text = readFileSync(new URL('./.dev.vars', import.meta.url), 'utf8')
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq < 1) continue
      const key = trimmed.slice(0, eq).trim()
      if (!DEV_SECRET_KEYS.includes(key as (typeof DEV_SECRET_KEYS)[number])) continue
      if (env[key as keyof TtsEnv]) continue
      let value = trimmed.slice(eq + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (value) env[key as keyof TtsEnv] = value
    }
  } catch {
    /* .dev.vars is optional */
  }
  return env
}

function ttsDevProxy(): Plugin {
  const env = loadDevSecrets()
  return {
    name: 'wortweg-tts-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? ''
        if (!url.startsWith('/api/tts')) return next()
        try {
          const hostHeader = req.headers.host
          const host = (Array.isArray(hostHeader) ? hostHeader[0] : hostHeader) || 'localhost'
          const headers = new Headers()
          const site = req.headers['sec-fetch-site']
          if (typeof site === 'string') headers.set('sec-fetch-site', site)
          const request = new Request(new URL(url, `http://${host}`), {
            method: req.method || 'GET',
            headers,
          })
          const response = await handleTtsRequest(request, env)
          res.statusCode = response.status
          response.headers.forEach((value, key) => res.setHeader(key, value))
          const bytes = Buffer.from(await response.arrayBuffer())
          res.end(bytes)
        } catch {
          res.statusCode = 500
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.setHeader('cache-control', 'no-store')
          res.end(JSON.stringify({ error: 'tts proxy failed' }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), ttsDevProxy()],
})
