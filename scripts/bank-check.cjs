// 一次性词库体检脚本（构建后删除）
const fs = require('fs')
const path = require('path')

const dir = path.join(process.cwd(), 'src/data/bank')
const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.ts') && f !== 'parse.ts' && f !== 'index.ts')

let total = 0
const problems = []
const perFile = []

for (const f of files) {
  const lines = fs.readFileSync(path.join(dir, f), 'utf8').split(/\r?\n/)
  let count = 0
  for (const raw of lines) {
    const line = raw.trim()
    if (!line.startsWith("'") || !line.endsWith("',")) continue
    const inner = line.slice(1, -2)
    const parts = inner.split('|').map((p) => p.trim())
    const german = parts[0]
    const zh = parts[1] ?? ''
    if (!german) continue
    count++
    total++
    if (!zh) problems.push(`${f}: 无释义 -> "${german}"`)
    if (/\?$/.test(german)) problems.push(`${f}: 可疑问号 -> "${german}"`)
    if (german !== german.trim()) problems.push(`${f}: 首尾空格 -> "${german}"`)
    if (german.length < 2) problems.push(`${f}: 过短 -> "${german}"`)
  }
  perFile.push(`${f}: ${count}`)
}

console.log(perFile.join('\n'))
console.log('TOTAL:', total)
console.log(problems.length ? 'PROBLEMS:\n' + problems.join('\n') : 'OK - 无问题行')
