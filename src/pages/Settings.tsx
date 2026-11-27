import { useEffect, useRef, useState } from 'react'
import { Download, FileUp, Moon, Sun, Trash2, Volume2 } from 'lucide-react'
import { useStore, exportBackupJSON, exportMasteredCSV } from '../store'
import { useGermanVoices, useSpeech } from '../hooks/useSpeech'
import { PROXY_STATUS_EVENT, armProxyPreview, isMobileSpeechDevice, readProxyStatus, type ProxyStatus } from '../lib/tts'
import { ELEVEN_VOICES, VOICERSS_VOICES, voiceForSource } from '../../functions/tts-contract.ts'
import { Modal, SectionTitle } from '../components/ui'
import { BANK } from '../data/bank'
import type { TtsSource } from '../types'

const VOICE_LABEL: Record<string, string> = {
  Hanna: 'Hanna（女）',
  Lina: 'Lina（女）',
  Jonas: 'Jonas（男）',
  Lily: 'Lily（女）',
  Charlotte: 'Charlotte（女）',
  Daniel: 'Daniel（男）',
}

const SOURCE_HINT: Record<TtsSource, string> = {
  system: '用操作系统/浏览器自带语音。离线可用，音质取决于已装的德语语音包。',
  voicerss:
    'VoiceRSS 德语音色（Hanna / Lina / Jonas）。浏览器只向本站要音频，由 Cloudflare 去调用 VoiceRSS，密钥留在服务端。慢速用播放倍速。失败时回落系统语音。',
  elevenlabs:
    'ElevenLabs 德语合成（Lily / Charlotte / Daniel）。同样只请求本站代理，密钥不进浏览器。慢速用播放倍速。失败时回落系统语音。',
}

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const stamp = () => new Date().toISOString().slice(0, 10)
const PREVIEW_PHRASE = 'Guten Tag! Ich lerne gern Deutsch.'

function useProxyStatus(): ProxyStatus | null {
  const [status, setStatus] = useState<ProxyStatus | null>(() => readProxyStatus())
  useEffect(() => {
    const onStatus = (event: Event) => {
      const detail = (event as CustomEvent<ProxyStatus>).detail
      setStatus(detail?.state === 'ready' ? null : detail)
    }
    window.addEventListener(PROXY_STATUS_EVENT, onStatus)
    return () => window.removeEventListener(PROXY_STATUS_EVENT, onStatus)
  }, [])
  return status
}

