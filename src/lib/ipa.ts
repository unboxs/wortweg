// 德语音标来自 open-dict-data/ipa-dict 的 data/de.txt（MIT，Copyright (c) 2016 dohliam）。
// 其中的德语条目录自维基词典的 IPA。每个词只保留词典里列出的第一种读音。
// 词组按空格拆开逐词查找；有任何一个词没有条目，整条就不显示，不补造音标。
import dict from '../data/ipa-de.json' with { type: 'json' }

const DICT = dict as Record<string, string>

function flipInitial(token: string): string {
  const first = token[0]
  if (!first) return token
  const flipped = first === first.toUpperCase() ? first.toLowerCase() : first.toUpperCase()
  return flipped + token.slice(1)
}

function lookup(token: string): string | undefined {
  const exact = DICT[token]
  if (exact) return exact
  const alt = flipInitial(token)
  if (alt !== token) return DICT[alt]
  return undefined
}

/** 词典里查得到才返回，例如 /haˈloː/。没有条目时返回 undefined。 */
export function ipaFor(german: string): string | undefined {
  const tokens = german
    .replace(/[?.!,;:„“”"'()[\]]/g, ' ')
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
  if (tokens.length === 0) return undefined
  const parts: string[] = []
  for (const token of tokens) {
    const hit = lookup(token)
    if (!hit) return undefined
    parts.push(hit)
  }
  return parts.join(' ')
}
