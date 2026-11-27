import { ipaFor } from '../lib/ipa'

function providedIpa(ipa?: string): string | undefined {
  const text = ipa?.trim()
  if (!text) return undefined
  if (text.startsWith('/') || text.startsWith('[')) return text
  return `/${text}/`
}

/**
 * 单词下方的音标。
 * 已导入词条只用牌组里的音标；没有就不显示，也不回退到词典。
 * 内置词库仍查词典，词典没有这条读音时不占位。
 */
export function IpaLine({
  text,
  ipa,
  fromImport = false,
  align = 'center',
}: {
  text: string
  ipa?: string
  fromImport?: boolean
  align?: 'center' | 'start'
}) {
  const shown = providedIpa(ipa) ?? (fromImport ? undefined : ipaFor(text))
  if (!shown) return null
  return (
    <p
      className={`mt-1.5 text-[15px] leading-relaxed tracking-wide text-zinc-500 dark:text-zinc-400 ${
        align === 'center' ? 'px-2 text-center' : 'text-left'
      }`}
      lang="de"
    >
      {shown}
    </p>
  )
}
