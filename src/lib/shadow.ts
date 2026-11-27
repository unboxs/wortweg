import { normalizeDe } from './goldlist'

const SKIP = new Set(['der', 'die', 'das', 'ein', 'eine', 'und'])

function norm(s: string): string {
  return normalizeDe(s)
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 跟读识别结果是否和词条大体一致。宽松比对，不拿来当考试。 */
export function shadowMatch(target: string, heard: string): boolean {
  const t = norm(target)
  const h = norm(heard)
  if (!t || !h) return false
  if (h.includes(t) || t.includes(h)) return true
  const words = t.split(' ').filter((w) => w.length > 2 && !SKIP.has(w))
  return words.length > 0 && words.every((w) => h.includes(w))
}
