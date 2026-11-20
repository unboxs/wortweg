// 内置 B1–B2 词库聚合。所有条目为手工整理的高频德语词汇/短语。
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
