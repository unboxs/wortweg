// 一次性导入脚本：dychb.pdf（德语词汇表）→ src/data/bank/jiaocai.ts
// 词源三部分：1 分类词组 → 按分类导入；2 字母序核心词汇 → 剥离变位信息导入；
// 3 不规则动词表 → 跳过（语法参考，不适合做词条）。
// 与现有词库（A1–B2，2702 条）按归一化词形去重；修正 PDF 个别错印。
const fs = require('fs')
const path = require('path')

const norm = (s) =>
  s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/\s+/g, ' ')
    .trim()

// ── 现有词库词形集合 ──
function loadExisting() {
  const dir = path.join(process.cwd(), 'src/data/bank')
  const set = new Set()
  for (const f of fs.readdirSync(dir)) {
    if (f === 'index.ts' || f === 'parse.ts' || f === 'jiaocai.ts') continue
    const text = fs.readFileSync(path.join(dir, f), 'utf8')
    for (const m of text.matchAll(/'([^']+)'/g)) {
      const inner = m[1]
      if (inner.includes('|')) set.add(norm(inner.split('|')[0]))
    }
  }
  return set
}

// ── PDF 错印修正（按归一化词形匹配）──
const OVERRIDES = {
  'der polizist': '警察',
  'die polizistin': '警察（女）',
  'vormittags, am vormittag': '在上午',
  fantastisch: '极好的；奇妙的',
  günstig: '便宜的；划算的',
  pünktlich: '准时的',
  doch: '肯定回答；（语气词，加强肯定）',
  bei: '在…处；在某人处（介词）',
  frei: '自由的；空的；免费的',
  mit: '和…一起；用；带有（介词）',
  über: '在/到…上方；穿过；超出（介词）',
}

// 提取断片直接丢弃；POST 是断片的干净替身
const JUNK_CONTAINS = ['10 Grad Celsius']
const POST = [['jczeit', '1 g / 1 kg|一克/一千克']]

// ── 分类路由 ──
const SECTIONS = [
  ['1. WORTGRUPPEN 分类词组', '__SKIP__'],
  ['Abkürzungen 缩写', 'jcabk'],
  ['Familienmitglieder 家庭成员', 'jcfamilie'],
  ['Anweisungssprache zur Prüfung 考试指示用语', 'jcpruefung'],
  ['Familienstand 婚姻状况', 'jcfamilie'],
  ['Farben 颜色', 'jcfarben'],
  ['Berufe 职业', 'jcberufe'],
  ['Himmelsrichtungen 方向', 'jcfarben'],
  ['Länder und Nationalitäten 国家和民族', 'jclaender'],
  ['Schule und Schulfächer 学校和学校科目', 'jcschule'],
  ['Währungen und Maße 货币和计量', 'jczeit'],
  ['Zeitangaben 时间表达', 'jczeit'],
  ['Datum 日期', 'jczeit'],
  ['Feiertage 节日', 'jczeit'],
  ['Jahreszeiten 季节', 'jczeit'],
  ['Monate 月份', 'jczeit'],
  ['Tageszeiten 一天中的时间', 'jczeit'],
  ['Uhrzeit 钟点', 'jczeit'],
  ['Wochentage 一周中的时间', 'jczeit'],
  ['Zeitmaße 时间计量', 'jczeit'],
  ['Zahlen 数字', 'jczahl'],
  ['2. ALPHABETISCHER WORTSCHATZ 按照字母顺序的词汇', 'jcalpha'],
  ['3. Tabelle aller starken Verben 不规则动词表', '__END__'],
]

const CAT_META = {
  jcabk: ['教材·缩写', 'Abkürzungen'],
  jcfamilie: ['教材·家庭与婚姻', 'Familie'],
  jcpruefung: ['教材·考试用语', 'Prüfung'],
  jcfarben: ['教材·颜色与方位', 'Farben & Richtungen'],
  jcberufe: ['教材·职业', 'Berufe'],
  jclaender: ['教材·国家与民族', 'Länder'],
  jcschule: ['教材·学校科目', 'Schule'],
  jczeit: ['教材·时间与计量', 'Zeit & Maße'],
  jczahl: ['教材·数字与序数', 'Zahlen'],
  jcalpha: ['教材·核心词汇 A–Z', 'Wortschatz A–Z'],
}

