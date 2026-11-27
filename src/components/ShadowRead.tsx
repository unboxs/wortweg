import { useEffect, useRef, useState } from 'react'
import { Mic } from 'lucide-react'
import { useSpeech } from '../hooks/useSpeech'
import { shadowMatch } from '../lib/shadow'

interface Recog extends EventTarget {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  continuous: boolean
  start: () => void
  abort: () => void
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: ((ev: { error: string }) => void) | null
  onend: (() => void) | null
}

function createRecog(): Recog | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => Recog
    webkitSpeechRecognition?: new () => Recog
  }
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
  return Ctor ? new Ctor() : null
}

/**
 * 跟读：先听示范，再让学习者开口。
 * 优先用浏览器语音识别；没有识别时尽量录音回放；两者都没有就说明原因，仍可自己跟读。
 */
export function ShadowRead({ text }: { text: string }) {
  const { speak } = useSpeech()
  const [phase, setPhase] = useState<'idle' | 'model' | 'you' | 'hearing' | 'done'>('idle')
  const [note, setNote] = useState('')
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const recogRef = useRef<Recog | null>(null)
  const urlRef = useRef<string | null>(null)

  useEffect(() => {
    setPhase('idle')
    setNote('')
    setAudioUrl(null)
    recogRef.current?.abort()
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = null
  }, [text])

  useEffect(
    () => () => {
      recogRef.current?.abort()
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    },
    [],
  )

  const selfDone = () => {
    recogRef.current?.abort()
    setPhase('done')
    setNote('这一轮跟读结束。浏览器没有采到可打分的声音，自己比着刚才的读音听辨即可。')
  }

  const start = async () => {
    recogRef.current?.abort()
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = null
    setAudioUrl(null)
    setNote('')
    setPhase('model')
    await speak(text)
    setPhase('you')

    const recog = createRecog()
    if (recog) {
      recog.lang = 'de-DE'
      recog.interimResults = false
      recog.continuous = false
      recog.maxAlternatives = 1
      let heard = ''
      recog.onresult = (ev) => {
        heard = ev.results?.[0]?.[0]?.transcript ?? ''
      }
      recog.onerror = (ev) => {
        if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
          setNote('浏览器拦住了麦克风。请再听一遍，自己跟着读，读完点「我读完了」。')
        } else if (ev.error !== 'aborted') {
          setNote('这次没有听清。再听一遍，然后跟着读。')
        }
        setPhase('you')
      }
      recog.onend = () => {
        if (!heard) {
          setPhase((current) => (current === 'hearing' ? 'you' : current))
          setNote((prev) => prev || '没有听到内容。再听一遍跟着读，或点「我读完了」。')
          return
        }
        if (shadowMatch(text, heard)) setNote(`听到了「${heard}」。和这个词比较接近。`)
        else setNote(`听到了「${heard}」。听起来还不太像，再听一遍跟着读。`)
        setPhase('done')
      }
      recogRef.current = recog
      setPhase('hearing')
      setNote('请跟着读。识别只在这台浏览器里进行，不会上传。')
      try {
        recog.start()
      } catch {
        setNote('这个浏览器没法开始语音识别。请自己跟着读，读完点「我读完了」。')
        setPhase('you')
      }
      return
    }

    if (navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        const rec = new MediaRecorder(stream)
        const chunks: Blob[] = []
        rec.ondataavailable = (e) => {
          if (e.data.size) chunks.push(e.data)
        }
        rec.onstop = () => {
          stream.getTracks().forEach((t) => t.stop())
          const url = URL.createObjectURL(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }))
          urlRef.current = url
          setAudioUrl(url)
          setNote('这个浏览器不能给跟读打分，但录下了你的声音。放一遍，和刚才的读音比一比。录音不会上传。')
          setPhase('done')
        }
        setPhase('hearing')
        setNote('请跟着读。正在录音，大约三秒，不会上传。')
        rec.start()
        window.setTimeout(() => {
          if (rec.state === 'recording') rec.stop()
        }, 3500)
        return
      } catch {
        setNote('这个浏览器不能采集语音。请再听一遍，自己跟着读，读完点「我读完了」。')
        setPhase('you')
        return
      }
    }

    setNote('这个浏览器不能采集语音。请再听一遍，自己跟着读，读完点「我读完了」。')
    setPhase('you')
  }

  return (
    <div className="mx-auto mt-8 w-full max-w-md rounded-2xl border border-zinc-200 p-4 text-left dark:border-white/10">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Mic size={15} className="text-amber-500 dark:text-amber-300" />
        跟读
      </div>
      <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">先听示范，再自己读一遍。</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-gold h-9" onClick={() => void start()} disabled={phase === 'model' || phase === 'hearing'}>
          {phase === 'model' ? '正在朗读…' : phase === 'hearing' ? '请跟着读…' : '开始跟读'}
        </button>
        {phase === 'you' && (
          <button type="button" className="btn btn-ghost h-9" onClick={selfDone}>
            我读完了
          </button>
        )}
      </div>
      {note && <p className="mt-3 text-sm leading-relaxed text-zinc-900 dark:text-zinc-50">{note}</p>}
      {audioUrl && <audio className="mt-3 w-full" src={audioUrl} controls />}
    </div>
  )
}
