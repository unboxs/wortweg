// ─── 德语数字引擎 ───────────────────────────────────────────────────────
// 锚点表数据移植自 GermanLearn 项目（0–20 + 整十，含 IPA）。
// numberToGerman() 让 TTS 能读出 0–9999 的任意数字 —— 修复原项目
// 只能训练 29 个录音锚点、无法覆盖合成数（德语数字的真正难点）的缺口。

export interface NumberAnchor {
  value: number
  de: string
  ipa: string
}

const ANCHOR_ROWS: [number, string, string][] = [
  [0, 'null', '[ˈnʊl]'], [1, 'eins', '[ˈaɪns]'], [2, 'zwei', '[ˈtsvaɪ]'], [3, 'drei', '[ˈdʁaɪ]'], [4, 'vier', '[ˈfiːɐ̯]'],
  [5, 'fünf', '[ˈfʏnf]'], [6, 'sechs', '[ˈzɛks]'], [7, 'sieben', '[ˈziːbn̩]'], [8, 'acht', '[ˈaxt]'], [9, 'neun', '[ˈnɔʏn]'],
  [10, 'zehn', '[ˈtseːn]'], [11, 'elf', '[ˈɛlf]'], [12, 'zwölf', '[ˈtsvœlf]'], [13, 'dreizehn', '[ˈdʁaɪtseːn]'], [14, 'vierzehn', '[ˈfiːɐ̯tseːn]'],
  [15, 'fünfzehn', '[ˈfʏnftseːn]'], [16, 'sechzehn', '[ˈzɛçtseːn]'], [17, 'siebzehn', '[ˈziːptseːn]'], [18, 'achtzehn', '[ˈaxtseːn]'],
  [19, 'neunzehn', '[ˈnɔʏntseːn]'], [20, 'zwanzig', '[ˈtsvantsɪç]'],
  [30, 'dreißig', '[ˈdʁaɪsɪç]'], [40, 'vierzig', '[ˈfiːɐ̯tsɪç]'], [50, 'fünfzig', '[ˈfʏnftsɪç]'], [60, 'sechzig', '[ˈzɛçtsɪç]'],
  [70, 'siebzig', '[ˈziːptsɪç]'], [80, 'achtzig', '[ˈaxtsɪç]'], [90, 'neunzig', '[ˈnɔʏntsɪç]'], [100, 'hundert', '[ˈhʊndɐt]'],
]

export const NUMBER_ANCHORS: NumberAnchor[] = ANCHOR_ROWS.map(([value, de, ipa]) => ({ value, de, ipa }))

export const NUMBER_RANGES = [
  { id: 'basic', label: '基础 0–20', max: 20 },
  { id: 'full', label: '进阶 0–100', max: 100 },
  { id: 'real', label: '实战 0–9999', max: 9999 },
] as const

export type RangeId = (typeof NUMBER_RANGES)[number]['id']

const ONES = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun']
// 13–19 的词根：sechs→sech-、sieben→sieb-（-zehn/-zig 前缩合），其余同原形
const TEEN_ROOTS: Record<number, string> = { 3: 'drei', 4: 'vier', 5: 'fünf', 6: 'sech', 7: 'sieb', 8: 'acht', 9: 'neun' }
const TENS = ['', '', 'zwanzig', 'dreißig', 'vierzig', 'fünfzig', 'sechzig', 'siebzig', 'achtzig', 'neunzig']

function under100(n: number): string {
  if (n < 10) return ONES[n]
  if (n === 10) return 'zehn'
  if (n === 11) return 'elf'
  if (n === 12) return 'zwölf'
  if (n < 20) return TEEN_ROOTS[n - 10] + 'zehn'
  const u = n % 10
  const t = Math.floor(n / 10)
  if (u === 0) return TENS[t]
  // 合成数：个位在前 + und + 十位 —— 德语数字的核心难点
  return (u === 1 ? 'ein' : ONES[u]) + 'und' + TENS[t]
}

/** 把 0–9999 的整数合成为德语单词（一个长词，符合德语书写习惯） */
export function numberToGerman(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 9999) return ''
  if (n === 100) return 'hundert'
  if (n < 100) return under100(n)
  if (n < 1000) {
    const h = Math.floor(n / 100)
    const rest = n % 100
    return (h === 1 ? 'ein' : ONES[h]) + 'hundert' + (rest > 0 ? under100(rest) : '')
  }
  const t = Math.floor(n / 1000)
  const rest = n % 1000
  return (t === 1 ? 'ein' : ONES[t]) + 'tausend' + (rest > 0 ? numberToGerman(rest) : '')
}