const CJKISH = /[\u4e00-\u9fff\uff08\uff09\uff0c]/ // 含全角括号逗号
const GRAM = /\b(Vt\.|Vi\.|Refl\.|Adj\.|Adv\.|Präp\.|Konj\.|Pron\.|Part\.|Num\.|Intj\.|N\.|Modalverb)/
const GRAM_START = /^(Vt\.|Vi\.|Refl\.|Adj\.|Adv\.|Präp\.|Konj\.|Pron\.|Part\.|Num\.|Intj\.|Modalverb)/

function splitZh(line) {
  const t = line.trim()
  let i = 0
  while (i < t.length && !CJKISH.test(t[i])) i++
  if (i === 0 || i === t.length) return null
  return [t.slice(0, i).trim(), t.slice(i).trim()]
}

function stripParens(head) {
  // (ab)fahren → abfahren（短括号保留内容）；(Bsp. darauf, darüber) → 删除（长括号）
  return head
    .replace(/\(([^)\s]{1,3})\)/g, '$1')
    .replace(/\s*\([^)]{4,}\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanNoun(g) {
  let s = g.trim()
  s = s.replace(/\(Sg\.?\)/g, '').replace(/\(Pl\.\)/g, '')
  s = s.replace(/\[[^\]]*\]/g, '')
  if (/^(der|die|das|der\/die)\s/i.test(s)) {
    const comma = s.indexOf(',')
    if (comma > -1) s = s.slice(0, comma)
  }
  return s.trim()
}

// 冠词对拆分：der X / die Yin → 两条；der X / das Y → 男性 + 同义
function splitPairs(german, zh) {
  if (!/ \/ /.test(german)) return [{ german, zh }]
  const parts = german.split(' / ')
  const art = /^(der|die|das)\s/i
  if (!parts.every((p) => art.test(p))) return [{ german, zh }]
  const zhParts = zh.split('/')
  return parts.map((p, idx) => {
    let z
    if (idx === 0) z = zhParts[0] || zh
    else {
      const cand = zhParts[idx]
      if (cand && cand.length >= 2) z = cand
      else if (/^die\s/i.test(p) && /^der\s/i.test(parts[0])) z = zh + '（女）'
      else z = zh + '（同义）'
    }
    return { german: cleanNoun(p), zh: z }
  })
}

// 字母序区：词头剥离变位与语法标注
function parseAlphaHead(g) {
  let head = g
  const tagAt = head.search(GRAM)
  if (tagAt > 0) head = head.slice(0, tagAt)
  head = head.replace(/[,;]+\s*$/g, '').trim()
  // (sich) 提前：anmelden (sich) → sich anmelden
  if (/\(sich\)$/.test(head)) head = 'sich ' + head.replace(/\s*\(sich\)$/, '')
  head = stripParens(head)
  if (head.includes(',')) head = head.split(',')[0].trim() // 主变化部分后面的并列变位
  head = head.replace(/\s+/g, ' ').trim()
  return head
}