export default function Settings() {
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const importData = useStore((s) => s.importData)
  const resetAll = useStore((s) => s.resetAll)
  const lists = useStore((s) => s.lists)
  const voices = useGermanVoices()
  const { speak } = useSpeech()
  const proxyStatus = useProxyStatus()
  const preview = () => {
    armProxyPreview()
    void speak(PREVIEW_PHRASE)
  }
  const fileRef = useRef<HTMLInputElement>(null)
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const masteredCount = lists.flatMap((l) => l.entries).filter((e) => e.mastered).length

  const onFile = async (f: File) => {
    const raw = await f.text()
    const r = importData(raw)
    setImportMsg(r.ok ? '✓ 导入成功，数据已替换' : `导入失败：${r.error}`)
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      {/* 学习 */}
      <section>
        <SectionTitle>学习节奏</SectionTitle>
        <div className="card space-y-6 p-5">
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <label className="text-sm font-medium">冷却期（蒸馏间隔）</label>
              <span className="text-sm font-semibold tabular-nums text-amber-600 dark:text-amber-300">{settings.cooldownDays} 天</span>
            </div>
            <input
              type="range" min={5} max={30} step={1}
              className="w-full accent-amber-400"
              value={settings.cooldownDays}
              onChange={(e) => setSettings({ cooldownDays: Number(e.target.value) })}
            />
            <p className="mt-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">
              Goldlist 原版为 14 天 —— 短期记忆在此期间自然消退，剩下的才是真会的。修改后所有列表状态即时重算。
            </p>
          </div>
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <label className="text-sm font-medium">每日目标</label>
              <span className="text-sm font-semibold tabular-nums text-amber-600 dark:text-amber-300">{settings.dailyGoal} 词</span>
            </div>
            <input
              type="range" min={0} max={100} step={5}
              className="w-full accent-amber-400"
              value={settings.dailyGoal}
              onChange={(e) => setSettings({ dailyGoal: Number(e.target.value) })}
            />
            <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-400 dark:text-zinc-500">
              有列表可以蒸馏时，计蒸馏检视的词条。还没有可蒸馏的列表时（例如第一份还在冷却），计学习模式里练过的词条，空等不算失败。设为 0 关闭。
            </p>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">释义显示语言</label>
            <div className="flex gap-2">
              {([['zh', '中文'], ['en', 'English']] as const).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setSettings({ meaningLang: k })}
                  className={`chip border ${
                    settings.meaningLang === k
                      ? 'border-amber-400/60 bg-amber-400/10 text-amber-600 dark:text-amber-300'
                      : 'border-zinc-200 text-zinc-500 dark:border-white/10 dark:text-zinc-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">
              内置词库以中文释义为主；手动创建的词条可同时填英文，选择 English 时优先显示。
            </p>
          </div>
        </div>
      </section>

      {/* TTS */}
      <section>
        <SectionTitle>德语发音</SectionTitle>
        <div className="card space-y-5 p-5">
          <div>
            <label className="mb-2 block text-sm font-medium">发音源</label>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['system', '系统语音'],
                  ['voicerss', '在线 · VoiceRSS'],
                  ['elevenlabs', '在线 · ElevenLabs'],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setSettings({ ttsSource: k })}
                  className={`chip border ${
                    settings.ttsSource === k
                      ? 'border-amber-400/60 bg-amber-400/10 text-amber-600 dark:text-amber-300'
                      : 'border-zinc-200 text-zinc-500 dark:border-white/10 dark:text-zinc-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {settings.ttsSource !== 'system' && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {(settings.ttsSource === 'voicerss' ? VOICERSS_VOICES : ELEVEN_VOICES).map((v) => (
                  <button
                    key={v}
                    onClick={() => setSettings({ onlineVoice: v })}
                    className={`chip border ${
                      voiceForSource(settings.ttsSource, settings.onlineVoice) === v
                        ? 'border-amber-400/60 bg-amber-400/10 text-amber-600 dark:text-amber-300'
                        : 'border-zinc-200 text-zinc-500 dark:border-white/10 dark:text-zinc-400'
                    }`}
                  >
                    {VOICE_LABEL[v]}
                  </button>
                ))}
                <button className="btn btn-ghost h-9 shrink-0" onClick={preview}>
                  <Volume2 size={15} /> 试听
                </button>
              </div>
            )}
            <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-400 dark:text-zinc-500">
              {SOURCE_HINT[settings.ttsSource] ?? SOURCE_HINT.system}
              {settings.ttsSource !== 'system' && ' 试听短语是「Guten Tag! Ich lerne gern Deutsch.」。'}
            </p>
            {proxyStatus?.state === 'unconfigured' && (settings.ttsSource === 'voicerss' || settings.ttsSource === 'elevenlabs') && (
              <p className="mt-2 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-[11px] leading-relaxed text-amber-800 dark:text-amber-100">
                在线发音还没配好。Cloudflare 里还没有 {proxyStatus.secret}，试听和学习朗读暂时用系统语音。写好这个密钥并重新部署后，再点试听才会是在线合成。
              </p>
            )}
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">
              {settings.ttsSource === 'system' ? '德语语音' : '回落用的系统语音'}
            </label>
            <div className="flex gap-2">
              <select
                className="input flex-1"
                value={settings.voiceURI}
                onChange={(e) => setSettings({ voiceURI: e.target.value })}
              >
                <option value="">自动选择（推荐 de-DE）</option>
                {voices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name}（{v.lang}）
                  </option>
                ))}
              </select>
              {settings.ttsSource === 'system' && (
                <button className="btn btn-ghost h-9 shrink-0" onClick={preview}>
                  <Volume2 size={15} /> 试听
                </button>
              )}
            </div>
            <p className="mt-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">
              {settings.ttsSource === 'system'
                ? '语音列表来自你的操作系统/浏览器。Windows 推荐安装德语语音包以获得最佳音质。试听短语是「Guten Tag! Ich lerne gern Deutsch.」。'
                : '在线发音失败时用这里的系统嗓音接着读。上面的试听针对当前在线发音源。'}
            </p>
            {settings.ttsSource === 'system' && voices.length === 0 && (
              <div className="mt-2 rounded-lg border border-amber-400/50 bg-amber-400/10 px-3 py-3 text-[12px] leading-relaxed text-amber-950 dark:text-amber-50">
                <p className="font-medium">这台设备没有德语系统语音。点朗读不会静默跳过，页面上会说明没读出来。</p>
                <p className="mt-1">可以直接改用在线发音。密钥在 Cloudflare，不在这个网页里。</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" className="btn btn-gold h-9" onClick={() => setSettings({ ttsSource: 'voicerss', onlineVoice: 'Hanna' })}>
                    改用 VoiceRSS
                  </button>
                  <button type="button" className="btn btn-ghost h-9" onClick={() => setSettings({ ttsSource: 'elevenlabs', onlineVoice: 'Lily' })}>
                    改用 ElevenLabs
                  </button>
                </div>
                <p className="mt-2 text-[11px] opacity-80">
                  {isMobileSpeechDevice()
                    ? '手机通常没有德语系统语音，用上面的在线源即可。'
                    : '也可以在系统里安装德语语音包后重启浏览器。Windows：设置 → 时间和语言 → 添加德语，并勾选语音组件。'}
                </p>
              </div>
            )}
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <label className="text-sm font-medium">常速</label>
                <span className="text-xs tabular-nums text-zinc-400">{settings.rate.toFixed(2)}×</span>
              </div>
              <input type="range" min={0.5} max={1.3} step={0.05} className="w-full accent-amber-400"
                value={settings.rate} onChange={(e) => setSettings({ rate: Number(e.target.value) })} />
            </div>
            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <label className="text-sm font-medium">慢速</label>
                <span className="text-xs tabular-nums text-zinc-400">{settings.slowRate.toFixed(2)}×</span>
              </div>
              <input type="range" min={0.4} max={0.9} step={0.05} className="w-full accent-amber-400"
                value={settings.slowRate} onChange={(e) => setSettings({ slowRate: Number(e.target.value) })} />
            </div>
          </div>
          <label className="flex cursor-pointer items-start justify-between gap-4 text-sm">
            <span>
              出现词条时自动朗读
              <span className="mt-1 block text-[11px] font-normal leading-relaxed text-zinc-400 dark:text-zinc-500">
                抄写页：词一出现读常速一遍，抄对后再读慢速一遍，读完才进入下一个。教学和蒸馏也会自动读。关掉后这两次不会自己开始，手动朗读按钮仍然可用。
              </span>
            </span>
            <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-amber-400"
              checked={settings.autoSpeak} onChange={(e) => setSettings({ autoSpeak: e.target.checked })} />
          </label>
        </div>
      </section>

      {/* 外观 */}
      <section>
        <SectionTitle>外观</SectionTitle>
        <div className="card flex items-center justify-between p-5">
          <span className="text-sm">主题 —— 深色为默认，金色点缀呼应 Goldlist</span>
          <div className="flex rounded-xl border border-zinc-200 p-1 dark:border-white/10">
            <button
              onClick={() => setSettings({ theme: 'dark' })}
              className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition ${settings.theme === 'dark' ? 'bg-amber-400/15 text-amber-600 dark:text-amber-300' : 'text-zinc-400'}`}
            >
              <Moon size={14} /> 深色
            </button>
            <button
              onClick={() => setSettings({ theme: 'light' })}
              className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition ${settings.theme === 'light' ? 'bg-amber-400/15 text-amber-600 dark:text-amber-300' : 'text-zinc-400'}`}
            >
              <Sun size={14} /> 亮色
            </button>
          </div>
        </div>
      </section>

      {/* 数据 */}
      <section>
        <SectionTitle>数据（仅存本机 localStorage）</SectionTitle>
        <div className="card space-y-3 p-5">
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-ghost" onClick={() => download(`wortweg-backup-${stamp()}.json`, exportBackupJSON(), 'application/json')}>
              <Download size={15} /> 导出完整备份 (JSON)
            </button>
            <button className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
              <FileUp size={15} /> 导入备份
            </button>
            <button
              className="btn btn-ghost"
              disabled={masteredCount === 0}
              onClick={() => download(`wortweg-mastered-${stamp()}.csv`, exportMasteredCSV(), 'text/csv;charset=utf-8')}
            >
              <Download size={15} /> 导出已掌握 {masteredCount} 词 (CSV)
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onFile(f)
                e.target.value = ''
              }}
            />
          </div>
          {importMsg && <p className="text-xs text-amber-600 dark:text-amber-300">{importMsg}</p>}
          <div className="flex items-center justify-between border-t border-zinc-100 pt-3 dark:border-white/5">
            <span className="text-xs text-zinc-400 dark:text-zinc-500">危险区</span>
            <button className="btn btn-danger h-9" onClick={() => setConfirmReset(true)}>
              <Trash2 size={14} /> 清空全部数据
            </button>
          </div>
        </div>
      </section>

      {/* 关于 */}
      <section>
        <SectionTitle>关于 Wortweg</SectionTitle>
        <div className="card space-y-2 p-5 text-sm text-zinc-500 dark:text-zinc-400">
          <p>
            Wortweg（"词语之路"）用 Goldlist：抄写一份 Headlist → 冷却
            {' '}{settings.cooldownDays} 天 → 蒸馏只留没记住的。面向 B1 和 B2，不闪卡、不逼回忆。
          </p>
          <p>
            内置词库共 {BANK.reduce((s, c) => s + c.entries.length, 0)} 条、{BANK.length} 个主题：
            A1 {BANK.find((c) => c.id === 'a1')?.entries.length ?? 0}、
            A2 {BANK.find((c) => c.id === 'a2')?.entries.length ?? 0}、
            B1–B2 主题 {BANK.filter((c) => !c.id.startsWith('jc') && c.id !== 'a1' && c.id !== 'a2').reduce((s, c) => s + c.entries.length, 0)}、
            教材分类 {BANK.filter((c) => c.id.startsWith('jc')).reduce((s, c) => s + c.entries.length, 0)}。
            不是只有 B2。全部存在本机浏览器。
          </p>
          <p className="text-xs">v1.0 · 学习数据只在本机。在线发音经本站 Cloudflare 代理，密钥不在浏览器里。</p>
        </div>
      </section>

      <Modal
        open={confirmReset}
        title="清空全部数据？"
        onClose={() => setConfirmReset(false)}
        footer={
          <>
            <button className="btn btn-ghost h-9" onClick={() => setConfirmReset(false)}>取消</button>
            <button
              className="btn btn-danger h-9"
              onClick={() => {
                resetAll()
                setConfirmReset(false)
              }}
            >
              确认清空
            </button>
          </>
        }
      >
        所有列表、掌握记录、成就与经验值将被删除。建议先导出一份 JSON 备份。
      </Modal>
    </div>
  )
}
