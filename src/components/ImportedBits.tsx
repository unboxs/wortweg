import { useEffect, useState } from 'react'
import { Volume2 } from 'lucide-react'
import { mediaObjectUrl, playDeckAudio } from '../lib/apkg/playback'
import type { EntryExample, ImportedGrammar } from '../types'

export function DeckImage({
  deckId,
  name,
  className = 'mx-auto mb-4 max-h-52 w-auto rounded-xl object-contain',
}: {
  deckId?: string
  name?: string
  className?: string
}) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!deckId || !name) {
      setUrl(null)
      return
    }
    let cancelled = false
    void mediaObjectUrl(deckId, name).then((next) => {
      if (!cancelled) setUrl(next)
    })
    return () => {
      cancelled = true
    }
  }, [deckId, name])
  if (!url) return null
  return <img src={url} alt="" className={className} />
}

export function GrammarLine({ grammar, level }: { grammar?: ImportedGrammar; level?: string }) {
  if (!grammar && !level) return null
  const parts: string[] = []
  if (level) parts.push(level)
  if (grammar?.pos) parts.push(grammar.pos)
  if (grammar?.plural) parts.push(`复数 ${grammar.plural}`)
  if (grammar?.genitive) parts.push(`二格 ${grammar.genitive}`)
  const verb = [grammar?.pres3, grammar?.praet, grammar?.partizip].filter(Boolean)
  if (verb.length) parts.push(verb.join(' · '))
  if (grammar?.aux) parts.push(`助动词 ${grammar.aux}`)
  if (grammar?.comparative || grammar?.superlative) parts.push([grammar.comparative, grammar.superlative].filter(Boolean).join(' · '))
  if (grammar?.government) parts.push(`支配 ${grammar.government}`)
  if (grammar?.separable) parts.push(grammar.separable === '可分' ? '可分动词' : `可分 ${grammar.separable}`)
  if (grammar?.reflexive) parts.push(grammar.reflexive === '反身' ? '反身' : grammar.reflexive)
  if (grammar?.feminine) parts.push(`阴性 ${grammar.feminine}`)
  if (grammar?.verbClass) parts.push(grammar.verbClass)
  if (grammar?.nDeclension) parts.push(grammar.nDeclension)
  if (parts.length === 0) return null
  return <p className="mt-2 text-xs leading-relaxed text-zinc-400 dark:text-zinc-500">{parts.join(' · ')}</p>
}

export function ExampleList({
  examples,
  fallback,
  deckId,
  align = 'center',
}: {
  examples?: EntryExample[]
  fallback?: string
  deckId?: string
  align?: 'center' | 'start'
}) {
  const rows = examples?.filter((example) => example.de) ?? []
  if (rows.length === 0) {
    if (!fallback) return null
    const compact = align === 'start'
    return (
      <div className={`${compact ? 'mt-1 text-xs' : 'mt-3 text-sm'} italic text-zinc-400 dark:text-zinc-500 ${compact ? 'text-left' : ''}`}>
        „{fallback}“
      </div>
    )
  }
  return (
    <ul className={`mt-3 space-y-2 text-sm ${align === 'center' ? '' : 'text-left'}`}>
      {rows.map((example, index) => (
        <li key={`${example.de}-${index}`} className="text-zinc-400 dark:text-zinc-500">
          <div className={`flex items-start gap-2 italic ${align === 'center' ? 'justify-center' : 'justify-start'}`}>
            <span>„{example.de}“</span>
            {example.audioName && deckId && (
              <button
                type="button"
                className="mt-0.5 shrink-0 cursor-pointer rounded-md p-1 text-zinc-400 hover:bg-amber-400/15 hover:text-amber-500 dark:hover:text-amber-300"
                title="播放例句原声"
                onClick={() => void playDeckAudio(deckId, example.audioName!, 1)}
              >
                <Volume2 size={14} />
              </button>
            )}
          </div>
          {example.zh && <div className={`text-xs not-italic text-zinc-500 ${align === 'center' ? 'text-center' : 'text-left'}`}>{example.zh}</div>}
        </li>
      ))}
    </ul>
  )
}
