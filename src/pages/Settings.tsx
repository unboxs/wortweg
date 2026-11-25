import { useRef, useState } from 'react'
import { Download, FileUp, Moon, Sun, Trash2, Volume2 } from 'lucide-react'
import { useStore, exportBackupJSON, exportMasteredCSV } from '../store'
import { useGermanVoices, useSpeech } from '../hooks/useSpeech'
import { Modal, SectionTitle } from '../components/ui'
import { BANK } from '../data/bank'

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

export default function Settings() {
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const importData = useStore((s) => s.importData)
  const resetAll = useStore((s) => s.resetAll)
  const lists = useStore((s) => s.lists)
  const voices = useGermanVoices()
  const { speak } = useSpeech()
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
              <label className="text-sm font-medium">每日目标（蒸馏检视词条数）</label>
              <span className="text-sm font-semibold tabular-nums text-amber-600 dark:text-amber-300">{settings.dailyGoal} 词</span>
            </div>
            <input
              type="range" min={0} max={100} step={5}
              className="w-full accent-amber-400"
              value={settings.dailyGoal}
              onChange={(e) => setSettings({ dailyGoal: Number(e.target.value) })}
            />
            <p className="mt-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">设为 0 关闭每日目标。</p>
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
              {([['system', '系统语音'], ['polly', '在线 · Polly'], ['google', '在线 · Google']] as const).map(([k, label]) => (
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
            {settings.ttsSource === 'polly' && (
              <div className="mt-3 flex flex-wrap gap-2">
                {([['Vicki', 'Vicki（女）'], ['Marlene', 'Marlene（女）'], ['Hans', 'Hans（男）']] as const).map(([v, label]) => (
                  <button
                    key={v}
                    onClick={() => setSettings({ onlineVoice: v })}
                    className={`chip border ${
                      settings.onlineVoice === v
                        ? 'border-amber-400/60 bg-amber-400/10 text-amber-600 dark:text-amber-300'
                        : 'border-zinc-200 text-zinc-500 dark:border-white/10 dark:text-zinc-400'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-400 dark:text-zinc-500">
              {settings.ttsSource === 'system'
                ? '用操作系统/浏览器自带语音。离线可用，音质取决于已装的德语语音包。'
                : '在线合成，音质更好、无需安装；需要网络，国内访问 Google 源可能需代理。不可达时自动回落系统语音；在线源不支持慢速档（慢速仍走系统语音）。'}
            </p>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">德语语音</label>
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
              <button className="btn btn-ghost shrink-0" onClick={() => speak('Guten Tag! Ich lerne gern Deutsch.')}>
                <Volume2 size={15} /> 试听
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">
              语音列表来自你的操作系统/浏览器。Windows 推荐安装德语语音包以获得最佳音质。
            </p>
            {voices.length === 0 && (
              <p className="mt-1.5 text-[11px] leading-relaxed text-red-500 dark:text-red-400">
                当前没有可用的德语语音（所以朗读会被静默跳过）。安装方法：Windows 设置 →
                时间和语言 → 语言 → 添加德语，勾选"语音转换/文本转语音"组件，然后重启浏览器。
                Edge 浏览器自带微软在线德语语音，可直接使用。
              </p>
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
          <label className="flex cursor-pointer items-center justify-between text-sm">
            <span>蒸馏时自动朗读每个词</span>
            <input type="checkbox" className="h-4 w-4 accent-amber-400"
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
            Wortweg（"词语之路"）忠实实现 Goldlist Method：创建 20–25 词的 Headlist → 冷却
            {' '}{settings.cooldownDays} 天 → 蒸馏只留没记住的 → 循环直到清空。不闪卡、不逼回忆，让自然遗忘曲线替你筛选。
          </p>
          <p>内置词库：{BANK.length} 个主题、{BANK.reduce((s, c) => s + c.entries.length, 0)} 个 B1–B2 词条/短语，全部存储于本机浏览器。</p>
          <p className="text-xs">v1.0 · 纯前端，无账号、无服务器、无追踪。</p>
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
