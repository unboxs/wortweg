/** 同一套笔记的指纹。重新导入同一 .apkg 时用它认出原牌组，避免再插一份。 */
export async function fingerprint(guids: string[]): Promise<string> {
  const data = new TextEncoder().encode(guids.slice().sort().join('\n'))
  const buf = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** 两边 guid 的重合比例（分母取较大的一边）。1 = 完全同一套笔记。 */
export function overlapRatio(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0
  const set = new Set(a)
  let hit = 0
  for (const guid of b) if (set.has(guid)) hit++
  return hit / Math.max(a.length, b.length)
}

export const SAME_DECK_OVERLAP = 0.8