function main() {
  const text = fs.readFileSync(path.join(process.cwd(), 'scripts/dychb.txt'), 'utf8')
  const rawLines = text.split(/\r?\n/)
  const existing = loadExisting()
  const cats = {}
  Object.keys(CAT_META).forEach((k) => (cats[k] = []))
  const seen = new Set()
  const junk = []
  let skippedDup = 0
  let current = null
  let prev = null

  for (const raw of rawLines) {
    const line = raw.trim()
    if (!line || line.startsWith('=== PAGE')) continue
    if (/^\d{1,4}$/.test(line)) continue // 页码
    if (/^[A-ZÄÖÜ]$/.test(line)) continue // 字母导航
    if (JUNK_CONTAINS.some((j) => line.includes(j))) {
      junk.push(`[断片] ${line}`)
      continue
    }
    const hit = SECTIONS.find(([mark]) => line === mark)
    if (hit) {
      current = hit[1] === '__SKIP__' ? null : hit[1] === '__END__' ? '__END__' : hit[1]
      continue
    }
    if (current === '__END__') break
    if (!current) continue
    if (GRAM_START.test(line)) {
      // 上一词条的多词性续行：并入释义
      if (prev) prev.zh = prev.zh + '；' + line
      continue
    }

    let german
    let zh
    if (current === 'jcalpha') {
      const sp = splitZh(line)
      if (!sp) {
        junk.push(`[无中文] ${line}`)
        continue
      }
      german = parseAlphaHead(sp[0])
      zh = sp[1].replace(/\(Modalverb\)/g, '').replace(/，\s*$/, '').trim()
      if (!german || german.length < 2 || german.endsWith('-')) {
        junk.push(`[词头异常] ${line}`)
        continue
      }
    } else {
      const sp = splitZh(line)
      if (!sp) {
        junk.push(`[无中文] ${line}`)
        continue
      }
      german = sp[0]
      zh = sp[1]
      if (current === 'jcabk' && / = /.test(german)) {
        // 缩写：term = expansion 释义
        const [term, exp] = german.split('=').map((s) => s.trim())
        const expClean = exp.replace(/[.,]$/, '')
        german = term
        zh = `${zh}（= ${expClean}）`
      } else if (current === 'jczahl' && / = /.test(german)) {
        // 数字：取右侧词形，左侧数字丢弃
        german = german.split('=').map((s) => s.trim()).pop()
      }
      // 含 " / " 的冠词对交给 splitPairs 逐边清理，此处只处理单个名词
      if (/^(der|die|das|der\/die)\s/i.test(german) && !/ \/ /.test(german)) german = cleanNoun(german)
      german = german.replace(/\s+/g, ' ').trim()
      // 提取器把中文开头的数字留在了德语侧（如 "...zweitausendzwölf 2012|年 2 月 20 日"）
      // 德语侧以数字结尾且释义不以数字开头时，把数字归还给释义
      const tailNum = german.match(/(\d+(?:[.,]\d+)?)$/)
      if (tailNum && !/^\d/.test(zh) && !/^\d/.test(zh.slice(0, 1))) {
        german = german.slice(0, german.length - tailNum[1].length).trim()
        zh = tailNum[1] + ' ' + zh
      }
    }

    const pieces = splitPairs(german, zh)
    for (const p of pieces) {
      let z = p.zh
      const ov = OVERRIDES[norm(p.german)]
      if (ov) z = ov
      const key = norm(p.german)
      if (existing.has(key) || seen.has(key)) {
        skippedDup++
        continue
      }
      if (!z || !p.german || p.german.length < 2) {
        junk.push(`[空字段] ${line}`)
        continue
      }
      seen.add(key)
      const entry = `${p.german}|${z}`
      cats[current].push(entry)
      prev = { german: p.german, zh: z }
    }
  }

  // 生成 jiaocai.ts
  const out = []
  out.push('// 由 scripts/pdf-import.cjs 从 dychb.pdf（德语词汇表）生成，请勿手改；重跑脚本再生成。')
  out.push("// 教材词汇：分类词组 + 字母序核心词汇，已与 A1–B2 词库去重并修正个别错印。")
  out.push("import { build } from './parse'")
  out.push("import type { BankCategory } from '../../types'")
  out.push('')
  out.push('export const JIAOCAI: BankCategory[] = [')
  for (const [id, [name, nameDe]] of Object.entries(CAT_META)) {
    const lines = cats[id]
    if (!lines.length) continue
    out.push(`  build('${id}', '${name}', '${nameDe}', [`)
    for (const l of lines) out.push(`    '${l.replace(/'/g, "\\'")}',`)
    out.push('  ]),')
  }
  out.push(']')
  out.push('')
  fs.writeFileSync(path.join(process.cwd(), 'src/data/bank/jiaocai.ts'), out.join('\n'), 'utf8')

  // 断片的干净替身（在计数前追加）
  for (const [catId, entry] of POST) {
    const key = norm(entry.split('|')[0])
    if (!existing.has(key) && !seen.has(key)) {
      cats[catId].push(entry)
      seen.add(key)
    }
  }
  const total = Object.values(cats).reduce((s, a) => s + a.length, 0)
  console.log('导入条目：', total, '｜去重跳过：', skippedDup)
  for (const [id] of Object.entries(CAT_META)) console.log(' ', id, cats[id].length)
  console.log('丢弃/异常行：', junk.length)
  junk.slice(0, 40).forEach((j) => console.log('   ', j))
}

main()
