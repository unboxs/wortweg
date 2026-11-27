import { BANK } from '../data/bank'

const NAMES = new Map(BANK.map((c) => [c.id, c.name]))

/** 词条上存的是主题 id（如 jcpruefung）。界面显示中文名，未知标签原样保留。 */
export function tagLabel(tag: string): string {
  return NAMES.get(tag) ?? tag
}
