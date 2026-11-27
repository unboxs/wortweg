import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Check, FlaskConical, Gem, PenLine, Turtle, TrendingUp, Volume2, X } from 'lucide-react'
import { useStore } from '../store'
import { useSpeech } from '../hooks/useSpeech'
import { activeEntries, canDistill, clampCooldown, daysLeft, normalizeDe, roundName, stageOf } from '../lib/goldlist'
import { Gloss } from '../components/Gloss'
import { TtsNotice } from '../components/TtsNotice'
import { IpaLine } from '../components/IpaLine'
import { Bar, EmptyState, Modal } from '../components/ui'
import type { DistillResult, GList } from '../types'

export default function Distill() {
  const { id } = useParams()
  const nav = useNavigate()
  const list = useStore((s) => s.lists.find((l) => l.id === id))
  const settings = useStore((s) => s.settings)
  const distillList = useStore((s) => s.distillList)
  const { speak } = useSpeech()
  // 开始/翻到下一词时在点击里朗读；effect 再读会叠声，跳过那一次。
  const skipAutoRef = useRef(false)

  const [started, setStarted] = useState(false)
  const [idx, setIdx] = useState(0)
  const [remembered, setRemembered] = useState<string[]>([])
  const [typed, setTyped] = useState('')
  const [confirmExit, setConfirmExit] = useState(false)
  const [result, setResult] = useState<DistillResult | null>(null)

  const active = useMemo(() => (list ? activeEntries(list) : []), [list])
  const entry = active[idx]

  const judge = useCallback(
    (got: boolean) => {
      if (!list || !entry || !canDistill(list, settings.cooldownDays)) return
      const next = got ? [...remembered, entry.id] : remembered
      if (idx + 1 >= active.length) {
        const outcome = distillList(list.id, next)
        if (outcome) setResult(outcome)
      } else {
        const upcoming = active[idx + 1]
        if (settings.autoSpeak && upcoming) {
          skipAutoRef.current = true
          speak(upcoming.german)
        }
        setRemembered(next)
        setIdx(idx + 1)
        setTyped('')
      }
    },
    [list, entry, idx, remembered, active, distillList, settings.autoSpeak, speak],
  )

  // 每个词条出现时自动朗读（可在设置关闭）
  useEffect(() => {
    if (!started || !entry || result) return
    if (skipAutoRef.current) {
      skipAutoRef.current = false
      return
    }
    if (settings.autoSpeak) speak(entry.german)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, idx, entry?.id, result])

  // 键盘：空格 = 记住了，N = 还没，S = 朗读，D = 慢速。抄写输入框内不触发。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!started || result || !entry) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      if (e.key === ' ') {
        e.preventDefault()
        judge(true)
      } else if (e.key.toLowerCase() === 'n') judge(false)
      else if (e.key.toLowerCase() === 's') speak(entry.german)
      else if (e.key.toLowerCase() === 'd') speak(entry.german, settings.slowRate)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, judge, result, entry?.id, settings.slowRate])

  // ── 分支渲染（hook 已全部调用完毕，可以安全 return） ──
  if (!list)
    return (
      <div className="flex min-h-dvh items-center justify-center p-4">
        <EmptyState title="列表不存在">
          <Link to="/lists" className="btn btn-ghost h-9">返回</Link>
        </EmptyState>
      </div>
    )

  if (result) return <Summary list={list} result={result} />

  const stage = stageOf(list, settings.cooldownDays)
  if (stage === 'writing' || stage === 'cooling') {
    const left = daysLeft(list, settings.cooldownDays)
    return (
      <div className="flex min-h-dvh items-center justify-center p-4">
        <div className="card w-full max-w-md p-7">
          <h1 className="text-xl font-bold tracking-tight">{stage === 'writing' ? '还没抄写完' : '还在冷却'}</h1>
          <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
            {stage === 'writing'
              ? '这份列表要先逐词抄写，冷却才会开始。直接打开蒸馏地址也不会把词记成长期记忆。'
              : `还要 ${left} 天才能蒸馏（冷却期 ${clampCooldown(settings.cooldownDays)} 天）。直接打开这个地址也不能提前蒸馏。`}
          </p>
          <div className="mt-5 flex gap-2">
            <Link to={`/lists/${list.id}`} className="btn btn-ghost flex-1">返回列表</Link>
            {stage === 'writing' && (
              <Link to={`/write/${list.id}`} className="btn btn-gold flex-1">继续抄写</Link>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (active.length === 0)
    return (
      <div className="flex min-h-dvh items-center justify-center p-4">
        <EmptyState title="这份列表已全部入册" desc="所有词条都经受住了蒸馏，进入长期记忆。">
          <Link to={`/lists/${list.id}`} className="btn btn-gold h-9">查看列表</Link>
        </EmptyState>
      </div>
    )

  // ── 开始前的仪式说明 ──
  if (!started)
    return (
      <div className="flex min-h-dvh items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card w-full max-w-md p-7">
          <div className="flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-500">
            <FlaskConical size={14} className="text-amber-500 dark:text-amber-300" />
            {list.name} · 即将进入 {roundName(list.round + 1)}
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight">蒸馏 {active.length} 个词</h1>
          <ul className="mt-4 space-y-2.5 text-sm text-zinc-600 dark:text-zinc-300">
            <li>· 看着每个词，听一遍发音，问自己：<span className="font-medium">记住了吗？</span></li>
            <li>· 诚实作答 —— 需要费力回想就选「还没记住」，不必羞愧</li>
            <li>· 记住的词就此留下（入长期记忆），没记住的进入下一轮</li>
            <li>· 不许翻之前的记录 —— 这是和自己的自然遗忘曲线合作</li>
          </ul>
          <label className="mt-5 flex cursor-pointer items-center justify-between rounded-xl border border-zinc-200 p-3.5 dark:border-white/10">
            <span className="flex items-center gap-2 text-sm">
              <PenLine size={14} className="text-zinc-400" />
              抄写模式
              <span className="text-[11px] text-zinc-400">（可选仪式感，不强制）</span>
            </span>
            <input
              type="checkbox"
              className="h-4 w-4 accent-amber-400"
              checked={settings.writeMode}
              onChange={(e) => useStore.getState().setSettings({ writeMode: e.target.checked })}
            />
          </label>
          <div className="mt-5 flex gap-2">
            <button className="btn btn-ghost flex-1" onClick={() => nav(`/lists/${list.id}`)}>
              返回
            </button>
            <button
              className="btn btn-gold flex-1"
              onClick={() => {
                if (settings.autoSpeak && active[0]) {
                  skipAutoRef.current = true
                  speak(active[0].german)
                }
                setStarted(true)
              }}
            >
              开始蒸馏 <ArrowRight size={15} />
            </button>
          </div>
        </motion.div>
      </div>
    )

  // ── 蒸馏进行中 ──
  const typedOk = settings.writeMode && normalizeDe(typed) === normalizeDe(entry?.german ?? '')

  return (
    <div className="flex min-h-dvh flex-col bg-zinc-50 dark:bg-[#0c0c0e]">
      {/* 顶部：退出 + 进度 */}
      <div className="px-5 pt-5">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <button onClick={() => setConfirmExit(true)} className="cursor-pointer rounded-lg p-1.5 text-zinc-400 transition hover:text-zinc-700 dark:hover:text-zinc-200">
            <X size={18} />
          </button>
          <span className="text-xs tabular-nums text-zinc-400">
            {roundName(list.round + 1)} · {idx + 1} / {active.length}
          </span>
          <Bar pct={(idx + (result ? 1 : 0)) / active.length} gold />
          <span className="text-xs tabular-nums text-amber-500 dark:text-amber-300">{remembered.length} 已记住</span>
        </div>
      </div>

      {/* 卡片 */}
      <div className="flex flex-1 items-center justify-center px-5 py-8">
        {/* 只进不出：新卡立即挂载淡入，无退场完成依赖（mode="wait" 在失焦窗口会永久卡死） */}
        <motion.div
          key={entry.id}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22 }}
          className="w-full max-w-xl text-center"
        >
            <h2 className="px-2 text-4xl font-bold tracking-tight sm:text-5xl">{entry.german}</h2>
            <IpaLine text={entry.german} />

            {/* 释义稍后浮现 —— 被动吸收，不逼抢答 */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="mt-4">
              <Gloss>{(settings.meaningLang === 'en' && entry.en ? entry.en : entry.zh) || '—'}</Gloss>
              {entry.example && <div className="mt-3 text-sm italic text-zinc-600 dark:text-zinc-300">„{entry.example}“</div>}
              {entry.note && <div className="mt-3 text-xs text-amber-700 dark:text-amber-200">笔记 · {entry.note}</div>}
            </motion.div>

            {/* 发音 */}
            <div className="mt-7 flex items-center justify-center gap-3">
              <button onClick={() => speak(entry.german)} className="btn btn-gold h-11 w-11 rounded-full px-0">
                <Volume2 size={18} />
              </button>
              <button onClick={() => speak(entry.german, settings.slowRate)} className="btn btn-ghost h-11 w-11 rounded-full px-0">
                <Turtle size={17} />
              </button>
            </div>
            <TtsNotice text={entry.german} />

            {/* 抄写模式 */}
            {settings.writeMode && (
              <div className="mx-auto mt-6 flex max-w-xs items-center gap-2">
                <input
                  autoFocus
                  className="input text-center font-mono"
                  placeholder="试着凭听写抄下这个词…"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                />
                {/* 不用嵌套 AnimatePresence：外层 mode="wait" 会等嵌套退场而卡死 */}
                {typedOk && (
                  <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}>
                    <Check size={20} className="text-amber-400" strokeWidth={3} />
                  </motion.span>
                )}
              </div>
            )}
          </motion.div>
      </div>

      {/* 判断按钮 */}
      <div className="px-5 pb-8">
        <div className="mx-auto flex max-w-xl gap-3">
          <button onClick={() => judge(false)} className="btn btn-ghost h-14 flex-1 text-base">
            还没记住 <span className="kbd ml-1">N</span>
          </button>
          <button onClick={() => judge(true)} className="btn btn-gold h-14 flex-1 text-base">
            记住了 <span className="kbd ml-1 border-zinc-800/40 text-zinc-800">空格</span>
          </button>
        </div>
        <p className="mt-3 text-center text-[11px] text-zinc-400 dark:text-zinc-600">
          被动吸收 · 不闪卡 · 不自欺 —— <span className="kbd">S</span> 朗读 <span className="kbd">D</span> 慢速
        </p>
      </div>

      <Modal
        open={confirmExit}
        title="中途退出蒸馏？"
        onClose={() => setConfirmExit(false)}
        footer={
          <>
            <button className="btn btn-ghost h-9" onClick={() => setConfirmExit(false)}>继续蒸馏</button>
            <button className="btn btn-danger h-9" onClick={() => nav(`/lists/${list.id}`)}>退出（丢弃本轮判断）</button>
          </>
        }
      >
        本轮已作出的判断尚未保存，退出后不会生效。建议坚持走完 —— 通常只需几分钟。
      </Modal>
    </div>
  )
}

// ─── 蒸馏总结 ────────────────────────────────────────────────────────────

function Summary({ list, result }: { list: GList; result: DistillResult }) {
  const nav = useNavigate()
  const pct = Math.round(result.keptRatio * 100)
  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="card w-full max-w-md overflow-hidden p-0">
        <div className="border-b border-zinc-100 p-7 text-center dark:border-white/5">
          {result.listDone ? (
            <>
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.15 }} className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-amber-400/15">
                <Gem size={26} className="text-amber-500 dark:text-amber-300" />
              </motion.div>
              <h1 className="text-2xl font-bold tracking-tight">列表完成！</h1>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                「{list.name}」的每一个词都通过了全部蒸馏，整份进入长期记忆。
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold tracking-tight">本轮蒸馏完成</h1>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                {result.reviewed} 个词检视完毕，冷却时钟已重置。
              </p>
            </>
          )}

          <div className="mt-6 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-amber-400/10 p-3">
              <div className="text-2xl font-bold tabular-nums text-gold-gradient">{result.mastered}</div>
              <div className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">送入长期记忆</div>
            </div>
            <div className="rounded-xl bg-zinc-100 p-3 dark:bg-white/5">
              <div className="text-2xl font-bold tabular-nums">{result.kept}</div>
              <div className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">带入 {roundName(list.round)}</div>
            </div>
            <div className="rounded-xl bg-zinc-100 p-3 dark:bg-white/5">
              <div className="text-2xl font-bold tabular-nums">{pct}%</div>
              <div className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">保留率</div>
            </div>
          </div>

          <p className="mt-4 text-xs text-zinc-400 dark:text-zinc-500">
            {result.kept > 0
              ? pct >= 55 && pct <= 75
                ? '保留率落在自然的 60–70% 区间 —— 你的大脑正按遗忘曲线工作。'
                : '保留率不在典型区间也没关系：偏小说明吸收极好，偏大说明这批词偏难。'
              : '全部记住 —— 恭喜，这份 Headlist 一次性毕业。'}
          </p>
        </div>

        <div className="flex flex-col gap-2 p-5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">获得经验</span>
            <span className="font-semibold text-amber-600 dark:text-amber-300">+{result.xpGained} XP</span>
          </div>
          {result.levelAfter > result.levelBefore && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-500 dark:text-zinc-400">等级</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-300">
                Lv.{result.levelBefore} → Lv.{result.levelAfter}
              </span>
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <button className="btn btn-ghost flex-1" onClick={() => nav('/progress')}>
              <TrendingUp size={15} /> 词汇森林
            </button>
            <button className="btn btn-gold flex-1" onClick={() => nav(`/lists/${list.id}`)}>
              返回列表
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
