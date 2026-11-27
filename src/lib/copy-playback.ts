/**
 * 抄写页的自动朗读只有两个时刻：
 * 词出现时一遍常速，抄对后再一遍慢速。
 * 不在这里做「常速后再接慢速」的连读，那是教学卡的行为。
 */

export interface CopyCue {
  text: string
  rate: number
}

/** 自动朗读关闭，或没有词时，不产生自动播放。 */
export function copyAutoCue(autoSpeak: boolean, text: string, rate: number): CopyCue | null {
  const german = text.trim()
  if (!autoSpeak || !german) return null
  return { text: german, rate }
}

/**
 * 抄对之后若开着自动朗读，先把慢速这一遍播完。
 * play 在失败或被跳过时也会结束，调用方要等它返回再翻到下一个词。
 * 关掉自动朗读时不会调用 play。
 */
export async function afterCorrectCopy(opts: {
  autoSpeak: boolean
  text: string
  slowRate: number
  play: (text: string, rate: number) => Promise<void>
}): Promise<void> {
  const cue = copyAutoCue(opts.autoSpeak, opts.text, opts.slowRate)
  if (!cue) return
  await opts.play(cue.text, cue.rate)
}
