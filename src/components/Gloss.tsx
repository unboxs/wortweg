import type { ReactNode } from 'react'

/** 中文释义。要比德语词小一号，但对比度不能再压成灰色。 */
export function Gloss({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`text-xl font-medium leading-snug text-zinc-900 dark:text-zinc-50 ${className}`}>{children}</p>
}
