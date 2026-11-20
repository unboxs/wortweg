import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useStore } from './store'
import { initVoices } from './lib/tts'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Lists from './pages/Lists'
import ListDetail from './pages/ListDetail'
import NewHeadlist from './pages/NewHeadlist'
import Distill from './pages/Distill'
import Study from './pages/Study'
import Progress from './pages/Progress'
import Settings from './pages/Settings'

function ScrollToTop() {
  const { pathname } = useLocation()
  // window.scrollTo 在新 Chromium 返回 Promise，不能作为 effect 返回值
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

export default function App() {
  const theme = useStore((s) => s.settings.theme)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])
  useEffect(() => {
    initVoices()
  }, [])

  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        {/* 常规页面：带侧栏布局 */}
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="lists" element={<Lists />} />
          <Route path="lists/:id" element={<ListDetail />} />
          <Route path="new" element={<NewHeadlist />} />
          <Route path="progress" element={<Progress />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
        {/* 蒸馏模式：沉浸全屏，无导航 */}
        <Route path="distill/:id" element={<Distill />} />
        {/* 学习模式：冷却期的沉浸温习/探索，无导航 */}
        <Route path="study" element={<Study />} />
      </Routes>
    </BrowserRouter>
  )
}
