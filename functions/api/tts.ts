import { handleTtsRequest, type TtsEnv } from '../tts-handler.ts'

interface PagesContext {
  request: Request
  env: TtsEnv
}

/** GET /api/tts — same-origin German audio. Secrets stay on context.env. */
export function onRequestGet(context: PagesContext): Promise<Response> {
  return handleTtsRequest(context.request, context.env)
}
