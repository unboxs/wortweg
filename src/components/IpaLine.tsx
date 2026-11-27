import { ipaFor } from '../lib/ipa'

/** 单词下方的音标。词典没有这条读音时不占位。 */
export function IpaLine({ text, align = 'center' }: { text: string; align?: 'center' | 'start' }) {
  const ipa = ipaFor(text)
  // 没有音标、或只剩空斜杠时不占位，避免画出「/ /」。
  if (!ipa || !ipa.replace(/[/\s]/g, '')) return null
  return (
    <p
      className={`mt-1.5 text-[15px] leading-relaxed tracking-wide text-zinc-500 dark:text-zinc-400 ${
        align === 'center' ? 'px-2 text-center' : 'text-left'
      }`}
      lang="de"
    >
      {ipa}
    </p>
  )
}
