// 一次性脚本：提取 dychb.pdf 的文本到 scripts/dychb.txt（带页码），供检查与解析
const fs = require('fs')
const path = require('path')
const { PDFParse } = require('pdf-parse')

async function main() {
  const buf = fs.readFileSync(path.join(process.cwd(), 'dychb.pdf'))
  const parser = new PDFParse({ data: buf })
  const result = await parser.getText()
  parser.destroy()
  const pages = (result.pages || []).map((p, i) => `=== PAGE ${i + 1} ===\n${(p.text || '').trim()}`)
  console.log('pages:', pages.length, 'totalChars:', pages.join('').length)
  fs.writeFileSync(path.join(process.cwd(), 'scripts', 'dychb.txt'), pages.join('\n\n'), 'utf8')
  console.log('written scripts/dychb.txt')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
