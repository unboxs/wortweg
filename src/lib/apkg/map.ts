// 把 Anki 字段映射成 Wortweg 词条。
// 只使用牌组里真有的音标、例句和音频，缺了就空着。

import type { EntryExample, ImportedGrammar } from '../../types'
import { imageNames, soundNames, stripHtml } from './html'
import type { MappedNote, RawNote } from './types'

const ARTICLE = /^(der|die|das)$/i

const GERMAN_KEYS = [
  'lemma',
  'display',
  'german',
  'deutsch',
  'de',
  'wort',
  'word',
  'front',
  'expression',
  'vocab',
  'vocabulary',
  'phrase',
  'text',
]

const MEANING_KEYS = ['meaning', 'bedeutung', 'back', 'chinese', 'zh', 'cn', '中文', '释义', 'translation', 'definition', 'gloss']

export function normKey(name: string): string {
  return name.toLowerCase().replace(/[\s_\-./]+/g, '')
}

function clean(raw: string | undefined): string {
  if (!raw) return ''
  return stripHtml(raw).replace(/[ \t]+\n/g, '\n').replace(/\n+/g, '\n').replace(/\s+/g, ' ').trim()
}

function mostlyHan(text: string): boolean {
  const letters = [...text].filter((ch) => /\p{L}/u.test(ch))
  if (letters.length === 0) return false
  const han = letters.filter((ch) => /\p{Script=Han}/u.test(ch)).length
  return han > letters.length * 0.5
}

function mostlyLatin(text: string): boolean {
  const letters = [...text].filter((ch) => /\p{L}/u.test(ch))
  if (letters.length === 0) return false
  const latin = letters.filter((ch) => /\p{Script=Latin}/u.test(ch)).length
  return latin / letters.length > 0.6
}

function articleWord(raw: string | undefined): string | undefined {
  const text = clean(raw).toLowerCase()
  return ARTICLE.test(text) ? text : undefined
}

function genderCode(raw: string | undefined): 'm' | 'f' | 'n' | undefined {
  const text = clean(raw).toLowerCase()
  if (!text) return undefined
  if (/^(m|masc|masculine|maskulin|männlich|maennlich|der)$/.test(text)) return 'm'
  if (/^(f|fem|feminine|feminin|weiblich|die)$/.test(text)) return 'f'
  if (/^(n|neut|neuter|neutrum|sächlich|saechlich|das)$/.test(text)) return 'n'
  return undefined
}

function articleFromGender(code: 'm' | 'f' | 'n' | undefined): string | undefined {
  if (code === 'm') return 'der'
  if (code === 'f') return 'die'
  if (code === 'n') return 'das'
  return undefined
}

function withArticle(base: string, article: string | undefined): string {
  if (!article) return base
  const bare = base.replace(/^(der|die|das)\s+/i, '').trim()
  if (!bare) return base
  return `${article} ${bare}`
}

function isVerbPos(pos: string): boolean {
  return /verb|动词/.test(pos.toLowerCase())
}

function cleanIpa(raw: string | undefined): string | undefined {
  const text = clean(raw)
  if (!text) return undefined
  if (/^(-|—|–|n\/a|na|none|无|\/|\[])$/i.test(text)) return undefined
  return text
}

function cleanLevel(raw: string | undefined): string | undefined {
  const text = clean(raw).toUpperCase().replace(/[–—]/g, '-')
  const found = [...text.matchAll(/\b(A1|A2|B1|B2|C1|C2)\b/g)].map((m) => m[1]!)
  if (found.length === 0) return undefined
  if (found.length === 1) return found[0]
  return `${found[0]}–${found[found.length - 1]}`
}

function optionalText(raw: string | undefined): string | undefined {
  const text = clean(raw)
  if (!text || /^(0|no|n|false|否|none|-|—|–)$/i.test(text)) return undefined
  return text
}

function flagOrText(raw: string | undefined, yesLabel: string): string | undefined {
  const text = optionalText(raw)
  if (!text) return undefined
  if (/^(1|y|yes|ja|true|是|有)$/i.test(text)) return yesLabel
  return text
}

function firstRaw(get: (key: string) => string, keys: string[]): string {
  for (const key of keys) {
    const value = get(key)
    if (value && value.trim()) return value
  }
  return ''
}

function cap(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max).trim()
}

