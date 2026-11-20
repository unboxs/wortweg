// numberToGerman 合成规则自检（node scripts/numbers-check.ts）
import { numberToGerman } from '../src/lib/numbers.ts'

const cases: [number, string][] = [
  [0, 'null'], [1, 'eins'], [7, 'sieben'], [10, 'zehn'], [11, 'elf'], [12, 'zwölf'],
  [16, 'sechzehn'], [17, 'siebzehn'], [20, 'zwanzig'], [21, 'einundzwanzig'],
  [42, 'zweiundvierzig'], [60, 'sechzig'], [67, 'siebenundsechzig'],
  [100, 'hundert'], [101, 'einhunderteins'], [121, 'einhunderteinundzwanzig'],
  [200, 'zweihundert'], [999, 'neunhundertneunundneunzig'],
  [1000, 'eintausend'], [1234, 'eintausendzweihundertvierunddreißig'],
  [2000, 'zweitausend'], [3030, 'dreitausenddreißig'],
  [9999, 'neuntausendneunhundertneunundneunzig'],
]

let fail = 0
for (const [n, want] of cases) {
  const got = numberToGerman(n)
  if (got !== want) {
    fail++
    console.error(`FAIL  ${n}: want "${want}" got "${got}"`)
  }
}
const bad = [numberToGerman(-1), numberToGerman(10000), numberToGerman(12.5)].filter((s) => s !== '')
if (bad.length) {
  fail++
  console.error('FAIL  非法输入未返回空串:', bad)
}
console.log(fail === 0 ? `${cases.length} 组数字合成 + 边界全部正确` : `${fail} 项失败`)
process.exit(fail ? 1 : 0)
