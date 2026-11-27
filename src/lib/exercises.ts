// ─── 学习区练习生成器 ──────────────────────────────────────────────────
// 全部题型从词条数据自动派生，零人工出题成本：
//   copy      抄写（看词+释义，打出来）
//   article   冠词（定/不定/否定/物主——按名词性别出题）
//   letters   补全缺失字母
//   dictation 听写（只听/看提示，写整词）
//   cloze     例句填空（例句里挖掉目标词）
//   recall    释义 → 德语（中译德回忆）
//   sentence  句子重组（打乱例句，按序点回）
// 只有例句的词条才会出 cloze/sentence；不是名词的词条不会出冠词题。

import type { EntryExample, ImportedGrammar } from '../types'
import { normalizeDe } from './goldlist'

export interface ExEntry {
  german: string
  zh: string
  example?: string
  examples?: EntryExample[]
  ipa?: string
  /** 已导入词条：没有牌组音标时不要查词典补一个 */
  fromImport?: boolean
  grammar?: ImportedGrammar
  level?: string
  sourceDeckId?: string
  audioName?: string
  imageName?: string
}

export type Gender = 'm' | 'f' | 'n'

/** 从 "die Banane" 这类词条解析名词与性别 */
export function parseNoun(german: string): { base: string; gender: Gender } | null {
  const m = /^(der|die|das)\s+(.+)$/i.exec(german.trim())
  if (!m) return null
  const art = m[1].toLowerCase()
  return { base: m[2], gender: art === 'der' ? 'm' : art === 'die' ? 'f' : 'n' }
}

export type ExerciseKind = 'copy' | 'article' | 'letters' | 'dictation' | 'cloze' | 'recall' | 'sentence'

export interface Exercise {
  kind: ExerciseKind
  /** 冠词家族名（article 用） */
  family?: string
  /** 题干展示：冠词题的裸名词 / 补字母的骨架 / 填空的例句 */
  display?: string
  /** article 的选项 */
  options?: string[]
  /** 校验目标（宽松比对） */
  answer?: string
  /** sentence 打乱后的词 */
  shuffled?: string[]
  /** 进入卡片时是否自动朗读（自动朗读不等于泄题的题型才开） */
  speakOnEnter: boolean
}

/** 冠词家族：主格形式，按性别给答案。mein/dein/sein/unser 同 ein 型变化。 */
const FAMILIES: { name: string; options: string[]; answerFor: Record<Gender, string> }[] = [
  { name: '定冠词', options: ['der', 'die', 'das'], answerFor: { m: 'der', f: 'die', n: 'das' } },
  { name: '不定冠词', options: ['ein', 'eine'], answerFor: { m: 'ein', f: 'eine', n: 'ein' } },
  { name: '否定冠词', options: ['kein', 'keine'], answerFor: { m: 'kein', f: 'keine', n: 'kein' } },
  { name: '物主冠词', options: ['mein', 'meine'], answerFor: { m: 'mein', f: 'meine', n: 'mein' } },
]

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** 抄写/听写/填空的宽松比对：忽略大小写、ä/ae 等变音写法；
 *  标点替换为空格（"sich(Dat)" 与 "sich dat" 等价），避免剥标点后字母粘连 */
export const transcribed = (typed: string, german: string): boolean => {
  const norm = (s: string) =>
    normalizeDe(s)
      .replace(/[^a-z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  return norm(typed) !== '' && norm(typed) === norm(german)
}

function buildLetters(word: string): { skeleton: string; missing: string } | null {
  // 只对 ≥5 字母的单词出题；短语跳过
  if (word.length < 5 || /\s/.test(word)) return null
  const n = Math.max(2, Math.round(word.length * 0.3))
  const positions: number[] = []
  while (positions.length < Math.min(n, word.length - 1)) {
    const p = 1 + Math.floor(Math.random() * (word.length - 1))
    if (!positions.includes(p)) positions.push(p)
  }
  positions.sort((a, b) => a - b)
  const skeleton = [...word].map((c, i) => (positions.includes(i) ? '_' : c)).join('')
  const missing = positions.map((i) => word[i]).join('')
  return { skeleton, missing }
}

function buildCloze(example: string, base: string): string | null {
  const i = example.toLowerCase().indexOf(base.toLowerCase())
  if (i === -1) return null
  return example.slice(0, i) + '＿＿＿' + example.slice(i + base.length)
}

function buildSentence(example: string): { shuffled: string[]; answer: string } | null {
  const words = example.split(/\s+/).filter(Boolean)
  if (words.length < 4 || words.length > 12) return null
  let s = shuffle(words)
  if (s.join(' ') === words.join(' ')) s = s.reverse()
  return { shuffled: s, answer: words.join(' ') }
}

/** 为一个词条随机抽一种题型（可用题型取决于词条特征） */
export function buildExercise(entry: ExEntry): Exercise {
  const noun = parseNoun(entry.german)
  const kinds: ExerciseKind[] = ['copy', 'dictation', 'recall']
  const letters = buildLetters(noun ? noun.base : entry.german)
  if (noun) kinds.push('article', 'article') // 冠词是德语核心痛点，权重加倍
  if (letters) kinds.push('letters')
  const clozeText = entry.example ? buildCloze(entry.example, noun ? noun.base : entry.german) : null
  if (clozeText) kinds.push('cloze')
  const sentence = entry.example ? buildSentence(entry.example) : null
  if (sentence) kinds.push('sentence')

  const kind = pick(kinds)
  switch (kind) {
    case 'article': {
      const f = pick(FAMILIES)
      return {
        kind,
        family: f.name,
        display: noun!.base,
        options: f.options,
        answer: f.answerFor[noun!.gender],
        speakOnEnter: false,
      }
    }
    case 'letters':
      return { kind, display: letters!.skeleton, answer: letters!.missing, speakOnEnter: false }
    case 'cloze':
      return { kind, display: clozeText!, answer: noun ? noun.base : entry.german, speakOnEnter: false }
    case 'sentence':
      return { kind, shuffled: sentence!.shuffled, answer: sentence!.answer, speakOnEnter: false }
    case 'dictation':
      return { kind, answer: entry.german, speakOnEnter: true }
    case 'recall':
      return { kind, answer: entry.german, speakOnEnter: false }
    default:
      return { kind: 'copy', answer: entry.german, speakOnEnter: true }
  }
}