function gloss(meaning: string): { zh: string; en?: string } {
  if (!meaning) return { zh: '' }
  if (mostlyHan(meaning)) return { zh: meaning }
  return { zh: meaning, en: meaning }
}

function buildSentences(get: (key: string) => string): EntryExample[] {
  const found: EntryExample[] = []
  const push = (deKeys: string[], zhKeys: string[], audioKeys: string[]) => {
    const de = clean(firstRaw(get, deKeys))
    if (!de || found.some((item) => item.de === de)) return
    const zh = clean(firstRaw(get, zhKeys)) || undefined
    const audioName = soundNames(firstRaw(get, audioKeys))[0]
    found.push({ de: cap(de, 500), zh: zh ? cap(zh, 500) : undefined, audioName })
  }
  push(
    ['sentence', 'sentence1', 'example', 'example1', 'beispiel', 'beispiel1'],
    ['sentencemeaning', 'sentencemeaning1', 'examplemeaning', 'examplemeaning1', 'sentencezh', 'sentencezh1'],
    ['sentenceaudio', 'sentenceaudio1', 'exampleaudio', 'exampleaudio1'],
  )
  push(
    ['sentence2', 'example2', 'beispiel2'],
    ['sentencemeaning2', 'examplemeaning2', 'sentencezh2'],
    ['sentenceaudio2', 'exampleaudio2'],
  )
  push(
    ['sentence3', 'example3', 'beispiel3'],
    ['sentencemeaning3', 'examplemeaning3', 'sentencezh3'],
    ['sentenceaudio3', 'exampleaudio3'],
  )
  return found.slice(0, 3)
}

function buildGrammar(get: (key: string) => string, article: string | undefined): ImportedGrammar | undefined {
  const pos = optionalText(get('poslabel')) || optionalText(get('pos'))
  const gender = genderCode(get('gender')) ?? (article === 'der' ? 'm' : article === 'die' ? 'f' : article === 'das' ? 'n' : undefined)
  const noPlural = /^(1|y|yes|ja|true|是)$/i.test(clean(get('noplural')))
  const plural = noPlural ? '无复数' : optionalText(get('plural'))
  const grammar: ImportedGrammar = {
    pos,
    article,
    gender,
    plural,
    number: flagOrText(get('pluralonly'), '仅复数'),
    genitive: optionalText(get('genitive')),
    pres3: optionalText(get('pres3')),
    praet: optionalText(get('praet') || get('praeteritum') || get('preterite')),
    partizip: optionalText(get('partizip') || get('partizipii') || get('pp')),
    aux: optionalText(get('aux') || get('perfaux')),
    verbClass: optionalText(get('verbclass')),
    separable: flagOrText(get('separable'), '可分'),
    reflexive: flagOrText(get('reflexive'), '反身'),
    government: optionalText(get('government')),
    comparative: optionalText(get('comparative')),
    superlative: optionalText(get('superlative')),
    feminine: optionalText(get('feminine')),
    nDeclension: flagOrText(get('ndekl'), 'n 变格'),
  }
  const filled = Object.fromEntries(Object.entries(grammar).filter(([, value]) => value))
  return Object.keys(filled).length ? (filled as ImportedGrammar) : undefined
}

function pickGerman(get: (key: string) => string): { german: string; article?: string } {
  const lemma = clean(get('lemma'))
  const display = clean(get('display'))
  const named = clean(firstRaw(get, ['german', 'deutsch', 'wort', 'word', 'expression', 'vocab', 'vocabulary', 'phrase']))
  const front = clean(get('front'))
  let base = lemma || named || front || display
  const pos = `${get('pos')} ${get('poslabel')}`
  let article = isVerbPos(pos) ? undefined : articleWord(get('article')) ?? articleFromGender(genderCode(get('gender')))
  if (!article && display) {
    const found = /^(der|die|das)\s+/i.exec(display)
    const bare = display.replace(/^(der|die|das)\s+/i, '')
    if (found && lemma && bare.localeCompare(lemma, 'de', { sensitivity: 'accent' }) === 0) article = found[1]!.toLowerCase()
    if (!base) base = display
  }
  if (!base && display) base = display
  if (!base) return { german: '' }
  if (!article && /^(der|die|das)\s+\S/i.test(base)) return { german: base }
  return { german: withArticle(base, article), article }
}

