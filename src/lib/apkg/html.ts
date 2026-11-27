const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  '#39': "'",
}

export function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (full, body: string) => {
    if (body[0] === '#') {
      const hex = body[1] === 'x' || body[1] === 'X'
      const code = hex ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10)
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return full
      try {
        return String.fromCodePoint(code)
      } catch {
        return full
      }
    }
    return NAMED[body.toLowerCase()] ?? full
  })
}

/** Anki 字段里的 [sound:file.mp3]。外链不取，避免去网上拉文件。 */
export function soundNames(html: string): string[] {
  const out: string[] = []
  const re = /\[sound:([^\]]+)\]/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(html))) {
    const name = decodeEntities(match[1] ?? '').trim()
    if (!name || /^https?:/i.test(name)) continue
    out.push(name)
  }
  return out
}

/** <img src="file.jpg">。data: 和外链都不收。 */
export function imageNames(html: string): string[] {
  const out: string[] = []
  const re = /<img\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(html))) {
    const raw = match[1] ?? match[2] ?? match[3] ?? ''
    let name = decodeEntities(raw).trim()
    try {
      name = decodeURIComponent(name)
    } catch {
      /* 保留原样 */
    }
    name = name.split('?')[0]?.split('#')[0] ?? name
    if (!name || /^(https?:|data:|blob:)/i.test(name)) continue
    const base = name.split('/').pop() || name
    if (base && base !== '.' && base !== '..') out.push(base)
  }
  return out
}

export function stripHtml(html: string): string {
  let text = html.replace(/\r\n/g, '\n')
  text = text.replace(/\[sound:[^\]]*\]/gi, ' ')
  text = text.replace(/<img\b[^>]*>/gi, ' ')
  text = text.replace(/\{\{c\d+::([^}:]+)(?:::[^}]*)?\}\}/g, '$1')
  text = text.replace(/<br\s*\/?>/gi, '\n')
  text = text.replace(/<\/(div|p|li|tr|h\d)>/gi, '\n')
  text = text.replace(/<[^>]+>/g, '')
  text = decodeEntities(text).replace(/\u00a0/g, ' ')
  text = text
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line, index, all) => line.length > 0 || (index > 0 && all[index - 1]?.length))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return text
}
