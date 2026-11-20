import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Flame, Headphones, LayoutDashboard, List as ListIcon, Moon, PlusCircle, Settings as SettingsIcon, Sun, TrendingUp } from 'lucide-react'
import { useStore } from '../store'
import { levelProgress } from '../lib/xp'
import { dayKey } from '../lib/goldlist'
import Toasts from './Toasts'

const NAV = [
  { to: '/', label: '仪表盘', icon: LayoutDashboard, end: true },
  { to: '/lists', label: '我的列表', icon: ListIcon },
  { to: '/study', label: '学习模式', icon: Headphones },
  { to: '/new', label: '新建 Headlist', icon: PlusCircle },
  { to: '/progress', label: '成长', icon: TrendingUp },
  { to: '/settings', label: '设置', icon: SettingsIcon },
]

function ThemeToggle() {
  const theme = useStore((s) => s.settings.theme)
  const setSettings = useStore((s) => s.setSettings)
  return (
    <button
      onClick={() => setSettings({ theme: theme === 'dark' ? 'light' : 'dark' })}
      className="cursor-pointer rounded-xl border border-zinc-200 p-2 text-zinc-500 transition hover:text-zinc-800 dark:border-white/10 dark:text-zinc-400 dark:hover:text-zinc-100"
      title="切换亮/暗色"
    >
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  )
}

function LevelChip() {
  const xp = useStore((s) => s.xp)
  const p = levelProgress(xp)
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-white/10 dark:bg-white/5">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-sm font-semibold text-amber-600 dark:text-amber-300">
          Lv.{p.level} · {p.name}
        </span>
        <span className="text-[10px] tabular-nums text-zinc-400 dark:text-zinc-500">{p.into}/{p.need} XP</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-amber-300 to-amber-500 transition-all duration-500"
          style={{ width: `${p.pct * 100}%` }}
        />
      </div>
    </div>
  )
}

function StreakChip() {
  const streak = useStore((s) => s.streakDays)
  const active = streak > 0
  return (
    <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-white/10 dark:bg-white/5">
      <span className="flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400">
        <Flame size={15} className={active ? 'text-amber-500 dark:text-amber-300' : 'text-zinc-300 dark:text-zinc-600'} />
        连续学习
      </span>
      <span className={`text-sm font-semibold tabular-nums ${active ? 'text-amber-600 dark:text-amber-300' : 'text-zinc-400'}`}>
        {streak} 天
      </span>
    </div>
  )
}

export default function Layout() {
  const { pathname } = useLocation()
  return (
    <div className="min-h-dvh">
      {/* ── 桌面侧栏 ── */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-zinc-200 bg-white/80 backdrop-blur md:flex dark:border-white/10 dark:bg-zinc-950/70">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-400 font-bold text-zinc-950 shadow-[0_0_20px_-4px_var(--color-amber-500)]">
            W
          </div>
          <div>
            <div className="text-[15px] font-bold leading-none tracking-tight">Wortweg</div>
            <div className="mt-1 text-[10px] text-zinc-400 dark:text-zinc-500">Goldlist 蒸馏 · 德语 B2</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? 'bg-amber-400/10 text-amber-600 dark:text-amber-300'
                    : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-100'
                }`
              }
            >
              <Icon size={17} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-2 p-3">
          <LevelChip />
          <StreakChip />
          <div className="flex items-center justify-between pl-1">
            <span className="text-[10px] text-zinc-400 dark:text-zinc-600">v1.0 · 数据仅存本机</span>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      {/* ── 移动端顶栏 ── */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-zinc-200 bg-white/80 px-4 py-3 backdrop-blur md:hidden dark:border-white/10 dark:bg-zinc-950/70">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-400 text-sm font-bold text-zinc-950">W</div>
          <span className="font-bold tracking-tight">Wortweg</span>
        </div>
        <ThemeToggle />
      </header>

      {/* ── 内容 ── */}
      <div className="md:pl-60">
        {/* 只进不出：路由切换立即挂载淡入（mode="wait" 在失焦窗口会永久卡死） */}
        <motion.main
          key={pathname}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
          className="mx-auto w-full max-w-5xl px-4 pb-28 pt-6 md:px-8 md:pb-16 md:pt-8"
        >
          <Outlet />
        </motion.main>
      </div>

      {/* ── 移动端底部导航 ── */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-zinc-200 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden dark:border-white/10 dark:bg-zinc-950/85">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] transition ${
                isActive ? 'text-amber-500 dark:text-amber-300' : 'text-zinc-400 dark:text-zinc-500'
              }`
            }
          >
            <Icon size={19} />
            {label.replace(' Headlist', '')}
          </NavLink>
        ))}
      </nav>

      <Toasts />
    </div>
  )
}

export { dayKey }
