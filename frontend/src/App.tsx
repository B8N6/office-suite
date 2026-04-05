import { Routes, Route } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import MailApp from './pages/MailApp'
import AdminPage from './pages/AdminPage'
import TickerBars from './components/TickerBars/TickerBars'
import ErrorBoundary from './components/ErrorBoundary'
import { useBranding } from './hooks/useBranding'

export default function App() {
  useBranding() // load & apply theme on every page
  return (
    <ErrorBoundary>
      <TickerBars />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/admin/*" element={<AdminPage />} />
        <Route path="/*" element={<MailApp />} />
      </Routes>
    </ErrorBoundary>
  )
}
