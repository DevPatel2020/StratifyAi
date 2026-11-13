import { useEffect } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { useApp } from './store/app'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar'
import { CommandPalette } from './components/CommandPalette'
import { ChatPage } from './pages/ChatPage'
import { TreePage } from './pages/TreePage'
import { HistoryPage } from './pages/HistoryPage'
import { DocumentsPage } from './pages/DocumentsPage'
import { TemplatesPage } from './pages/TemplatesPage'
import { ModelLabPage } from './pages/ModelLabPage'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { EvaluationPage } from './pages/EvaluationPage'
import { SettingsPage } from './pages/SettingsPage'

export default function App() {
  const init = useApp((s) => s.init)
  const theme = useApp((s) => s.settings?.theme ?? 'dark')
  useEffect(() => {
    void init()
  }, [init])

  return (
    <HashRouter>
      <div className="flex h-full flex-col">
        <TitleBar />
        <div className="flex min-h-0 flex-1">
          <Sidebar />
          <main className="min-w-0 flex-1">
            <Routes>
              <Route path="/" element={<ChatPage />} />
              <Route path="/tree" element={<TreePage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/documents" element={<DocumentsPage />} />
              <Route path="/templates" element={<TemplatesPage />} />
              <Route path="/lab" element={<ModelLabPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/evaluation" element={<EvaluationPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </main>
        </div>
      </div>
      <CommandPalette />
      <Toaster theme={theme} position="bottom-right" richColors />
    </HashRouter>
  )
}