function pickMeaning(get: (key: string) => string, ordered: { name: string; text: string }[], german: string): { zh: string; en?: string } {
  const meaning = clean(firstRaw(get, MEANING_KEYS))
  const english = clean(get('english') || get('en'))
  if (meaning && english && meaning !== english) return { zh: cap(meaning, 800), en: cap(english, 800) }
  if (meaning) return gloss(cap(meaning, 800))
  if (english) return { zh: cap(english, 800), en: cap(english, 800) }
  const rest = ordered.map((field) => field.text).filter((text) => text && text !== german)
  const zh = rest.find((text) => mostlyHan(text))
  if (zh) return { zh: cap(zh, 800) }
  if (rest[0]) return gloss(cap(rest[0], 800))
  return { zh: '' }
}

/** 映射一条笔记。没有可用的德语词头时返回 null（算作跳过）。 */
export function mapNote(raw: RawNote): MappedNote | null {
  const byKey = new Map<string, string>()
  const ordered: { name: string; text: string }[] = []
  for (const field of raw.fields) {
    const key = normKey(field.name)
    if (key && !byKey.has(key)) byKey.set(key, field.value)
    const text = clean(field.value)
    if (text) ordered.push({ name: field.name, text })
  }
  const get = (key: string) => byKey.get(normKey(key)) ?? ''

  let { german, article } = pickGerman(get)
  if (!german) {
    const first = ordered[0]?.text ?? ''
    const second = ordered[1]?.text ?? ''
    if (mostlyHan(first) && mostlyLatin(second)) german = second
    else german = first
  }
  german = cap(german, 240)
  if (!german) return null

  let meaning = pickMeaning(get, ordered, german)
  if (mostlyHan(german) && mostlyLatin(meaning.zh) && !mostlyHan(meaning.zh)) {
    const swapped = german
    german = cap(meaning.zh, 240)
    meaning = { zh: cap(swapped, 800) }
    article = articleWord(german.split(/\s+/)[0]) ?? article
  }
  if (!german || mostlyHan(german)) {
    // 互换之后如果还是中文，就不是德语词条
    if (mostlyHan(german)) return null
  }

  const examples = buildSentences(get)
  const sentenceAudio = new Set(examples.map((item) => item.audioName).filter((name): name is string => !!name))
  const wordAudio =
    soundNames(firstRaw(get, ['wordaudio', 'audio', 'sound', 'wortaudio']))[0] ??
    raw.fields.flatMap((field) => soundNames(field.value)).find((name) => !sentenceAudio.has(name))
  const imageName =
    imageNames(firstRaw(get, ['image', 'picture', 'bild', 'img', 'photo']))[0] ??
    raw.fields.flatMap((field) => imageNames(field.value)).find(Boolean)

  const ipa = cleanIpa(get('ipa') || get('phonetic') || get('phonetics'))
  const level = cleanLevel(get('level') || get('cefr') || get('stufe'))
  const note = optionalText(get('note') || get('notes') || get('hinweis'))
  const grammar = buildGrammar(get, article)
  const ankiTags = raw.tags.map((tag) => tag.trim()).filter((tag) => tag && tag.length <= 40).slice(0, 6)

  return {
    guid: raw.guid,
    modelName: raw.modelName,
    deckName: raw.deckName,
    german,
    zh: meaning.zh,
    en: meaning.en,
    ipa,
    example: examples[0]?.de,
    examples: examples.length ? examples : undefined,
    note: note ? cap(note, 400) : undefined,
    grammar,
    level,
    audioName: wordAudio,
    imageName,
    ankiTags,
  }
}

export function majorityLevel(levels: string[]): string | undefined {
  if (levels.length === 0) return undefined
  const counts = new Map<string, number>()
  for (const level of levels) counts.set(level, (counts.get(level) ?? 0) + 1)
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1])
  const [level, count] = ranked[0]!
  if (count / levels.length >= 0.7) return level
  return undefined
}

export function deckTitle(counts: { name: string; count: number }[], fileName: string): string {
  const named = counts.filter((deck) => deck.count > 0 && deck.name && deck.name !== 'Default')
  named.sort((a, b) => b.count - a.count)
  if (named[0]?.name) return named[0].name
  const fromFile = fileName.replace(/\.apkg$/i, '').trim()
  return fromFile || '已导入牌组'
}
