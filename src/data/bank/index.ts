// 内置词库聚合。A1/A2 在前（新手第一眼），B1–B2 主题随后。
import a1 from './a1'
import a2 from './a2'
import alltag from './alltag'
import arbeit from './arbeit'
import reisen from './reisen'
import gefuehle from './gefuehle'
import meinung from './meinung'
import abstrakt from './abstrakt'
import bildung from './bildung'
import gesundheit from './gesundheit'
import wirtschaft from './wirtschaft'
import umwelt from './umwelt'
import zeit from './zeit'
import verben from './verben'
import wendungen from './wendungen'
import type { BankCategory } from '../../types'

export const BANK: BankCategory[] = [
  a1,
  a2,
  alltag,
  arbeit,
  reisen,
  gefuehle,
  meinung,
  abstrakt,
  bildung,
  gesundheit,
  wirtschaft,
  umwelt,
  zeit,
  verben,
  wendungen,
]

export const BANK_TOTAL = BANK.reduce((s, c) => s + c.entries.length, 0)
