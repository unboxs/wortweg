import type { BankCategory, BankEntry } from '../../types'

/**
 * 紧凑词库解析器：一行一条，`德语 | 释义` 或 `德语 | 释义 | 例句`。
 * `#` 开头的行是注释，空行忽略。文件体积只有 JSON 对象的三分之一左右。
 */
export function build(id: string, name: string, nameDe: string, lines: string[]): BankCategory {
  const entries: BankEntry[] = []
  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const parts = line.split('|').map((p) => p.trim())
    const german = parts[0]
    const zh = parts[1] ?? ''
    const example = parts[2] ?? ''
    if (german) entries.push({ german, zh, example: example || undefined })
  }
  return { id, name, nameDe, entries }
}
